/**
 * Bundles the real app screens for the browser.
 *
 * `react-native` is aliased to `react-native-web`, and the handful of Expo modules the screens
 * touch are stubbed — the harness renders the *presentation*, which is what a design system
 * can be checked against. Anything genuinely native stays on the device checklist.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export async function buildHarness({ repoRoot }) {
  const esbuild = await import("esbuild");

  const stubDir = join(repoRoot, "tools", "ui-verify", "src", "stubs");
  const alias = {
    "react-native": "react-native-web",
    "expo-image": join(stubDir, "expo-image.tsx"),
    "expo-video": join(stubDir, "expo-video.tsx"),
    "expo-audio": join(stubDir, "expo-audio.ts"),
    "expo-file-system": join(stubDir, "expo-file-system.ts"),
    "expo-media-library": join(stubDir, "expo-module.ts"),
    "expo-image-picker": join(stubDir, "expo-module.ts"),
    "expo-intent-launcher": join(stubDir, "expo-module.ts"),
    "expo-linking": join(stubDir, "expo-module.ts"),
    "expo-keep-awake": join(stubDir, "expo-module.ts"),
    "expo-splash-screen": join(stubDir, "expo-module.ts"),
    "expo-font": join(stubDir, "expo-font.ts"),
    "expo-router": join(stubDir, "expo-module.ts"),
    "react-native-safe-area-context": join(stubDir, "safe-area.tsx"),
  };

  const result = await esbuild.build({
    entryPoints: [join(repoRoot, "tools", "ui-verify", "src", "harness", "main.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    write: false,
    minify: false,
    sourcemap: false,
    logLevel: "silent",
    alias,
    loader: { ".png": "dataurl", ".jpg": "dataurl", ".ttf": "dataurl" },
    define: {
      "process.env.NODE_ENV": '"development"',
      __DEV__: "true",
      global: "globalThis",
    },
    absWorkingDir: repoRoot,
  });

  const js = result.outputFiles[0].text;
  const html = readFileSync(
    join(repoRoot, "tools", "ui-verify", "src", "harness", "index.html"),
    "utf8",
  );

  return { js, html };
}
