import ExpoModulesCore
import UIKit

/**
 * Handing a finished reel to Instagram's Reels composer on iOS.
 *
 * The pasteboard keys below are Instagram's documented sharing contract. Neither
 * `expo-sharing` nor `react-native-share` sets them, which is why this module exists at all.
 *
 * `instagram-reels` **must** be listed in `LSApplicationQueriesSchemes` in Info.plist, or
 * `canOpenURL` returns false forever and the button silently never appears. That is a build
 * configuration bug rather than a runtime one, so there is a test asserting the plist entry.
 */
public class InstagramShareModule: Module {

  private static let reelsScheme = "instagram-reels://share"
  private static let backgroundVideoKey = "com.instagram.sharedSticker.backgroundVideo"
  private static let appIdKey = "com.instagram.sharedSticker.appID"
  private static let pasteboardLifetimeSeconds: TimeInterval = 300

  public func definition() -> ModuleDefinition {
    Name("InstagramShare")

    AsyncFunction("isAvailable") { () -> Bool in
      guard let url = URL(string: InstagramShareModule.reelsScheme) else { return false }
      return await MainActor.run { UIApplication.shared.canOpenURL(url) }
    }

    AsyncFunction("shareToReels") { (videoPath: String, metaAppId: String) in
      let cleaned = videoPath.replacingOccurrences(of: "file://", with: "")
      let fileUrl = URL(fileURLWithPath: cleaned)

      guard FileManager.default.fileExists(atPath: cleaned) else {
        throw ShareError.fileMissing
      }
      guard let data = try? Data(contentsOf: fileUrl) else {
        throw ShareError.fileUnreadable
      }
      guard let url = URL(string: InstagramShareModule.reelsScheme) else {
        throw ShareError.handoffFailed
      }

      try await MainActor.run {
        guard UIApplication.shared.canOpenURL(url) else {
          throw ShareError.notInstalled
        }

        let items: [String: Any] = [
          InstagramShareModule.backgroundVideoKey: data,
          InstagramShareModule.appIdKey: metaAppId
        ]
        // The pasteboard entry expires on its own. A user's reel is not left sitting on the
        // system pasteboard after they have moved on.
        UIPasteboard.general.setItems(
          [items],
          options: [
            .expirationDate: Date().addingTimeInterval(
              InstagramShareModule.pasteboardLifetimeSeconds
            )
          ]
        )

        UIApplication.shared.open(url, options: [:]) { opened in
          if !opened {
            // Nothing to throw into at this point; the JS side treats a return with no
            // Instagram on screen as a failed handoff and offers the save fallback.
          }
        }
      }
    }

    /**
     * Can `packageName` accept a video? On iOS the package name is mapped to the app's URL
     * scheme, which must also be in `LSApplicationQueriesSchemes` or this is false for ever.
     */
    AsyncFunction("isPackageAvailable") { (packageName: String) -> Bool in
      let scheme: String?
      switch packageName {
      case "com.google.android.youtube": scheme = "youtube://"
      default: scheme = nil
      }
      guard let scheme, let url = URL(string: scheme) else { return false }
      return await MainActor.run { UIApplication.shared.canOpenURL(url) }
    }

    /**
     * iOS has no direct equivalent of Android's targeted ACTION_SEND — the system sheet is
     * the platform's own way to hand a file to a named app, so both entry points use it.
     */
    AsyncFunction("shareToPackage") { (videoPath: String, _ packageName: String) in
      try await Self.presentShareSheet(videoPath: videoPath)
    }

    AsyncFunction("shareSystem") { (videoPath: String) in
      try await Self.presentShareSheet(videoPath: videoPath)
    }
  }

  @MainActor
  private static func presentShareSheet(videoPath: String) throws {
    let cleaned = videoPath.replacingOccurrences(of: "file://", with: "")
    guard FileManager.default.fileExists(atPath: cleaned) else {
      throw ShareError.fileMissing
    }
    let fileUrl = URL(fileURLWithPath: cleaned)

    guard
      let scene = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene }).first,
      let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else {
      throw ShareError.handoffFailed
    }

    let sheet = UIActivityViewController(activityItems: [fileUrl], applicationActivities: nil)
    var top = root
    while let presented = top.presentedViewController { top = presented }
    sheet.popoverPresentationController?.sourceView = top.view
    top.present(sheet, animated: true)
  }
}

enum ShareError: Error, LocalizedError {
  case fileMissing
  case fileUnreadable
  case notInstalled
  case handoffFailed

  var errorDescription: String? {
    switch self {
    case .fileMissing: return "The reel is no longer on disk."
    case .fileUnreadable: return "The reel could not be read."
    case .notInstalled: return "Instagram is not installed."
    case .handoffFailed: return "Instagram would not accept the reel."
    }
  }
}
