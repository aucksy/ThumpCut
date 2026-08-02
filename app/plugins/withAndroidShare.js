/**
 * The two Android manifest entries the Instagram handoff cannot work without.
 *
 * Both of them fail *silently*, which is why they are here rather than trusted to be
 * remembered:
 *
 *   1. **A FileProvider.** The share module hands Instagram a `content://` URI built from
 *      `<applicationId>.fileprovider`. With no matching provider declared, Android throws
 *      "Couldn't find meta-data for provider with authority com.thumpcut.app.fileprovider"
 *      the first time anyone taps Share, on every phone.
 *
 *   2. **A `<queries>` entry for Instagram.** From Android 11 an app cannot see another app
 *      unless it declares it. Without this, `queryIntentActivities` returns nothing, the
 *      share module reports "Instagram is not installed", and the button never appears —
 *      on a phone with Instagram sitting on the home screen.
 *
 * There is nothing to configure. The plugin takes no options.
 */

const fs = require("node:fs");
const path = require("node:path");

const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

/**
 * Every app the share screen may need to *detect*. From Android 11, `queryIntentActivities`
 * only sees an app declared here — a package missing from this list reports "not installed"
 * on a phone where it is on the home screen, silently. Launching needs no declaration; only
 * showing or hiding a button does, and that is exactly what the share screen does.
 *
 * TikTok ships under two package names depending on region; both are declared so detection
 * works wherever the phone was bought.
 */
const VISIBLE_PACKAGES = [
  "com.instagram.android",
  "com.google.android.youtube",
  "com.zhiliaoapp.musically",
  "com.ss.android.ugc.trill",
];
const FILE_PROVIDER_AUTHORITY_SUFFIX = ".fileprovider";
const PATHS_RESOURCE = "thumpcut_file_paths";

/**
 * Every directory the app writes a reel to. The export lands in the cache directory; the
 * others are here so a change of output location cannot quietly break sharing.
 */
const FILE_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
  <cache-path name="thumpcut_cache" path="." />
  <files-path name="thumpcut_files" path="." />
  <external-cache-path name="thumpcut_external_cache" path="." />
  <external-files-path name="thumpcut_external_files" path="." />
  <external-path name="thumpcut_external" path="." />
</paths>
`;

function withFileProviderPaths(config) {
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const target = path.join(
        mod.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml",
      );
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, `${PATHS_RESOURCE}.xml`), FILE_PATHS_XML, "utf8");
      return mod;
    },
  ]);
}

function withFileProvider(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) {
      throw new Error(
        "withAndroidShare: the manifest has no <application> element to add the FileProvider to.",
      );
    }

    application.provider = application.provider ?? [];
    const authority = `\${applicationId}${FILE_PROVIDER_AUTHORITY_SUFFIX}`;
    const already = application.provider.some(
      (provider) => provider.$?.["android:authorities"] === authority,
    );
    if (!already) {
      application.provider.push({
        $: {
          "android:name": "androidx.core.content.FileProvider",
          "android:authorities": authority,
          "android:exported": "false",
          "android:grantUriPermissions": "true",
        },
        "meta-data": [
          {
            $: {
              "android:name": "android.support.FILE_PROVIDER_PATHS",
              "android:resource": `@xml/${PATHS_RESOURCE}`,
            },
          },
        ],
      });
    }

    return mod;
  });
}

function withShareTargetsVisible(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    manifest.queries = manifest.queries ?? [];
    if (manifest.queries.length === 0) manifest.queries.push({});
    const queries = manifest.queries[0];

    queries.package = queries.package ?? [];
    for (const packageName of VISIBLE_PACKAGES) {
      const already = queries.package.some(
        (entry) => entry.$?.["android:name"] === packageName,
      );
      if (!already) {
        queries.package.push({ $: { "android:name": packageName } });
      }
    }

    return mod;
  });
}

module.exports = function withAndroidShare(config) {
  return withShareTargetsVisible(withFileProvider(withFileProviderPaths(config)));
};
