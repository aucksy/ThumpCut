/**
 * Reading an MP4's structure, and checking the exported file is actually what we promised.
 *
 * Spec 06 §2.1 makes post-export validation mandatory, and every one of its assertions is
 * about a *box* in the container rather than about the picture. So this walks the boxes
 * directly. No ffprobe on the phone, no native call, no dependency.
 *
 * Why each check earns its place:
 *
 *   · **No edit list.** An `elst` box shifts playback start. Instagram honours it, our preview
 *     does not, and the reel then drifts off the beat with nothing to catch it.
 *   · **Constant frame rate.** Phone cameras record variable frame rate. If it survives into
 *     the export, Instagram re-encodes it and the cuts slide.
 *   · **No audio track.** The export is silent by design. A stray silent track is still a
 *     track, and Instagram would treat the reel as having its own audio.
 *   · **moov before mdat.** Without it the file will not start playing until it has fully
 *     downloaded.
 */

const HEADER_BYTES = 8;

export interface Mp4Box {
  type: string;
  start: number;
  size: number;
  payloadStart: number;
  payloadEnd: number;
}

export interface Mp4Track {
  handler: string;
  width: number;
  height: number;
  timescale: number;
  durationSec: number;
  hasEditList: boolean;
  /** Frame durations in timescale units, and how many frames use each. */
  timeToSample: { count: number; delta: number }[];
}

export interface Mp4Summary {
  boxes: string[];
  moovBeforeMdat: boolean;
  hasFtyp: boolean;
  tracks: Mp4Track[];
  durationSec: number;
}

export class Mp4ParseError extends Error {}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) throw new Mp4ParseError("truncated box header");
  return (
    ((bytes[offset] as number) << 24) |
    ((bytes[offset + 1] as number) << 16) |
    ((bytes[offset + 2] as number) << 8) |
    (bytes[offset + 3] as number)
  ) >>> 0;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] as number) << 8) | (bytes[offset + 1] as number);
}

function readType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] as number,
    bytes[offset + 1] as number,
    bytes[offset + 2] as number,
    bytes[offset + 3] as number,
  );
}

/** Every box directly inside `[start, end)`. */
export function readBoxes(bytes: Uint8Array, start = 0, end = bytes.length): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let cursor = start;

  while (cursor + HEADER_BYTES <= end) {
    let size = readUint32(bytes, cursor);
    const type = readType(bytes, cursor + 4);
    let payloadStart = cursor + HEADER_BYTES;

    if (size === 1) {
      // 64-bit size. The high word is ignored: a reel is never four gigabytes.
      const high = readUint32(bytes, cursor + 8);
      const low = readUint32(bytes, cursor + 12);
      if (high !== 0) throw new Mp4ParseError("box larger than 4GB");
      size = low;
      payloadStart = cursor + 16;
    } else if (size === 0) {
      size = end - cursor;
    }

    if (size < HEADER_BYTES) throw new Mp4ParseError(`box ${type} declares size ${size}`);
    const boxEnd = Math.min(cursor + size, end);

    boxes.push({ type, start: cursor, size, payloadStart, payloadEnd: boxEnd });
    cursor = boxEnd;
  }
  return boxes;
}

function findBox(boxes: Mp4Box[], type: string): Mp4Box | undefined {
  return boxes.find((box) => box.type === type);
}

function findAll(bytes: Uint8Array, box: Mp4Box, type: string): Mp4Box[] {
  return readBoxes(bytes, box.payloadStart, box.payloadEnd).filter(
    (child) => child.type === type,
  );
}

function parseTrack(bytes: Uint8Array, trak: Mp4Box): Mp4Track {
  const trakChildren = readBoxes(bytes, trak.payloadStart, trak.payloadEnd);

  let width = 0;
  let height = 0;
  const tkhd = findBox(trakChildren, "tkhd");
  if (tkhd) {
    const version = bytes[tkhd.payloadStart] as number;
    // Width and height are 16.16 fixed point and sit right after the 36-byte display matrix.
    // Everything before that: version+flags 4, then creation/modification/duration (4 bytes
    // each at version 0, 8 at version 1) around a 4-byte track id and 4 reserved, then 8
    // reserved, layer, alternate group, volume and 2 more reserved.
    const beforeMatrix = version === 1 ? 52 : 40;
    const base = tkhd.payloadStart + beforeMatrix + 36;
    if (base + 8 <= tkhd.payloadEnd) {
      width = readUint16(bytes, base);
      height = readUint16(bytes, base + 4);
    }
  }

  const edts = findBox(trakChildren, "edts");
  const hasEditList = edts ? findAll(bytes, edts, "elst").length > 0 : false;

  let handler = "";
  let timescale = 0;
  let durationUnits = 0;
  const timeToSample: { count: number; delta: number }[] = [];

  const mdia = findBox(trakChildren, "mdia");
  if (mdia) {
    const mdiaChildren = readBoxes(bytes, mdia.payloadStart, mdia.payloadEnd);

    const mdhd = findBox(mdiaChildren, "mdhd");
    if (mdhd) {
      const version = bytes[mdhd.payloadStart] as number;
      const offset = mdhd.payloadStart + 4 + (version === 1 ? 16 : 8);
      timescale = readUint32(bytes, offset);
      durationUnits =
        version === 1 ? readUint32(bytes, offset + 8) : readUint32(bytes, offset + 4);
    }

    const hdlr = findBox(mdiaChildren, "hdlr");
    if (hdlr) handler = readType(bytes, hdlr.payloadStart + 8);

    const minf = findBox(mdiaChildren, "minf");
    if (minf) {
      const stbl = findBox(readBoxes(bytes, minf.payloadStart, minf.payloadEnd), "stbl");
      if (stbl) {
        const stts = findBox(readBoxes(bytes, stbl.payloadStart, stbl.payloadEnd), "stts");
        if (stts) {
          const entryCount = readUint32(bytes, stts.payloadStart + 4);
          for (let index = 0; index < entryCount; index += 1) {
            const at = stts.payloadStart + 8 + index * 8;
            if (at + 8 > stts.payloadEnd) break;
            timeToSample.push({
              count: readUint32(bytes, at),
              delta: readUint32(bytes, at + 4),
            });
          }
        }
      }
    }
  }

  return {
    handler,
    width,
    height,
    timescale,
    durationSec: timescale > 0 ? durationUnits / timescale : 0,
    hasEditList,
    timeToSample,
  };
}

export function summarise(bytes: Uint8Array): Mp4Summary {
  const top = readBoxes(bytes);
  const types = top.map((box) => box.type);
  const moovIndex = types.indexOf("moov");
  const mdatIndex = types.indexOf("mdat");

  const moov = findBox(top, "moov");
  const tracks = moov ? findAll(bytes, moov, "trak").map((trak) => parseTrack(bytes, trak)) : [];

  let durationSec = 0;
  if (moov) {
    const mvhd = findBox(readBoxes(bytes, moov.payloadStart, moov.payloadEnd), "mvhd");
    if (mvhd) {
      const version = bytes[mvhd.payloadStart] as number;
      const offset = mvhd.payloadStart + 4 + (version === 1 ? 16 : 8);
      const timescale = readUint32(bytes, offset);
      const units =
        version === 1 ? readUint32(bytes, offset + 8) : readUint32(bytes, offset + 4);
      if (timescale > 0) durationSec = units / timescale;
    }
  }

  return {
    boxes: types,
    hasFtyp: types.includes("ftyp"),
    moovBeforeMdat: moovIndex >= 0 && (mdatIndex < 0 || moovIndex < mdatIndex),
    tracks,
    durationSec,
  };
}

// ---------------------------------------------------------------------------
// Spec 06 §2.1
// ---------------------------------------------------------------------------

export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;
export const OUTPUT_FPS = 30;
/** How far the file's duration may sit from the cut list's. */
export const DURATION_TOLERANCE_SEC = 0.1;

export interface ValidationResult {
  valid: boolean;
  failures: string[];
  summary: Mp4Summary | null;
}

export interface ValidateOptions {
  /**
   * Whether the file is supposed to carry the music.
   *
   * False — the default, and the only value an Instagram-catalogue export ever uses — means
   * *no audio track at all*, exactly as before. True is for the user's own music and
   * royalty-free tracks: then the file must carry exactly one audio track, running the same
   * length as the picture. Neither mode tolerates the other's file.
   */
  expectAudio?: boolean;
}

/** How far the audio track's length may sit from the video's. */
export const AUDIO_DURATION_TOLERANCE_SEC = 0.25;

/**
 * Every §2.1 assertion. A file that fails any one of them is not saved — the user gets an
 * error and a retry, never a broken reel in their gallery.
 */
export function validateExport(
  bytes: Uint8Array,
  expectedDurationSec: number,
  options: ValidateOptions = {},
): ValidationResult {
  const expectAudio = options.expectAudio === true;
  const failures: string[] = [];
  let summary: Mp4Summary;

  try {
    summary = summarise(bytes);
  } catch (error) {
    return {
      valid: false,
      failures: [`the file is not a readable MP4: ${(error as Error).message}`],
      summary: null,
    };
  }

  if (!summary.hasFtyp) failures.push("no ftyp box — this is not an MP4");
  if (!summary.moovBeforeMdat) {
    failures.push("the moov atom is not first, so playback would wait for the whole file");
  }

  const videoTracks = summary.tracks.filter((track) => track.handler === "vide");
  const audioTracks = summary.tracks.filter((track) => track.handler === "soun");

  if (!expectAudio && audioTracks.length > 0) {
    failures.push(`the file carries ${audioTracks.length} audio track(s); it must carry none`);
  }
  if (expectAudio) {
    if (audioTracks.length !== 1) {
      failures.push(
        `expected exactly one audio track carrying the music, found ${audioTracks.length}`,
      );
    } else {
      const audio = audioTracks[0] as Mp4Track;
      if (audio.hasEditList) {
        failures.push("the audio track has an edit list, which shifts playback start");
      }
      const videoDuration = videoTracks[0]?.durationSec ?? summary.durationSec;
      if (
        audio.durationSec > 0 &&
        Math.abs(audio.durationSec - videoDuration) > AUDIO_DURATION_TOLERANCE_SEC
      ) {
        failures.push(
          `the audio runs ${audio.durationSec.toFixed(3)}s against ` +
            `${videoDuration.toFixed(3)}s of picture`,
        );
      }
    }
  }
  if (videoTracks.length !== 1) {
    failures.push(`expected exactly one video track, found ${videoTracks.length}`);
    return { valid: false, failures, summary };
  }

  const video = videoTracks[0] as Mp4Track;

  if (video.hasEditList) {
    failures.push("the video track has an edit list, which shifts playback start");
  }
  if (video.width !== OUTPUT_WIDTH || video.height !== OUTPUT_HEIGHT) {
    failures.push(
      `the video is ${video.width}x${video.height}; it must be ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`,
    );
  }

  // Constant frame rate: every frame the same duration, and that duration exactly 1/30s.
  const deltas = new Set(video.timeToSample.map((entry) => entry.delta));
  if (video.timeToSample.length === 0) {
    failures.push("the video track has no frame timing information");
  } else if (deltas.size > 1) {
    failures.push(
      `the video has ${deltas.size} different frame durations, so it is variable frame rate`,
    );
  } else {
    const delta = video.timeToSample[0]?.delta ?? 0;
    const fps = delta > 0 && video.timescale > 0 ? video.timescale / delta : 0;
    if (Math.abs(fps - OUTPUT_FPS) > 0.01) {
      failures.push(`the video runs at ${fps.toFixed(2)}fps; it must be exactly ${OUTPUT_FPS}`);
    }
  }

  const observed = video.durationSec || summary.durationSec;
  if (Math.abs(observed - expectedDurationSec) > DURATION_TOLERANCE_SEC) {
    failures.push(
      `the file is ${observed.toFixed(3)}s but the edit is ${expectedDurationSec.toFixed(3)}s`,
    );
  }

  return { valid: failures.length === 0, failures, summary };
}
