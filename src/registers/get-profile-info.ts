import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listProfiles, detectActiveProfile } from "../profiles.js";
import { readSettings } from "../utils.js";

export function registerGetProfileInfo(server: McpServer): void {
  server.registerTool(
    "get_profile_info",
    {
      description: "Get details about a specific profile including masked API key",
      inputSchema: {
        profile: z.string().min(1).describe("Profile name to inspect"),
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
              text: `Profile "${profile}" not found.`,
            },
          ],
          isError: true,
        };
      }

      const settings = readSettings(found.file);
      if (!settings) {
        return {
          content: [
            {
              type: "text",
              text: `Could not read profile "${profile}".`,
            },
          ],
          isError: true,
        };
      }

      // Mask API key for security
      const safeEnv = { ...settings.env };
      if (safeEnv.ANTHROPIC_AUTH_TOKEN) {
        const token = safeEnv.ANTHROPIC_AUTH_TOKEN;
        safeEnv.ANTHROPIC_AUTH_TOKEN =
          token.length > 8 ? token.slice(0, 4) + "..." + token.slice(-4) : "****";
      }

      const active = detectActiveProfile(profiles);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                name: found.name,
                isActive: found.name === active,
                file: found.file,
                env: safeEnv,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
