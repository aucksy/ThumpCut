/**
 * PCM WAV decoding — `factory/audio_io.py`'s `_read_wav`, ported.
 *
 * Used by the tests to feed the committed fixture WAVs through the engine, and available to
 * any tool that needs it. The app itself never reads WAVs — the phone's decoder module hands
 * it raw samples.
 */

export class WavDecodeError extends Error {}

export interface DecodedWav {
  /** Mono float samples in -1..1. Stereo sources are averaged, as the Factory averages. */
  samples: Float64Array;
  sampleRate: number;
}

function readChunkId(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/** Decode a PCM WAV (8, 16 or 32-bit integer) into mono float samples. */
export function decodeWav(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 44 || readChunkId(view, 0) !== "RIFF" || readChunkId(view, 8) !== "WAVE") {
    throw new WavDecodeError("not a RIFF/WAVE file");
  }

  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataLength = 0;

  let cursor = 12;
  while (cursor + 8 <= bytes.length) {
    const chunkId = readChunkId(view, cursor);
    const chunkSize = view.getUint32(cursor + 4, true);
    const body = cursor + 8;
    if (chunkId === "fmt ") {
      const format = view.getUint16(body, true);
      if (format !== 1) throw new WavDecodeError(`unsupported WAV format code ${format}`);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (chunkId === "data") {
      dataOffset = body;
      dataLength = Math.min(chunkSize, bytes.length - body);
    }
    cursor = body + chunkSize + (chunkSize % 2);
  }

  if (channels <= 0 || sampleRate <= 0 || dataOffset < 0) {
    throw new WavDecodeError("missing fmt or data chunk");
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(dataLength / (bytesPerSample * channels));
  const mono = new Float64Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    let total = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const at = dataOffset + (frame * channels + channel) * bytesPerSample;
      if (bitsPerSample === 8) {
        total += (view.getUint8(at) - 128) / 128.0;
      } else if (bitsPerSample === 16) {
        total += view.getInt16(at, true) / 32768.0;
      } else if (bitsPerSample === 32) {
        total += view.getInt32(at, true) / 2147483648.0;
      } else {
        throw new WavDecodeError(`unsupported WAV sample width: ${bitsPerSample} bit`);
      }
    }
    mono[frame] = total / channels;
  }

  return { samples: mono, sampleRate };
}
