/**
 * Provider preset configurations for popular LLM API providers
 */
export const PRESETS = {
  anthropic: {
    display: "Anthropic (native)",
    env: {
      ANTHROPIC_BASE_URL: "",
    },
  },
  zai: {
    display: "Z.ai (GLM)",
    env: {
      ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
      ANTHROPIC_AUTH_TOKEN: "<YOUR_ZAI_API_KEY>",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-4.6",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-4.6",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-4.5-air",
    },
  },
  minimax: {
    display: "MiniMax",
    env: {
      ANTHROPIC_BASE_URL: "https://api.minimax.io/anthropic",
      ANTHROPIC_AUTH_TOKEN: "<MINIMAX_API_KEY>",
      API_TIMEOUT_MS: "3000000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      ANTHROPIC_MODEL: "MiniMax-M2",
      ANTHROPIC_SMALL_FAST_MODEL: "MiniMax-M2",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "MiniMax-M2",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "MiniMax-M2",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "MiniMax-M2",
    },
  },
  kimi: {
    display: "Kimi (Moonshot)",
    env: {
      ANTHROPIC_BASE_URL: "https://api.moonshot.ai/anthropic",
      ANTHROPIC_AUTH_TOKEN: "<MOONSHOT_API_KEY>",
      ANTHROPIC_MODEL: "kimi-k2-thinking",
      ANTHROPIC_SMALL_FAST_MODEL: "kimi-k2-turbo-preview",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "kimi-k2-thinking",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "kimi-k2-thinking-turbo",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "kimi-k2-0905-preview",
    },
  },
  qwen: {
    display: "Qwen (DashScope Intl)",
    env: {
      ANTHROPIC_BASE_URL: "https://dashscope-intl.aliyuncs.com/apps/anthropic",
      ANTHROPIC_AUTH_TOKEN: "<YOUR_DASHSCOPE_API_KEY>",
      ANTHROPIC_MODEL: "qwen-plus",
      ANTHROPIC_SMALL_FAST_MODEL: "qwen-flash",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "qwen-plus",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "qwen-plus",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "qwen-flash",
    },
  },
  deepseek: {
    display: "DeepSeek",
    env: {
      ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
      ANTHROPIC_AUTH_TOKEN: "<DEEPSEEK_API_KEY>",
      API_TIMEOUT_MS: "600000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      ANTHROPIC_MODEL: "deepseek-chat",
      ANTHROPIC_SMALL_FAST_MODEL: "deepseek-chat",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-chat",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-chat",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-chat",
    },
  },
} as const;

export type PresetKey = keyof typeof PRESETS;

/** Model environment variable keys that can be overridden */
export const MODEL_ENV_KEYS = [
  "ANTHROPIC_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
] as const;

/** Default model suggestions per preset */
export const DEFAULT_MODEL_HINTS: Record<PresetKey, string> = {
  anthropic: "claude-sonnet-4.5",
  zai: "glm-4.6",
  kimi: "kimi-k2-thinking",
  qwen: "qwen-plus",
  minimax: "MiniMax-M2",
  deepseek: "deepseek-chat",
};
