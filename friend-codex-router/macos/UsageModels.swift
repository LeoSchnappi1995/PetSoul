import Foundation

struct MetricsEnvelope: Decodable {
    let runtime: RuntimeMetrics
    let usage: UsageSnapshot
}

struct RuntimeMetrics: Decodable {
    let requests: Int
    let proxyErrors: Int
    let visionCalls: Int
    let visionCacheHits: Int
    let imagePlaceholders: Int
}

struct UsageSnapshot: Decodable {
    let window: String
    let period: UsagePeriod
    let updatedAt: String
    let total: ModelUsage
    let models: [ModelUsage]
}

struct UsagePeriod: Decodable {
    let start: String
    let end: String
}

struct ModelUsage: Decodable, Identifiable {
    var id: String { model ?? "total" }
    let model: String?
    let requests: Int
    let failures: Int
    let inputTokens: Int
    let outputTokens: Int
    let totalTokens: Int
    let cost: Double
    let visionCalls: Int
    let lastCalledAt: String?
}

struct RouterAppConfig: Decodable {
    let updateManifestURL: String?
    let updatePublicKeyBase64: String?
    let updateCheckIntervalSeconds: Int?
}

extension Int {
    var compactCount: String {
        if self >= 1_000_000 { return String(format: "%.1fM", Double(self) / 1_000_000) }
        if self >= 1_000 { return String(format: "%.1fK", Double(self) / 1_000) }
        return String(self)
    }
}

extension Double {
    var dollarText: String {
        String(format: "$%.2f", self)
    }
}
