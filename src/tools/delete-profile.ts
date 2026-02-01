import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listProfiles, detectActiveProfile, deleteProfile, profileExists } from "../profiles.js";

export function registerDeleteProfile(server: McpServer): void {
  server.registerTool(
    "delete_profile",
    {
      description: "Delete a provider profile",
      inputSchema: {
        profile: z.string().min(1).describe("Profile name to delete"),
      },
    },
    async ({ profile }) => {
      if (!profileExists(profile)) {
        return {
          content: [
            {
              type: "text",
              text: `Profile "${profile}" not found.`,
            },
          ],
          isError: true,
        };
      }

      const profiles = listProfiles();
      const active = detectActiveProfile(profiles);
      const isActive = active?.toLowerCase() === profile.toLowerCase();

      try {
        deleteProfile(profile);
        const warning = isActive ? " Note: This was your active profile." : "";
        return {
          content: [
            {
              type: "text",
              text: `Deleted ~/.claude/settings.${profile}.json.${warning}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to delete: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
