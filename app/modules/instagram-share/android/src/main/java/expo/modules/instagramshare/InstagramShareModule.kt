package expo.modules.instagramshare

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Handing a finished reel to Instagram's Reels composer.
 *
 * Two things here are not optional and both have bitten this integration before:
 *
 * 1. The content URI **must** come from a FileProvider. A raw `file://` URI throws
 *    FileUriExposedException on any modern Android.
 * 2. `resolveActivity` passing does not guarantee `startActivity` succeeds. An Instagram old
 *    enough to lack ADD_TO_REEL resolves and then throws. Always wrapped.
 */
class InstagramShareModule : Module() {

  companion object {
    private const val INSTAGRAM_PACKAGE = "com.instagram.android"
    private const val ADD_TO_REEL = "com.instagram.share.ADD_TO_REEL"
    private const val EXTRA_APPLICATION_ID = "com.instagram.platform.extra.APPLICATION_ID"
  }

  override fun definition() = ModuleDefinition {
    Name("InstagramShare")

    AsyncFunction("isAvailable") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val intent = Intent(ADD_TO_REEL).apply {
        setPackage(INSTAGRAM_PACKAGE)
        type = "video/*"
      }
      val manager = context.packageManager
      val resolved = manager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
      resolved.isNotEmpty()
    }

    AsyncFunction("shareToReels") { videoPath: String, metaAppId: String ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_NO_CONTEXT", "The app has no context to share from.", null)
      val activity = appContext.currentActivity
        ?: throw CodedException("ERR_NO_ACTIVITY", "The app is not in the foreground.", null)

      val file = File(videoPath.removePrefix("file://"))
      if (!file.exists()) {
        throw CodedException("ERR_FILE_MISSING", "The reel is no longer on disk.", null)
      }

      // S4 — a FileProvider URI, never file://.
      val contentUri: Uri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file
      )

      val intent = Intent(ADD_TO_REEL).apply {
        setPackage(INSTAGRAM_PACKAGE)
        type = "video/*"
        putExtra(EXTRA_APPLICATION_ID, metaAppId)
        putExtra(Intent.EXTRA_STREAM, contentUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }

      // Grant read access explicitly as well: on some OEM builds the flag alone is not enough.
      context.grantUriPermission(
        INSTAGRAM_PACKAGE,
        contentUri,
        Intent.FLAG_GRANT_READ_URI_PERMISSION
      )

      try {
        activity.startActivity(intent)
      } catch (error: Throwable) {
        // Resolving is not the same as launching. An Instagram too old for ADD_TO_REEL lands
        // here, and the app has to offer "save and share it manually" rather than crash.
        throw CodedException(
          "ERR_HANDOFF_FAILED",
          "Instagram would not accept the reel.",
          error
        )
      }
    }
  }
}
