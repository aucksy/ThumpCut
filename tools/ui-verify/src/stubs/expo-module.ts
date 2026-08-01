/**
 * A do-nothing stand-in for the Expo modules the screens import but never exercise while
 * being measured. Anything genuinely native stays on the device checklist rather than being
 * faked convincingly enough to hide a problem.
 */

const noop = async () => undefined;

export const requestPermissionsAsync = noop;
export const getPermissionsAsync = noop;
export const usePermissions = () => [null, noop, noop] as const;
export const launchImageLibraryAsync = noop;
export const getAssetsAsync = async () => ({ assets: [], hasNextPage: false, endCursor: "" });
export const createAssetAsync = noop;
export const saveToLibraryAsync = noop;
export const startActivityAsync = noop;
export const openSettings = noop;
export const openURL = noop;
export const canOpenURL = async () => false;
export const useKeepAwake = () => undefined;
export const activateKeepAwakeAsync = noop;
export const deactivateKeepAwake = noop;
export const preventAutoHideAsync = noop;
export const hideAsync = noop;
export const useRouter = () => ({ push: noop, back: noop, replace: noop });
export const useLocalSearchParams = () => ({});
export const Link = () => null;
export const Stack = () => null;

export default {};
