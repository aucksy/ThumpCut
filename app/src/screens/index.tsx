/**
 * Every screen in the app.
 *
 * They are all presentational: state in, pixels out, no data fetching and no navigation
 * inside them. That is what lets the UI checker render all thirty-odd states of them and
 * measure the result, and it is also what makes them readable a year from now.
 */

export { LaunchScreen, type LaunchScreenProps, type LaunchState } from "./Launch.tsx";
export { GalleryScreen, type GalleryScreenProps } from "./Gallery.tsx";
export { MediaSelectScreen, type MediaSelectScreenProps } from "./MediaSelect.tsx";
export { RecommendedScreen, type RecommendedScreenProps } from "./Recommended.tsx";
export {
  PreviewScreen,
  type PreviewAudioMode,
  type PreviewNotice,
  type PreviewScreenProps,
} from "./Preview.tsx";
export { ExportSheet, type ExportSheetProps } from "./ExportSheet.tsx";
export { ShareScreen, type ShareScreenProps } from "./Share.tsx";
export { SettingsScreen, type SettingsScreenProps } from "./Settings.tsx";
export { FaultScreen, type FaultScreenProps } from "./Fault.tsx";
