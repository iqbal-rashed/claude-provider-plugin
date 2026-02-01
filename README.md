# Claude Switcher Plugin

> A **Claude Code Plugin** to seamlessly switch between API providers (Anthropic, Kimi, Qwen, DeepSeek, MiniMax, Z.ai).

This plugin allows you to manage and switch your Claude Code configuration profiles directly within Claude Code using slash commands. It bundles an **MCP (Model Context Protocol)** server that handles the configuration management.

## Installation

### Prerequisites
- **Claude Code** installed (`npm install -g @anthropic-ai/claude-code`)
- **Node.js** (v18 or higher)

### Method 1: Marketplace (Recommended)

After adding the repository to your marketplace sources:

```bash
# 1. Add the repository
/plugin marketplace add iqbal-rashed/claude-provider-plugin

# 2. Install the plugin
/plugin install claude-provider
```

### Method 2: Local Install

1. Clone and build:
   ```bash
   git clone https://github.com/iqbal-rashed/claude-provider-plugin.git
   cd claude-provider-plugin
   npm install && npm run build
   ```

2. Install into Claude Code:
   ```bash
   claude --plugin-dir /absolute/path/to/claude-provider-plugin
   ```

## Usage

Once installed, use the slash commands directly in Claude Code:

### 🔄 Switch Profile
Switch to a different provider profile.
```text
/provider:switch <profile_name>
```
Example: `/provider:switch kimi`

### 📋 List Profiles
See all available profiles and which one is active.
```text
/provider:list
```

### ➕ Add Provider
Create a new profile from a preset or custom configuration.
```text
/provider:add <name>
```
*Note: This command will prompt for details like preset type (kimi, qwen, etc.) and API key.*

### 📸 Snapshot Settings
Save your current `~/.claude/settings.json` as a new named profile.
```text
/provider:snapshot <name>
```

### 🗑️ Delete Profile
Remove a profile.
```text
/provider:delete <profile_name>
```

## Supported Presets

- **Anthropic** (Native)
- **Kimi** (Moonshot AI)
- **Qwen** (Alibaba Cloud)
- **DeepSeek** (DeepSeek AI)
- **MiniMax**
- **Z.ai**
- **Custom** (Configure your own Base URL and keys)

## How It Works

This plugin uses the **Model Context Protocol (MCP)** to safely interact with your file system.

1. **Configuration**: Claude Code reads from `~/.claude/settings.json`.
2. **Profiles**: This plugin saves copies as `~/.claude/settings.<name>.json`.
3. **Switching**: When you run `/switch`, the MCP server copies the target profile to `settings.json`.
4. **Security**: API keys in profiles are masked when viewing info. File permissions are restricted.

## Troubleshooting

- **"Plugin not found"**: Ensure you provided the **absolute path** to the plugin directory.
- **"Command not found"**: Restart Claude Code after installing the plugin.
- **Type Errors**: If developing, ensure you run `npm run build` after changes.

## License

MIT
