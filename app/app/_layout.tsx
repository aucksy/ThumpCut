/**
 * The app shell.
 *
 * One flow, not four sections — so there is no tab bar here and there never will be. Screens
 * are pushed and popped; the header is drawn by each screen, because each one's header is part
 * of its design rather than a generic bar.
 */

import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View } from "react-native";
import { colors } from "@thumpcut/design-tokens";
import { AppStateProvider } from "../src/state/AppState.tsx";
import { FaultScreen } from "../src/screens/index.tsx";

void SplashScreen.preventAutoHideAsync();

/**
 * Expo Router renders this instead of unmounting when anything below throws.
 *
 * Without it a startup failure closes the app on the phone and takes its reason with it, and
 * reading Android's own crash log needs a laptop and a cable. This is what turns "it does not
 * even launch" into a sentence somebody can photograph.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  // The splash screen is still up at this point on a cold start, and hiding it is the
  // difference between showing the failure and showing nothing at all.
  void SplashScreen.hideAsync();
  return <FaultScreen error={error} onRetry={retry} />;
}

/**
 * How long the app will wait for its typefaces before giving up on them.
 *
 * There is no third state here on purpose. Either the fonts arrive, or the app starts anyway in
 * whatever face the phone has. What it must never do is sit on a blank screen indefinitely,
 * which is what it did on the first build handed over: font loading failed silently, the gate
 * below never opened, and from the outside the app simply did not launch.
 */
const FONT_WAIT_MS = 4000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    // Every number in this product is set in the mono face, so the app waits for these rather
    // than showing a screen of numbers in the wrong typeface for a frame.
    // All three are SIL Open Font Licence — see assets/fonts/OFL-*.txt.
    Archivo: require("../assets/fonts/Archivo-Variable.ttf"),
    PublicSans: require("../assets/fonts/PublicSans-Variable.ttf"),
    JetBrainsMono: require("../assets/fonts/JetBrainsMono-Variable.ttf"),
  });
  const [waitedLongEnough, setWaitedLongEnough] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedLongEnough(true), FONT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  // A font that will not load is a cosmetic problem. A screen that never appears is not.
  const ready = fontsLoaded || fontError !== null || waitedLongEnough;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bgApp }} />;

  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bgApp },
            // Hard cuts, never a crossfade. A crossfading interface undercuts an app whose
            // entire premise is cutting on the beat.
            animation: "fade",
            animationDuration: 120,
          }}
        />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
