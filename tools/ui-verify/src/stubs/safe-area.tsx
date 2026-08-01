/**
 * `react-native-safe-area-context` for the harness.
 *
 * The insets are supplied by the harness rather than the platform, so every screenshot is
 * measured against a real phone's safe areas: 44pt of status bar, 34pt of home indicator.
 * Without them the layout would be checked in a world that no device actually has.
 */

import { createContext, useContext, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";

export interface EdgeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const DEFAULT_INSETS: EdgeInsets = { top: 44, bottom: 34, left: 0, right: 0 };

const InsetsContext = createContext<EdgeInsets>(DEFAULT_INSETS);

export function SafeAreaProvider({
  children,
  initialMetrics,
}: {
  children: ReactNode;
  initialMetrics?: { frame: unknown; insets: EdgeInsets };
}) {
  return (
    <InsetsContext.Provider value={initialMetrics?.insets ?? DEFAULT_INSETS}>
      {children}
    </InsetsContext.Provider>
  );
}

export function useSafeAreaInsets(): EdgeInsets {
  return useContext(InsetsContext);
}

export function SafeAreaView({ children, style, ...rest }: ViewProps & { children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View {...rest} style={[{ paddingTop: insets.top, paddingBottom: insets.bottom }, style]}>
      {children}
    </View>
  );
}

export const initialWindowMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: DEFAULT_INSETS,
};
