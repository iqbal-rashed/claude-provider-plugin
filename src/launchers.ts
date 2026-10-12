import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { isValidProviderName } from "./utils.js";
import { profileExists } from "./profiles.js";
import { getAccountsRoot, runClaude, type RunOptions } from "./runner.js";

/**
 * Named start commands: `claude <name>` (shell integration) or `claude-<name>`
 * (shim) runs `cpr launch <name>`, which starts claude for a stored profile.
 */
export interface Launcher extends RunOptions {
  profile: string;
  args?: string[];
}

/** Names claude itself uses as subcommands; a launcher must not shadow them. */
const RESERVED = new Set([
  "agents",
  "api-key",
  "auth",
  "config",
  "doctor",
  "help",
  "install",
  "login",
  "logout",
  "mcp",
  "migrate-installer",
  "plugin",
  "plugins",
  "rc",
  "remote-control",
  "setup-token",
  "update",
  "upgrade",
]);

const BLOCK_START = "# >>> claude-provider launchers >>>";
const BLOCK_END = "# <<< claude-provider launchers <<<";

export function getLaunchersPath(): string {
  return path.join(getAccountsRoot(), "launchers.json");
}

export function readLaunchers(): Record<string, Launcher> {
  try {
    return JSON.parse(fs.readFileSync(getLaunchersPath(), "utf8")) as Record<string, Launcher>;
  } catch {
    return {};
  }
}

function writeLaunchers(all: Record<string, Launcher>): void {
  fs.mkdirSync(getAccountsRoot(), { recursive: true });
  fs.writeFileSync(getLaunchersPath(), JSON.stringify(all, null, 2) + "\n");
}

export function getBinDir(): string {
  return process.env.CPR_BIN_DIR || path.join(os.homedir(), ".local", "bin");
}

function shimPath(name: string): string {
  return path.join(getBinDir(), process.platform === "win32" ? `claude-${name}.cmd` : `claude-${name}`);
}

const SHIM_MARKER = "claude-provider launcher";

/** Only files carrying our marker are ours to replace or delete. */
function isOurShim(file: string): boolean {
  try {
    return fs.readFileSync(file, "utf8").includes(SHIM_MARKER);
  } catch {
    return false;
  }
}

/** Returns the shim path, or null when a file we didn't write already has that name. */
function writeShim(name: string): string | null {
  const file = shimPath(name);
  if (fs.existsSync(file) && !isOurShim(file)) return null;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (process.platform === "win32") {
    fs.writeFileSync(file, `@echo off\r\nrem ${SHIM_MARKER}\r\ncpr.cmd launch ${name} %*\r\n`);
  } else {
    fs.writeFileSync(file, `#!/bin/sh\n# ${SHIM_MARKER}\nexec cpr launch ${name} "$@"\n`, { mode: 0o755 });
  }
  return file;
}

/**
 * Create or change a launcher. `create` refuses to overwrite an existing one.
 */
export function saveLauncher(
  name: string,
  launcher: Launcher,
  opts: { create?: boolean } = {}
): { shim: string | null; shimConflict?: string } {
  if (!isValidProviderName(name)) throw new Error("Use letters, numbers, _ or - for the launcher name");
  if (RESERVED.has(name.toLowerCase())) throw new Error(`"${name}" is a claude subcommand; pick another name`);
  for (const profile of [launcher.profile, launcher.inference]) {
    if (profile && !profileExists(profile)) throw new Error(`Provider profile not found: ${profile}`);
  }
  const all = readLaunchers();
  if (opts.create && all[name]) throw new Error(`Launcher already exists: ${name} (use "cpr launcher set")`);

  const clean: Launcher = { profile: launcher.profile };
  if (launcher.home) clean.home = true;
  if (launcher.inference && launcher.inference !== launcher.profile) clean.inference = launcher.inference;
  if (launcher.model) clean.model = launcher.model;
  if (launcher.share === false) clean.share = false;
  if (launcher.sessions === false) clean.sessions = false;
  if (launcher.args?.length) clean.args = launcher.args;

  all[name] = clean;
  writeLaunchers(all);
  const shim = writeShim(name);
  return shim ? { shim } : { shim: null, shimConflict: shimPath(name) };
}

export function removeLauncher(name: string): void {
  const all = readLaunchers();
  if (!all[name]) throw new Error(`Launcher not found: ${name}`);
  delete all[name];
  writeLaunchers(all);
  if (isOurShim(shimPath(name))) fs.rmSync(shimPath(name), { force: true });
}

export function describeLauncher(l: Launcher): string {
  const parts = [l.profile];
  parts.push(l.home ? "(shared ~/.claude)" : "(own config dir)");
  if (!l.home && (l.sessions === false || l.share === false)) parts.push("own sessions");
  if (l.inference) parts.push(`→ inference via ${l.inference}`);
  if (l.model) parts.push(`model ${l.model}`);
  if (l.args?.length) parts.push(`args: ${l.args.join(" ")}`);
  return parts.join(" ");
}

export async function launch(name: string, extraArgs: string[]): Promise<number> {
  const l = readLaunchers()[name];
  if (!l) throw new Error(`Launcher not found: ${name} (see "cpr launcher list")`);
  return runClaude(l.profile, [...(l.args ?? []), ...extraArgs], l);
}

function powershellBlock(): string {
  return [
    BLOCK_START,
    "# `claude <launcher>` runs a claude-provider launcher; anything else goes to the",
    "# previous `claude` (alias target if there was one, else claude.exe).",
    "$CprClaudeFallback = if (Get-Alias claude -ErrorAction SilentlyContinue) { (Get-Alias claude).Definition } elseif ($CprClaudeFallback) { $CprClaudeFallback } else { 'claude.exe' }",
    "Remove-Item Alias:claude -Force -ErrorAction SilentlyContinue",
    "function claude {",
    "  $launchers = Join-Path $HOME '.claude-accounts\\launchers.json'",
    "  if ($args.Count -gt 0 -and (Test-Path $launchers)) {",
    "    $known = (Get-Content $launchers -Raw | ConvertFrom-Json).PSObject.Properties.Name",
    "    if ($known -contains [string]$args[0]) {",
    "      $rest = @($args | Select-Object -Skip 1)",
    "      & cpr.cmd launch $args[0] @rest",
    "      return",
    "    }",
    "  }",
    "  & $CprClaudeFallback @args",
    "}",
    BLOCK_END,
  ].join("\r\n");
}

function posixBlock(): string {
  return [
    BLOCK_START,
    "claude() {",
    '  if [ -n "$1" ] && [ -f "$HOME/.claude-accounts/launchers.json" ] && \\',
    '     node -e \'process.exit(Object.hasOwn(require(process.argv[1]),process.argv[2])?0:1)\' "$HOME/.claude-accounts/launchers.json" "$1" 2>/dev/null; then',
    '    name="$1"; shift; cpr launch "$name" "$@"',
    "  else",
    '    command claude "$@"',
    "  fi",
    "}",
    BLOCK_END,
  ].join("\n");
}

function powershellProfilePath(): string {
  const res = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$PROFILE"], {
    encoding: "utf8",
  });
  const out = res.stdout?.trim();
  if (!out) throw new Error("Could not determine the PowerShell profile path");
  return out;
}

export function upsertBlock(file: string, block: string): "installed" | "updated" | "unchanged" {
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const re = new RegExp(`${escape(BLOCK_START)}[\\s\\S]*?${escape(BLOCK_END)}`);
  const next = re.test(current)
    ? current.replace(re, block)
    : `${current}${current && !current.endsWith("\n") ? "\n" : ""}\n${block}\n`;
  if (next === current) return "unchanged";
  if (current) fs.copyFileSync(file, `${file}.bak-cpr`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return re.test(current) ? "updated" : "installed";
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Add (or refresh) the `claude <launcher>` shell function. It goes at the end
 * of the profile so it can wrap whatever `claude` was before.
 */
export function installShellIntegration(): { file: string; result: string }[] {
  if (process.platform === "win32") {
    const file = powershellProfilePath();
    return [{ file, result: upsertBlock(file, powershellBlock()) }];
  }
  const done: { file: string; result: string }[] = [];
  for (const rc of [".bashrc", ".zshrc"]) {
    const file = path.join(os.homedir(), rc);
    if (fs.existsSync(file)) done.push({ file, result: upsertBlock(file, posixBlock()) });
  }
  return done;
}
