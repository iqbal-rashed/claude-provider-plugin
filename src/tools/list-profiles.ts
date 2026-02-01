import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listProfiles, detectActiveProfile, getActiveProviderDisplay } from "../profiles.js";

export function registerListProfiles(server: McpServer): void {
  server.registerTool(
    "list_profiles",
    {
      description: "List all installed provider profiles with active indicator",
      inputSchema: {},
    },
    async () => {
      const profiles = listProfiles();
      const active = detectActiveProfile(profiles);
      const activeDisplay = getActiveProviderDisplay(profiles);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                active,
                activeDisplay,
                profiles: profiles.map((p) => p.name),
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
