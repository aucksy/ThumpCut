/**
 * The token gate.
 *
 * The design brief's position is restraint, and restraint dies one hardcoded `#FF9E2C` at a
 * time. Every colour, radius and border width in a screen has to come from
 * `@thumpcut/design-tokens`. A raw hex or an off-grid radius fails the build.
 *
 * It also enforces the two rules the brief calls non-negotiable:
 *   · No gradients, no glassmorphism, no shimmer loaders.
 *   · Radii are 8 on cards and 4 on chips. Nothing else is pillowy.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RGBA = /rgba?\(\s*\d[^)]*\)/g;

/**
 * Radii the design system allows: 8pt cards, 4pt chips, and the pill ends of thin bars —
 * a 2pt beat tick with a 1pt radius is a pill, not a rounded rectangle.
 */
const ALLOWED_RADII = new Set([0, 1, 2, 4, 8]);

/** Banned outright by the design brief's "what to avoid" list. */
const BANNED = [
  { pattern: /\bLinearGradient\b/, why: "gradients — every competitor uses purple-to-pink" },
  { pattern: /\bRadialGradient\b/, why: "gradients" },
  { pattern: /\bBlurView\b/, why: "glassmorphism" },
  { pattern: /\bshimmer\b/i, why: "shimmer loaders — nothing is being waited for" },
  { pattern: /\bSkeleton(?!Grid)/, why: "skeleton shimmer" },
  { pattern: /\bparallax\b/i, why: "parallax" },
];

/** Files allowed to hold raw values: the token package itself, and the harness. */
function isExempt(path) {
  return (
    path.includes("design-tokens") ||
    path.includes("ui-verify") ||
    path.endsWith("copy.ts")
  );
}

function walk(directory, out = []) {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if ([".ts", ".tsx"].includes(extname(full))) out.push(full);
  }
  return out;
}

export function runTokenGate({ repoRoot }) {
  const roots = [join(repoRoot, "app", "src")];
  const files = roots.flatMap((root) => {
    try {
      return walk(root);
    } catch {
      return [];
    }
  });

  const failures = [];
  let checked = 0;

  for (const file of files) {
    if (isExempt(file)) continue;
    const source = readFileSync(file, "utf8");
    const where = relative(repoRoot, file).replaceAll("\\", "/");
    checked += 1;

    for (const [index, line] of source.split(/\r?\n/).entries()) {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      for (const match of line.matchAll(HEX)) {
        failures.push({
          gate: "tokens",
          detail: `${where}:${index + 1} uses the raw colour ${match[0]} — import it from @thumpcut/design-tokens`,
        });
      }
      for (const match of line.matchAll(RGBA)) {
        failures.push({
          gate: "tokens",
          detail: `${where}:${index + 1} uses the raw colour ${match[0]} — import it from @thumpcut/design-tokens`,
        });
      }
      for (const rule of BANNED) {
        if (rule.pattern.test(line)) {
          failures.push({
            gate: "tokens",
            detail: `${where}:${index + 1} uses ${rule.why}, which the design brief rules out`,
          });
        }
      }
      for (const match of line.matchAll(/borderRadius:\s*(\d+(?:\.\d+)?)/g)) {
        const value = Number.parseFloat(match[1]);
        if (!ALLOWED_RADII.has(value)) {
          failures.push({
            gate: "tokens",
            detail: `${where}:${index + 1} sets borderRadius ${value} — the system allows 8 on cards and 4 on chips`,
          });
        }
      }
    }
  }

  return {
    name: "Tokens",
    checked,
    failures,
    summary: `${checked} screen files scanned for raw colours, off-grid radii and banned effects`,
  };
}
