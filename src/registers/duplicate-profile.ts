import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { duplicateProfile } from "../profiles.js";

export function registerDuplicateProfile(server: McpServer): void {
  server.registerTool(
    "duplicate_profile",
    {
      description: "Duplicate an existing provider profile under a new name",
      inputSchema: {
        source: z.string().min(1).describe("Existing profile name"),
        name: z.string().min(1).describe("Name for the copy"),
        withCredentials: z
          .boolean()
          .optional()
          .describe("Also copy the saved Claude login (default false)"),
      },
    },
    async ({ source, name, withCredentials }) => {
      try {
        const file = duplicateProfile(source, name, { withCredentials });
        return { content: [{ type: "text", text: `Created ${file} from "${source}".` }] };
      } catch (e) {
        return {
          content: [
            { type: "text", text: `Failed: ${e instanceof Error ? e.message : String(e)}` },
          ],
          isError: true,
        };
      }
    }
  );
}
