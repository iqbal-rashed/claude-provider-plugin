<p align="center">
  <h1 align="center">Claude Provider Plugin</h1>
  <p align="center">
    <strong>Seamlessly switch between LLM providers in Claude Code</strong>
  </p>
  <p align="center">
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node.js"></a>
  </p>
</p>

---

A powerful **Claude Code Plugin** that enables you to manage and switch between multiple LLM API providers directly within Claude Code. Configure profiles for different providers and switch between them instantly using simple slash commands.

## ✨ Features

- 🔄 **Instant Provider Switching** — Switch between providers with a single command
- 📦 **Pre-configured Presets** — Ready-to-use configurations for popular providers
- 🎛️ **Custom Configurations** — Create profiles with custom base URLs and models
- 📸 **Profile Snapshots** — Save your current settings as reusable profiles
- 🔐 **Secure** — API keys are masked in output; file permissions are restricted

## 🚀 Quick Start

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- Node.js v18 or higher

### Installation

**Via Marketplace (Recommended)**

```bash
# Add the marketplace
/plugin marketplace add iqbal-rashed/claude-provider-plugin

# Install the plugin
/plugin install provider@claude-provider-plugin
```

**Via Local Install**

```bash
git clone https://github.com/iqbal-rashed/claude-provider-plugin.git
cd claude-provider-plugin
npm install && npm run build

# Then in Claude Code:
claude --plugin-dir /absolute/path/to/claude-provider-plugin
```

## 📖 Usage

### Switch Provider
```
/provider:switch <profile_name>
```
Switch to a different provider profile instantly.

### List Profiles
```
/provider:list
```
View all available profiles and see which one is currently active.

### Add Provider
```
/provider:add <name>
```
Create a new profile from a preset or custom configuration. You'll be prompted for:
- **Preset** — Choose from available presets or `custom`
- **API Key** — Your provider's API key
- **Model** *(optional)* — Override the default model

### Snapshot Settings
```
/provider:snapshot <name>
```
Save your current `~/.claude/settings.json` as a named profile for later use.

### Delete Profile
```
/provider:delete <profile_name>
```
Remove a profile you no longer need.

## 🎯 Supported Providers

| Provider | Preset Key | Default Model |
|----------|-----------|---------------|
| **Anthropic** | `anthropic` | `claude-sonnet-4.5` |
| **Z.ai (GLM)** | `zai` | `glm-4.7` |
| **MiniMax** | `minimax` | `minimax-m2.1` |
| **Kimi (Moonshot)** | `kimi` | `kimi-k2.5` |
| **Qwen (DashScope)** | `qwen` | `qwen-max-latest` |
| **DeepSeek** | `deepseek` | `deepseek-chat` |
| **Custom** | `custom` | *User defined* |

> 💡 **Tip:** When using a preset, you can optionally specify a custom model to override the default.

## 🔧 How It Works
1. **Profiles** are stored as `~/.claude/settings.<name>.json`
2. **Switching** copies the target profile to `~/.claude/settings.json`
3. **MCP Protocol** ensures safe, structured file system interactions

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Plugin not found | Ensure you used the **absolute path** to the plugin directory |
| Command not recognized | Restart Claude Code after installing the plugin |

## 📄 License

[MIT](LICENSE) © [Rashed Iqbal](https://github.com/iqbal-rashed)

