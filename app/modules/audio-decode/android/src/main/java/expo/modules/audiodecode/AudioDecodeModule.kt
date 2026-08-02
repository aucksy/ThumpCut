package expo.modules.audiodecode

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.min

/**
 * Decoding a song into raw samples for the beat engine.
 *
 * The beat engine is pure TypeScript and needs mono float samples at its analysis rate.
 * This module is the only native piece of that story: MediaExtractor and MediaCodec decode
 * whatever the phone can play (mp3, m4a, flac, ogg, wav), the channels are averaged to mono,
 * a streaming linear resampler brings it to the requested rate, and the result is written to
 * a file as little-endian float32 — which JavaScript reads straight into a Float32Array.
 *
 * Two deliberate shapes:
 *
 *   · **Streaming, never buffered whole.** A four-minute song decoded at 48kHz stereo is
 *     ~90MB of floats. Held all at once that is a crash on the 2GB phones this app targets;
 *     resampled as it flows through, peak memory is a few hundred kilobytes.
 *   · **A duration cap, checked before any work.** The file picker cannot stop someone
 *     choosing a two-hour DJ set. Decoded, that would be a 600MB file — so anything over the
 *     cap is refused with a plain error before a byte is decoded.
 */
class AudioDecodeModule : Module() {

  companion object {
    private const val MAX_DURATION_SEC = 900.0
    private const val CODEC_TIMEOUT_US = 10_000L
    private const val WRITE_BUFFER_BYTES = 64 * 1024
    private const val WAV_HEADER_BYTES = 44
  }

  override fun definition() = ModuleDefinition {
    Name("AudioDecode")

    /**
     * Decode `uri` to mono float32 at `targetSampleRate`, writing to `outputPath`.
     * Returns { frames, durationSec, sampleRate }.
     */
    AsyncFunction("decode") { uri: String, targetSampleRate: Int, outputPath: String ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_NO_CONTEXT", "The app has no context to decode in.", null)
      if (targetSampleRate < 4000 || targetSampleRate > 48000) {
        throw CodedException("ERR_BAD_RATE", "Unsupported analysis sample rate.", null)
      }
      decodeToFile(context, uri, targetSampleRate, outputPath)
    }

    /**
     * Decode `uri` into a plain PCM WAV at `outputPath`, stopping after `maxDurationSec`.
     *
     * This copy is why the preview and the export stay on the beat for the user's own
     * music. A compressed file has two clocks: the one the beat engine measured (an exact
     * decode from time zero) and the one a player produces (which may skip encoder padding,
     * and lands only *near* a mid-file seek target on variable-bitrate MP3s). A PCM WAV has
     * one clock — every sample has an exact address — so playing and embedding this copy
     * makes the player's clock identical to the beat map's, by construction.
     *
     * Source sample rate and channel layout are preserved (many-channel sources fold to
     * stereo), so the copy sounds like the original. It is transient: the app keeps one at
     * a time and re-renders it when the song changes.
     */
    AsyncFunction("decodeToWav") { uri: String, outputPath: String, maxDurationSec: Double ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_NO_CONTEXT", "The app has no context to decode in.", null)
      if (maxDurationSec <= 0 || maxDurationSec > MAX_DURATION_SEC) {
        throw CodedException("ERR_BAD_RATE", "Unsupported copy length.", null)
      }
      decodeToWavFile(context, uri, outputPath, maxDurationSec)
    }

    /** Title, artist and duration as the file itself declares them. Never throws for tags. */
    AsyncFunction("readMetadata") { uri: String ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_NO_CONTEXT", "The app has no context to read in.", null)
      val retriever = MediaMetadataRetriever()
      try {
        setSource(retriever, context, uri)
        mapOf(
          "title" to retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE),
          "artist" to retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST),
          "durationSec" to
            (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
              ?.toDoubleOrNull() ?: 0.0) / 1000.0
        )
      } catch (error: Throwable) {
        throw CodedException("ERR_UNREADABLE", "That file could not be read.", error)
      } finally {
        retriever.release()
      }
    }
  }

  private fun setSource(retriever: MediaMetadataRetriever, context: Context, uri: String) {
    if (uri.startsWith("content://")) {
      retriever.setDataSource(context, Uri.parse(uri))
    } else {
      retriever.setDataSource(uri.removePrefix("file://"))
    }
  }

  private fun decodeToFile(
    context: Context,
    uri: String,
    targetSampleRate: Int,
    outputPath: String,
  ): Map<String, Any> {
    val extractor = MediaExtractor()
    try {
      if (uri.startsWith("content://")) {
        extractor.setDataSource(context, Uri.parse(uri), null)
      } else {
        extractor.setDataSource(uri.removePrefix("file://"))
      }
    } catch (error: Throwable) {
      extractor.release()
      throw CodedException("ERR_UNREADABLE", "That file could not be read.", error)
    }

    var trackIndex = -1
    var format: MediaFormat? = null
    for (index in 0 until extractor.trackCount) {
      val candidate = extractor.getTrackFormat(index)
      if (candidate.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
        trackIndex = index
        format = candidate
        break
      }
    }
    if (trackIndex < 0 || format == null) {
      extractor.release()
      throw CodedException("ERR_NO_AUDIO", "That file has no audio in it.", null)
    }

    // Refuse marathon files before decoding a byte. Zero means the container did not say —
    // let those through and let the beat engine's own minimum-length check speak to shorts.
    val declaredDurationSec =
      if (format.containsKey(MediaFormat.KEY_DURATION)) {
        format.getLong(MediaFormat.KEY_DURATION) / 1_000_000.0
      } else 0.0
    if (declaredDurationSec > MAX_DURATION_SEC) {
      extractor.release()
      throw CodedException(
        "ERR_TOO_LONG",
        "That file is over 15 minutes long. Pick a song rather than a mix.",
        null
      )
    }

    extractor.selectTrack(trackIndex)
    val mime = format.getString(MediaFormat.KEY_MIME)
      ?: throw CodedException("ERR_NO_AUDIO", "That file has no audio in it.", null)

    val output = File(outputPath.removePrefix("file://"))
    output.parentFile?.mkdirs()
    if (output.exists()) output.delete()

    var codec: MediaCodec? = null
    var frames = 0L
    try {
      codec = MediaCodec.createDecoderByType(mime)
      codec.configure(format, null, null, 0)
      codec.start()

      var sourceRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var pcmEncoding =
        if (format.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
          format.getInteger(MediaFormat.KEY_PCM_ENCODING)
        } else AudioFormat.ENCODING_PCM_16BIT

      var resampler = LinearResampler(sourceRate, targetSampleRate)

      BufferedOutputStream(FileOutputStream(output), WRITE_BUFFER_BYTES).use { stream ->
        val chunk = ByteBuffer.allocate(WRITE_BUFFER_BYTES).order(ByteOrder.LITTLE_ENDIAN)
        val emit: (Float) -> Unit = { value ->
          if (chunk.remaining() < 4) {
            stream.write(chunk.array(), 0, chunk.position())
            chunk.clear()
          }
          chunk.putFloat(value)
          frames += 1
        }

        val info = MediaCodec.BufferInfo()
        var inputDone = false
        var outputDone = false

        while (!outputDone) {
          if (!inputDone) {
            val inputIndex = codec.dequeueInputBuffer(CODEC_TIMEOUT_US)
            if (inputIndex >= 0) {
              val buffer = codec.getInputBuffer(inputIndex)
                ?: throw CodedException("ERR_DECODE", "The decoder gave no buffer.", null)
              val read = extractor.readSampleData(buffer, 0)
              if (read < 0) {
                codec.queueInputBuffer(
                  inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM
                )
                inputDone = true
              } else {
                codec.queueInputBuffer(inputIndex, 0, read, extractor.sampleTime, 0)
                extractor.advance()
              }
            }
          }

          val outputIndex = codec.dequeueOutputBuffer(info, CODEC_TIMEOUT_US)
          when {
            outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
              // The decoder's word wins over the container's. An m4a that claims one rate
              // and decodes at another would otherwise come out at the wrong tempo.
              val actual = codec.outputFormat
              sourceRate = actual.getInteger(MediaFormat.KEY_SAMPLE_RATE)
              channels = actual.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
              pcmEncoding =
                if (actual.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
                  actual.getInteger(MediaFormat.KEY_PCM_ENCODING)
                } else AudioFormat.ENCODING_PCM_16BIT
              resampler = resampler.retuned(sourceRate)
            }
            outputIndex >= 0 -> {
              val buffer = codec.getOutputBuffer(outputIndex)
              if (buffer != null && info.size > 0) {
                buffer.position(info.offset)
                buffer.limit(info.offset + info.size)
                pushSamples(buffer, pcmEncoding, channels, resampler, emit)
              }
              codec.releaseOutputBuffer(outputIndex, false)
              if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
            }
          }

          // A decoder can stall without erroring; a hard cap on decoded length doubles as
          // the guard for files whose container lied about their duration.
          if (frames > (MAX_DURATION_SEC + 60.0) * targetSampleRate) {
            throw CodedException(
              "ERR_TOO_LONG",
              "That file is over 15 minutes long. Pick a song rather than a mix.",
              null
            )
          }
        }

        stream.write(chunk.array(), 0, chunk.position())
      }
    } catch (error: CodedException) {
      output.delete()
      throw error
    } catch (error: Throwable) {
      output.delete()
      throw CodedException("ERR_DECODE", "That file could not be decoded.", error)
    } finally {
      try {
        codec?.stop()
      } catch (_: Throwable) {
        // Never started, or already dead.
      }
      codec?.release()
      extractor.release()
    }

    if (frames == 0L) {
      output.delete()
      throw CodedException("ERR_DECODE", "That file decoded to nothing.", null)
    }

    return mapOf(
      "frames" to frames,
      "durationSec" to frames.toDouble() / targetSampleRate,
      "sampleRate" to targetSampleRate
    )
  }

  /**
   * The playable copy: decode to interleaved 16-bit PCM at the source rate, stopping after
   * `maxDurationSec`, and finish by writing the true sizes into the WAV header.
   */
  private fun decodeToWavFile(
    context: Context,
    uri: String,
    outputPath: String,
    maxDurationSec: Double,
  ): Map<String, Any> {
    val extractor = MediaExtractor()
    try {
      if (uri.startsWith("content://")) {
        extractor.setDataSource(context, Uri.parse(uri), null)
      } else {
        extractor.setDataSource(uri.removePrefix("file://"))
      }
    } catch (error: Throwable) {
      extractor.release()
      throw CodedException("ERR_UNREADABLE", "That file could not be read.", error)
    }

    var trackIndex = -1
    var format: MediaFormat? = null
    for (index in 0 until extractor.trackCount) {
      val candidate = extractor.getTrackFormat(index)
      if (candidate.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
        trackIndex = index
        format = candidate
        break
      }
    }
    if (trackIndex < 0 || format == null) {
      extractor.release()
      throw CodedException("ERR_NO_AUDIO", "That file has no audio in it.", null)
    }
    extractor.selectTrack(trackIndex)
    val mime = format.getString(MediaFormat.KEY_MIME)
      ?: throw CodedException("ERR_NO_AUDIO", "That file has no audio in it.", null)

    val output = File(outputPath.removePrefix("file://"))
    output.parentFile?.mkdirs()
    if (output.exists()) output.delete()

    var codec: MediaCodec? = null
    var frames = 0L
    var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    var sourceChannels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    var pcmEncoding =
      if (format.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
        format.getInteger(MediaFormat.KEY_PCM_ENCODING)
      } else AudioFormat.ENCODING_PCM_16BIT
    var outChannels = min(sourceChannels, 2).coerceAtLeast(1)

    try {
      codec = MediaCodec.createDecoderByType(mime)
      codec.configure(format, null, null, 0)
      codec.start()

      RandomAccessFile(output, "rw").use { file ->
        // A placeholder header; the sizes are written once they are known.
        file.write(ByteArray(WAV_HEADER_BYTES))

        val chunk = ByteBuffer.allocate(WRITE_BUFFER_BYTES).order(ByteOrder.LITTLE_ENDIAN)
        val flush = {
          file.write(chunk.array(), 0, chunk.position())
          chunk.clear()
        }
        val emitFrame = { left: Float, right: Float ->
          if (chunk.remaining() < 4) flush()
          chunk.putShort(pcm16(left))
          if (outChannels == 2) chunk.putShort(pcm16(right))
          frames += 1
        }

        val info = MediaCodec.BufferInfo()
        var inputDone = false
        var outputDone = false
        val maxFrames = { (maxDurationSec * sampleRate).toLong() }

        while (!outputDone && frames < maxFrames()) {
          if (!inputDone) {
            val inputIndex = codec.dequeueInputBuffer(CODEC_TIMEOUT_US)
            if (inputIndex >= 0) {
              val buffer = codec.getInputBuffer(inputIndex)
                ?: throw CodedException("ERR_DECODE", "The decoder gave no buffer.", null)
              val read = extractor.readSampleData(buffer, 0)
              if (read < 0) {
                codec.queueInputBuffer(
                  inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM
                )
                inputDone = true
              } else {
                codec.queueInputBuffer(inputIndex, 0, read, extractor.sampleTime, 0)
                extractor.advance()
              }
            }
          }

          val outputIndex = codec.dequeueOutputBuffer(info, CODEC_TIMEOUT_US)
          when {
            outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
              val actual = codec.outputFormat
              sampleRate = actual.getInteger(MediaFormat.KEY_SAMPLE_RATE)
              sourceChannels = actual.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
              pcmEncoding =
                if (actual.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
                  actual.getInteger(MediaFormat.KEY_PCM_ENCODING)
                } else AudioFormat.ENCODING_PCM_16BIT
              outChannels = min(sourceChannels, 2).coerceAtLeast(1)
            }
            outputIndex >= 0 -> {
              val buffer = codec.getOutputBuffer(outputIndex)
              if (buffer != null && info.size > 0) {
                buffer.position(info.offset)
                buffer.limit(info.offset + info.size)
                foldFrames(buffer, pcmEncoding, sourceChannels, emitFrame)
              }
              codec.releaseOutputBuffer(outputIndex, false)
              if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
            }
          }
        }
        flush()

        writeWavHeader(file, sampleRate, outChannels, frames)
      }
    } catch (error: CodedException) {
      output.delete()
      throw error
    } catch (error: Throwable) {
      output.delete()
      throw CodedException("ERR_DECODE", "That file could not be decoded.", error)
    } finally {
      try {
        codec?.stop()
      } catch (_: Throwable) {
        // Never started, or already dead.
      }
      codec?.release()
      extractor.release()
    }

    if (frames == 0L) {
      output.delete()
      throw CodedException("ERR_DECODE", "That file decoded to nothing.", null)
    }

    return mapOf(
      "frames" to frames,
      "durationSec" to frames.toDouble() / sampleRate,
      "sampleRate" to sampleRate,
      "channels" to outChannels
    )
  }

  /** One decoder buffer as stereo-or-mono frames; sources beyond two channels fold down. */
  private fun foldFrames(
    buffer: ByteBuffer,
    pcmEncoding: Int,
    channels: Int,
    emitFrame: (Float, Float) -> Unit,
  ) {
    val safeChannels = if (channels < 1) 1 else channels
    if (pcmEncoding == AudioFormat.ENCODING_PCM_FLOAT) {
      val floats = buffer.order(ByteOrder.nativeOrder()).asFloatBuffer()
      val frameCount = floats.remaining() / safeChannels
      for (frame in 0 until frameCount) {
        var left = 0f
        var right = 0f
        for (channel in 0 until safeChannels) {
          val sample = floats.get(frame * safeChannels + channel)
          if (safeChannels == 1 || channel % 2 == 0) left += sample else right += sample
        }
        emitStereo(safeChannels, left, right, emitFrame)
      }
    } else {
      val shorts = buffer.order(ByteOrder.nativeOrder()).asShortBuffer()
      val frameCount = shorts.remaining() / safeChannels
      for (frame in 0 until frameCount) {
        var left = 0f
        var right = 0f
        for (channel in 0 until safeChannels) {
          val sample = shorts.get(frame * safeChannels + channel) / 32768f
          if (safeChannels == 1 || channel % 2 == 0) left += sample else right += sample
        }
        emitStereo(safeChannels, left, right, emitFrame)
      }
    }
  }

  private fun emitStereo(
    sourceChannels: Int,
    leftSum: Float,
    rightSum: Float,
    emitFrame: (Float, Float) -> Unit,
  ) {
    if (sourceChannels <= 2) {
      emitFrame(leftSum, if (sourceChannels == 2) rightSum else leftSum)
      return
    }
    val half = (sourceChannels + 1) / 2
    emitFrame(leftSum / half, rightSum / (sourceChannels / 2))
  }

  private fun pcm16(value: Float): Short {
    val scaled = (value * 32767f).toInt()
    return scaled.coerceIn(-32768, 32767).toShort()
  }

  /** The 44-byte canonical PCM WAV header, written over the placeholder once sizes exist. */
  private fun writeWavHeader(
    file: RandomAccessFile,
    sampleRate: Int,
    channels: Int,
    frames: Long,
  ) {
    val dataBytes = frames * channels * 2
    val header = ByteBuffer.allocate(WAV_HEADER_BYTES).order(ByteOrder.LITTLE_ENDIAN)
    header.put("RIFF".toByteArray(Charsets.US_ASCII))
    header.putInt((36 + dataBytes).toInt())
    header.put("WAVE".toByteArray(Charsets.US_ASCII))
    header.put("fmt ".toByteArray(Charsets.US_ASCII))
    header.putInt(16)
    header.putShort(1) // PCM
    header.putShort(channels.toShort())
    header.putInt(sampleRate)
    header.putInt(sampleRate * channels * 2)
    header.putShort((channels * 2).toShort())
    header.putShort(16)
    header.put("data".toByteArray(Charsets.US_ASCII))
    header.putInt(dataBytes.toInt())
    file.seek(0)
    file.write(header.array())
  }

  /** Average the channels of one decoder buffer to mono and feed the resampler. */
  private fun pushSamples(
    buffer: ByteBuffer,
    pcmEncoding: Int,
    channels: Int,
    resampler: LinearResampler,
    emit: (Float) -> Unit,
  ) {
    val safeChannels = if (channels < 1) 1 else channels
    when (pcmEncoding) {
      AudioFormat.ENCODING_PCM_FLOAT -> {
        val floats = buffer.order(ByteOrder.nativeOrder()).asFloatBuffer()
        val frameCount = floats.remaining() / safeChannels
        for (frame in 0 until frameCount) {
          var total = 0f
          for (channel in 0 until safeChannels) {
            total += floats.get(frame * safeChannels + channel)
          }
          resampler.push(total / safeChannels, emit)
        }
      }
      else -> {
        val shorts = buffer.order(ByteOrder.nativeOrder()).asShortBuffer()
        val frameCount = shorts.remaining() / safeChannels
        for (frame in 0 until frameCount) {
          var total = 0f
          for (channel in 0 until safeChannels) {
            total += shorts.get(frame * safeChannels + channel) / 32768f
          }
          resampler.push(total / safeChannels, emit)
        }
      }
    }
  }

  /**
   * Streaming linear resampler. Emits an output sample whenever the running source position
   * passes it, interpolating between the two source samples either side — the same linear
   * interpolation the Factory's offline resampler uses.
   */
  private class LinearResampler(sourceRate: Int, private val targetRate: Int) {
    private val step = sourceRate.toDouble() / targetRate.toDouble()
    private var nextSourcePosition = 0.0
    private var previous = 0f
    private var index = -1L

    fun retuned(newSourceRate: Int): LinearResampler =
      if (newSourceRate.toDouble() / targetRate.toDouble() == step) this
      else LinearResampler(newSourceRate, targetRate)

    fun push(sample: Float, emit: (Float) -> Unit) {
      index += 1
      if (index == 0L) {
        // The very first source sample can itself be an output sample.
        while (nextSourcePosition <= 0.0) {
          emit(sample)
          nextSourcePosition += step
        }
        previous = sample
        return
      }
      while (nextSourcePosition <= index.toDouble()) {
        val fraction = (nextSourcePosition - (index - 1)).toFloat()
        emit(previous * (1f - fraction) + sample * fraction)
        nextSourcePosition += step
      }
      previous = sample
    }
  }
}
