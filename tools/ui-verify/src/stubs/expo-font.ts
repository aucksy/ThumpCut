/** `expo-font` for the harness. Fonts are pinned in the harness stylesheet instead. */

export function useFonts(): [boolean, Error | null] {
  return [true, null];
}
export async function loadAsync(): Promise<void> {}
export function isLoaded(): boolean {
  return true;
}

export default { useFonts, loadAsync, isLoaded };
