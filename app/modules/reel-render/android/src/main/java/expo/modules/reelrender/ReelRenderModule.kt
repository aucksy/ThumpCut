package expo.modules.reelrender

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.audio.SpeedProvider
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.InAppMp4Muxer
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine
import kotlin.math.max

/**
 * Composing the reel on Android, with Media3 Transformer.
 *
 * `react-native-media-toolkit` was the spec's first choice, but it crops, trims and compresses
 * a *single* file — it cannot compose a timeline of clips and stills, which is the entire job.
 * Media3 Transformer is what that library would have wrapped, so this uses it directly.
 *
 * Four things here are structural rather than stylistic, and each of them is a bug that would
 * otherwise only show up on a real phone:
 *
 *   · **Everything Transformer touches happens on the main thread.** Transformer must be built,
 *     started, polled and cancelled from one thread, and that thread must have a Looper. Expo's
 *     `AsyncFunction` runs on a background queue that has neither.
 *   · **`cancel()` does not call the listener.** Cancelling would leave the JavaScript promise
 *     unresolved for ever and freeze the export sheet, so cancellation resolves the waiting
 *     continuation itself.
 *   · **Progress is polled, not pushed.** Transformer has no progress callback. Without the
 *     poll the ring sits at zero for the whole export and looks hung.
 *   · **Source rotation is left alone.** Media3 applies a video's rotation metadata and a
 *     photo's EXIF orientation before effects run. Re-applying it here would turn every
 *     sideways clip the wrong way twice.
 *
 * The three memory rules are the difference between working and crashing on a 2GB phone:
 *
 *   R-I4  One `Transformer` runs at a time, over one sequence. Nothing decodes in parallel.
 *   R-I5  Stills are decoded one at a time with `inSampleSize`, so no more than a couple of
 *         bitmaps are alive at once.
 *   R-I6  Every decode is downsampled towards 1080x1920 — never the full 4032x3024 a phone
 *         camera hands you.
 */
@UnstableApi
class ReelRenderModule : Module() {

  companion object {
    private const val OUTPUT_WIDTH = 1080
    private const val OUTPUT_HEIGHT = 1920
    private const val FRAME_RATE = 30
    private const val PROGRESS_POLL_MS = 250L
  }

  /** Everything below is touched only from this thread. See the class comment. */
  private val main = Handler(Looper.getMainLooper())

  private var transformer: Transformer? = null
  private var pending: Pending? = null
  private var poll: Runnable? = null

  /** One render, and the single place that decides it is over. */
  private class Pending(val continuation: Continuation<Double>) {
    var settled = false
  }

  override fun definition() = ModuleDefinition {
    Name("ReelRender")

    Events("onProgress")

    AsyncFunction("render") Coroutine { cuts: List<Map<String, Any?>>, outputPath: String ->
      runRender(cuts, outputPath)
    }

    AsyncFunction("cancel") {
      main.post { abort("cancelled", "The export was cancelled.") }
    }

    /**
     * Read a still at output resolution or lower — never at full source resolution (R-I6).
     * A 12-megapixel photo decoded whole is 48MB of bitmap; on a 2GB phone three of those in
     * flight is the crash.
     */
    AsyncFunction("decodeStillDownscaled") { path: String, maxWidth: Int, maxHeight: Int ->
      val cleaned = path.removePrefix("file://")
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(cleaned, bounds)

      var sample = 1
      while (
        bounds.outWidth / sample > maxWidth * 2 || bounds.outHeight / sample > maxHeight * 2
      ) {
        sample *= 2
      }

      val options = BitmapFactory.Options().apply {
        inSampleSize = sample
        inPreferredConfig = Bitmap.Config.RGB_565
      }
      val bitmap = BitmapFactory.decodeFile(cleaned, options)
        ?: throw CodedException("ERR_DECODE", "That image could not be read.", null)
      val size = mapOf("width" to bitmap.width, "height" to bitmap.height)
      bitmap.recycle()
      size
    }

    AsyncFunction("probe") { path: String ->
      val retriever = MediaMetadataRetriever()
      try {
        retriever.setDataSource(path.removePrefix("file://"))
        mapOf(
          "durationSec" to
            (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
              ?.toDoubleOrNull() ?: 0.0) / 1000.0,
          "width" to (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
            ?.toIntOrNull() ?: 0),
          "height" to (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
            ?.toIntOrNull() ?: 0),
          "rotationDeg" to (retriever.extractMetadata(
            MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION
          )?.toIntOrNull() ?: 0)
        )
      } catch (error: Throwable) {
        throw CodedException("ERR_PROBE", "That file could not be read.", error)
      } finally {
        retriever.release()
      }
    }

    // A render that outlives its screen would keep an encoder and a wake lock alive.
    OnDestroy {
      main.post { abort("cancelled", "The export was cancelled.") }
    }
  }

  // -------------------------------------------------------------------------
  // The render itself
  // -------------------------------------------------------------------------

  private suspend fun runRender(cuts: List<Map<String, Any?>>, outputPath: String): Double =
    suspendCoroutine { continuation ->
      val context = appContext.reactContext
      if (context == null) {
        continuation.resumeWithException(
          CodedException("unknown", "The app has no context to render in.", null)
        )
        return@suspendCoroutine
      }
      main.post {
        if (pending != null) {
          // R-I8 — one render at a time. The orchestrator already guards this; so does this.
          continuation.resumeWithException(
            CodedException("unknown", "An export is already running.", null)
          )
          return@post
        }
        val holder = Pending(continuation)
        pending = holder
        try {
          begin(context, cuts, outputPath, holder)
        } catch (error: Throwable) {
          settle(holder) { it.resumeWithException(asCoded(error)) }
        }
      }
    }

  private fun begin(
    context: Context,
    cuts: List<Map<String, Any?>>,
    outputPath: String,
    holder: Pending,
  ) {
    val output = File(outputPath.removePrefix("file://"))
    output.parentFile?.mkdirs()
    if (output.exists()) output.delete()

    if (cuts.isEmpty()) throw CodedException("unknown", "There is nothing to render.", null)

    val items = cuts.map(::toEditedMediaItem)

    val sequence = EditedMediaItemSequence.Builder(setOf(C.TRACK_TYPE_VIDEO))
      .addItems(items)
      .build()
    val composition = Composition.Builder(sequence).build()

    val built = Transformer.Builder(context)
      .setVideoMimeType(MimeTypes.VIDEO_H264)
      // The platform muxer writes the moov atom last, and §2.1 rejects that outright.
      .setMuxerFactory(InAppMp4Muxer.Factory())
      .addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, result: ExportResult) {
          val seconds = result.durationMs.toDouble() / 1000.0
          settle(holder) { it.resume(seconds) }
        }

        override fun onError(
          composition: Composition,
          result: ExportResult,
          exception: ExportException,
        ) {
          val code = when {
            exception.errorCode == ExportException.ERROR_CODE_IO_NO_PERMISSION -> "storageFull"
            exception.errorCode == ExportException.ERROR_CODE_IO_FILE_NOT_FOUND -> "unknown"
            exception.cause is OutOfMemoryError -> "outOfMemory"
            else -> "unknown"
          }
          settle(holder) {
            it.resumeWithException(
              CodedException(code, exception.message ?: "The export failed.", exception)
            )
          }
        }
      })
      .build()

    transformer = built
    built.start(composition, output.absolutePath)
    startPolling()
  }

  private fun toEditedMediaItem(cut: Map<String, Any?>): EditedMediaItem {
    val uri = cut["uri"] as? String
      ?: throw CodedException("unknown", "A cut has no source.", null)
    val kind = cut["kind"] as? String ?: "photo"
    val startMs = ((cut["sourceInSec"] as? Double ?: 0.0) * 1000).toLong()
    val endMs = ((cut["sourceOutSec"] as? Double ?: 0.0) * 1000).toLong()
    val durationUs = ((cut["durationSec"] as? Double ?: 0.0) * 1_000_000).toLong()
    val speed = (cut["speed"] as? Double ?: 1.0).toFloat()

    // Centre-crop to 9:16 rather than letterbox. Bars on a reel look like a mistake.
    // Source rotation is deliberately not applied here — see the class comment.
    val effects: List<Effect> = listOf(
      Presentation.createForWidthAndHeight(
        OUTPUT_WIDTH,
        OUTPUT_HEIGHT,
        Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP,
      )
    )

    val mediaItem = if (kind == "photo") {
      MediaItem.fromUri(Uri.parse(uri))
    } else {
      MediaItem.Builder()
        .setUri(Uri.parse(uri))
        .setClippingConfiguration(
          MediaItem.ClippingConfiguration.Builder()
            .setStartPositionMs(startMs)
            .setEndPositionMs(max(endMs, startMs + 1))
            .build()
        )
        .build()
    }

    val builder = EditedMediaItem.Builder(mediaItem)
      .setEffects(Effects(emptyList(), effects))
      // The export is silent by design. Removing audio here means no stray silent track can
      // survive into the file (G2).
      .setRemoveAudio(true)

    if (kind == "photo") {
      builder.setDurationUs(max(durationUs, 1L))
      builder.setFrameRate(FRAME_RATE)
    } else if (speed != 1.0f && speed > 0f) {
      // A slot the clip does not exactly fill is filled by playing it faster or slower. If this
      // is dropped the cut runs short or long and every cut after it slides off the beat.
      builder.setSpeed(ConstantSpeed(speed))
    }

    return builder.build()
  }

  /** Transformer has no progress callback, so the progress bar has to ask. */
  private fun startPolling() {
    val holder = ProgressHolder()
    val runnable = object : Runnable {
      override fun run() {
        val active = transformer ?: return
        val state = active.getProgress(holder)
        if (state == Transformer.PROGRESS_STATE_AVAILABLE) {
          sendEvent("onProgress", mapOf("fraction" to holder.progress / 100.0))
        }
        if (state != Transformer.PROGRESS_STATE_NOT_STARTED) {
          main.postDelayed(this, PROGRESS_POLL_MS)
        }
      }
    }
    poll = runnable
    main.postDelayed(runnable, PROGRESS_POLL_MS)
  }

  /**
   * Stop whatever is running and fail the waiting promise.
   *
   * `Transformer.cancel()` deliberately does not call the listener, so without this the export
   * sheet would sit on "Cancelling" for ever.
   */
  private fun abort(code: String, message: String) {
    val holder = pending ?: return
    try {
      transformer?.cancel()
    } catch (_: Throwable) {
      // Already finished, or never started.
    }
    settle(holder) { it.resumeWithException(CodedException(code, message, null)) }
  }

  /** The only place a render is allowed to end. Resumes exactly once. */
  private fun settle(holder: Pending, finish: (Continuation<Double>) -> Unit) {
    if (holder.settled) return
    holder.settled = true

    poll?.let { main.removeCallbacks(it) }
    poll = null
    transformer = null
    if (pending === holder) pending = null

    finish(holder.continuation)
  }

  private fun asCoded(error: Throwable): CodedException =
    error as? CodedException
      ?: CodedException("unknown", error.message ?: "The export failed.", error)

  /** One speed for the whole clip. Media3 wants a provider; the cut engine has one number. */
  private class ConstantSpeed(private val speed: Float) : SpeedProvider {
    override fun getSpeed(timeUs: Long): Float = speed
    override fun getNextSpeedChangeTimeUs(timeUs: Long): Long = C.TIME_UNSET
  }
}
