<p align="center">
  <h1 align="center">Claude Provider</h1>
  <p align="center">
    <strong>Plugin & CLI tool to switch between LLM providers in Claude Code</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/claude-provider"><img src="https://img.shields.io/npm/v/claude-provider.svg" alt="npm version"></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node.js"></a>
  </p>
</p>

---

A powerful tool that enables you to manage and switch between multiple LLM API providers for Claude Code. Available as both a **Claude Code plugin** and a **standalone CLI**.

## ✨ Features

- 🔄 **Instant Provider Switching** — Switch between providers with a single command
- � **Dual Mode** — Use as a Claude Code plugin or standalone CLI tool
- 📦 **Pre-configured Presets** — Ready-to-use configurations for popular providers
- 🎛️ **Custom Configurations** — Create profiles with custom base URLs and models
- 📸 **Profile Snapshots** — Save your current settings as reusable profiles
- 🔐 **Secure** — API keys are masked in output; file permissions are restricted

## 🚀 Installation

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- Node.js v18 or higher

### Install via npm (Recommended)

```bash
npm install -g claude-provider
```

This installs both the Claude Code plugin and the CLI tool.




## 🔌 Plugin Usage

Use the provider commands directly within Claude Code via slash commands.

### Setup Plugin

**Via Marketplace:**

```bash
# Add the marketplace
/plugin marketplace add iqbal-rashed/claude-provider-plugin

# Install the plugin
/plugin install provider@claude-provider-plugin
```

### Plugin Commands

#### Switch Provider
```
/provider:switch <profile_name>
```
Switch to a different provider profile instantly.

#### List Profiles
```
/provider:list
```
View all available profiles and see which one is currently active.

#### Add Provider
```
/provider:add <name>
```
Create a new profile from a preset or custom configuration. You'll be prompted for:
- **Preset** — Choose from available presets or `custom`
- **API Key** — Your provider's API key
- **Model** *(optional)* — Override the default model

#### Snapshot Settings
```
/provider:snapshot <name>
```
Save your current `~/.claude/settings.json` as a named profile for later use.

#### Delete Profile
```
/provider:delete <profile_name>
```
Remove a profile you no longer need.

---

## 📖 CLI Usage

After installation, you can use `claude-provider` or the shorthand `cpr` from your terminal.

### Interactive Mode

```bash
claude-provider
# or
cpr
```

Launches an interactive menu to:
- View and switch between providers
- Add new providers (from presets or custom)
- Manage existing providers (edit/delete)

### Quick Switch

```bash
claude-provider <provider_name>
# or
cpr kimi
```

Switch directly to a provider by name.

### List Providers

```bash
claude-provider --list
# or
cpr -l
```

Display all installed providers with the active one highlighted.

### Keychain Credential Swap (macOS, opt-in)

When multiple profiles target the same Anthropic account (e.g. a Pro plan and a Team plan on one login), settings.json alone isn't enough to switch — Claude Code authenticates via an OAuth blob in the macOS keychain. The `credential` subcommand snapshots that blob per profile so `switch` can restore the correct one.

```bash
# Snapshot the current keychain credential for the active profile
cpr credential save anthropic

# Restore a previously saved credential to the keychain
cpr credential restore anthropic

# List saved credentials
cpr credential list

# Auto-restore on switch (opt-in via env var)
CPR_SWAP_CREDENTIALS=1 cpr switch anthropic-team
```

macOS only. Without `CPR_SWAP_CREDENTIALS` the `switch` command never touches the keychain, so existing users are unaffected.

---

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

---

## 🔧 How It Works

1. **Profiles** are stored as `~/.claude/settings.<name>.json`
2. **Switching** copies the target profile to `~/.claude/settings.json`
3. **Plugins preserved** — Your enabled plugins are maintained when switching providers
4. **MCP Protocol** ensures safe, structured file system interactions (plugin mode)

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Command not found | Run `npm install -g claude-provider` or check your PATH |
| Plugin not found | Ensure you used the **absolute path** to the plugin directory |
| Command not recognized | Restart Claude Code after installing the plugin |

---

## 📄 License

[MIT](LICENSE) © [Rashed Iqbal](https://github.com/iqbal-rashed)
