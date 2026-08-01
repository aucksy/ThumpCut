/**
 * The copy gate.
 *
 * Reads the exact on-screen text out of the spec error catalogues and the design brief, and
 * fails if any of it has drifted in the app. Paraphrasing is a defect: "Couldn't open
 * Instagram" and "Could not open Instagram" are not the same product.
 *
 * It also catches the subtler class — a straight apostrophe where the spec has a curly one, or
 * a hyphen where the spec has an em dash. Those survive review and then look wrong on a phone.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Quoted strings that appear in a spec but are not on-screen copy: they name a state, a file
 * or a setting. Each one is listed here on purpose so the gate stays strict about the rest.
 */
const NOT_ON_SCREEN = new Set([
  "Don't keep activities",
  "video/*",
  "com.instagram.share.ADD_TO_REEL",
  "com.instagram.android",
  "com.instagram.sharedSticker.backgroundVideo",
  "com.instagram.sharedSticker.appID",
  "instagram-reels://share",
  "beat_this",
  "Optimise Storage",
  "while I was in there",
  "Getting things ready",
]);

/** Sections whose quoted text is on-screen copy. */
const COPY_SECTION = /error catalogue|non-error copy|exact on-screen text/i;

function extractQuoted(text) {
  const found = new Set();
  // Straight and curly double quotes both, so the gate sees what the spec actually wrote.
  for (const match of text.matchAll(/[“"]([^“”"]{6,200}?)[”"]/g)) {
    const value = match[1].trim();
    if (!value.includes(" ")) continue;
    if (value.startsWith("http")) continue;
    found.add(value);
  }
  return found;
}

/** Pull on-screen copy out of a spec, section by section. */
function copyFromSpec(text) {
  const lines = text.split(/\r?\n/);
  const found = new Set();
  let inCopySection = false;

  for (const line of lines) {
    const heading = /^#{2,4}\s+(.*)$/.exec(line);
    if (heading) {
      inCopySection = COPY_SECTION.test(heading[1]);
      continue;
    }
    if (!inCopySection) continue;
    if (!line.startsWith("|")) continue;
    for (const value of extractQuoted(line)) found.add(value);
  }
  return found;
}

/** The design brief quotes exact copy inline, under each screen's states. */
function copyFromDesignBrief(text) {
  const start = text.indexOf("# Screens and every one of their states");
  const end = text.indexOf("# Copy rules");
  if (start < 0) return new Set();
  const section = text.slice(start, end > start ? end : undefined);

  const found = new Set();
  for (const line of section.split(/\r?\n/)) {
    for (const value of extractQuoted(line)) found.add(value);
  }
  return found;
}

export function runCopyGate({ repoRoot }) {
  const specDir = join(repoRoot, "specs");
  const expected = new Map();

  for (const name of readdirSync(specDir).filter((file) => file.endsWith(".md"))) {
    const text = readFileSync(join(specDir, name), "utf8");
    for (const value of copyFromSpec(text)) {
      if (!expected.has(value)) expected.set(value, name);
    }
  }

  const briefPath = join(repoRoot, "docs", "DESIGN-BRIEF.md");
  for (const value of copyFromDesignBrief(readFileSync(briefPath, "utf8"))) {
    if (!expected.has(value)) expected.set(value, "DESIGN-BRIEF.md");
  }

  const copySource = readFileSync(join(repoRoot, "app", "src", "copy.ts"), "utf8");

  const failures = [];
  let checked = 0;

  for (const [value, source] of expected) {
    if (NOT_ON_SCREEN.has(value)) continue;
    checked += 1;
    if (!copySource.includes(value)) {
      failures.push({
        gate: "copy",
        detail: `${source} defines "${value}" but app/src/copy.ts does not contain it verbatim`,
      });
    }
  }

  return {
    name: "Copy",
    checked,
    failures,
    summary: `${checked} exact strings from the specs and the design brief`,
  };
}
