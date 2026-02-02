/**
 * Claude Switcher MCP Server
 *
 * MCP server for managing Claude Code settings profiles.
 * Allows switching between different API providers (Anthropic, Kimi, Qwen, DeepSeek, etc.)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerListProfiles } from "./registers/list-profiles.js";
import { registerSwitchProfile } from "./registers/switch-profile.js";
import { registerSnapshotCurrent } from "./registers/snapshot-current.js";
import { registerAddProfile } from "./registers/add-profile.js";
import { registerDeleteProfile } from "./registers/delete-profile.js";
import { registerListPresets } from "./registers/list-presets.js";
import { registerGetProfileInfo } from "./registers/get-profile-info.js";

// Create MCP server instance
const server = new McpServer({
  name: "provider",
  version: "0.0.3",
});

// Register all tools
registerListProfiles(server);
registerSwitchProfile(server);
registerSnapshotCurrent(server);
registerAddProfile(server);
registerDeleteProfile(server);
registerListPresets(server);
registerGetProfileInfo(server);

// Start the server
export async function mcpServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Note: Don't log to stdout in stdio mode (breaks JSON-RPC)
  console.error("Claude Switcher MCP Server running on stdio");
}


mcpServer().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
