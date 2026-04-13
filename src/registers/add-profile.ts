import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeProfile, profileExists } from "../profiles.js";
import { PRESETS, MODEL_ENV_KEYS } from "../constants.js";
import type { PresetKey } from "../constants.js";
import type { Settings } from "../types.js";
import { createApiKeyHelper } from "../utils.js";

const VALID_PRESETS = [
  "anthropic",
  "kimi",
  "qwen",
  "deepseek",
  "minimax",
  "zai",
  "fireworks",
  "custom",
] as const;

export function registerAddProfile(server: McpServer): void {
  server.registerTool(
    "add_profile",
    {
      description: "Add a new provider profile from preset or custom configuration",
      inputSchema: {
        name: z.string().min(1).describe("Profile name (used as settings.<name>.json)"),
        preset: z
          .string()
          .describe("Preset provider: anthropic, kimi, qwen, deepseek, minimax, zai, fireworks, or custom"),
        apiKey: z.string().optional().describe("API key/token for the provider"),
        baseUrl: z.string().optional().describe("Base URL (required for custom preset)"),
        model: z.string().optional().describe("Optional model override. If not provided, uses the preset's default model (e.g., glm-4.7 for zai, kimi-k2.5 for kimi)"),
      },
    },
    async ({ name, preset, apiKey, baseUrl, model }) => {
      // Validate preset
      if (!VALID_PRESETS.includes(preset as (typeof VALID_PRESETS)[number])) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid preset "${preset}". Valid options: ${VALID_PRESETS.join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      if (profileExists(name)) {
        return {
          content: [
            {
              type: "text",
              text: `Profile "${name}" already exists. Choose a different name.`,
            },
          ],
          isError: true,
        };
      }

      let settings: Settings;

      if (preset === "custom") {
        if (!baseUrl) {
          return {
            content: [{ type: "text", text: "Base URL is required for custom preset." }],
            isError: true,
          };
        }
        if (!apiKey) {
          return {
            content: [{ type: "text", text: "API key is required for custom preset." }],
            isError: true,
          };
        }

        const env: Record<string, string> = {
          ANTHROPIC_BASE_URL: baseUrl,
        };

        if (model) {
          for (const key of MODEL_ENV_KEYS) {
            env[key] = model;
          }
        }

        settings = {
          apiKeyHelper: createApiKeyHelper(apiKey),
          env,
          model,
        };
      } else {
        const template = PRESETS[preset as PresetKey];
        const env: Record<string, string> = { ...template.env };

        if (!apiKey) {
          return {
            content: [
              {
                type: "text",
                text: `API key is required for ${preset} preset.`,
              },
            ],
            isError: true,
          };
        }

        if (model) {
          for (const key of MODEL_ENV_KEYS) {
            if (key in env) {
              env[key] = model;
            }
          }
        }

        settings = {
          apiKeyHelper: createApiKeyHelper(apiKey),
          env,
          model: model ?? template.model,
        };
      }

      try {
        writeProfile(name, settings);
        return {
          content: [
            {
              type: "text",
              text: `Created ~/.claude/settings.${name}.json with ${preset} configuration.`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to create profile: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
