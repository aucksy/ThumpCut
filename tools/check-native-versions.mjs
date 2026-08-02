/**
 * Fails if any native module compiled into the app comes from a different Expo SDK.
 *
 * This exists because of a specific, expensive bug. `expo-asset` resolved to its **SDK 57**
 * build inside this SDK 55 app, and Expo's autolinker picked that copy to compile in.
 * `expo-asset` is what loads the fonts and images during the first render, so the app died the
 * instant it was opened — while the build was green, the types passed, 306 tests passed and all
 * forty screens rendered and measured cleanly. Nothing anywhere said a word.
 *
 * `npx expo install --check` does not catch it: it inspects the packages listed in
 * package.json, not what the tree actually resolved to underneath them.
 *
 * This asks the autolinker the only question that matters — *which copy are you about to
 * compile?* — and refuses anything that is not on the SDK's own major version.
 *
 * Run:  npm run check:native
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..", "app");
/** Resolved the way the app resolves it, because in a workspace `expo` is hoisted to the root. */
const requireFromApp = createRequire(join(APP, "package.json"));

/**
 * Packages that legitimately do not follow the SDK's version line. React Native community
 * packages have their own numbering, and Expo pins them by range rather than by SDK major.
 */
const NOT_SDK_VERSIONED = [/^react-native-/, /^@react-native/];

function sdkMajor() {
  return requireFromApp("expo/package.json").version.split(".")[0];
}

function linkedModules(platform) {
  // Run the CLI through node directly rather than through npx: npx resolves differently on
  // Windows, in a workspace, and in CI, and this check exists precisely to be trustworthy.
  const cli = requireFromApp.resolve("expo-modules-autolinking/bin/expo-modules-autolinking.js");
  const raw = execFileSync(
    process.execPath,
    [cli, "search", "--platform", platform, "--json"],
    { cwd: APP, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(raw);
}

function check(platform, major) {
  const modules = linkedModules(platform);
  const wrong = [];

  for (const [name, entry] of Object.entries(modules)) {
    if (NOT_SDK_VERSIONED.some((pattern) => pattern.test(name))) continue;
    // Local modules carry no version. They are ours; they are always in step.
    if (!entry.version) continue;

    if (entry.version.split(".")[0] !== major) {
      wrong.push({
        name,
        version: entry.version,
        // The other copies in the tree. One of them is usually the right one, which is what
        // makes this worth reporting rather than just failing.
        alternatives: (entry.duplicates ?? []).map((duplicate) => duplicate.version),
      });
    }
  }

  return wrong;
}

const major = sdkMajor();
let failed = false;

for (const platform of ["android", "ios"]) {
  const wrong = check(platform, major);
  if (wrong.length === 0) {
    console.log(`PASS  ${platform}  every linked native module is on SDK ${major}`);
    continue;
  }

  failed = true;
  console.error(`FAIL  ${platform}  ${wrong.length} native module(s) from another SDK:`);
  for (const item of wrong) {
    const others = item.alternatives.length
      ? ` — the tree also holds ${item.alternatives.join(", ")}`
      : "";
    console.error(`        ${item.name} is ${item.version}, expected ${major}.x${others}`);
  }
}

if (failed) {
  console.error(
    "\nThis compiles, and then the app dies on launch. Pin the package to the SDK's own\n" +
      'version with an "overrides" entry in the root package.json, reinstall, and run again.',
  );
  process.exit(1);
}
