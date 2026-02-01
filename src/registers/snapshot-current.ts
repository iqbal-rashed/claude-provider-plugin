import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeProfile, profileExists } from "../profiles.js";
import { getSettingsPath, readSettings } from "../utils.js";

export function registerSnapshotCurrent(server: McpServer): void {
  server.registerTool(
    "snapshot_current",
    {
      description: "Save current settings.json as a named profile",
      inputSchema: {
        profile: z.string().min(1).describe("Name for the new profile"),
      },
    },
    async ({ profile }) => {
      const current = readSettings(getSettingsPath());

      if (!current) {
        return {
          content: [
            {
              type: "text",
              text: "No current settings.json found to snapshot.",
            },
          ],
          isError: true,
        };
      }

      if (profileExists(profile)) {
        return {
          content: [
            {
              type: "text",
              text: `Profile "${profile}" already exists. Choose a different name or delete it first.`,
            },
          ],
          isError: true,
        };
      }

      try {
        writeProfile(profile, current);
        return {
          content: [
            {
              type: "text",
              text: `Saved current ~/.claude/settings.json as ~/.claude/settings.${profile}.json`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to save: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
