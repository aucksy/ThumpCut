/**
 * The metronome click, synthesised on the device.
 *
 * No audio file is fetched, bundled or streamed. This builds a few kilobytes of PCM in memory
 * and hands it to the player as a data URI.
 *
 * That is a legal constraint, not an optimisation. ThumpCut hosts no audio and licenses no
 * music; the preview lets the user hear the *timing*, and Instagram supplies the song at the
 * end. The beat ruler and the amber pulse do the rest of the work.
 *
 * Pure and synchronous, so it can be tested under plain `node`.
 */

const SAMPLE_RATE = 22050;
const BITS_PER_SAMPLE = 16;

export interface ClickShape {
  /** Pitch of the click, in hertz. Downbeats sit lower and land harder. */
  frequencyHz: number;
  /** Length in seconds. Short enough to read as a click rather than a tone. */
  durationSec: number;
  /** 0..1. */
  amplitude: number;
}

/** A beat. Light, high, short. */
export const BEAT_CLICK: ClickShape = { frequencyHz: 1400, durationSec: 0.028, amplitude: 0.5 };

/** A downbeat. Lower and stronger, so bars are audible without counting. */
export const DOWNBEAT_CLICK: ClickShape = {
  frequencyHz: 900,
  durationSec: 0.042,
  amplitude: 0.92,
};

/** Render a click to mono 16-bit PCM samples. */
export function renderClick(shape: ClickShape, sampleRate = SAMPLE_RATE): Int16Array {
  const length = Math.max(1, Math.round(shape.durationSec * sampleRate));
  const samples = new Int16Array(length);

  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    // A fast exponential decay is what makes it read as a click and not a beep.
    const envelope = Math.exp(-t * 90);
    // A short attack ramp removes the speaker pop a hard start produces.
    const attack = Math.min(1, index / (sampleRate * 0.0015));
    const value = Math.sin(2 * Math.PI * shape.frequencyHz * t) * envelope * attack * shape.amplitude;
    samples[index] = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
  }
  return samples;
}

/** Wrap PCM samples in a WAV container. */
export function toWavBytes(samples: Int16Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * BITS_PER_SAMPLE) / 8, true);
  view.setUint16(32, BITS_PER_SAMPLE / 8, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + index * 2, samples[index] as number, true);
  }
  return new Uint8Array(buffer);
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 without a platform dependency — React Native has no `btoa`. */
export function toBase64(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] as number;
    const b = index + 1 < bytes.length ? (bytes[index + 1] as number) : 0;
    const c = index + 2 < bytes.length ? (bytes[index + 2] as number) : 0;
    const triple = (a << 16) | (b << 8) | c;

    output += BASE64_ALPHABET[(triple >> 18) & 63];
    output += BASE64_ALPHABET[(triple >> 12) & 63];
    output += index + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? BASE64_ALPHABET[triple & 63] : "=";
  }
  return output;
}

/** A playable `data:` URI for one click. Built once and reused for every beat. */
export function clickDataUri(shape: ClickShape, sampleRate = SAMPLE_RATE): string {
  const wav = toWavBytes(renderClick(shape, sampleRate), sampleRate);
  return `data:audio/wav;base64,${toBase64(wav)}`;
}
