import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PRESETS } from "../constants.js";

export function registerListPresets(server: McpServer): void {
  server.registerTool(
    "list_presets",
    {
      description: "List available provider presets (kimi, qwen, deepseek, etc.)",
      inputSchema: {},
    },
    async () => {
      const presets = Object.entries(PRESETS).map(([key, value]) => ({
        name: key,
        display: value.display,
        baseUrl: value.env.ANTHROPIC_BASE_URL || "(native Anthropic)",
        model: value.model,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ presets, available: Object.keys(PRESETS) }, null, 2),
          },
        ],
      };
    }
  );
}
