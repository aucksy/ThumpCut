/** Settings. Almost empty, and that is the message. */

import { Linking } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { SettingsScreen } from "../src/screens/index.tsx";

const PRIVACY_URL = "https://thumpcut.app/privacy";

export default function SettingsRoute() {
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? "1.0.0";
  const build = Constants.expoConfig?.ios?.buildNumber ?? "1";

  return (
    <SettingsScreen
      exportQuality="1080p"
      version={`ThumpCut ${version} (${build})`}
      onBack={() => router.back()}
      onPrivacyPolicy={() => void Linking.openURL(PRIVACY_URL)}
    />
  );
}
