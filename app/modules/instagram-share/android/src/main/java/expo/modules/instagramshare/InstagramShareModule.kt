package expo.modules.instagramshare

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Handing a finished reel to another app.
 *
 * Instagram's Reels composer is the original path. Two more exist for reels that carry
 * their own music: a direct hand-off to a named app (YouTube — a vertical video under
 * three minutes becomes a Short on its own), and the system share sheet for everything
 * else. Both use the same FileProvider URI discipline as the Instagram path.
 *
 * Two things here are not optional and both have bitten this integration before:
 *
 * 1. The content URI **must** come from a FileProvider. A raw `file://` URI throws
 *    FileUriExposedException on any modern Android.
 * 2. `resolveActivity` passing does not guarantee `startActivity` succeeds. An Instagram old
 *    enough to lack ADD_TO_REEL resolves and then throws. Always wrapped.
 *
 * And one Android 11 rule: `queryIntentActivities` only sees an app that is declared in the
 * manifest's `<queries>`. YouTube and TikTok are declared by the share config plugin — a
 * package missing there reports "not installed" on a phone where it is on the home screen.
 */
class InstagramShareModule : Module() {

  companion object {
    private const val INSTAGRAM_PACKAGE = "com.instagram.android"
    private const val ADD_TO_REEL = "com.instagram.share.ADD_TO_REEL"
    private const val EXTRA_APPLICATION_ID = "com.instagram.platform.extra.APPLICATION_ID"
    private const val VIDEO_MIME = "video/mp4"
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

    /** Can `packageName` accept a plain video share? Needs a `<queries>` entry to see it. */
    AsyncFunction("isPackageAvailable") { packageName: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val intent = Intent(Intent.ACTION_SEND).apply {
        setPackage(packageName)
        type = VIDEO_MIME
      }
      context.packageManager
        .queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
        .isNotEmpty()
    }

    /** Hand the reel to one named app — YouTube's upload flow, in practice. */
    AsyncFunction("shareToPackage") { videoPath: String, packageName: String ->
      val (context, activity, contentUri) = prepare(videoPath)

      val intent = Intent(Intent.ACTION_SEND).apply {
        setPackage(packageName)
        type = VIDEO_MIME
        putExtra(Intent.EXTRA_STREAM, contentUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      context.grantUriPermission(packageName, contentUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)

      try {
        activity.startActivity(intent)
      } catch (error: Throwable) {
        throw CodedException("ERR_HANDOFF_FAILED", "That app would not accept the reel.", error)
      }
    }

    /** The system share sheet — every app the phone has, the user picks. */
    AsyncFunction("shareSystem") { videoPath: String ->
      val (_, activity, contentUri) = prepare(videoPath)

      val send = Intent(Intent.ACTION_SEND).apply {
        type = VIDEO_MIME
        putExtra(Intent.EXTRA_STREAM, contentUri)
        // The chooser forwards permission to whichever app is picked only when the URI also
        // rides in ClipData with the grant flag. Without this, some targets open and then
        // cannot read the file — a failure that looks like the target app's fault.
        clipData = ClipData.newRawUri("reel", contentUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }

      try {
        activity.startActivity(Intent.createChooser(send, null))
      } catch (error: Throwable) {
        throw CodedException("ERR_HANDOFF_FAILED", "Nothing could accept the reel.", error)
      }
    }
  }

  /** The shared preamble: context, foreground activity, and a FileProvider URI (S4). */
  private fun prepare(videoPath: String): Triple<android.content.Context, android.app.Activity, Uri> {
    val context = appContext.reactContext
      ?: throw CodedException("ERR_NO_CONTEXT", "The app has no context to share from.", null)
    val activity = appContext.currentActivity
      ?: throw CodedException("ERR_NO_ACTIVITY", "The app is not in the foreground.", null)

    val file = File(videoPath.removePrefix("file://"))
    if (!file.exists()) {
      throw CodedException("ERR_FILE_MISSING", "The reel is no longer on disk.", null)
    }

    val contentUri: Uri = FileProvider.getUriForFile(
      context,
      "${context.packageName}.fileprovider",
      file
    )
    return Triple(context, activity, contentUri)
  }
}
