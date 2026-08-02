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

    /**
     * The playable copy: a plain PCM WAV of the song, stopped after `maxDurationSec`.
     * One clock for the beat map, the preview and the export — see the Android half for
     * the full reasoning; compressed formats carry encoder padding and imprecise seeking,
     * PCM carries neither.
     */
    AsyncFunction("decodeToWav") { (uri: String, outputPath: String, maxDurationSec: Double) -> [String: Any] in
      guard maxDurationSec > 0, maxDurationSec <= Self.maxDurationSec else {
        throw Exception(name: "ERR_BAD_RATE", description: "Unsupported copy length.")
      }
      return try Self.decodeToWavFile(uri: uri, outputPath: outputPath, maxDurationSec: maxDurationSec)
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

  private static func decodeToWavFile(
    uri: String, outputPath: String, maxDurationSec: Double
  ) throws -> [String: Any] {
    let asset = AVURLAsset(url: url(from: uri))
    guard let track = asset.tracks(withMediaType: .audio).first else {
      throw Exception(name: "ERR_NO_AUDIO", description: "That file has no audio in it.")
    }

    // The source's own rate and layout, read from the stream description; stereo at most.
    var sampleRate = 44100
    var channels = 2
    if let formats = track.formatDescriptions as? [CMFormatDescription],
       let format = formats.first,
       let description = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee {
      if description.mSampleRate > 0 { sampleRate = Int(description.mSampleRate) }
      channels = min(max(Int(description.mChannelsPerFrame), 1), 2)
    }

    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: asset)
    } catch {
      throw Exception(name: "ERR_UNREADABLE", description: "That file could not be read.")
    }

    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: channels,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
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

    // A placeholder header; the true sizes are written once they are known.
    handle.write(Data(count: 44))

    guard reader.startReading() else {
      throw Exception(name: "ERR_DECODE", description: "That file could not be decoded.")
    }

    var frames: Int64 = 0
    let bytesPerFrame = channels * 2
    let maxFrames = Int64(maxDurationSec * Double(sampleRate))
    while frames < maxFrames, let sample = output.copyNextSampleBuffer() {
      guard let block = CMSampleBufferGetDataBuffer(sample) else { continue }
      let length = CMBlockBufferGetDataLength(block)
      if length == 0 { continue }
      var data = Data(count: length)
      data.withUnsafeMutableBytes { (destination: UnsafeMutableRawBufferPointer) in
        guard let base = destination.baseAddress else { return }
        CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: base)
      }
      handle.write(data)
      frames += Int64(length / bytesPerFrame)
    }
    reader.cancelReading()

    if frames == 0 {
      try? FileManager.default.removeItem(at: outputUrl)
      throw Exception(name: "ERR_DECODE", description: "That file could not be decoded.")
    }

    // The canonical 44-byte PCM WAV header.
    let dataBytes = UInt32(frames * Int64(bytesPerFrame))
    var header = Data()
    func put(_ text: String) { header.append(text.data(using: .ascii)!) }
    func put32(_ value: UInt32) { withUnsafeBytes(of: value.littleEndian) { header.append(contentsOf: $0) } }
    func put16(_ value: UInt16) { withUnsafeBytes(of: value.littleEndian) { header.append(contentsOf: $0) } }
    put("RIFF"); put32(36 + dataBytes); put("WAVE")
    put("fmt "); put32(16); put16(1); put16(UInt16(channels))
    put32(UInt32(sampleRate)); put32(UInt32(sampleRate * bytesPerFrame))
    put16(UInt16(bytesPerFrame)); put16(16)
    put("data"); put32(dataBytes)
    try handle.seek(toOffset: 0)
    handle.write(header)

    return [
      "frames": frames,
      "durationSec": Double(frames) / Double(sampleRate),
      "sampleRate": sampleRate,
      "channels": channels,
    ]
  }
}
