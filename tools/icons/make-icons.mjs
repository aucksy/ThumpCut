/**
 * Draws ThumpCut's launcher icon, adaptive foreground and splash mark.
 *
 * Why this exists rather than a checked-in image from a design tool: without an icon the
 * Android build ships Expo's default placeholder, which looks on the home screen exactly like
 * an app that was never finished. The mark has to come from the same tokens as the app, and it
 * has to be regenerable when they change.
 *
 * The mark is a **play triangle cut in two**, the lower half dropped, an amber blade in the
 * gap. It went through one earlier design — five vertical bars on a baseline — which was
 * rejected on sight for reading as a bar chart. Anything built from bars of differing height
 * reads as data, whatever the colours are doing, so the shape has to carry the meaning: a play
 * triangle says video, and a clean break through it says cut.
 *
 * No image library. Every shape here has a closed-form distance function, so the edges are
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

/** Proportions of the mark box. Tuned so the shape still reads at a home-screen size. */
const TRIANGLE_WIDTH = 0.86;
const TRIANGLE_HEIGHT = 1.0;
/** Where the blade falls across the triangle, measured from its left edge. */
const CUT_AT = 0.52;
/**
 * The two pieces stay level.
 *
 * An earlier attempt dropped the right-hand piece to make the cut unmistakable, and it cost
 * more than it bought: sliced vertically and offset, the left half stops being a triangle and
 * reads as a slab, which takes the "play" out of the mark entirely. Kept level, the triangle
 * survives whole and the amber blade is what carries the cut — the same device the wordmark
 * already uses between "Thump" and "cut".
 */
const DROP = 0;
/** The gap the blade sits in, and the blade itself. */
const GAP = 0.062;
const BLADE = 0.03;
const CORNER = 0.035;

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function canvas(size) {
  return { size, pixels: new Float64Array(size * size * 4) };
}

/** Src-over compositing of one pixel. */
function blend(target, px, py, colour, coverage) {
  if (coverage <= 0) return;
  const a = Math.min(1, coverage);
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

/** Signed distance from a point to a rounded rectangle. Negative inside. */
function roundedRectDistance(px, py, cx, cy, halfWidth, halfHeight, radius) {
  const r = Math.min(radius, halfWidth, halfHeight);
  const qx = Math.abs(px - cx) - (halfWidth - r);
  const qy = Math.abs(py - cy) - (halfHeight - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Signed distance to a right-pointing triangle, as the furthest of its three edge half-planes.
 * Exact along the edges, slightly short at the corners — which is precisely where a small
 * rounding radius is about to be subtracted anyway.
 */
function triangleDistance(px, py, cx, cy, width, height) {
  const a = [cx - width / 2, cy - height / 2];
  const b = [cx - width / 2, cy + height / 2];
  const c = [cx + width / 2, cy];
  const centroid = [(a[0] + b[0] + c[0]) / 3, cy];

  let distance = -Infinity;
  for (const [p, q] of [
    [a, b],
    [b, c],
    [c, a],
  ]) {
    let nx = q[1] - p[1];
    let ny = -(q[0] - p[0]);
    const length = Math.hypot(nx, ny);
    nx /= length;
    ny /= length;
    // Point the normal away from the middle, so inside is negative.
    if ((centroid[0] - p[0]) * nx + (centroid[1] - p[1]) * ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    distance = Math.max(distance, (px - p[0]) * nx + (py - p[1]) * ny);
  }
  return distance;
}

function fillRoundedRect(target, { x, y, width, height, radius, colour }) {
  const left = Math.max(0, Math.floor(x - 2));
  const right = Math.min(target.size, Math.ceil(x + width + 2));
  const top = Math.max(0, Math.floor(y - 2));
  const bottom = Math.min(target.size, Math.ceil(y + height + 2));

  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      const distance = roundedRectDistance(
        px + 0.5,
        py + 0.5,
        x + width / 2,
        y + height / 2,
        width / 2,
        height / 2,
        radius,
      );
      blend(target, px, py, colour, 0.5 - distance);
    }
  }
}

/**
 * One piece of the split triangle: the whole triangle, drawn only between `clipFrom` and
 * `clipTo`, shifted down by `drop`.
 */
function fillTrianglePiece(target, { cx, cy, width, height, radius, colour, clipFrom, clipTo, drop }) {
  const left = Math.max(0, Math.floor(clipFrom));
  const right = Math.min(target.size, Math.ceil(clipTo));
  const top = Math.max(0, Math.floor(cy + drop - height / 2 - 2));
  const bottom = Math.min(target.size, Math.ceil(cy + drop + height / 2 + 2));

  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      const distance =
        triangleDistance(px + 0.5, py + 0.5, cx, cy + drop, width, height) - radius;
      // Coverage is also clipped at the cut, so the two pieces meet the gap cleanly instead of
      // fading into it.
      const insideCut = Math.min(px + 1 - clipFrom, clipTo - px);
      blend(target, px, py, colour, Math.min(0.5 - distance, insideCut));
    }
  }
}

/** The mark, drawn to fill `box` pixels centred in the canvas. */
function drawMark(target, box) {
  const size = target.size;
  // A triangle's weight sits a third of the way from its flat edge, not halfway, so centring
  // it by its bounding box leaves it visibly parked to the left. Nudged right until it looks
  // centred, which is the only test that matters.
  const cx = size / 2 + box * 0.05;
  const cy = size / 2;

  const width = box * TRIANGLE_WIDTH;
  const height = box * TRIANGLE_HEIGHT;
  const radius = box * CORNER;
  const drop = box * DROP;

  const cutCentre = cx - width / 2 + width * CUT_AT;
  const halfGap = (box * GAP) / 2;

  // Upper piece, in place. Lower piece, dropped. The eye reads the offset as the cut.
  fillTrianglePiece(target, {
    cx, cy, width, height, radius,
    colour: BONE,
    clipFrom: 0,
    clipTo: cutCentre - halfGap,
    drop: 0,
  });
  fillTrianglePiece(target, {
    cx, cy, width, height, radius,
    colour: BONE,
    clipFrom: cutCentre + halfGap,
    clipTo: size,
    drop,
  });

  // The blade. Amber is the app's colour for "playing" — this is the moment of the cut.
  // Long enough to overshoot both pieces, so it reads as passing through rather than sitting
  // between them.
  const bladeWidth = box * BLADE;
  const bladeHeight = height + drop + box * 0.16;
  fillRoundedRect(target, {
    x: cutCentre - bladeWidth / 2,
    y: cy - bladeHeight / 2 + drop / 2,
    width: bladeWidth,
    height: bladeHeight,
    radius: bladeWidth / 2,
    colour: SIGNAL,
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
      for (let channel = 0; channel < 4; channel += 1) {
        raw[cursor] = Math.round(Math.min(1, Math.max(0, pixels[index + channel])) * 255);
        cursor += 1;
      }
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
  writeFileSync(join(ASSETS, name), encodePng(target));
  console.log(`  ${name}  ${target.size}x${target.size}`);
}

console.log("ThumpCut icons");

// 1. The square icon. Graphite to the edge, mark at 54% so the rounded mask never clips it.
const icon = canvas(1024);
fillBackground(icon, GRAPHITE);
drawMark(icon, 1024 * 0.54);
write("icon.png", icon);

// 2. The Android adaptive foreground. The launcher may crop to a circle and animates the
//    layers apart, so the mark must sit inside the middle 66% and the layer stays transparent.
const adaptive = canvas(1024);
drawMark(adaptive, 1024 * 0.42);
write("adaptive-icon.png", adaptive);

// 3. The splash mark, shown on graphite by the splash screen itself.
const splash = canvas(512);
drawMark(splash, 512 * 0.48);
write("splash-icon.png", splash);

console.log("Done.");
