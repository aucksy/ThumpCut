package expo.modules.reelrender

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.audio.SpeedProvider
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.MatrixTransformation
import androidx.media3.effect.Presentation
import androidx.media3.effect.RgbMatrix
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
// `Coroutine` is an infix extension on the builder returned by the name-only AsyncFunction, and
// it is not imported by the module DSL. Without this line it reads as an unresolved reference
// and the suspend body will not compile.
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine
import kotlin.math.max
import kotlin.math.min

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

    /** Each side of a crossfade dip: the outgoing shot falls to dark, the incoming one rises. */
    private const val DIP_HALF_US = 150_000L
    /** A zoom punch lands on the cut and settles within four frames. */
    private const val PUNCH_DURATION_US = 130_000L
    private const val PUNCH_FROM_SCALE = 1.08f
    /** Freeze frames are decoded no larger than this on their long side. */
    private const val FREEZE_MAX_DIMENSION = 1920
    /** Below this a part is not worth a media item: it is less than a frame at 30fps. */
    private const val MIN_PART_SEC = 0.02
  }

  /** Everything below is touched only from this thread. See the class comment. */
  private val main = Handler(Looper.getMainLooper())

  private var transformer: Transformer? = null
  private var pending: Pending? = null
  private var poll: Runnable? = null

  /** One render, and the single place that decides it is over. */
  private class Pending(val continuation: Continuation<Double>) {
    var settled = false
    /** Freeze-frame stills extracted for this run. Deleted when the run settles. */
    val scratch = mutableListOf<File>()
  }

  /** One cut as the JavaScript side sent it, typed, with its freeze frame when one is needed. */
  private data class ParsedCut(
    val uri: String,
    val kind: String,
    val durationSec: Double,
    val sourceInSec: Double,
    val sourceOutSec: Double,
    val speed: Double,
    val freezeFromSec: Double?,
    val holdDurationSec: Double,
    val kenBurnsFrom: Double?,
    val kenBurnsTo: Double?,
    val transitionIn: String,
    val freezeFrame: File?,
  )

  override fun definition() = ModuleDefinition {
    Name("ReelRender")

    Events("onProgress")

    AsyncFunction("render") Coroutine {
      cuts: List<Map<String, Any?>>, outputPath: String, audio: Map<String, Any?>? ->
      runRender(cuts, outputPath, audio)
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

  private suspend fun runRender(
    cuts: List<Map<String, Any?>>,
    outputPath: String,
    audio: Map<String, Any?>?,
  ): Double {
    val context = appContext.reactContext
      ?: throw CodedException("unknown", "The app has no context to render in.", null)

    // Freeze frames are decoded here, on the module's background dispatcher, before anything
    // touches the main thread. Extracting a frame takes long enough to jank an animation, and
    // the main thread is where Transformer itself must live.
    val parsed = parseCuts(context, cuts)

    return suspendCoroutine { continuation ->
      main.post {
        if (pending != null) {
          // R-I8 — one render at a time. The orchestrator already guards this; so does this.
          parsed.mapNotNull { it.freezeFrame }.forEach { it.delete() }
          continuation.resumeWithException(
            CodedException("unknown", "An export is already running.", null)
          )
          return@post
        }
        val holder = Pending(continuation)
        holder.scratch.addAll(parsed.mapNotNull { it.freezeFrame })
        pending = holder
        try {
          begin(context, parsed, outputPath, audio, holder)
        } catch (error: Throwable) {
          settle(holder) { it.resumeWithException(asCoded(error)) }
        }
      }
    }
  }

  /** Type every cut, and extract the still any frozen tail will hold on. */
  private fun parseCuts(context: Context, cuts: List<Map<String, Any?>>): List<ParsedCut> {
    val extracted = mutableListOf<File>()
    try {
      return cuts.mapIndexed { index, cut ->
        val uri = cut["uri"] as? String
          ?: throw CodedException("unknown", "A cut has no source.", null)
        val kind = cut["kind"] as? String ?: "photo"
        val holdDurationSec = cut["holdDurationSec"] as? Double ?: 0.0
        val freezeFromSec = cut["freezeFromSec"] as? Double
        val needsStill = kind == "video" && holdDurationSec > MIN_PART_SEC && freezeFromSec != null
        val freezeFrame = if (needsStill) {
          extractFreezeFrame(context, uri, freezeFromSec as Double, index).also(extracted::add)
        } else {
          null
        }
        ParsedCut(
          uri = uri,
          kind = kind,
          durationSec = cut["durationSec"] as? Double ?: 0.0,
          sourceInSec = cut["sourceInSec"] as? Double ?: 0.0,
          sourceOutSec = cut["sourceOutSec"] as? Double ?: 0.0,
          speed = cut["speed"] as? Double ?: 1.0,
          freezeFromSec = freezeFromSec,
          holdDurationSec = holdDurationSec,
          kenBurnsFrom = cut["kenBurnsFrom"] as? Double,
          kenBurnsTo = cut["kenBurnsTo"] as? Double,
          transitionIn = cut["transitionIn"] as? String ?: "cut",
          freezeFrame = freezeFrame,
        )
      }
    } catch (error: Throwable) {
      extracted.forEach { it.delete() }
      throw error
    }
  }

  /**
   * The frame a too-short clip will hold on, saved as a JPEG the composition can show like
   * any photo. Decoded once, bounded in size (R-I5, R-I6), and aimed one frame short of the
   * requested moment so a freeze at the very end of a file still lands on a real frame.
   */
  private fun extractFreezeFrame(context: Context, uri: String, atSec: Double, index: Int): File {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(context, Uri.parse(if (uri.startsWith("/")) "file://$uri" else uri))
      val timeUs = ((atSec * 1_000_000).toLong() - 16_000L).coerceAtLeast(0L)
      val frame = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        retriever.getScaledFrameAtTime(
          timeUs,
          MediaMetadataRetriever.OPTION_CLOSEST,
          FREEZE_MAX_DIMENSION,
          FREEZE_MAX_DIMENSION,
        )
      } else {
        retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST)
      } ?: throw CodedException("unknown", "The clip's last frame could not be read.", null)
      val file = File(context.cacheDir, "reelrender-freeze-$index.jpg")
      try {
        file.outputStream().use { frame.compress(Bitmap.CompressFormat.JPEG, 92, it) }
      } finally {
        frame.recycle()
      }
      return file
    } finally {
      retriever.release()
    }
  }

  private fun begin(
    context: Context,
    cuts: List<ParsedCut>,
    outputPath: String,
    audio: Map<String, Any?>?,
    holder: Pending,
  ) {
    val output = File(outputPath.removePrefix("file://"))
    output.parentFile?.mkdirs()
    if (output.exists()) output.delete()

    if (cuts.isEmpty()) throw CodedException("unknown", "There is nothing to render.", null)

    val items = buildItems(cuts)

    val sequence = EditedMediaItemSequence.Builder(setOf(C.TRACK_TYPE_VIDEO))
      .addItems(items)
      .build()

    // The music, when the export is allowed to carry any. Tracks from Instagram's catalogue
    // are never handed in here — their exports stay silent for ever, for licensing reasons
    // that are not up for revision. This path exists for the user's own music and for
    // royalty-free tracks whose licence permits it.
    val sequences = mutableListOf(sequence)
    if (audio != null) {
      sequences.add(toAudioSequence(audio))
    }
    val composition = Composition.Builder(sequences).build()

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

  /**
   * Expand the cut list into the composition's media items.
   *
   * A cut becomes one item — or two, when a clip runs out before its slot does: the clip
   * itself, then a still of its last frame holding until the next cut. The designed motion
   * rides along here: Ken Burns on photos, and per-cut transitions.
   *
   * The transitions are entrance-and-exit effects rather than overlaps, on purpose. A true
   * overlap dissolve needs two decoders running at once, and nothing in this renderer decodes
   * in parallel (R-I4) — that rule is what keeps a 30-item export alive on a 2GB phone. So
   * "crossfade" renders as a dip: the outgoing shot falls towards dark over 150ms and the
   * incoming one rises out of it, which cuts on the same frame the beat lands on. "zoomPunch"
   * lands 8% tight on the cut and settles within four frames.
   */
  private fun buildItems(cuts: List<ParsedCut>): List<EditedMediaItem> {
    val items = mutableListOf<EditedMediaItem>()

    cuts.forEachIndexed { index, cut ->
      val exitCrossfade = cuts.getOrNull(index + 1)?.transitionIn == "crossfade"

      if (cut.kind == "photo") {
        items.add(photoItem(cut, cut.durationSec, cut.transitionIn, exitCrossfade))
        return@forEachIndexed
      }

      val playedSec = (cut.sourceOutSec - cut.sourceInSec) / (if (cut.speed > 0) cut.speed else 1.0)
      val still = cut.freezeFrame

      if (playedSec > MIN_PART_SEC) {
        // The clip fades out only when nothing holds after it; otherwise the still owns the exit.
        val followingStill =
          if (still != null && cut.holdDurationSec > MIN_PART_SEC) still else null
        items.add(
          videoItem(
            cut,
            entrance = cut.transitionIn,
            exitCrossfade = exitCrossfade && followingStill == null,
            partDurationSec = playedSec,
          )
        )
        if (followingStill != null) {
          items.add(freezeItem(followingStill, cut.holdDurationSec, entrance = null, exitCrossfade))
        }
      } else if (still != null) {
        // Nothing left of the clip to play: the still covers the whole slot.
        items.add(freezeItem(still, cut.durationSec, entrance = cut.transitionIn, exitCrossfade))
      } else {
        // No playable stretch and no still to hold on — the cut cannot be rendered honestly.
        throw CodedException("unknown", "A clip had nothing left to play.", null)
      }
    }

    return items
  }

  private fun videoItem(
    cut: ParsedCut,
    entrance: String,
    exitCrossfade: Boolean,
    partDurationSec: Double,
  ): EditedMediaItem {
    val startMs = (cut.sourceInSec * 1000).toLong()
    val endMs = (cut.sourceOutSec * 1000).toLong()
    val speed = cut.speed.toFloat()

    val mediaItem = MediaItem.Builder()
      .setUri(Uri.parse(cut.uri))
      .setClippingConfiguration(
        MediaItem.ClippingConfiguration.Builder()
          .setStartPositionMs(startMs)
          .setEndPositionMs(max(endMs, startMs + 1))
          .build()
      )
      .build()

    val builder = EditedMediaItem.Builder(mediaItem)
      .setEffects(
        Effects(
          emptyList(),
          visualEffects(entrance, exitCrossfade, null, null, partDurationSec),
        )
      )
      // The export is silent by design. Removing audio here means no stray silent track can
      // survive into the file (G2).
      .setRemoveAudio(true)

    if (speed != 1.0f && speed > 0f) {
      // A slot the clip does not exactly fill is filled by playing it faster or slower. If this
      // is dropped the cut runs short or long and every cut after it slides off the beat.
      builder.setSpeed(ConstantSpeed(speed))
    }

    return builder.build()
  }

  private fun photoItem(
    cut: ParsedCut,
    partDurationSec: Double,
    entrance: String?,
    exitCrossfade: Boolean,
  ): EditedMediaItem {
    val durationUs = (partDurationSec * 1_000_000).toLong()
    return EditedMediaItem.Builder(MediaItem.fromUri(Uri.parse(cut.uri)))
      .setEffects(
        Effects(
          emptyList(),
          visualEffects(entrance, exitCrossfade, cut.kenBurnsFrom, cut.kenBurnsTo, partDurationSec),
        )
      )
      .setRemoveAudio(true)
      .setDurationUs(max(durationUs, 1L))
      .setFrameRate(FRAME_RATE)
      .build()
  }

  private fun freezeItem(
    frame: File,
    partDurationSec: Double,
    entrance: String?,
    exitCrossfade: Boolean,
  ): EditedMediaItem {
    val durationUs = (partDurationSec * 1_000_000).toLong()
    return EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(frame)))
      .setEffects(
        Effects(
          emptyList(),
          visualEffects(entrance, exitCrossfade, null, null, partDurationSec),
        )
      )
      .setRemoveAudio(true)
      .setDurationUs(max(durationUs, 1L))
      .setFrameRate(FRAME_RATE)
      .build()
  }

  /**
   * The visual chain for one part: centre-crop to 9:16, then any Ken Burns drift, then the
   * transition. Centre-crop first, rather than letterbox — bars on a reel look like a mistake.
   * Source rotation is deliberately not applied here; see the class comment.
   */
  private fun visualEffects(
    entrance: String?,
    exitCrossfade: Boolean,
    kenBurnsFrom: Double?,
    kenBurnsTo: Double?,
    partDurationSec: Double,
  ): List<Effect> {
    val partDurationUs = (partDurationSec * 1_000_000).toLong()
    val effects = mutableListOf<Effect>(
      Presentation.createForWidthAndHeight(
        OUTPUT_WIDTH,
        OUTPUT_HEIGHT,
        Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP,
      )
    )

    if (kenBurnsFrom != null && kenBurnsTo != null) {
      // Scales below 1 would pull the picture inside the frame and show the void behind it.
      val from = max(1.0, kenBurnsFrom).toFloat()
      val to = max(1.0, kenBurnsTo).toFloat()
      if (from != to) effects.add(AnimatedZoom(from, to, partDurationUs))
    }

    if (entrance == "zoomPunch") {
      effects.add(AnimatedZoom(PUNCH_FROM_SCALE, 1f, min(PUNCH_DURATION_US, partDurationUs)))
    }

    val fadeInUs = if (entrance == "crossfade") min(DIP_HALF_US, partDurationUs / 2) else 0L
    val fadeOutUs = if (exitCrossfade) min(DIP_HALF_US, partDurationUs / 2) else 0L
    if (fadeInUs > 0 || fadeOutUs > 0) {
      effects.add(AnimatedDip(fadeInUs, fadeOutUs, partDurationUs))
    }

    return effects
  }

  /**
   * The music as a second sequence: one item, clipped to exactly the stretch of the track
   * the reel was cut against, so the sound in the file is the sound the preview played.
   *
   * `setRemoveVideo` is not decoration: an mp3's cover art arrives as a video track, and
   * without this it would race the real timeline for the file's single video slot.
   */
  private fun toAudioSequence(audio: Map<String, Any?>): EditedMediaItemSequence {
    val uri = audio["uri"] as? String
      ?: throw CodedException("unknown", "The audio has no source.", null)
    val startMs = ((audio["startSec"] as? Double ?: 0.0) * 1000).toLong()
    val durationMs = ((audio["durationSec"] as? Double ?: 0.0) * 1000).toLong()
    if (durationMs <= 0) {
      throw CodedException("unknown", "The audio has no duration.", null)
    }

    val item = MediaItem.Builder()
      .setUri(Uri.parse(uri))
      .setClippingConfiguration(
        MediaItem.ClippingConfiguration.Builder()
          .setStartPositionMs(startMs)
          .setEndPositionMs(startMs + durationMs)
          .build()
      )
      .build()

    val edited = EditedMediaItem.Builder(item)
      .setRemoveVideo(true)
      .build()

    return EditedMediaItemSequence.Builder(setOf(C.TRACK_TYPE_AUDIO))
      .addItems(listOf(edited))
      .build()
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

    // The freeze stills are scratch. Success, failure and cancel all sweep them.
    holder.scratch.forEach { it.delete() }
    holder.scratch.clear()

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

  /**
   * A zoom that moves across this item's run: Ken Burns on a photo, or the settling punch of
   * a zoomPunch cut. Scaling in normalised device coordinates is a zoom about the centre.
   *
   * Time is measured from the first frame this instance sees rather than from zero — each
   * item's effect instances are its own, but whether the timestamps handed to effects start
   * at the item or at the composition is an implementation detail this must not depend on.
   */
  private class AnimatedZoom(
    private val fromScale: Float,
    private val toScale: Float,
    private val rampDurationUs: Long,
  ) : MatrixTransformation {
    private var baseTimeUs = C.TIME_UNSET

    override fun getMatrix(presentationTimeUs: Long): Matrix {
      if (baseTimeUs == C.TIME_UNSET) baseTimeUs = presentationTimeUs
      val progress = if (rampDurationUs <= 0L) {
        1f
      } else {
        ((presentationTimeUs - baseTimeUs).toFloat() / rampDurationUs).coerceIn(0f, 1f)
      }
      val scale = fromScale + (toScale - fromScale) * progress
      return Matrix().apply { postScale(scale, scale) }
    }
  }

  /**
   * The dip that renders a crossfade: brightness falls to black across the last stretch of
   * the outgoing item and rises across the first stretch of the incoming one. The cut itself
   * stays on the exact frame the beat lands on.
   */
  private class AnimatedDip(
    private val fadeInUs: Long,
    private val fadeOutUs: Long,
    private val itemDurationUs: Long,
  ) : RgbMatrix {
    private var baseTimeUs = C.TIME_UNSET

    override fun getMatrix(presentationTimeUs: Long, useHdr: Boolean): FloatArray {
      if (baseTimeUs == C.TIME_UNSET) baseTimeUs = presentationTimeUs
      val elapsedUs = presentationTimeUs - baseTimeUs
      var factor = 1f
      if (fadeInUs > 0L && elapsedUs < fadeInUs) {
        factor = min(factor, (elapsedUs.toFloat() / fadeInUs).coerceIn(0f, 1f))
      }
      if (fadeOutUs > 0L && itemDurationUs > 0L) {
        val fadeOutStartUs = itemDurationUs - fadeOutUs
        if (elapsedUs >= fadeOutStartUs) {
          val through = ((elapsedUs - fadeOutStartUs).toFloat() / fadeOutUs).coerceIn(0f, 1f)
          factor = min(factor, 1f - through)
        }
      }
      return floatArrayOf(
        factor, 0f, 0f, 0f,
        0f, factor, 0f, 0f,
        0f, 0f, factor, 0f,
        0f, 0f, 0f, 1f,
      )
    }
  }
}
