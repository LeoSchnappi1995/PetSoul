import AppKit
import SwiftUI

@MainActor
final class SettingsWindowController {
    static let shared = SettingsWindowController()
    private var windowController: NSWindowController?

    func show(monitor: UsageViewModel) {
        if let windowController {
            NSApplication.shared.activate(ignoringOtherApps: true)
            windowController.showWindow(nil)
            windowController.window?.makeKeyAndOrderFront(nil)
            return
        }

        let rootView = SetupView(monitor: monitor)
            .frame(minWidth: 680, minHeight: 650)
        let hosting = NSHostingController(rootView: rootView)
        let window = NSWindow(contentViewController: hosting)
        window.title = "Friend Codex Router 设置"
        window.styleMask = [.titled, .closable, .miniaturizable]
        window.setContentSize(NSSize(width: 700, height: 670))
        window.center()
        window.isReleasedWhenClosed = false
        let controller = NSWindowController(window: window)
        windowController = controller
        NSApplication.shared.activate(ignoringOtherApps: true)
        controller.showWindow(nil)
        window.makeKeyAndOrderFront(nil)
    }
}
