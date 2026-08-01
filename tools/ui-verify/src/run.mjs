#!/usr/bin/env node
/**
 * ThumpCut's UI self-check.
 *
 *   npm run verify:ui            all gates
 *   npm run verify:ui -- --screens   only render, measure and screenshot
 *
 * Four gates, in order of how cheap they are to run:
 *
 *   1. Tokens    — every colour, radius and border in a screen comes from the design system.
 *   2. Copy      — every exact string in a spec error catalogue appears verbatim in the app.
 *   3. Geometry  — every screen state renders at 393x852 and is measured: tap targets at least
 *                  44pt, nothing overflowing the screen, no clipped or zero-size text.
 *   4. Pictures  — a screenshot of every state, written to artifacts/ui/.
 *
 * A green build with an ugly screenshot is still a failure. Look at the pictures.
 */

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { runTokenGate } from "./gates/tokens.mjs";
import { runCopyGate } from "./gates/copy.mjs";
import { runScreenGate } from "./gates/screens.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");

const argv = process.argv.slice(2);
const only = {
  screens: argv.includes("--screens"),
  static: argv.includes("--static"),
};
const runAll = !only.screens && !only.static;

const GREEN = "[32m";
const RED = "[31m";
const DIM = "[2m";
const BOLD = "[1m";
const RESET = "[0m";

function report(result) {
  const ok = result.failures.length === 0;
  const badge = ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
  console.log(`${badge}  ${BOLD}${result.name}${RESET}  ${DIM}${result.summary}${RESET}`);
  for (const failure of result.failures.slice(0, 40)) {
    console.log(`      ${RED}·${RESET} ${failure.detail}`);
  }
  if (result.failures.length > 40) {
    console.log(`      ${DIM}… and ${result.failures.length - 40} more${RESET}`);
  }
  return ok;
}

async function main() {
  console.log(`\n${BOLD}ThumpCut UI verification${RESET}\n`);

  const results = [];

  if (runAll || only.static) {
    results.push(runTokenGate({ repoRoot: REPO_ROOT }));
    results.push(runCopyGate({ repoRoot: REPO_ROOT }));
  }

  if (runAll || only.screens) {
    const screensEntry = join(REPO_ROOT, "tools", "ui-verify", "src", "harness", "states.tsx");
    if (!existsSync(screensEntry)) {
      console.log(
        `${DIM}SKIP  Geometry and Pictures — the harness has no screen states yet${RESET}`,
      );
    } else {
      results.push(...(await runScreenGate({ repoRoot: REPO_ROOT })));
    }
  }

  console.log("");
  const allPassed = results.map(report).every(Boolean);
  const failureCount = results.reduce((sum, result) => sum + result.failures.length, 0);

  console.log("");
  if (allPassed) {
    console.log(`${GREEN}${BOLD}All UI gates pass.${RESET}`);
    console.log(
      `${DIM}Screenshots, if any, are in artifacts/ui/. A green gate with an ugly screenshot is still a failure — look at them.${RESET}\n`,
    );
    process.exit(0);
  }

  console.log(`${RED}${BOLD}${failureCount} UI problem(s).${RESET}\n`);
  process.exit(1);
}

main().catch((error) => {
  console.error(`${RED}The UI check itself failed to run:${RESET}`, error);
  process.exit(2);
});
