import AppKit
import Foundation
import ServiceManagement
import SwiftUI

@main
struct FriendRouterSetupApp: App {
    @NSApplicationDelegateAdaptor(FriendRouterAppDelegate.self) private var appDelegate
    @StateObject private var usage = UsageViewModel.shared

    var body: some Scene {
        MenuBarExtra {
            UsageMenuView(monitor: usage)
        } label: {
            Text(usage.menuTitle)
        }
        .menuBarExtraStyle(.menu)
    }
}

struct UsageMenuView: View {
    @ObservedObject var monitor: UsageViewModel

    var body: some View {
        Group {
            Text("本自然周累计")
            if let snapshot = monitor.snapshot {
                Text(summaryLine(snapshot.total))
                Text("统计范围：\(snapshot.period.start) 至 \(snapshot.period.end)")
                Divider()
                ForEach(Array(snapshot.models.prefix(8))) { item in
                    Text(modelTitle(item))
                    Text("  \(item.requests) 次 · 输入 \(item.inputTokens.compactCount) · 输出 \(item.outputTokens.compactCount) · 共 \(item.totalTokens.compactCount)\(item.visionCalls > 0 ? " · 视觉 \(item.visionCalls) 次" : "")")
                }
            } else {
                Text(monitor.lastError ?? "等待本地网关数据…")
            }

            Divider()
            Button("立即刷新") { Task { await monitor.refresh() } }
            Button("设置…") { openSettings() }

            Divider()
            if let update = monitor.availableUpdate {
                Button("安装版本 \(update.version)…") { Task { await monitor.downloadAvailableUpdate() } }
            } else {
                Button("检查更新…") { Task { await monitor.checkForUpdates(interactive: true) } }
            }
            if !monitor.updateStatus.isEmpty { Text(monitor.updateStatus) }
            Text("版本 \(monitor.currentVersion)")
            Button("退出") { NSApplication.shared.terminate(nil) }
        }
        .task { monitor.start() }
    }

    private func summaryLine(_ usage: ModelUsage) -> String {
        let cost = usage.cost > 0 ? "\(usage.cost.dollarText) · " : ""
        return "\(cost)\(usage.requests) 次调用 · \(usage.totalTokens.compactCount) Tokens"
    }

    private func modelTitle(_ usage: ModelUsage) -> String {
        let name = usage.model ?? "unknown"
        let cost = usage.cost > 0 ? " · \(usage.cost.dollarText)" : ""
        return "\(name)\(cost)"
    }

    private func openSettings() {
        SettingsWindowController.shared.show(monitor: monitor)
    }
}

struct SetupView: View {
    @ObservedObject var monitor: UsageViewModel
    @State private var deepSeekKey = ""
    @State private var qwenKey = ""
    @State private var ccrClientKey = ""
    @State private var textModel = "DeepSeek/deepseek-chat"
    @State private var visionModel = "qwen-vl-max"
    @State private var status = "先安装并启动 Claude Code Router，在 API Keys 页面创建一个本地 Client Key。"
    @State private var working = false
    @State private var localClientKeyStored = false
    @State private var ccrKeyStored = false
    @State private var visionKeyStored = false

    private let textModels = [
        "DeepSeek/deepseek-chat",
        "DeepSeek/deepseek-reasoner",
        "Alibaba Bailian/qwen3-coder-plus"
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 5) {
                Text("Friend Codex Router")
                    .font(.system(size: 28, weight: .bold))
                Text("文字任务走 DeepSeek/Qwen；新图片只理解一次，后续复用摘要。")
                    .foregroundStyle(.secondary)
            }

            GroupBox("1. 服务商密钥") {
                VStack(alignment: .leading, spacing: 12) {
                    SecureField("DeepSeek API Key", text: $deepSeekKey)
                    SecureField("Qwen / DashScope API Key", text: $qwenKey)
                    SecureField("CCR 本地 Client Key（内测版暂需从 CCR 的 API Keys 页面复制）", text: $ccrClientKey)
                    Text("本地状态：Codex Key \(storedText(localClientKeyStored)) · CCR Key \(storedText(ccrKeyStored)) · 图片理解 Key \(storedText(visionKeyStored))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    HStack {
                        Button("打开 CCR") { openCCR() }
                        Button("导入 DeepSeek 与 Qwen 到 CCR") { importProviders() }
                            .disabled(deepSeekKey.isEmpty || qwenKey.isEmpty)
                        Button("保存本地连接密钥") { Task { await saveCredentials() } }
                            .disabled(working || qwenKey.isEmpty || ccrClientKey.isEmpty)
                    }
                    Text("DeepSeek/Qwen 服务商 Key 由 CCR 保存；CCR Client Key 与图片理解 Key 由本 App 保存进 macOS 钥匙串。安全原因不会回填明文。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(8)
            }

            GroupBox("2. 模型") {
                VStack(alignment: .leading, spacing: 12) {
                    Picker("默认文字模型", selection: $textModel) {
                        ForEach(textModels, id: \.self) { Text($0).tag($0) }
                    }
                    TextField("图片理解模型", text: $visionModel)
                    HStack {
                        Button("应用模型路由") { Task { await applyRouting() } }
                            .disabled(working)
                        Text("文字 → \(textModel)；新图片 → \(visionModel) 一次；后续复用摘要。")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text("切换文字模型不需要重新输入 Key。图片理解与图片生成完全分开；接收图片不会触发生图。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(8)
            }

            GroupBox("3. 自动接入 Codex") {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Button("安装并连接 Codex") { Task { await install() } }
                            .buttonStyle(.borderedProminent)
                            .disabled(working || (!visionKeyStored && qwenKey.isEmpty) || (!ccrKeyStored && ccrClientKey.isEmpty))
                        Button("恢复原 Codex 配置") { Task { await restore() } }
                            .disabled(working)
                        Button("检查运行状态") { Task { await checkHealth() } }
                            .disabled(working)
                    }
                    Text(status)
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(8)
            }

            Spacer()
            Text("内测版：请先把本 App 拖到 Applications 再安装。正式版会自动创建 CCR Client Key，并完成签名与公证。")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(24)
        .onAppear {
            loadStoredState()
            monitor.start()
        }
    }

    @MainActor
    private func saveCredentials() async {
        working = true
        defer { working = false }
        do {
            let environment = [
                "FRIEND_ROUTER_CCR_KEY": ccrClientKey,
                "FRIEND_ROUTER_VISION_KEY": qwenKey,
                "FRIEND_ROUTER_CODEX_MODEL": textModel,
                "FRIEND_ROUTER_VISION_MODEL": visionModel
            ]
            _ = try runNode("configure.mjs", environment: environment)
            deepSeekKey = ""
            qwenKey = ""
            ccrClientKey = ""
            loadStoredState()
            status = "本地连接密钥已保存到 macOS 钥匙串。DeepSeek/Qwen 服务商配置仍以 CCR 中的状态为准。"
        } catch {
            status = "保存密钥失败：\(error.localizedDescription)"
        }
    }

    @MainActor
    private func applyRouting() async {
        working = true
        defer { working = false }
        do {
            let environment = [
                "FRIEND_ROUTER_CODEX_MODEL": textModel,
                "FRIEND_ROUTER_VISION_MODEL": visionModel
            ]
            _ = try runNode("update-routing.mjs", environment: environment)
            _ = try runNode("install-codex.mjs", arguments: ["install", "--model=\(textModel)"])
            if ccrKeyStored && visionKeyStored {
                _ = try runNode("install-service.mjs", arguments: ["install"])
            }
            status = "路由已应用：文字任务走 \(textModel)，新图片首次走 \(visionModel)。请在 Codex 中新开任务使默认文字模型立即生效。"
        } catch {
            status = "应用路由失败：\(error.localizedDescription)"
        }
    }

    @MainActor
    private func install() async {
        guard !Bundle.main.bundlePath.hasPrefix("/Volumes/") else {
            status = "请先将 App 拖入 Applications，再执行安装；否则后台服务会引用 DMG 临时路径。"
            return
        }
        working = true
        defer { working = false }
        do {
            if !ccrClientKey.isEmpty || !qwenKey.isEmpty {
                guard !ccrClientKey.isEmpty && !qwenKey.isEmpty else {
                    throw SetupError("首次保存需要同时填写 CCR Client Key 与 Qwen/DashScope Key。")
                }
                let environment = [
                    "FRIEND_ROUTER_CCR_KEY": ccrClientKey,
                    "FRIEND_ROUTER_VISION_KEY": qwenKey,
                    "FRIEND_ROUTER_CODEX_MODEL": textModel,
                    "FRIEND_ROUTER_VISION_MODEL": visionModel
                ]
                _ = try runNode("configure.mjs", environment: environment)
                loadStoredState()
            }
            guard ccrKeyStored || keychainHas(service: "com.friend-codex-router.ccr") else {
                throw SetupError("缺少 CCR Client Key，请先在上方保存本地连接密钥。")
            }
            guard visionKeyStored || keychainHas(service: "com.friend-codex-router.vision") else {
                throw SetupError("缺少 Qwen 图片理解 Key，请先在上方保存本地连接密钥。")
            }
            _ = try runNode("update-routing.mjs", environment: [
                "FRIEND_ROUTER_CODEX_MODEL": textModel,
                "FRIEND_ROUTER_VISION_MODEL": visionModel
            ])
            _ = try runNode("install-codex.mjs", arguments: ["install", "--model=\(textModel)"])
            _ = try runNode("install-service.mjs", arguments: ["install"])
            try? SMAppService.mainApp.register()
            monitor.start()
            await monitor.refresh()
            status = "安装完成。Codex 已指向本地网关；同一张图片默认只调用一次视觉模型。"
        } catch {
            status = "安装失败：\(error.localizedDescription)"
        }
    }

    @MainActor
    private func restore() async {
        working = true
        defer { working = false }
        do {
            _ = try? runNode("install-service.mjs", arguments: ["uninstall"])
            _ = try runNode("install-codex.mjs", arguments: ["restore"])
            try? await SMAppService.mainApp.unregister()
            status = "已停止本地网关并恢复安装前的 Codex 配置。"
        } catch {
            status = "恢复失败：\(error.localizedDescription)"
        }
    }

    @MainActor
    private func checkHealth() async {
        working = true
        defer { working = false }
        do {
            await monitor.refresh()
            if monitor.reachable {
                status = "网关正常。当前自然周：\(monitor.snapshot?.total.requests ?? 0) 次调用，\(monitor.snapshot?.total.totalTokens.compactCount ?? "0") Tokens。"
            } else {
                throw SetupError(monitor.lastError ?? "本地网关未响应。")
            }
        } catch {
            status = "网关尚未运行：\(error.localizedDescription)"
        }
    }

    private func importProviders() {
        openProvider(name: "DeepSeek", baseURL: "https://api.deepseek.com", key: deepSeekKey,
                     models: "deepseek-chat,deepseek-reasoner")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            openProvider(name: "Alibaba Bailian", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", key: qwenKey,
                         models: "qwen3-coder-plus,qwen-vl-max")
        }
    }

    private func loadStoredState() {
        localClientKeyStored = keychainHas(service: "com.friend-codex-router.client")
        ccrKeyStored = keychainHas(service: "com.friend-codex-router.ccr")
        visionKeyStored = keychainHas(service: "com.friend-codex-router.vision")
        let configURL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Friend Codex Router/config.json")
        if let data = try? Data(contentsOf: configURL),
           let routing = try? JSONDecoder().decode(StoredRouting.self, from: data) {
            textModel = routing.codexModel ?? textModel
            visionModel = routing.visionModel ?? visionModel
        }
    }

    private func keychainHas(service: String) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/security")
        process.arguments = ["find-generic-password", "-s", service, "-a", "default"]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            return false
        }
    }

    private func storedText(_ stored: Bool) -> String { stored ? "已保存" : "未保存" }

    private func openProvider(name: String, baseURL: String, key: String, models: String) {
        var components = URLComponents()
        components.scheme = "ccr"
        components.host = "provider"
        components.queryItems = [
            URLQueryItem(name: "name", value: name),
            URLQueryItem(name: "base_url", value: baseURL),
            URLQueryItem(name: "api_key", value: key),
            URLQueryItem(name: "protocol", value: "openai_chat_completions"),
            URLQueryItem(name: "models", value: models)
        ]
        if let url = components.url { NSWorkspace.shared.open(url) }
    }

    private func openCCR() {
        let candidates = [
            "/Applications/Claude Code Router.app",
            NSString(string: "~/Applications/Claude Code Router.app").expandingTildeInPath
        ]
        if let app = candidates.first(where: { FileManager.default.fileExists(atPath: $0) }) {
            NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: app), configuration: .init())
        } else if let url = URL(string: "https://github.com/musistudio/claude-code-router/releases") {
            NSWorkspace.shared.open(url)
        }
    }

    private func runNode(_ script: String, arguments: [String] = [], environment: [String: String] = [:]) throws -> String {
        guard let resources = Bundle.main.resourceURL else { throw SetupError("App resources are missing.") }
        let node = resources.appendingPathComponent("node/bin/node")
        let scriptURL = resources.appendingPathComponent("app/src/\(script)")
        let process = Process()
        process.executableURL = node
        process.arguments = [scriptURL.path] + arguments
        process.environment = ProcessInfo.processInfo.environment.merging(environment) { _, new in new }
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        try process.run()
        process.waitUntilExit()
        let output = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        guard process.terminationStatus == 0 else { throw SetupError(output.trimmingCharacters(in: .whitespacesAndNewlines)) }
        return output
    }
}

private struct StoredRouting: Decodable {
    let codexModel: String?
    let visionModel: String?
}

struct SetupError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
