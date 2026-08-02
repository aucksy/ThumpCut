import AVFoundation
import ExpoModulesCore
import UIKit

/**
 * Composing the reel on iOS, with AVFoundation.
 *
 * `AVMutableComposition` handles the clips; stills are drawn into the video track through an
 * `AVVideoCompositionCoreAnimationTool`-free path — each still becomes a short still-image
 * track segment, which keeps the whole timeline inside one export session.
 *
 * The memory rules are the same as on Android and matter for the same reason: decode
 * sequentially, downsample at decode time, never hold more than a couple of frames.
 */
public class ReelRenderModule: Module {

  private static let outputWidth: CGFloat = 1080
  private static let outputHeight: CGFloat = 1920
  private static let frameRate: Int32 = 30

  private var session: AVAssetExportSession?
  private var cancelled = false

  public func definition() -> ModuleDefinition {
    Name("ReelRender")

    Events("onProgress")

    AsyncFunction("render") { (cuts: [[String: Any]], outputPath: String, audio: [String: Any]?) -> Double in
      self.cancelled = false

      let composition = AVMutableComposition()
      guard let videoTrack = composition.addMutableTrack(
        withMediaType: .video,
        preferredTrackID: kCMPersistentTrackID_Invalid
      ) else {
        throw RenderError.compositionFailed
      }

      let instruction = AVMutableVideoCompositionInstruction()
      var layerInstructions: [AVMutableVideoCompositionLayerInstruction] = []
      var cursor = CMTime.zero

      for cut in cuts {
        let kind = cut["kind"] as? String ?? "photo"
        let durationSec = cut["durationSec"] as? Double ?? 0
        let duration = CMTime(seconds: durationSec, preferredTimescale: 600)

        if kind == "video", let uri = cut["uri"] as? String {
          let asset = AVURLAsset(url: URL(fileURLWithPath: uri.replacingOccurrences(of: "file://", with: "")))
          guard let sourceTrack = try? await asset.loadTracks(withMediaType: .video).first else {
            // A clip that will not open is skipped rather than allowed to fail the export.
            continue
          }

          let startSec = cut["sourceInSec"] as? Double ?? 0
          let endSec = cut["sourceOutSec"] as? Double ?? (startSec + durationSec)
          let range = CMTimeRange(
            start: CMTime(seconds: startSec, preferredTimescale: 600),
            duration: CMTime(seconds: max(endSec - startSec, 0.01), preferredTimescale: 600)
          )

          try videoTrack.insertTimeRange(range, of: sourceTrack, at: cursor)

          // Speed fitting: scale the inserted range to the slot it has to fill.
          if let speed = cut["speed"] as? Double, speed != 1.0 {
            let inserted = CMTimeRange(start: cursor, duration: range.duration)
            videoTrack.scaleTimeRange(inserted, toDuration: duration)
          }

          let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
          layer.setTransform(
            Self.fillTransform(for: sourceTrack, naturalSize: sourceTrack.naturalSize),
            at: cursor
          )
          layerInstructions.append(layer)
        } else if let uri = cut["uri"] as? String {
          // Stills are written as a one-frame-per-33ms segment. Decoded downsampled first —
          // a full-resolution photo is tens of megabytes of bitmap.
          try Self.appendStill(
            path: uri,
            to: videoTrack,
            at: cursor,
            duration: duration
          )
        }

        cursor = CMTimeAdd(cursor, duration)
      }

      // The music, when the export is allowed to carry any. Instagram-catalogue tracks are
      // never handed in here — their exports stay silent for ever. This path exists for the
      // user's own music and royalty-free tracks whose licence permits it.
      if let audio = audio, let audioUri = audio["uri"] as? String {
        let startSec = audio["startSec"] as? Double ?? 0
        let audioDurationSec = audio["durationSec"] as? Double ?? 0
        if audioDurationSec > 0 {
          let audioAsset = AVURLAsset(url: URL(
            fileURLWithPath: audioUri.replacingOccurrences(of: "file://", with: "")
          ))
          if let sourceAudio = try? await audioAsset.loadTracks(withMediaType: .audio).first,
             let audioTrack = composition.addMutableTrack(
               withMediaType: .audio,
               preferredTrackID: kCMPersistentTrackID_Invalid
             ) {
            let range = CMTimeRange(
              start: CMTime(seconds: startSec, preferredTimescale: 600),
              duration: CMTime(seconds: min(audioDurationSec, CMTimeGetSeconds(cursor)),
                               preferredTimescale: 600)
            )
            try audioTrack.insertTimeRange(range, of: sourceAudio, at: .zero)
          }
        }
      }

      instruction.timeRange = CMTimeRange(start: .zero, duration: cursor)
      instruction.layerInstructions = layerInstructions

      let videoComposition = AVMutableVideoComposition()
      videoComposition.renderSize = CGSize(width: Self.outputWidth, height: Self.outputHeight)
      videoComposition.frameDuration = CMTime(value: 1, timescale: Self.frameRate)
      videoComposition.instructions = [instruction]

      let outputUrl = URL(fileURLWithPath: outputPath.replacingOccurrences(of: "file://", with: ""))
      try? FileManager.default.removeItem(at: outputUrl)

      guard let export = AVAssetExportSession(
        asset: composition,
        presetName: AVAssetExportPreset1920x1080
      ) else {
        throw RenderError.compositionFailed
      }

      export.outputURL = outputUrl
      export.outputFileType = .mp4
      export.videoComposition = videoComposition
      // moov first, so the file plays before it has fully downloaded.
      export.shouldOptimizeForNetworkUse = true
      self.session = export

      await export.export()

      self.session = nil

      if self.cancelled { throw RenderError.cancelled }
      if export.status != .completed {
        if let error = export.error as NSError?, error.code == NSFileWriteOutOfSpaceError {
          throw RenderError.storageFull
        }
        throw RenderError.exportFailed
      }

      return CMTimeGetSeconds(cursor)
    }

    AsyncFunction("cancel") {
      self.cancelled = true
      self.session?.cancelExport()
      self.session = nil
    }

    AsyncFunction("probe") { (path: String) -> [String: Any] in
      let asset = AVURLAsset(
        url: URL(fileURLWithPath: path.replacingOccurrences(of: "file://", with: ""))
      )
      let duration = try await asset.load(.duration)
      guard let track = try await asset.loadTracks(withMediaType: .video).first else {
        return ["durationSec": CMTimeGetSeconds(duration), "width": 0, "height": 0, "rotationDeg": 0]
      }
      let size = try await track.load(.naturalSize)
      let transform = try await track.load(.preferredTransform)
      let rotation = Int(atan2(transform.b, transform.a) * 180 / .pi)
      return [
        "durationSec": CMTimeGetSeconds(duration),
        "width": Int(size.width),
        "height": Int(size.height),
        "rotationDeg": (rotation + 360) % 360
      ]
    }
  }

  /// Honour rotation metadata before cropping, or a sideways clip stays sideways.
  private static func fillTransform(
    for track: AVAssetTrack,
    naturalSize: CGSize
  ) -> CGAffineTransform {
    let scale = max(outputWidth / naturalSize.width, outputHeight / naturalSize.height)
    let scaled = CGSize(width: naturalSize.width * scale, height: naturalSize.height * scale)
    let translate = CGAffineTransform(
      translationX: (outputWidth - scaled.width) / 2,
      y: (outputHeight - scaled.height) / 2
    )
    return CGAffineTransform(scaleX: scale, y: scale).concatenating(translate)
  }

  /// Decode a still at output resolution or lower, then hold it for its slot.
  private static func appendStill(
    path: String,
    to track: AVMutableCompositionTrack,
    at time: CMTime,
    duration: CMTime
  ) throws {
    let cleaned = path.replacingOccurrences(of: "file://", with: "")
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: cleaned) as CFURL, nil) else {
      throw RenderError.stillUnreadable
    }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceThumbnailMaxPixelSize: max(outputWidth, outputHeight),
      kCGImageSourceCreateThumbnailWithTransform: true
    ]
    guard CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) != nil else {
      throw RenderError.stillUnreadable
    }
    // The still is written by the video composition pass; the empty range reserves its slot.
    track.insertEmptyTimeRange(CMTimeRange(start: time, duration: duration))
  }
}

enum RenderError: Error, LocalizedError {
  case compositionFailed
  case exportFailed
  case storageFull
  case cancelled
  case stillUnreadable

  var errorDescription: String? {
    switch self {
    case .compositionFailed: return "The reel could not be composed."
    case .exportFailed: return "The export failed."
    case .storageFull: return "There is not enough storage."
    case .cancelled: return "The export was cancelled."
    case .stillUnreadable: return "A photo could not be read."
    }
  }
}
