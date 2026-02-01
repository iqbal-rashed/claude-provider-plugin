import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listProfiles, switchToProvider } from "../profiles.js";

export function registerSwitchProfile(server: McpServer): void {
  server.registerTool(
    "switch_profile",
    {
      description: "Switch to a different provider profile",
      inputSchema: {
        profile: z.string().min(1).describe("Profile name to switch to"),
      },
    },
    async ({ profile }) => {
      const profiles = listProfiles();
      const found = profiles.find((p) => p.name.toLowerCase() === profile.toLowerCase());

      if (!found) {
        return {
          content: [
            {
              type: "text",
              text: `Profile "${profile}" not found. Available: ${profiles.map((p) => p.name).join(", ") || "(none)"}`,
            },
          ],
          isError: true,
        };
      }

      try {
        switchToProvider(found.name);
        return {
          content: [
            {
              type: "text",
              text:
                `Switched ~/.claude/settings.json to profile "${found.name}".\n` +
                `Restart Claude Code for changes to take effect.`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to switch: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
