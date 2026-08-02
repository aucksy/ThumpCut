import AVFoundation
import ExpoModulesCore

/**
 * Decoding a song into raw samples for the beat engine — the iOS half.
 *
 * AVAssetReader does in one configured pass what the Android half assembles by hand:
 * decode, downmix to mono, resample to the analysis rate, output float32. The samples are
 * streamed to a file as little-endian float32, which JavaScript reads into a Float32Array.
 *
 * The same duration cap as Android applies, checked before any decoding starts: a two-hour
 * mix decoded to floats is a 600MB file, and refusing it with a plain error beats filling
 * the phone.
 */
public class AudioDecodeModule: Module {
  private static let maxDurationSec = 900.0

  public func definition() -> ModuleDefinition {
    Name("AudioDecode")

    AsyncFunction("decode") { (uri: String, targetSampleRate: Int, outputPath: String) -> [String: Any] in
      guard targetSampleRate >= 4000, targetSampleRate <= 48000 else {
        throw Exception(name: "ERR_BAD_RATE", description: "Unsupported analysis sample rate.")
      }
      return try Self.decodeToFile(uri: uri, targetSampleRate: targetSampleRate, outputPath: outputPath)
    }

    AsyncFunction("readMetadata") { (uri: String) -> [String: Any?] in
      let asset = AVURLAsset(url: Self.url(from: uri))
      let items = asset.commonMetadata
      let title = AVMetadataItem.metadataItems(
        from: items, withKey: AVMetadataKey.commonKeyTitle, keySpace: .common
      ).first?.stringValue
      let artist = AVMetadataItem.metadataItems(
        from: items, withKey: AVMetadataKey.commonKeyArtist, keySpace: .common
      ).first?.stringValue
      return [
        "title": title,
        "artist": artist,
        "durationSec": CMTimeGetSeconds(asset.duration),
      ]
    }
  }

  private static func url(from uri: String) -> URL {
    if let parsed = URL(string: uri), parsed.scheme != nil {
      return parsed
    }
    return URL(fileURLWithPath: uri)
  }

  private static func decodeToFile(
    uri: String, targetSampleRate: Int, outputPath: String
  ) throws -> [String: Any] {
    let asset = AVURLAsset(url: url(from: uri))

    let durationSec = CMTimeGetSeconds(asset.duration)
    if durationSec > maxDurationSec {
      throw Exception(
        name: "ERR_TOO_LONG",
        description: "That file is over 15 minutes long. Pick a song rather than a mix."
      )
    }

    guard let track = asset.tracks(withMediaType: .audio).first else {
      throw Exception(name: "ERR_NO_AUDIO", description: "That file has no audio in it.")
    }

    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: asset)
    } catch {
      throw Exception(name: "ERR_UNREADABLE", description: "That file could not be read.")
    }

    // One configuration does the whole job: decode, downmix, resample, float32.
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: targetSampleRate,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 32,
      AVLinearPCMIsFloatKey: true,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else {
      throw Exception(name: "ERR_DECODE", description: "That file could not be decoded.")
    }
    reader.add(output)

    let outputUrl = URL(fileURLWithPath: outputPath.replacingOccurrences(of: "file://", with: ""))
    try? FileManager.default.createDirectory(
      at: outputUrl.deletingLastPathComponent(), withIntermediateDirectories: true
    )
    FileManager.default.createFile(atPath: outputUrl.path, contents: nil)
    guard let handle = try? FileHandle(forWritingTo: outputUrl) else {
      throw Exception(name: "ERR_DECODE", description: "The result could not be written.")
    }
    defer { try? handle.close() }

    guard reader.startReading() else {
      throw Exception(name: "ERR_DECODE", description: "That file could not be decoded.")
    }

    var frames: Int64 = 0
    while let sample = output.copyNextSampleBuffer() {
      guard let block = CMSampleBufferGetDataBuffer(sample) else { continue }
      let length = CMBlockBufferGetDataLength(block)
      if length == 0 { continue }
      var data = Data(count: length)
      data.withUnsafeMutableBytes { (destination: UnsafeMutableRawBufferPointer) in
        guard let base = destination.baseAddress else { return }
        CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: base)
      }
      handle.write(data)
      frames += Int64(length / 4)

      if Double(frames) > (maxDurationSec + 60.0) * Double(targetSampleRate) {
        try? FileManager.default.removeItem(at: outputUrl)
        throw Exception(
          name: "ERR_TOO_LONG",
          description: "That file is over 15 minutes long. Pick a song rather than a mix."
        )
      }
    }

    if reader.status == .failed || frames == 0 {
      try? FileManager.default.removeItem(at: outputUrl)
      throw Exception(name: "ERR_DECODE", description: "That file could not be decoded.")
    }

    return [
      "frames": frames,
      "durationSec": Double(frames) / Double(targetSampleRate),
      "sampleRate": targetSampleRate,
    ]
  }
}
