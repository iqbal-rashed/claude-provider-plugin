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

### Duplicate a Profile

```bash
cpr duplicate kimi kimi-work
cpr duplicate anthropic-main anthropic-copy --with-credentials   # also copy the saved Claude login
```

Also available in the interactive menu (Manage providers → Duplicate), as the MCP tool `duplicate_profile`, and as `/provider:duplicate`.

### Multiple Claude Subscriptions

Profiles without an API key use your Claude subscription login. That login is swapped automatically on every switch:

- Windows / Linux: `~/.claude/.credentials.json`
- macOS: keychain item `Claude Code-credentials`
- plus the `oauthAccount` block of `~/.claude.json`, so `/status` shows the right account

Saved logins live in `~/.claude/credentials.<profile>.json` (mode 0600, plaintext on Windows/Linux like Claude Code's own file).

```bash
# 1. you are logged in as account A with profile "anthropic-main" active
# 2. add account B:
cpr add-account anthropic-secondary   # saves A's login, logs out locally
claude                                # then /login with account B

# switch whenever you like — logins are saved and restored for you
cpr anthropic-main
cpr anthropic-secondary
```

Other helpers: `cpr credential save|restore|clear|list [profile]`. Disable auto-swapping with `CPR_SWAP_CREDENTIALS=0`. Restart Claude Code after switching accounts.

### Two Accounts at the Same Time (Remote Control on both)

`cpr switch` changes the one global login. To run several sessions concurrently, use `cpr run`, which gives each profile its own config dir (`~/.claude-accounts/<name>`, via `CLAUDE_CONFIG_DIR`):

```bash
cpr run anthropic-main        # terminal 1
cpr run anthropic-secondary   # terminal 2: first run asks for /login, then it's remembered
```

Each is a normal claude.ai login, so Remote Control works in both. Skills, commands, agents and plugins are shared with `~/.claude` via links (`--no-share` to opt out), and so are sessions (see Shared Sessions); `settings.json` is seeded from your global one plus the profile. Extra arguments go to claude: `cpr run anthropic-main -- --resume`.

### Remote Control on A, inference through B (or a `/v1` gateway)

Claude Code turns Remote Control off when `ANTHROPIC_BASE_URL` points anywhere but api.anthropic.com, so the redirect has to happen outside the process. Split mode starts a local [mitmproxy](https://mitmproxy.org) that rewrites only `POST /v1/messages` for that one session:

```bash
cpr run anthropic-main --inference anthropic-secondary   # RC login = main, model calls billed to secondary
cpr run anthropic-main --inference my-gateway            # RC login = main, model calls go to your /v1 gateway
cpr run anthropic-main --inference my-gateway --model some-model-id
```

Requirements and limits:
- Install mitmproxy (`pipx install mitmproxy`) and run `mitmdump` once so its CA exists; the CA is trusted for that claude process only (`NODE_EXTRA_CA_CERTS`).
- The session profile (A) must be a claude.ai login profile. B can be a gateway profile (needs `ANTHROPIC_BASE_URL` + key) or another account that you have run once with `cpr run` (its token is read from its config dir; if it has expired, run that account once to refresh it). B-as-account is not supported on macOS.
- Stateful "thread" turns that a claude.ai login uses can't be served by another backend, so the proxy refuses them and Claude Code falls back to stateless requests.
- Using one account's session to spend another account's subscription may conflict with Anthropic's terms; check before relying on it.

### Start Commands (`claude keno`, `claude nils`, `claude omni`)

Save a start command once, then launch it by name:

```bash
cpr launcher add keno anthropic-keno --home                         # shared ~/.claude, keno's login
cpr launcher add nils anthropic-nils --home                         # shared ~/.claude, nils's login
cpr launcher add omni anthropic-keno --home --inference omniroute   # RC on keno, models via gateway
cpr launcher set keno anthropic-keno --home -- --resume             # change one (args after -- go to claude)
cpr launcher list
cpr launcher remove nils
cpr launcher install-shell                                          # enables `claude <name>`
```

Each launcher can be started three ways: `claude <name>` (after `install-shell`), `claude-<name>` (a shim in `~/.local/bin`, or `CPR_BIN_DIR`), or `cpr launch <name> [claude args]`. The interactive menu has a "Start commands" entry for the same.

- `--home` runs on the normal `~/.claude` (see below for the login swap) instead of an isolated dir. For a gateway profile, the provider is applied per process through env vars, so `settings.json` is never touched.
- `install-shell` appends a marked block to your PowerShell profile (or `~/.bashrc` / `~/.zshrc`). It defines a `claude` function that runs a launcher when the first argument is a launcher name, and otherwise calls whatever `claude` was before. A backup is written as `<profile>.bak-cpr`. PowerShell functions drop a literal `--` argument, so call the previous target directly when you need one.
- A shim is never written over (or deleted from) a file that cpr did not create. If `claude-<name>` already exists, the launcher still works through `claude <name>` and `cpr launch <name>`.
- Launcher names cannot shadow claude subcommands (`mcp`, `update`, `remote-control`, …).
- Isolated account dirs start from your MCP servers and project trust only, never your main account's cached flags or Remote Control state. On every start they also pick up folders newly trusted in `~/.claude.json`. Dirs seeded by an older version can be cleaned with `cpr account-clean <profile...>`.
- The first `claude remote-control` in a new account dir asks "Enable Remote Control? (y/n)" once. It refuses to run from your home directory; start it from a project folder.

### One Shared ~/.claude, Different Accounts

Launchers with `--home` all run on the same `~/.claude`: same settings, memory, sessions, jobs and history. Only the claude.ai login differs. Starting a login launcher makes its account the live one: the outgoing login is saved under the profile it belongs to (matched by account, so refreshed tokens are kept), then the incoming one is restored. Split launchers (`--inference`) don't swap; they keep whatever login is live for Remote Control.

```bash
cpr launcher set keno anthropic-keno --home                         # kenoschreibt@… login
cpr launcher set nils anthropic-nils --home                         # second account, same everything else
cpr launcher set omni anthropic-keno --home --inference omniroute   # models via OmniRoute
```

When one subscription hits its limit, exit and continue the same conversation on the other:

```bash
claude keno              # ... "You've hit your session limit"
claude nils --continue   # same folder: picks up the latest session
claude nils --resume     # or pick any session
```

- One account at a time: starting `claude nils` switches every running session on `~/.claude` to nils (cpr warns when others are running). For two accounts at once, use an isolated launcher (without `--home`) for the second one.
- Thinking is bound to the account's organization. After a switch, Claude Code notes it "can't use thinking from another organization", rereads the session and carries on (one-time extra tokens).
- A profile's first login comes from its isolated account dir if it has one (`/login` there), else from `cpr credential save <profile>`, else claude asks for `/login`.
- Isolated account dirs share transcripts and memory (`projects`), `file-history`, `plans`, `tasks` and `todos` with `~/.claude` too, so `--resume` works across them; their startup job list and prompt history stay their own. `--own-sessions` keeps an isolated dir fully separate.

### Custom `/v1` Gateways

Custom profiles accept a base URL with or without a trailing `/v1` (Claude Code appends `/v1/messages` itself, so `/v1` is stripped), and can fetch the model list from `<base>/v1/models`. The endpoint must speak the **Anthropic Messages API**; pure OpenAI `/chat/completions` endpoints need a translating gateway in front.

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
