/**
 * Draws ThumpCut's launcher icon, adaptive foreground and splash mark.
 *
 * Why this exists rather than a checked-in image from a design tool: without an icon the
 * Android build ships Expo's default placeholder, which looks on the home screen exactly like
 * an app that was never finished. The mark has to come from the same tokens as the app, and it
 * has to be regenerable when they change.
 *
 * No image library. A rounded rectangle has a closed-form signed distance, so the edges are
 * anti-aliased exactly rather than by supersampling a buffer this laptop cannot hold.
 *
 * Run:  node tools/icons/make-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, "..", "..", "app", "assets", "icon");

// ---------------------------------------------------------------------------
// The tokens. Transcribed from packages/design-tokens — the same values the app uses.
// ---------------------------------------------------------------------------

const GRAPHITE = [0x17, 0x18, 0x1a];
const BONE = [0xea, 0xe6, 0xde];
const SIGNAL = [0xff, 0x9e, 0x2c];
const COOL = [0x4f, 0xb8, 0xc4];

/**
 * The beat ruler, which is the one picture that says what this app does: bars on a grid, the
 * playing one amber, the chosen clip teal, the rest bone at the weights the design brief uses
 * for secondary and disabled text.
 */
const BARS = [
  { height: 0.44, colour: BONE, alpha: 0.35 },
  { height: 0.72, colour: BONE, alpha: 0.55 },
  { height: 1.0, colour: SIGNAL, alpha: 1 },
  { height: 0.62, colour: COOL, alpha: 1 },
  { height: 0.34, colour: BONE, alpha: 0.55 },
];

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function canvas(size) {
  return { size, pixels: new Float64Array(size * size * 4) };
}

/** Signed distance from a point to a rounded rectangle. Negative inside. */
function roundedRectDistance(px, py, cx, cy, halfWidth, halfHeight, radius) {
  const r = Math.min(radius, halfWidth, halfHeight);
  const qx = Math.abs(px - cx) - (halfWidth - r);
  const qy = Math.abs(py - cy) - (halfHeight - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - r;
}

function fillRoundedRect(target, { x, y, width, height, radius, colour, alpha = 1 }) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  const left = Math.max(0, Math.floor(x - 2));
  const right = Math.min(target.size, Math.ceil(x + width + 2));
  const top = Math.max(0, Math.floor(y - 2));
  const bottom = Math.min(target.size, Math.ceil(y + height + 2));

  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      const distance = roundedRectDistance(
        px + 0.5,
        py + 0.5,
        cx,
        cy,
        halfWidth,
        halfHeight,
        radius,
      );
      // One pixel of coverage either side of the edge. Exact, and no buffer to hold.
      const coverage = Math.min(1, Math.max(0, 0.5 - distance));
      if (coverage <= 0) continue;

      const a = coverage * alpha;
      const index = (py * target.size + px) * 4;
      const existing = target.pixels[index + 3];
      const out = a + existing * (1 - a);

      for (let channel = 0; channel < 3; channel += 1) {
        const source = colour[channel] / 255;
        const under = target.pixels[index + channel] * existing;
        target.pixels[index + channel] = out === 0 ? 0 : (source * a + under * (1 - a)) / out;
      }
      target.pixels[index + 3] = out;
    }
  }
}

/**
 * The mark, drawn to fill `box` pixels centred in the canvas.
 *
 * Bars sit on a shared baseline, so the tall amber one reads as the beat that is playing
 * rather than as a random arrangement.
 */
function drawMark(target, box) {
  const size = target.size;
  const gapRatio = 0.6;
  const count = BARS.length;
  const barWidth = box / (count + (count - 1) * gapRatio);
  const gap = barWidth * gapRatio;

  const left = (size - box) / 2;
  const baseline = (size + box) / 2;

  BARS.forEach((bar, index) => {
    const height = box * bar.height;
    fillRoundedRect(target, {
      x: left + index * (barWidth + gap),
      y: baseline - height,
      width: barWidth,
      height,
      radius: barWidth / 2,
      colour: bar.colour,
      alpha: bar.alpha,
    });
  });
}

function fillBackground(target, colour) {
  for (let index = 0; index < target.size * target.size; index += 1) {
    target.pixels[index * 4] = colour[0] / 255;
    target.pixels[index * 4 + 1] = colour[1] / 255;
    target.pixels[index * 4 + 2] = colour[2] / 255;
    target.pixels[index * 4 + 3] = 1;
  }
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(target) {
  const { size, pixels } = target;
  // Filter byte 0 (none) in front of every scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let cursor = 0;
  for (let y = 0; y < size; y += 1) {
    raw[cursor] = 0;
    cursor += 1;
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const alpha = pixels[index + 3];
      for (let channel = 0; channel < 3; channel += 1) {
        raw[cursor] = Math.round(Math.min(1, Math.max(0, pixels[index + channel])) * 255);
        cursor += 1;
      }
      raw[cursor] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
      cursor += 1;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// The three files Expo asks for
// ---------------------------------------------------------------------------

function write(name, target) {
  mkdirSync(ASSETS, { recursive: true });
  const file = join(ASSETS, name);
  writeFileSync(file, encodePng(target));
  console.log(`  ${name}  ${target.size}x${target.size}`);
}

console.log("ThumpCut icons");

// 1. The square icon. Graphite to the edge, mark at 56% so the rounded mask never clips it.
const icon = canvas(1024);
fillBackground(icon, GRAPHITE);
drawMark(icon, 1024 * 0.56);
write("icon.png", icon);

// 2. The Android adaptive foreground. The launcher may crop to a circle and animates the
//    layers apart, so the mark must sit inside the middle 66% and the layer stays transparent.
const adaptive = canvas(1024);
drawMark(adaptive, 1024 * 0.44);
write("adaptive-icon.png", adaptive);

// 3. The splash mark, shown on graphite by the splash screen itself.
const splash = canvas(512);
drawMark(splash, 512 * 0.5);
write("splash-icon.png", splash);

console.log("Done.");
