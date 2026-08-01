/**
 * The tokens are checked against the design system files they were transcribed from.
 *
 * This is the test that stops the two drifting. Someone changes a colour in
 * `design-system/tokens/colors.css`, the app keeps the old one, and nothing anywhere says so —
 * until a screenshot review months later.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  DROP_THRESHOLD,
  energyColor,
  fontSize,
  layout,
  palette,
  radius,
  space,
} from "../src/index.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DESIGN_SYSTEM = join(REPO_ROOT, "design-system", "tokens");

function readCssVariables(file: string): Map<string, string> {
  const text = readFileSync(join(DESIGN_SYSTEM, file), "utf8");
  const values = new Map<string, string>();
  for (const match of text.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    values.set(match[1] as string, (match[2] as string).trim());
  }
  return values;
}

describe("colours match the design system", () => {
  const css = readCssVariables("colors.css");

  const pairs: [string, string][] = [
    ["tc-graphite", palette.graphite],
    ["tc-panel", palette.panel],
    ["tc-panel-2", palette.panel2],
    ["tc-bone", palette.bone],
    ["tc-signal", palette.signal],
    ["tc-cool", palette.cool],
    ["tc-clip", palette.clip],
  ];

  for (const [name, value] of pairs) {
    it(`--${name}`, () => {
      assert.equal(css.get(name)?.toUpperCase(), value.toUpperCase());
    });
  }

  it("the background is warm graphite, never pure black", () => {
    assert.notEqual(palette.graphite.toUpperCase(), "#000000");
  });

  it("the two accents are genuinely different, because their jobs are", () => {
    assert.notEqual(palette.signal, palette.cool);
  });
});

describe("spacing and radii match the design system", () => {
  const spacing = readCssVariables("spacing.css");

  it("the 4pt grid", () => {
    assert.equal(spacing.get("sp-1"), `${space.s1}px`);
    assert.equal(spacing.get("sp-5"), `${space.s5}px`);
    assert.equal(spacing.get("sp-9"), `${space.s9}px`);
  });

  it("8pt on cards, 4pt on chips", () => {
    assert.equal(spacing.get("r-card"), `${radius.card}px`);
    assert.equal(spacing.get("r-chip"), `${radius.chip}px`);
  });

  it("the tap minimum and the screen size", () => {
    assert.equal(spacing.get("tap-min"), `${layout.tapMin}px`);
    assert.equal(spacing.get("screen-w"), `${layout.screenWidth}px`);
    assert.equal(spacing.get("screen-h"), `${layout.screenHeight}px`);
    assert.equal(spacing.get("screen-pad"), `${layout.screenPad}px`);
  });
});

describe("the type ramp matches the design system", () => {
  const typography = readCssVariables("typography.css");

  it("every size", () => {
    assert.equal(typography.get("text-display-xl"), `${fontSize.displayXl}px`);
    assert.equal(typography.get("text-display-lg"), `${fontSize.displayLg}px`);
    assert.equal(typography.get("text-display-md"), `${fontSize.displayMd}px`);
    assert.equal(typography.get("text-body"), `${fontSize.body}px`);
    assert.equal(typography.get("text-data"), `${fontSize.data}px`);
    assert.equal(typography.get("text-label"), `${fontSize.label}px`);
  });
});

describe("the energy ramp", () => {
  it("is teal at the quiet end", () => {
    assert.equal(energyColor(0), "rgb(79,184,196)");
  });

  it("passes through bone in the middle", () => {
    assert.equal(energyColor(0.5), "rgb(234,230,222)");
  });

  it("is amber near the top", () => {
    assert.equal(energyColor(0.84), "rgb(248,181,101)");
  });

  it("is red at the drop, and only at the drop", () => {
    assert.equal(energyColor(DROP_THRESHOLD), "rgb(226,61,40)");
    assert.equal(energyColor(1), "rgb(226,61,40)");
    assert.notEqual(energyColor(DROP_THRESHOLD - 0.01), "rgb(226,61,40)");
  });

  it("survives nonsense input rather than producing NaN", () => {
    assert.equal(energyColor(-5), "rgb(79,184,196)");
    assert.equal(energyColor(99), "rgb(226,61,40)");
    assert.equal(energyColor(Number.NaN).includes("NaN"), false);
  });
});
