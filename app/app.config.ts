import type { ExpoConfig } from "expo/config";

/**
 * ThumpCut's Expo configuration.
 *
 * Three entries here are not cosmetic and the app silently misbehaves without them:
 *
 *   · `LSApplicationQueriesSchemes` must list `instagram-reels`, or `canOpenURL` returns false
 *     for ever and the share button never appears on iOS. There is a test asserting it.
 *   · The Android FileProvider authority must match what the share module builds its content
 *     URI from, or the handoff throws on every modern Android.
 *   · New Architecture is on by default from React Native 0.82 — there is no flag to set
 *     and no way to turn it off, so there is nothing here to configure.
 */

const META_APP_ID = process.env.EXPO_PUBLIC_META_APP_ID ?? "";

const config: ExpoConfig = {
  name: "ThumpCut",
  slug: "thumpcut",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "thumpcut",
  userInterfaceStyle: "dark",
  backgroundColor: "#17181A",

  // Generated from the design tokens by `npm run icons`. Without these the build ships Expo's
  // placeholder, which on a home screen looks like an app that was never finished.
  icon: "./assets/icon/icon.png",

  splash: {
    image: "./assets/icon/splash-icon.png",
    backgroundColor: "#17181A",
    resizeMode: "contain",
  },

  ios: {
    bundleIdentifier: "com.thumpcut.app",
    supportsTablet: false,
    buildNumber: "1",
    infoPlist: {
      // Without this the Instagram button never appears, and nothing errors.
      LSApplicationQueriesSchemes: ["instagram-reels", "instagram"],
      NSPhotoLibraryUsageDescription:
        "ThumpCut needs access to your photos to make a reel.",
      NSPhotoLibraryAddUsageDescription:
        "ThumpCut saves your finished reel to your gallery.",
      UIViewControllerBasedStatusBarAppearance: false,
    },
  },

  android: {
    package: "com.thumpcut.app",
    // Every cloud build gets its own number, so Android treats a new one as an upgrade rather
    // than a sideways reinstall, and so the build a tester is holding can be identified.
    versionCode: Number(process.env.THUMPCUT_BUILD ?? "1"),
    permissions: [
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      // Android 13 and below. Newer versions use the two above.
      "android.permission.READ_EXTERNAL_STORAGE",
    ],
    adaptiveIcon: {
      foregroundImage: "./assets/icon/adaptive-icon.png",
      backgroundColor: "#17181A",
    },
  },

  plugins: [
    "expo-router",
    // Declares the FileProvider the share module builds its content URI from, and makes
    // Instagram visible to the package manager. Both fail silently if they are missing.
    "./plugins/withAndroidShare",
    [
      "expo-image-picker",
      { photosPermission: "ThumpCut needs access to your photos to make a reel." },
    ],
    [
      "expo-media-library",
      {
        photosPermission: "ThumpCut needs access to your photos to make a reel.",
        savePhotosPermission: "ThumpCut saves your finished reel to your gallery.",
        isAccessMediaLocationEnabled: false,
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          // Media3 Transformer, which the renderer composes the timeline with.
          minSdkVersion: 24,
          // 36 because Media3 1.10 refuses to be consumed by anything compiled against less.
          // Compiling against a newer platform only makes newer APIs available; it is
          // `targetSdkVersion` that opts an app in to new runtime behaviour, and that stays
          // where it was.
          compileSdkVersion: 36,
          targetSdkVersion: 35,
        },
        ios: { deploymentTarget: "15.1" },
      },
    ],
  ],

  extra: {
    metaAppId: META_APP_ID,
    catalogueUrl: process.env.EXPO_PUBLIC_CATALOGUE_URL ?? "",
    eas: { projectId: process.env.EAS_PROJECT_ID ?? "" },
  },

  experiments: { typedRoutes: true },
};

export default config;
