/**
 * The geometry gate and the screenshots.
 *
 * The real screens are bundled for the browser with `react-native` aliased to
 * `react-native-web`, rendered at 393x852 — the exact canvas the design brief specifies — and
 * then *measured*. Not eyeballed: measured. Tap targets, overflow, clipped text, contrast.
 *
 * Why a browser and not a device: a compiled build never proves a screen opens, and there is
 * no Android toolchain here. This runs anywhere, in CI as easily as on a laptop, and catches
 * the class of defect that ships — a control too small to hit, a row that shatters at 360dp,
 * a label clipped at font scale 2.
 *
 * What it cannot catch: anything platform-native. Those stay on the device checklist.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildHarness } from "../bundle.mjs";

const VIEWPORTS = [
  { id: "default", width: 393, height: 852, fontScale: 1 },
  { id: "small", width: 360, height: 640, fontScale: 1 },
  { id: "large-type", width: 393, height: 852, fontScale: 1.6 },
];

/** Only the default viewport is screenshotted; the others exist to catch breakage. */
const SCREENSHOT_VIEWPORT = "default";

export async function runScreenGate({ repoRoot }) {
  const outDir = join(repoRoot, "artifacts", "ui");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const bundle = await buildHarness({ repoRoot });

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return [
      {
        name: "Geometry",
        checked: 0,
        failures: [],
        summary: "skipped — run 'npx playwright install chromium' to enable",
      },
    ];
  }

  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    return [
      {
        name: "Geometry",
        checked: 0,
        failures: [],
        summary: `skipped — Chromium is not installed (${String(error).slice(0, 60)})`,
      },
    ];
  }

  const geometryFailures = [];
  const shots = [];
  let statesChecked = 0;

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        colorScheme: "dark",
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => {
        geometryFailures.push({
          gate: "geometry",
          detail: `${viewport.id}: the harness threw — ${String(error).slice(0, 200)}`,
        });
      });

      await page.setContent(bundle.html, { waitUntil: "domcontentloaded" });
      await page.addScriptTag({ content: bundle.js });
      await page.waitForFunction("window.__TC_READY__ === true", null, { timeout: 30000 });

      const states = await page.evaluate("window.__TC_STATES__");

      for (const state of states) {
        await page.evaluate(
          ([id, scale, width, height]) => window.__TC_RENDER__(id, scale, width, height),
          [state.id, viewport.fontScale, viewport.width, viewport.height],
        );
        await page.waitForFunction(
          ([id]) => window.__TC_RENDERED__ === id,
          [state.id],
          { timeout: 15000 },
        );
        statesChecked += 1;

        const measured = await page.evaluate(() => window.__TC_MEASURE__());
        for (const problem of measured.problems) {
          geometryFailures.push({
            gate: "geometry",
            detail: `${state.id} @ ${viewport.id}: ${problem}`,
          });
        }

        if (viewport.id === SCREENSHOT_VIEWPORT) {
          const file = join(outDir, `${state.id}.png`);
          const element = await page.$("#tc-screen");
          if (element) await element.screenshot({ path: file });
          else await page.screenshot({ path: file });
          shots.push({ id: state.id, title: state.title, file: `${state.id}.png` });
        }
      }

      await context.close();
    }

    writeFileSync(
      join(outDir, "index.html"),
      buildContactSheet(shots),
      "utf8",
    );
  } finally {
    await browser.close();
  }

  return [
    {
      name: "Geometry",
      checked: statesChecked,
      failures: geometryFailures,
      summary: `${statesChecked} screen states measured across ${VIEWPORTS.length} viewports`,
    },
    {
      name: "Pictures",
      checked: shots.length,
      failures: [],
      summary: `${shots.length} screenshots in artifacts/ui/ — open index.html`,
    },
  ];
}

function buildContactSheet(shots) {
  const cards = shots
    .map(
      (shot) => `
    <figure>
      <img src="${shot.file}" alt="${shot.title}" loading="lazy" />
      <figcaption>${shot.title}</figcaption>
    </figure>`,
    )
    .join("");

  return `<!doctype html>
<meta charset="utf-8" />
<title>ThumpCut screens</title>
<style>
  body { background:#0e0f11; color:#EAE6DE; font-family: ui-sans-serif, system-ui; margin:0; padding:32px; }
  h1 { font-size:20px; letter-spacing:-0.02em; margin:0 0 4px; }
  p { color:rgba(234,230,222,.55); font-size:13px; margin:0 0 28px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:24px; }
  figure { margin:0; }
  img { width:100%; border-radius:8px; border:1px solid rgba(234,230,222,.12); display:block; background:#17181A; }
  figcaption { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:rgba(234,230,222,.55); margin-top:8px; }
</style>
<h1>ThumpCut — every screen, every state</h1>
<p>${shots.length} states rendered at 393×852. Measured for tap targets, overflow and clipping.</p>
<div class="grid">${cards}</div>
`;
}
