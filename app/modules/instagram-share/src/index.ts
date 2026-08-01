/**
 * The JavaScript face of the Instagram share module.
 *
 * It never throws for "Instagram is not there" — that is a normal state, and the share screen
 * simply does not draw the button. It throws only when a handoff that should have worked did
 * not, so the app can offer "save the reel and share it manually".
 */

import { requireOptionalNativeModule } from "expo";

export interface InstagramShareNativeModule {
  isAvailable(): Promise<boolean>;
  shareToReels(videoPath: string, metaAppId: string): Promise<void>;
}

const native = requireOptionalNativeModule<InstagramShareNativeModule>("InstagramShare");

export class InstagramHandoffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstagramHandoffError";
  }
}

/**
 * True only when the platform says a Reels share can actually be accepted.
 *
 * On a development build with no native module linked this returns false, and the app behaves
 * exactly as it would on a phone with no Instagram — which is the honest thing for it to do.
 */
export async function isAvailable(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isAvailable();
  } catch {
    return false;
  }
}

export async function shareToReels(videoPath: string, metaAppId: string): Promise<void> {
  if (!native) {
    throw new InstagramHandoffError("The Instagram share module is not available in this build.");
  }
  if (!metaAppId) {
    // Instagram silently ignores a share with no application id, which looks to the user
    // like the app simply did nothing. Fail loudly instead.
    throw new InstagramHandoffError("EXPO_PUBLIC_META_APP_ID is not set in this build.");
  }
  try {
    await native.shareToReels(videoPath, metaAppId);
  } catch (error) {
    throw new InstagramHandoffError(
      error instanceof Error ? error.message : "Instagram would not accept the reel.",
    );
  }
}

export const isNativeModuleLinked = native !== null;
