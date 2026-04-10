/**
 * Provider preset configurations for popular LLM API providers
 */
export const PRESETS = {
  anthropic: {
    display: "Anthropic (native)",
    apiKeyPlaceholder: "YOUR_ANTHROPIC_API_KEY",
    env: {
      ANTHROPIC_BASE_URL: "",
      ANTHROPIC_MODEL: "claude-sonnet-4-5",
      ANTHROPIC_SMALL_FAST_MODEL: "claude-haiku-4-5",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-1",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-5",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5",
    },
    model: "claude-sonnet-4-5",
  },
  zai: {
    display: "Z.ai (GLM)",
    apiKeyPlaceholder: "YOUR_ZAI_API_KEY",
    env: {
      ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
      ANTHROPIC_MODEL: "glm-4.7",
      ANTHROPIC_SMALL_FAST_MODEL: "glm-4.7-flash",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-4.7",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-4.7",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-4.7-flash",
    },
    model: "glm-4.7",
  },
  minimax: {
    display: "MiniMax",
    apiKeyPlaceholder: "MINIMAX_API_KEY",
    env: {
      ANTHROPIC_BASE_URL: "https://api.minimax.io/anthropic",
      API_TIMEOUT_MS: "3000000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      ANTHROPIC_MODEL: "minimax-m2.1",
      ANTHROPIC_SMALL_FAST_MODEL: "minimax-m2.1",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "minimax-m2.1",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "minimax-m2.1",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "minimax-m2.1",
    },
    model: "minimax-m2.1",
  },
  kimi: {
    display: "Kimi (Moonshot)",
    apiKeyPlaceholder: "MOONSHOT_API_KEY",
    env: {
      ANTHROPIC_BASE_URL: "https://api.moonshot.ai/anthropic",
      ANTHROPIC_MODEL: "kimi-k2.5",
      ANTHROPIC_SMALL_FAST_MODEL: "kimi-k2.5",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "kimi-k2.5",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "kimi-k2.5",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "kimi-k2.5",
    },
    model: "kimi-k2.5",
  },
  qwen: {
    display: "Qwen (DashScope Intl)",
    apiKeyPlaceholder: "YOUR_DASHSCOPE_API_KEY",
    env: {
      ANTHROPIC_BASE_URL: "https://dashscope-intl.aliyuncs.com/apps/anthropic",
      ANTHROPIC_MODEL: "qwen-max-latest",
      ANTHROPIC_SMALL_FAST_MODEL: "qwen-turbo-latest",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "qwen-max-latest",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "qwen-plus-latest",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "qwen-turbo-latest",
    },
    model: "qwen-max-latest",
  },
  deepseek: {
    display: "DeepSeek",
    apiKeyPlaceholder: "DEEPSEEK_API_KEY",
    env: {
      ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
      API_TIMEOUT_MS: "600000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      ANTHROPIC_MODEL: "deepseek-chat",
      ANTHROPIC_SMALL_FAST_MODEL: "deepseek-chat",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-chat",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-chat",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-chat",
    },
    model: "deepseek-chat",
  },
  fireworks: {
    display: "Fireworks (Kimi router)",
    apiKeyPlaceholder: "YOUR_FIREWORKS_API_KEY",
    env: {
      ANTHROPIC_BASE_URL: "https://api.fireworks.ai/inference",
      ANTHROPIC_MODEL: "accounts/fireworks/routers/kimi-k2p5-turbo",
      ANTHROPIC_SMALL_FAST_MODEL: "accounts/fireworks/routers/kimi-k2p5-turbo",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "accounts/fireworks/routers/kimi-k2p5-turbo",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "accounts/fireworks/routers/kimi-k2p5-turbo",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "accounts/fireworks/routers/kimi-k2p5-turbo",
    },
    model: "accounts/fireworks/routers/kimi-k2p5-turbo",
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
  zai: "glm-4.7",
  kimi: "kimi-k2.5",
  qwen: "qwen-max-latest",
  minimax: "minimax-m2.1",
  deepseek: "deepseek-chat",
  fireworks: "accounts/fireworks/routers/kimi-k2p5-turbo",
};
