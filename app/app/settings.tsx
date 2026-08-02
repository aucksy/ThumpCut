/** Settings. Almost empty, and that is the message. */

import { Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { SettingsScreen } from "../src/screens/index.tsx";

/**
 * Served from this repository by the same CDN the song list uses, so it exists for as long
 * as the project does. The app collects nothing, and the page says exactly that.
 */
const PRIVACY_URL = "https://cdn.jsdelivr.net/gh/aucksy/ThumpCut@main/docs/privacy.html";

export default function SettingsRoute() {
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? "1.0.0";
  // The build number of the platform we are actually running on. Reading the iOS field on an
  // Android phone showed "(1)" for ever, whatever build was installed.
  const build =
    Platform.OS === "android"
      ? String(Constants.expoConfig?.android?.versionCode ?? "1")
      : (Constants.expoConfig?.ios?.buildNumber ?? "1");

  return (
    <SettingsScreen
      exportQuality="1080p"
      version={`ThumpCut ${version} (${build})`}
      onBack={() => router.back()}
      onPrivacyPolicy={() => void Linking.openURL(PRIVACY_URL)}
    />
  );
}
