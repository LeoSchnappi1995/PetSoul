import AppKit
import Foundation

@MainActor
final class FriendRouterAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        UsageViewModel.shared.start()
        let configURL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Friend Codex Router/config.json")
        let forceOpen = ProcessInfo.processInfo.environment["FRIEND_ROUTER_OPEN_SETTINGS"] == "1"
        if forceOpen || !FileManager.default.fileExists(atPath: configURL.path) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                SettingsWindowController.shared.show(monitor: UsageViewModel.shared)
            }
        }
    }
}
