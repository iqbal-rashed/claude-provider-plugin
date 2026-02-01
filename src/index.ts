/**
 * Claude Switcher MCP Server
 *
 * MCP server for managing Claude Code settings profiles.
 * Allows switching between different API providers (Anthropic, Kimi, Qwen, DeepSeek, etc.)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerListProfiles } from "./tools/list-profiles.js";
import { registerSwitchProfile } from "./tools/switch-profile.js";
import { registerSnapshotCurrent } from "./tools/snapshot-current.js";
import { registerAddProfile } from "./tools/add-profile.js";
import { registerDeleteProfile } from "./tools/delete-profile.js";
import { registerListPresets } from "./tools/list-presets.js";
import { registerGetProfileInfo } from "./tools/get-profile-info.js";

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
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Note: Don't log to stdout in stdio mode (breaks JSON-RPC)
  console.error("Claude Switcher MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
