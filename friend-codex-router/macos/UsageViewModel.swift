import AppKit
import Foundation

@MainActor
final class UsageViewModel: ObservableObject {
    static let shared = UsageViewModel()
    @Published var snapshot: UsageSnapshot?
    @Published var runtime: RuntimeMetrics?
    @Published var reachable = false
    @Published var lastError: String?
    @Published var updateStatus = ""
    @Published var availableUpdate: UpdateManifest?

    private var monitoringTask: Task<Void, Never>?
    private var updateTask: Task<Void, Never>?
    private let updateService = UpdateService()
    private(set) var appConfig = RouterAppConfig(updateManifestURL: nil, updatePublicKeyBase64: nil, updateCheckIntervalSeconds: 900)

    var currentVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.3.2"
    }

    var menuTitle: String {
        guard reachable, let total = snapshot?.total else { return "Router --" }
        if total.cost > 0 { return total.cost.dollarText }
        return total.totalTokens > 0 ? total.totalTokens.compactCount : "Router 0"
    }

    func start() {
        guard monitoringTask == nil else { return }
        appConfig = loadAppConfig()
        monitoringTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(10))
            }
        }
        updateTask = Task { [weak self] in
            guard let self else { return }
            await self.checkForUpdates(interactive: false)
            let interval = max(300, self.appConfig.updateCheckIntervalSeconds ?? 900)
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(interval))
                await self.checkForUpdates(interactive: false)
            }
        }
    }

    func refresh() async {
        do {
            let url = URL(string: "http://127.0.0.1:3566/metrics?window=week")!
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw UpdateError("本地网关未响应。")
            }
            let envelope = try JSONDecoder().decode(MetricsEnvelope.self, from: data)
            snapshot = envelope.usage
            runtime = envelope.runtime
            reachable = true
            lastError = nil
        } catch {
            reachable = false
            lastError = error.localizedDescription
        }
    }

    func checkForUpdates(interactive: Bool) async {
        do {
            let result = try await updateService.check(config: appConfig, currentVersion: currentVersion)
            switch result {
            case .disabled:
                updateStatus = interactive ? "尚未配置签名更新地址。" : ""
            case .current:
                availableUpdate = nil
                updateStatus = interactive ? "当前已经是最新版本。" : ""
            case .available(let manifest):
                availableUpdate = manifest
                updateStatus = "发现新版本 \(manifest.version)"
            }
        } catch {
            if interactive { updateStatus = "检查更新失败：\(error.localizedDescription)" }
        }
    }

    func downloadAvailableUpdate() async {
        guard let manifest = availableUpdate else { return }
        do {
            updateStatus = "正在下载并校验版本 \(manifest.version)…"
            _ = try await updateService.downloadAndOpen(manifest)
            updateStatus = "安装包已验证并打开，请将新版本拖入 Applications。"
        } catch {
            updateStatus = "更新失败：\(error.localizedDescription)"
        }
    }

    private func loadAppConfig() -> RouterAppConfig {
        let url = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Friend Codex Router/config.json")
        guard let data = try? Data(contentsOf: url), let value = try? JSONDecoder().decode(RouterAppConfig.self, from: data) else {
            return RouterAppConfig(updateManifestURL: nil, updatePublicKeyBase64: nil, updateCheckIntervalSeconds: 900)
        }
        return value
    }
}
