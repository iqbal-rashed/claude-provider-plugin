import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addClaudeAccount } from "../profiles.js";

export function registerAddAccount(server: McpServer): void {
  server.registerTool(
    "add_claude_account",
    {
      description:
        "Add another Claude subscription account: saves the current login, creates a new profile and logs out locally so /login signs in the new account",
      inputSchema: {
        name: z.string().min(1).describe("Profile name, e.g. anthropic-secondary"),
      },
    },
    async ({ name }) => {
      try {
        const notes = addClaudeAccount(name);
        return { content: [{ type: "text", text: notes.join("\n") }] };
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
