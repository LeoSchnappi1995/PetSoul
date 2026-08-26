import AppKit
import Foundation
import SwiftUI

@main
struct FriendRouterSetupApp: App {
    var body: some Scene {
        WindowGroup("Friend Codex Router") {
            SetupView()
                .frame(minWidth: 640, minHeight: 590)
        }
        .windowResizability(.contentSize)
    }
}

struct SetupView: View {
    @State private var deepSeekKey = ""
    @State private var qwenKey = ""
    @State private var ccrClientKey = ""
    @State private var textModel = "DeepSeek/deepseek-chat"
    @State private var visionModel = "qwen-vl-max"
    @State private var status = "先安装并启动 Claude Code Router，在 API Keys 页面创建一个本地 Client Key。"
    @State private var working = false

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
                    HStack {
                        Button("打开 CCR") { openCCR() }
                        Button("导入 DeepSeek 与 Qwen 配置") { importProviders() }
                            .disabled(deepSeekKey.isEmpty || qwenKey.isEmpty)
                    }
                    Text("导入会打开 CCR 的官方预览页；分别确认两次后，密钥才会保存到 CCR。")
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
                    Text("图片理解与图片生成完全分开；接收图片不会触发生图。")
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
                            .disabled(working || qwenKey.isEmpty || ccrClientKey.isEmpty || (textModel.hasPrefix("DeepSeek/") && deepSeekKey.isEmpty))
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
            let environment = [
                "FRIEND_ROUTER_CCR_KEY": ccrClientKey,
                "FRIEND_ROUTER_VISION_KEY": qwenKey,
                "FRIEND_ROUTER_CODEX_MODEL": textModel,
                "FRIEND_ROUTER_VISION_MODEL": visionModel
            ]
            _ = try runNode("configure.mjs", environment: environment)
            _ = try runNode("install-codex.mjs", arguments: ["install", "--model=\(textModel)"])
            _ = try runNode("install-service.mjs", arguments: ["install"])
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
            let data = try Data(contentsOf: URL(string: "http://127.0.0.1:3566/health")!)
            status = String(data: data, encoding: .utf8) ?? "网关已响应。"
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

struct SetupError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
