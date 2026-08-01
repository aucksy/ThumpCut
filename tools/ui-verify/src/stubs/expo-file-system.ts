/** `expo-file-system` for the harness. Nothing here touches a disk. */

export const documentDirectory = "/harness/";
export const cacheDirectory = "/harness/cache/";

export async function getInfoAsync() {
  return { exists: false, isDirectory: false, uri: "", size: 0 };
}
export async function makeDirectoryAsync(): Promise<void> {}
export async function readAsStringAsync(): Promise<string> {
  return "";
}
export async function writeAsStringAsync(): Promise<void> {}
export async function deleteAsync(): Promise<void> {}
export async function moveAsync(): Promise<void> {}
export async function readDirectoryAsync(): Promise<string[]> {
  return [];
}
export async function getFreeDiskStorageAsync(): Promise<number> {
  return Number.MAX_SAFE_INTEGER;
}

export default {
  documentDirectory,
  cacheDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
  deleteAsync,
  moveAsync,
  readDirectoryAsync,
  getFreeDiskStorageAsync,
};
