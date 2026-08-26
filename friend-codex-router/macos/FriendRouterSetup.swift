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
    @State private var textProviderId = "deepseek"
    @State private var textEndpoint = ProviderPreset.find("deepseek").baseURL
    @State private var textModel = ProviderPreset.find("deepseek").textModels.first!
    @State private var textKey = ""
    @State private var visionProviderId = "bailian"
    @State private var visionEndpoint = ProviderPreset.find("bailian").baseURL
    @State private var visionModel = ProviderPreset.find("bailian").visionModels.first!
    @State private var visionKey = ""
    @State private var statusKind: StatusKind = .neutral
    @State private var statusTitle = "尚未连接"
    @State private var statusDetail = "选择服务商并填写 API Key。系统会先测试连接，成功后再接入 Codex。"
    @State private var working = false
    @State private var connected = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Friend Codex Router").font(.system(size: 28, weight: .bold))
                    Text("选择常用服务商，测试成功后自动连接 Codex。新图片只理解一次。")
                        .foregroundStyle(.secondary)
                }

                ConnectionStatusBanner(kind: statusKind, title: statusTitle, detail: statusDetail, working: working)

                providerGroup(title: "1. 文字模型", providerId: $textProviderId, endpoint: $textEndpoint, model: $textModel, key: $textKey, vision: false)
                providerGroup(title: "2. 图片理解模型", providerId: $visionProviderId, endpoint: $visionEndpoint, model: $visionModel, key: $visionKey, vision: true)

                GroupBox("3. 测试并连接") {
                    VStack(alignment: .leading, spacing: 12) {
                        Button(connected ? "重新测试并连接 Codex" : "测试并连接 Codex") { Task { await connect() } }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .disabled(working || !canConnect)
                        Text("会分别发送一次极小的文字和图片测试请求。两项都成功后才保存 Key、启动网关并修改 Codex 配置。")
                            .font(.caption).foregroundStyle(.secondary)
                        Divider()
                        HStack {
                            Button("检查运行状态") { Task { await checkHealth() } }.disabled(working)
                            Button("恢复原 Codex 配置") { Task { await restore() } }.disabled(working)
                        }
                    }.padding(8)
                }

                Text("Key 保存于 macOS 钥匙串，不会显示或回填。Endpoint 与模型可以随时修改；自定义服务必须兼容 OpenAI Chat Completions。")
                    .font(.caption).foregroundStyle(.secondary)
            }.padding(24)
        }
        .onAppear { loadStoredConfiguration(); monitor.start() }
        .onChange(of: textProviderId) { value in applyPreset(value, vision: false) }
        .onChange(of: visionProviderId) { value in applyPreset(value, vision: true) }
    }

    @ViewBuilder
    private func providerGroup(title: String, providerId: Binding<String>, endpoint: Binding<String>, model: Binding<String>, key: Binding<String>, vision: Bool) -> some View {
        let preset = ProviderPreset.find(providerId.wrappedValue)
        GroupBox(title) {
            VStack(alignment: .leading, spacing: 11) {
                Picker("服务商", selection: providerId) {
                    ForEach(ProviderPreset.all) { Text($0.name).tag($0.id) }
                }
                TextField("API Endpoint", text: endpoint)
                HStack {
                    TextField(vision ? "图片理解模型 ID" : "文字模型 ID", text: model)
                    if !(vision ? preset.visionModels : preset.textModels).isEmpty {
                        Menu("常用模型") {
                            ForEach(vision ? preset.visionModels : preset.textModels, id: \.self) { item in
                                Button(item) { model.wrappedValue = item }
                            }
                        }
                    }
                }
                SecureField(vision && providerId.wrappedValue == textProviderId ? "API Key（留空则复用文字模型 Key）" : "API Key", text: key)
                Text("Endpoint 已预填但可编辑。保存状态：\(keyStatus(providerId.wrappedValue))")
                    .font(.caption).foregroundStyle(.secondary)
            }.padding(8)
        }
    }

    private var canConnect: Bool {
        !textEndpoint.isEmpty && !textModel.isEmpty && !visionEndpoint.isEmpty && !visionModel.isEmpty
        && (effectiveKey(providerId: textProviderId, entered: textKey) != nil)
        && (effectiveVisionKey != nil)
    }

    private var effectiveVisionKey: String? {
        if !visionKey.isEmpty { return visionKey }
        if visionProviderId == textProviderId, let value = effectiveKey(providerId: textProviderId, entered: textKey) { return value }
        return readKeychain(providerId: visionProviderId)
    }

    @MainActor
    private func connect() async {
        guard !Bundle.main.bundlePath.hasPrefix("/Volumes/") else {
            setStatus(.error, "请先拖入 Applications", "从 DMG 直接运行会导致后台服务引用临时路径。")
            return
        }
        guard let resolvedTextKey = effectiveKey(providerId: textProviderId, entered: textKey), let resolvedVisionKey = effectiveVisionKey else {
            setStatus(.error, "缺少 API Key", "请填写文字与图片模型所需的 Key。")
            return
        }
        working = true
        setStatus(.working, "正在测试连接", "先测试 \(textProvider.name) / \(textModel)，再测试 \(visionProvider.name) / \(visionModel)。")
        defer { working = false }
        do {
            let textJSON = providerJSON(textProvider, endpoint: textEndpoint, model: textModel)
            let visionJSON = providerJSON(visionProvider, endpoint: visionEndpoint, model: visionModel)
            _ = try runNode("provider-check.mjs", environment: ["FRIEND_ROUTER_PROVIDER_JSON": textJSON, "FRIEND_ROUTER_PROVIDER_KEY": resolvedTextKey, "FRIEND_ROUTER_PROVIDER_KIND": "text"])
            _ = try runNode("provider-check.mjs", environment: ["FRIEND_ROUTER_PROVIDER_JSON": visionJSON, "FRIEND_ROUTER_PROVIDER_KEY": resolvedVisionKey, "FRIEND_ROUTER_PROVIDER_KIND": "vision"])
            _ = try runNode("configure.mjs", environment: [
                "FRIEND_ROUTER_TEXT_PROVIDER_JSON": textJSON,
                "FRIEND_ROUTER_VISION_PROVIDER_JSON": visionJSON,
                "FRIEND_ROUTER_TEXT_KEY": resolvedTextKey,
                "FRIEND_ROUTER_VISION_KEY": resolvedVisionKey
            ])
            _ = try runNode("install-codex.mjs", arguments: ["install", "--model=friend-router/text"])
            _ = try runNode("install-service.mjs", arguments: ["install"])
            try? SMAppService.mainApp.register()
            textKey = ""; visionKey = ""; connected = true
            monitor.start(); await monitor.refresh()
            setStatus(.success, "连接成功", "文字：\(textProvider.name) / \(textModel)　图片：\(visionProvider.name) / \(visionModel)。现在直接打开 Codex 即可。")
        } catch {
            setStatus(.error, "连接失败", error.localizedDescription)
        }
    }

    @MainActor
    private func checkHealth() async {
        working = true; defer { working = false }; await monitor.refresh()
        if monitor.reachable {
            setStatus(.success, "网关运行正常", "本周 \(monitor.snapshot?.total.requests ?? 0) 次调用，\(monitor.snapshot?.total.totalTokens.compactCount ?? "0") Tokens。")
        } else { setStatus(.error, "网关未运行", monitor.lastError ?? "请重新测试并连接。") }
    }

    @MainActor
    private func restore() async {
        working = true; defer { working = false }
        do {
            _ = try? runNode("install-service.mjs", arguments: ["uninstall"])
            _ = try runNode("install-codex.mjs", arguments: ["restore"])
            try? await SMAppService.mainApp.unregister(); connected = false
            setStatus(.neutral, "已恢复", "已停止本地网关并恢复安装前的 Codex 配置。")
        } catch { setStatus(.error, "恢复失败", error.localizedDescription) }
    }

    private var textProvider: ProviderPreset { ProviderPreset.find(textProviderId) }
    private var visionProvider: ProviderPreset { ProviderPreset.find(visionProviderId) }
    private func applyPreset(_ id: String, vision: Bool) {
        let preset = ProviderPreset.find(id)
        if vision { visionEndpoint = preset.baseURL; visionModel = preset.visionModels.first ?? preset.textModels.first ?? "" }
        else { textEndpoint = preset.baseURL; textModel = preset.textModels.first ?? "" }
    }
    private func providerJSON(_ preset: ProviderPreset, endpoint: String, model: String) -> String {
        let value = ProviderPayload(id: preset.id, name: preset.name, baseUrl: endpoint, model: model)
        return String(data: try! JSONEncoder().encode(value), encoding: .utf8)!
    }
    private func keyStatus(_ id: String) -> String { readKeychain(providerId: id) == nil ? "未保存" : "已保存" }
    private func effectiveKey(providerId: String, entered: String) -> String? { entered.isEmpty ? readKeychain(providerId: providerId) : entered }
    private func readKeychain(providerId: String) -> String? {
        let process = Process(); let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/security")
        process.arguments = ["find-generic-password", "-w", "-s", "com.friend-codex-router.provider.\(providerId)", "-a", "default"]
        process.standardOutput = pipe; process.standardError = FileHandle.nullDevice
        do { try process.run(); process.waitUntilExit(); guard process.terminationStatus == 0 else { return nil }; return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) } catch { return nil }
    }
    private func loadStoredConfiguration() {
        let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Friend Codex Router/config.json")
        guard let data = try? Data(contentsOf: url), let stored = try? JSONDecoder().decode(StoredProviderConfiguration.self, from: data) else { return }
        if let route = stored.textRoute, let provider = stored.providers?[route.provider] { textProviderId = route.provider; textEndpoint = provider.baseUrl; textModel = route.model }
        if let route = stored.visionRoute, let provider = stored.providers?[route.provider] { visionProviderId = route.provider; visionEndpoint = provider.baseUrl; visionModel = route.model }
        connected = FileManager.default.fileExists(atPath: url.path)
        if connected { setStatus(.success, "已保存配置", "点击“重新测试并连接 Codex”可以验证当前 Key 与模型仍然可用。") }
    }
    private func setStatus(_ kind: StatusKind, _ title: String, _ detail: String) { statusKind = kind; statusTitle = title; statusDetail = detail }
    private func runNode(_ script: String, arguments: [String] = [], environment: [String: String] = [:]) throws -> String {
        guard let resources = Bundle.main.resourceURL else { throw SetupError("App resources are missing.") }
        let process = Process(); let pipe = Pipe()
        process.executableURL = resources.appendingPathComponent("node/bin/node")
        process.arguments = [resources.appendingPathComponent("app/src/\(script)").path] + arguments
        process.environment = ProcessInfo.processInfo.environment.merging(environment) { _, new in new }
        process.standardOutput = pipe; process.standardError = pipe
        try process.run(); process.waitUntilExit()
        let output = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        guard process.terminationStatus == 0 else { throw SetupError(output.trimmingCharacters(in: .whitespacesAndNewlines)) }
        return output
    }
}

private struct ProviderPayload: Encodable { let id: String; let name: String; let baseUrl: String; let model: String }
private struct StoredProviderConfiguration: Decodable { let providers: [String: StoredProvider]?; let textRoute: StoredRoute?; let visionRoute: StoredRoute? }
private struct StoredProvider: Decodable { let name: String; let baseUrl: String }
private struct StoredRoute: Decodable { let provider: String; let model: String }

enum StatusKind { case neutral, working, success, error }
struct ConnectionStatusBanner: View {
    let kind: StatusKind; let title: String; let detail: String; let working: Bool
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if working { ProgressView().controlSize(.small) } else { Image(systemName: icon).foregroundStyle(color).font(.title3) }
            VStack(alignment: .leading, spacing: 4) { Text(title).font(.headline); Text(detail).font(.subheadline).foregroundStyle(.secondary).textSelection(.enabled) }
            Spacer()
        }.padding(14).background(color.opacity(0.11)).overlay(RoundedRectangle(cornerRadius: 12).stroke(color.opacity(0.35))).clipShape(RoundedRectangle(cornerRadius: 12))
    }
    private var icon: String { switch kind { case .success: return "checkmark.circle.fill"; case .error: return "xmark.octagon.fill"; case .working: return "arrow.triangle.2.circlepath"; case .neutral: return "info.circle.fill" } }
    private var color: Color { switch kind { case .success: return .green; case .error: return .red; case .working: return .blue; case .neutral: return .blue } }
}

struct SetupError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
