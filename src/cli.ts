import { Command } from "commander";
import chalk from "chalk";
import {
  listProfiles,
  detectActiveProfile,
  switchProfile,
  duplicateProfile,
  addClaudeAccount,
} from "./profiles.js";
import fs from "node:fs";
import path from "node:path";
import { clearAccountState, getAccountDir, runClaude, type RunOptions } from "./runner.js";
import {
  describeLauncher,
  installShellIntegration,
  launch,
  readLaunchers,
  removeLauncher,
  saveLauncher,
} from "./launchers.js";
import { runInteractiveMenu } from "./interactive.js";
import { mcpServer } from "./mcp.js";
import {
  saveCredentialForProfile,
  restoreCredentialForProfile,
  listSavedCredentials,
  clearLogin,
} from "./credentials.js";

function fail(message: string): never {
  console.error(chalk.red(message));
  process.exit(1);
}

/**
 * Display list of installed providers
 */
function showProviderList(): void {
  const profiles = listProfiles();

  console.log(chalk.bold("Installed providers:"));

  if (!profiles || profiles.length === 0) {
    console.log(chalk.dim("  No providers installed. Run claude-provider to add one."));
    return;
  }

  const active = detectActiveProfile(profiles);
  const saved = new Set(listSavedCredentials());

  for (const profile of profiles) {
    const marker = profile.name === active ? chalk.green(" (active)") : "";
    const login = saved.has(profile.name) ? chalk.dim(" [login saved]") : "";
    console.log(` - ${profile.name}${marker}${login}`);
  }
}

/**
 * Direct switch to a provider by name
 */
function directSwitch(name: string): void {
  const profile = listProfiles().find((p) => p.name.toLowerCase() === name.toLowerCase());

  if (!profile) {
    console.error(chalk.red(`Provider not installed: ${name}`));
    console.error(chalk.dim('Tip: run "claude-provider" or "cpr" to add providers interactively.'));
    process.exit(1);
  }

  const { notes } = switchProfile(profile.name);
  console.log(`✅ Switched to ${chalk.cyan(profile.name)}. Run "claude" then /status.`);
  for (const note of notes) console.log(chalk.dim(`   (${note})`));
}

/**
 * Handle `cpr credential <action> [profile]` subcommand.
 */
function handleCredentialCommand(action: string, profile?: string): void {
  switch (action) {
    case "save": {
      if (!profile) fail("Usage: cpr credential save <profile>");
      const result = saveCredentialForProfile(profile);
      if (!result.saved) fail(`Failed: ${result.reason}`);
      console.log(`✅ Saved login for ${chalk.cyan(profile)} → ${result.path}`);
      return;
    }
    case "restore": {
      if (!profile) fail("Usage: cpr credential restore <profile>");
      const result = restoreCredentialForProfile(profile);
      if (!result.restored) fail(`Failed: ${result.reason}`);
      console.log(`✅ Restored login for ${chalk.cyan(profile)} from ${result.path}`);
      return;
    }
    case "clear": {
      clearLogin();
      console.log("✅ Logged out locally. Run claude, then /login.");
      return;
    }
    case "list": {
      const saved = listSavedCredentials();
      if (saved.length === 0) {
        console.log(chalk.dim("No saved logins. Run `cpr credential save <profile>`."));
        return;
      }
      console.log(chalk.bold("Saved logins:"));
      for (const name of saved) {
        console.log(` - ${name}`);
      }
      return;
    }
    default:
      console.error(chalk.red(`Unknown action: ${action}`));
      console.error(chalk.dim("Available: save, restore, clear, list"));
      process.exit(1);
  }
}

const RUN_FLAGS = "[--inference <profile>] [--model <id>] [--home] [--no-share] [--own-sessions] [-- <claude args>]";
const RUN_USAGE = `Usage: cpr run <profile> ${RUN_FLAGS}`;
const LAUNCHER_USAGE = [
  "Usage:",
  `  cpr launcher add <name> <profile> ${RUN_FLAGS}   create a start command`,
  `  cpr launcher set <name> <profile> ${RUN_FLAGS}   create or change one`,
  "  cpr launcher remove <name>",
  "  cpr launcher list",
  "  cpr launcher install-shell                        enable `claude <name>` in your shell",
  "  cpr launch <name> [claude args]                   run one (also: claude-<name>)",
].join("\n");

interface ParsedRun {
  positionals: string[];
  opts: RunOptions;
  claudeArgs: string[];
}

function parseRunArgs(argv: string[], maxPositionals: number): ParsedRun {
  const parsed: ParsedRun = { positionals: [], opts: {}, claudeArgs: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      parsed.claudeArgs.push(...argv.slice(i + 1));
      break;
    } else if (arg === "--inference") parsed.opts.inference = argv[++i];
    else if (arg === "--model") parsed.opts.model = argv[++i];
    else if (arg === "--home") parsed.opts.home = true;
    else if (arg === "--no-share") parsed.opts.share = false;
    else if (arg === "--own-sessions") parsed.opts.sessions = false;
    else if (parsed.positionals.length < maxPositionals) parsed.positionals.push(arg);
    else parsed.claudeArgs.push(arg);
  }
  return parsed;
}

function assertProfiles(...names: (string | undefined)[]): void {
  const known = listProfiles().map((p) => p.name);
  for (const name of names) {
    if (name && !known.includes(name)) fail(`Provider not installed: ${name}`);
  }
}

/**
 * `cpr run`: start claude in an isolated per-profile config dir (or ~/.claude
 * with --home), so several accounts/gateways can run at once; --inference
 * splits the Remote Control login from the profile that serves model calls.
 */
async function handleRunCommand(argv: string[]): Promise<void> {
  const { positionals, opts, claudeArgs } = parseRunArgs(argv, 1);
  const [profile] = positionals;
  if (!profile) fail(RUN_USAGE);
  assertProfiles(profile, opts.inference);
  try {
    process.exitCode = await runClaude(profile, claudeArgs, opts);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

async function handleLaunchCommand(argv: string[]): Promise<void> {
  const [name, ...rest] = argv;
  if (!name) fail(LAUNCHER_USAGE);
  try {
    process.exitCode = await launch(name, rest);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

function handleLauncherCommand(argv: string[]): void {
  const [action, ...rest] = argv;
  try {
    switch (action) {
      case "add":
      case "set": {
        const { positionals, opts, claudeArgs } = parseRunArgs(rest, 2);
        const [name, profile] = positionals;
        if (!name || !profile) fail(LAUNCHER_USAGE);
        const { shim, shimConflict } = saveLauncher(
          name,
          { ...opts, profile, args: claudeArgs },
          { create: action === "add" }
        );
        console.log(`✅ ${chalk.cyan(name)}: ${describeLauncher(readLaunchers()[name])}`);
        console.log(chalk.dim(`   run: claude ${name} (after install-shell)  |  cpr launch ${name}${shim ? `  |  ${shim}` : ""}`));
        if (shimConflict) {
          console.log(chalk.yellow(`   ${shimConflict} already exists and is not ours; left untouched (no shim).`));
        }
        return;
      }
      case "remove":
      case "delete": {
        if (!rest[0]) fail(LAUNCHER_USAGE);
        removeLauncher(rest[0]);
        console.log(`✅ Removed launcher ${chalk.cyan(rest[0])}`);
        return;
      }
      case "list":
      case undefined: {
        const all = Object.entries(readLaunchers());
        if (all.length === 0) {
          console.log(chalk.dim("No launchers. Create one: cpr launcher add keno anthropic-keno --home"));
          return;
        }
        console.log(chalk.bold("Launchers:"));
        for (const [name, l] of all) console.log(` - ${chalk.cyan(name)}: ${describeLauncher(l)}`);
        return;
      }
      case "install-shell": {
        for (const { file, result } of installShellIntegration()) {
          console.log(`✅ ${result}: ${file}`);
        }
        console.log(chalk.dim("   Open a new terminal, then: claude <launcher>"));
        return;
      }
      default:
        fail(LAUNCHER_USAGE);
    }
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Create and configure the CLI program
 */
export function createProgram(): Command {
  return new Command()
    .name("claude-provider")
    .description("CLI tool to switch between Claude Code API providers and Claude accounts")
    .version("0.1.0")
    .argument(
      "[provider]",
      "provider name to switch to, or: mcp | credential | duplicate | add-account | run | launch | launcher"
    )
    .argument("[arg1]", "credential: save|restore|clear|list; duplicate: source; add-account: name")
    .argument("[arg2]", "credential: profile; duplicate: new name")
    .option("-l, --list", "list installed providers")
    .option("--with-credentials", "duplicate: also copy the saved Claude login");
}

/**
 * Run the CLI application
 */
export async function runCli(): Promise<void> {
  const sub = process.argv[2];
  if (sub === "run") return handleRunCommand(process.argv.slice(3));
  if (sub === "launch") return handleLaunchCommand(process.argv.slice(3));
  if (sub === "launcher" || sub === "launchers") return handleLauncherCommand(process.argv.slice(3));
  if (sub === "account-clean") {
    const names = process.argv.slice(3);
    if (names.length === 0) fail("Usage: cpr account-clean <profile...>");
    for (const name of names) {
      const dir = getAccountDir(name);
      const file = path.join(dir, ".claude.json");
      if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-cpr`);
      const removed = clearAccountState(dir);
      console.log(`✅ ${chalk.cyan(name)}: removed ${removed.length} cached account keys`);
    }
    return;
  }

  const program = createProgram();
  program.parse(process.argv);

  const opts = program.opts<{ list?: boolean; withCredentials?: boolean }>();
  const [provider, arg1, arg2] = program.args;

  if (opts.list) {
    showProviderList();
    return;
  }

  if (provider == "mcp") {
    return mcpServer();
  }

  if (provider === "credential") {
    if (!arg1) fail("Usage: cpr credential <save|restore|clear|list> [profile]");
    handleCredentialCommand(arg1, arg2);
    return;
  }

  if (provider === "duplicate") {
    if (!arg1 || !arg2) fail("Usage: cpr duplicate <source> <new-name> [--with-credentials]");
    try {
      const file = duplicateProfile(arg1, arg2, { withCredentials: opts.withCredentials });
      console.log(`✅ Duplicated ${chalk.cyan(arg1)} → ${chalk.cyan(arg2)} (${file})`);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
    return;
  }

  if (provider === "add-account") {
    if (!arg1) fail("Usage: cpr add-account <name>");
    try {
      for (const note of addClaudeAccount(arg1)) console.log(`✅ ${note}`);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
    return;
  }

  if (provider) {
    directSwitch(provider);
    return;
  }

  await runInteractiveMenu();
}

runCli().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
