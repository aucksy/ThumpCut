/**
 * The harness entry point.
 *
 * Renders one screen state at a time into a 393x852 frame, then exposes three functions the
 * checker drives from outside the page:
 *
 *   window.__TC_RENDER__(id, fontScale)  render a state
 *   window.__TC_MEASURE__()              measure what is on screen and report problems
 *   window.__TC_STATES__                 the list of states to walk
 *
 * Measuring in a real browser, rather than asserting on a style object, is the point: it
 * catches a control that ended up 32px tall because of a flex rule three components up, which
 * no amount of reading the source would have shown.
 */

import { createRoot, type Root } from "react-dom/client";
import { StrictMode } from "react";
import { AppRegistry, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SCREEN_STATES } from "./states.tsx";
import { measure } from "./measure.ts";

declare global {
  interface Window {
    __TC_READY__: boolean;
    __TC_RENDERED__: string | null;
    __TC_STATES__: { id: string; title: string }[];
    __TC_RENDER__: (id: string, fontScale: number, width: number, height: number) => void;
    __TC_MEASURE__: () => { problems: string[] };
  }
}

/** A phone's real safe areas. Without these the layout is measured in a world that does not exist. */
const INSETS = { top: 44, bottom: 34, left: 0, right: 0 };

const container = document.getElementById("root");
if (!container) throw new Error("the harness page has no #root");

const frame = document.createElement("div");
frame.id = "tc-screen";
frame.style.overflow = "hidden";
frame.style.position = "relative";
frame.style.backgroundColor = "#17181A";
container.appendChild(frame);

let root: Root | null = null;
let currentWidth = 393;
let currentHeight = 852;

/**
 * Point the app's font family names at faces this machine actually has.
 *
 * React Native asks for `PublicSans` with no fallback, because on a device that font is
 * bundled. A browser with no match falls all the way back to Times — which made every
 * screenshot look like a different product and threw off every text measurement. These
 * substitutes are chosen for similar metrics, not similar looks.
 */
const FONT_STACKS: Record<string, string> = {
  Archivo: '"Archivo", "Archivo Black", "Arial Black", Impact, sans-serif',
  PublicSans: '"Public Sans", "Segoe UI", Roboto, Arial, sans-serif',
  JetBrainsMono: '"JetBrains Mono", "Cascadia Mono", Consolas, "Courier New", monospace',
};

function applyFontStacks(): void {
  for (const element of Array.from(frame.querySelectorAll<HTMLElement>("*"))) {
    const family = getComputedStyle(element).fontFamily.replace(/["']/g, "").split(",")[0]?.trim();
    const stack = family ? FONT_STACKS[family] : undefined;
    if (stack) element.style.fontFamily = stack;
  }
}

/**
 * Apply the system font scale the way a phone does.
 *
 * React Native multiplies every `fontSize` by the OS font scale unless a component opts out.
 * React Native Web does not, so the harness does it itself: walk the rendered tree and
 * multiply each computed font size. Without this, "large type does not clip the counter" is
 * a rule nobody ever actually checks.
 */
function applyFontScale(scale: number): void {
  if (scale === 1) return;
  for (const element of Array.from(frame.querySelectorAll<HTMLElement>("*"))) {
    // A brand mark is not prose. Anything tagged this way opts out on a device too, via
    // `allowFontScaling={false}`.
    if (element.closest('[data-tc-no-font-scale="true"]')) continue;
    const size = Number.parseFloat(getComputedStyle(element).fontSize);
    if (!Number.isFinite(size) || size <= 0) continue;
    element.style.fontSize = `${size * scale}px`;
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
    if (Number.isFinite(lineHeight) && lineHeight > 0) {
      element.style.lineHeight = `${lineHeight * scale}px`;
    }
  }
}

function render(id: string, fontScale: number, width: number, height: number): void {
  const state = SCREEN_STATES.find((candidate) => candidate.id === id);
  if (!state) throw new Error(`no such screen state: ${id}`);

  currentWidth = width;
  currentHeight = height;
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;

  // A fresh root per state, on purpose. The font-scale pass writes inline font sizes, and
  // reusing the tree meant the next state was scaled on top of the last one — by the fortieth
  // screen a duration badge was three times its real width and the gate was reporting
  // overflow that no phone would ever show.
  if (root) root.unmount();
  root = createRoot(frame);
  root.render(
    <StrictMode>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width, height },
          insets: INSETS,
        }}
      >
        <View style={{ width, height }}>{state.render()}</View>
      </SafeAreaProvider>
    </StrictMode>,
  );

  // React 19 renders synchronously enough for this, but a frame of settle time keeps the
  // measurement honest about anything that lays out on mount.
  requestAnimationFrame(() => {
    applyFontStacks();
    requestAnimationFrame(() => {
      applyFontScale(fontScale);
      requestAnimationFrame(() => {
        window.__TC_RENDERED__ = id;
      });
    });
  });
}

window.__TC_RENDERED__ = null;
window.__TC_STATES__ = SCREEN_STATES.map((state) => ({ id: state.id, title: state.title }));
window.__TC_RENDER__ = (id, fontScale, width, height) => {
  window.__TC_RENDERED__ = null;
  render(id, fontScale, width, height);
};
window.__TC_MEASURE__ = () => measure(frame, { width: currentWidth, height: currentHeight });

// react-native-web wants an app registered before its StyleSheet flushes.
AppRegistry.registerComponent("ThumpCut", () => () => null);
window.__TC_READY__ = true;
