import AppKit
import CryptoKit
import Foundation

struct UpdateManifest: Decodable {
    let version: String
    let build: Int
    let dmgURL: String
    let sha256: String
    let signature: String

    var canonicalData: Data {
        Data("\(version)\n\(build)\n\(dmgURL)\n\(sha256.lowercased())\n".utf8)
    }
}

enum UpdateCheckResult {
    case disabled
    case current
    case available(UpdateManifest)
}

struct UpdateService {
    func check(config: RouterAppConfig, currentVersion: String) async throws -> UpdateCheckResult {
        guard
            let manifestText = config.updateManifestURL,
            let manifestURL = URL(string: manifestText),
            manifestURL.scheme == "https",
            let publicKeyText = config.updatePublicKeyBase64,
            let publicKeyData = Data(base64Encoded: publicKeyText),
            !publicKeyData.isEmpty
        else { return .disabled }

        let (data, response) = try await URLSession.shared.data(from: manifestURL)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw UpdateError("版本服务器返回异常。")
        }
        let manifest = try JSONDecoder().decode(UpdateManifest.self, from: data)
        let publicKey = try Curve25519.Signing.PublicKey(rawRepresentation: publicKeyData)
        guard
            let signature = Data(base64Encoded: manifest.signature),
            publicKey.isValidSignature(signature, for: manifest.canonicalData)
        else { throw UpdateError("更新清单签名验证失败。") }

        return manifest.version.compare(currentVersion, options: .numeric) == .orderedDescending
            ? .available(manifest)
            : .current
    }

    func downloadAndOpen(_ manifest: UpdateManifest) async throws -> URL {
        guard let url = URL(string: manifest.dmgURL), url.scheme == "https" else {
            throw UpdateError("安装包地址必须使用 HTTPS。")
        }
        let (temporaryURL, response) = try await URLSession.shared.download(from: url)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw UpdateError("安装包下载失败。")
        }
        let data = try Data(contentsOf: temporaryURL, options: .mappedIfSafe)
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard digest == manifest.sha256.lowercased() else {
            throw UpdateError("安装包 SHA-256 校验失败。")
        }
        let updatesDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Friend Codex Router/Updates", isDirectory: true)
        try FileManager.default.createDirectory(at: updatesDir, withIntermediateDirectories: true)
        let destination = updatesDir.appendingPathComponent("Friend-Codex-Router-\(manifest.version).dmg")
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.copyItem(at: temporaryURL, to: destination)
        _ = await MainActor.run { NSWorkspace.shared.open(destination) }
        return destination
    }
}

struct UpdateError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
