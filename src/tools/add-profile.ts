import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeProfile, profileExists } from "../profiles.js";
import { PRESETS, MODEL_ENV_KEYS } from "../constants.js";
import type { PresetKey } from "../constants.js";
import type { Settings } from "../types.js";

const VALID_PRESETS = [
  "anthropic",
  "kimi",
  "qwen",
  "deepseek",
  "minimax",
  "zai",
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
          .describe("Preset provider: anthropic, kimi, qwen, deepseek, minimax, zai, or custom"),
        apiKey: z.string().optional().describe("API key/token for the provider"),
        baseUrl: z.string().optional().describe("Base URL (required for custom preset)"),
        model: z.string().optional().describe("Default model override"),
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
          ANTHROPIC_AUTH_TOKEN: apiKey,
        };

        if (model) {
          env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
          env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
          env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
        }

        settings = { env };
      } else {
        const template = PRESETS[preset as PresetKey];
        const env: Record<string, string> = { ...template.env };

        if (apiKey) {
          env.ANTHROPIC_AUTH_TOKEN = apiKey;
        } else if (env.ANTHROPIC_AUTH_TOKEN?.includes("<")) {
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

        settings = { env };
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
