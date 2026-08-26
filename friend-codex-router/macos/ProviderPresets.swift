import Foundation

struct ProviderPreset: Identifiable, Hashable {
    let id: String
    let name: String
    let baseURL: String
    let textModels: [String]
    let visionModels: [String]

    static let all: [ProviderPreset] = [
        .init(id: "deepseek", name: "DeepSeek", baseURL: "https://api.deepseek.com", textModels: ["deepseek-chat", "deepseek-reasoner"], visionModels: []),
        .init(id: "bailian", name: "阿里百炼 / Qwen", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", textModels: ["qwen3-coder-plus", "qwen-plus", "qwen-max"], visionModels: ["qwen-vl-max", "qwen-vl-plus"]),
        .init(id: "openrouter", name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", textModels: ["deepseek/deepseek-chat", "qwen/qwen3-coder"], visionModels: ["qwen/qwen-2.5-vl-72b-instruct"]),
        .init(id: "siliconflow", name: "SiliconFlow", baseURL: "https://api.siliconflow.cn/v1", textModels: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-Coder-32B-Instruct"], visionModels: ["Qwen/Qwen2.5-VL-72B-Instruct"]),
        .init(id: "moonshot", name: "Moonshot / Kimi", baseURL: "https://api.moonshot.cn/v1", textModels: ["kimi-latest"], visionModels: []),
        .init(id: "zhipu", name: "智谱 GLM", baseURL: "https://open.bigmodel.cn/api/paas/v4", textModels: ["glm-4-plus", "glm-4-flash"], visionModels: ["glm-4v-plus"]),
        .init(id: "custom", name: "自定义 OpenAI-compatible", baseURL: "", textModels: [], visionModels: [])
    ]

    static func find(_ id: String) -> ProviderPreset {
        all.first(where: { $0.id == id }) ?? all.last!
    }
}
