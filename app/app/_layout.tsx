/**
 * The app shell.
 *
 * One flow, not four sections — so there is no tab bar here and there never will be. Screens
 * are pushed and popped; the header is drawn by each screen, because each one's header is part
 * of its design rather than a generic bar.
 */

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View } from "react-native";
import { colors } from "@thumpcut/design-tokens";
import { AppStateProvider } from "../src/state/AppState.tsx";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    // Every number in this product is set in the mono face, so the app waits for these rather
    // than showing a screen of numbers in the wrong typeface for a frame.
    // All three are SIL Open Font Licence — see assets/fonts/OFL-*.txt.
    Archivo: require("../assets/fonts/Archivo-Variable.ttf"),
    PublicSans: require("../assets/fonts/PublicSans-Variable.ttf"),
    JetBrainsMono: require("../assets/fonts/JetBrainsMono-Variable.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.bgApp }} />;

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
