import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { Settings } from "./types.js";
import { MODEL_ENV_KEYS } from "./constants.js";
import {
  getClaudeDir,
  getClaudeJsonPath,
  getSettingsPath,
  readSettings,
  writeSettings,
  normalizeBaseUrl,
} from "./utils.js";
import {
  getProfileFilePath,
  isOauthProfile,
  listProfiles,
  mergeProfileSettings,
  readActiveProfileMarker,
  writeActiveProfileMarker,
} from "./profiles.js";
import {
  clearLiveCredential,
  getCredentialPath,
  readLiveCredential,
  readOauthAccount,
  readSavedLogin,
  writeLiveCredential,
  writeOauthAccount,
} from "./credentials.js";
import { PROXY_ADDON_PY } from "./proxy-addon.js";

/**
 * Run several Claude Code sessions side by side.
 *
 * Each profile gets its own CLAUDE_CONFIG_DIR (~/.claude-accounts/<name>), so
 * two claude.ai accounts can be logged in at once, each with Remote Control.
 * With `home`, the session uses the normal ~/.claude dir and its login instead.
 *
 * Split mode (`inference`): the session keeps its claude.ai login (so Remote
 * Control stays on) while a local mitmproxy rewrites only the inference call
 * (POST /v1/messages) to go out through another profile: a second Claude
 * account or any Anthropic-compatible /v1 gateway. Setting ANTHROPIC_BASE_URL
 * instead would disable Remote Control.
 */

const SHARED_ENTRIES = ["skills", "commands", "agents", "plugins"];
/**
 * Session state shared by every account dir, so a session started under one
 * account can be resumed (`claude <launcher> --continue`) under another:
 * transcripts, rewind checkpoints, plans and task lists.
 */
export const SESSION_ENTRIES = ["projects", "file-history", "plans", "tasks", "todos"];
const AUTH_ENV = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"];

/**
 * Keys of ~/.claude.json that are safe to copy into a new account dir. Everything
 * else there is tied to the logged-in account (feature-flag and model-access
 * caches, Remote Control bridge state) and must be fetched fresh per account.
 */
const SEED_KEYS = [
  "mcpServers",
  "projects",
  "githubRepoPaths",
  "hasCompletedOnboarding",
  "lastOnboardingVersion",
  "installMethod",
  "autoUpdates",
  "autoUpdatesProtectedForNative",
  "hasSeenTasksHint",
  "lastReleaseNotesSeen",
  "claudeInChromeDefaultEnabled",
  "hasCompletedClaudeInChromeOnboarding",
];

const ACCOUNT_STATE_KEY =
  /^(cached|replBridge|remoteControl|rcLongTurn|hasUsedRemoteControl|remoteDialogSeen|passes|hasVisitedPasses|groveConfigCache|penguinModeOrgEnabled|subscriptionNoticeCount|hasAvailableSubscription|clientDataCacheSlots|additionalModel|modelAccessCache|orgModelDefaultCache|autoCompactWindowsCache|githubWebConnectionStatusCache|promoStartupStatusCache|claudeAiMcpEverConnected)/;

export function getAccountsRoot(): string {
  return path.join(os.homedir(), ".claude-accounts");
}

export function getAccountDir(name: string): string {
  return path.join(getAccountsRoot(), name);
}

function link(src: string, dest: string): void {
  if (!fs.existsSync(src) || fs.existsSync(dest)) return;
  try {
    fs.symlinkSync(src, dest, "junction");
  } catch {
    // Sharing is a convenience; the profile still works without it.
  }
}

function isLink(file: string): boolean {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Link a session entry to the shared one in ~/.claude. A real dir left from
 * earlier runs is merged in first (nothing is overwritten); anything that
 * could not be moved stays in `<dest>.bak-cpr`.
 */
function linkSessionEntry(src: string, dest: string): void {
  fs.mkdirSync(src, { recursive: true });
  if (fs.existsSync(dest) && !isLink(dest) && fs.statSync(dest).isDirectory()) {
    for (const child of fs.readdirSync(dest)) {
      const target = path.join(src, child);
      if (!fs.existsSync(target)) mergeMove(path.join(dest, child), target);
      else if (fs.statSync(target).isDirectory() && fs.statSync(path.join(dest, child)).isDirectory()) {
        for (const inner of fs.readdirSync(path.join(dest, child))) {
          if (!fs.existsSync(path.join(target, inner))) mergeMove(path.join(dest, child, inner), path.join(target, inner));
        }
      }
    }
    try {
      fs.rmdirSync(dest);
    } catch {
      let backup = `${dest}.bak-cpr`;
      for (let i = 1; fs.existsSync(backup); i++) backup = `${dest}.bak-cpr${i}`;
      fs.renameSync(dest, backup);
    }
  }
  link(src, dest);
}

function mergeMove(from: string, to: string): void {
  try {
    fs.renameSync(from, to);
  } catch {
    // Left behind; ends up in the .bak-cpr dir.
  }
}

/**
 * Drop account-bound caches from an account dir's .claude.json (kept: its own
 * oauthAccount, MCP servers, project trust). Claude refetches them on start.
 */
export function clearAccountState(dir: string): string[] {
  const file = path.join(dir, ".claude.json");
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return [];
  }
  const removed = Object.keys(json).filter((k) => ACCOUNT_STATE_KEY.test(k));
  if (removed.length === 0) return [];
  for (const key of removed) delete json[key];
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  return removed;
}

/**
 * Create/refresh the isolated config dir for a profile: shared skills,
 * commands, agents, plugins and project memory are linked from ~/.claude,
 * settings.json is the user's base settings plus the profile.
 */
export function prepareAccountDir(name: string, opts: { share?: boolean; sessions?: boolean } = {}): string {
  const dir = getAccountDir(name);
  fs.mkdirSync(dir, { recursive: true });

  const profile = readSettings(getProfileFilePath(name));
  if (!profile) throw new Error(`Provider profile not found: settings.${name}.json`);

  const ownSettings = path.join(dir, "settings.json");
  const base = readSettings(fs.existsSync(ownSettings) ? ownSettings : getSettingsPath());
  writeSettings(ownSettings, mergeProfileSettings(base, profile));

  if (opts.share !== false) {
    for (const entry of SHARED_ENTRIES) link(path.join(getClaudeDir(), entry), path.join(dir, entry));
    const md = path.join(dir, "CLAUDE.md");
    const srcMd = path.join(getClaudeDir(), "CLAUDE.md");
    if (!fs.existsSync(md) && fs.existsSync(srcMd)) fs.copyFileSync(srcMd, md);
    if (opts.sessions !== false) {
      for (const entry of SESSION_ENTRIES) {
        linkSessionEntry(path.join(getClaudeDir(), entry), path.join(dir, entry));
      }
    }
  }

  const ownJson = path.join(dir, ".claude.json");
  if (!fs.existsSync(ownJson) && fs.existsSync(getClaudeJsonPath())) {
    try {
      const json = JSON.parse(fs.readFileSync(getClaudeJsonPath(), "utf8")) as Record<string, unknown>;
      const seed = Object.fromEntries(SEED_KEYS.filter((k) => k in json).map((k) => [k, json[k]]));
      fs.writeFileSync(ownJson, JSON.stringify(seed, null, 2) + "\n");
    } catch {
      // Claude will create a fresh one.
    }
  } else {
    inheritFolderTrust(ownJson);
  }
  return dir;
}

type Projects = Record<string, Record<string, unknown>>;

/**
 * Folder trust is about the folder, not the account: carry over folders
 * trusted in ~/.claude.json so `claude remote-control` works there too.
 */
function inheritFolderTrust(ownJson: string): void {
  try {
    const main = JSON.parse(fs.readFileSync(getClaudeJsonPath(), "utf8")) as { projects?: Projects };
    const own = JSON.parse(fs.readFileSync(ownJson, "utf8")) as { projects?: Projects };
    let changed = false;
    for (const [folder, entry] of Object.entries(main.projects ?? {})) {
      if (entry?.hasTrustDialogAccepted !== true) continue;
      own.projects ??= {};
      if (own.projects[folder]?.hasTrustDialogAccepted === true) continue;
      own.projects[folder] = { ...own.projects[folder], hasTrustDialogAccepted: true };
      changed = true;
    }
    if (changed) fs.writeFileSync(ownJson, JSON.stringify(own, null, 2) + "\n");
  } catch {
    // Missing or unreadable state: claude asks for trust itself.
  }
}

/** True when the config dir holds a claude.ai login (Windows/Linux file store). */
export function hasLogin(dir: string): boolean {
  if (process.platform === "darwin") return true;
  try {
    const c = JSON.parse(fs.readFileSync(path.join(dir, ".credentials.json"), "utf8"));
    return Boolean(c?.claudeAiOauth?.accessToken);
  } catch {
    return false;
  }
}

interface Login {
  credential: string;
  oauthAccount: unknown | null;
}

function accountId(account: unknown): string | null {
  const a = account as { accountUuid?: string; emailAddress?: string } | null;
  return a?.accountUuid ?? a?.emailAddress ?? null;
}

function accountEmail(account: unknown): string {
  return (account as { emailAddress?: string } | null)?.emailAddress ?? "unknown account";
}

function expiresAt(credential: string | null | undefined): number {
  try {
    return Number(JSON.parse(credential ?? "").claudeAiOauth?.expiresAt) || 0;
  } catch {
    return 0;
  }
}

/** The login an isolated account dir holds (made by /login there), if any. */
function readAccountDirLogin(name: string): Login | null {
  if (process.platform === "darwin") return null;
  const dir = getAccountDir(name);
  try {
    const credential = fs.readFileSync(path.join(dir, ".credentials.json"), "utf8").trim();
    if (!JSON.parse(credential)?.claudeAiOauth?.accessToken) return null;
    const json = JSON.parse(fs.readFileSync(path.join(dir, ".claude.json"), "utf8"));
    return { credential, oauthAccount: json.oauthAccount ?? null };
  } catch {
    return null;
  }
}

function writeSavedLogin(name: string, login: Login): void {
  const file = getCredentialPath(name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, ...login }) + "\n", { mode: 0o600 });
}

/**
 * The login a profile should use. An isolated account dir was logged in with
 * /login under that name, so it wins over a snapshot of another account and
 * over an older token of the same one.
 */
export function loginFor(name: string): Login | null {
  const saved = readSavedLogin(name);
  const own = readAccountDirLogin(name);
  if (
    own &&
    (!saved ||
      accountId(own.oauthAccount) !== accountId(saved.oauthAccount) ||
      expiresAt(own.credential) > expiresAt(saved.credential))
  ) {
    writeSavedLogin(name, own);
    return own;
  }
  return saved;
}

/** Live claude processes on ~/.claude other than our own. */
function liveHomeSessions(): number {
  const dir = path.join(getClaudeDir(), "sessions");
  let count = 0;
  try {
    for (const f of fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))) {
      const pid = Number(f.slice(0, -5));
      try {
        process.kill(pid, 0);
        count++;
      } catch {
        // Not running.
      }
    }
  } catch {
    // No sessions dir.
  }
  return count;
}

function oauthPart(credential: string | null | undefined): Record<string, unknown> | null {
  try {
    const part = JSON.parse(credential ?? "").claudeAiOauth;
    return part?.accessToken ? part : null;
  } catch {
    return null;
  }
}

/**
 * Put `login`'s claude.ai token (or none) into the live credential, keeping
 * everything else stored there, such as MCP server OAuth tokens.
 */
function setLiveOauth(login: Login | null): void {
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(readLiveCredential() ?? "{}");
  } catch {
    // Unreadable: start over.
  }
  delete current.claudeAiOauth;
  const part = login ? oauthPart(login.credential) : null;
  if (part) current.claudeAiOauth = part;
  if (Object.keys(current).length > 0) writeLiveCredential(JSON.stringify(current));
  else clearLiveCredential();
  writeOauthAccount(login?.oauthAccount ?? null);
}

/**
 * Make `name`'s claude.ai login the live one in ~/.claude, keeping every other
 * file (settings, memory, sessions, MCP logins) as it is. The outgoing login
 * is saved first under the profile it belongs to: the one holding the same
 * refresh token, else the same account, else the profile last activated.
 */
export function activateHomeLogin(name: string): string[] {
  const notes: string[] = [];
  const target = loginFor(name);
  const live = readLiveCredential();
  const liveOauth = oauthPart(live);
  const liveAccount = readOauthAccount();
  const liveId = accountId(liveAccount);

  const loginProfiles = listProfiles()
    .map((p) => p.name)
    .filter((p) => isOauthProfile(readSettings(getProfileFilePath(p))));
  const sameToken = (p: string): boolean =>
    Boolean(liveOauth?.refreshToken) && oauthPart(loginFor(p)?.credential)?.refreshToken === liveOauth?.refreshToken;
  let owners = loginProfiles.filter(sameToken);
  if (owners.length === 0 && liveId) {
    owners = loginProfiles.filter((p) => accountId(loginFor(p)?.oauthAccount) === liveId);
  }
  const marked = readActiveProfileMarker();
  if (owners.length === 0 && marked && loginProfiles.includes(marked) && !loginFor(marked)) owners = [marked];

  if (liveOauth) {
    for (const owner of owners) {
      const saved = loginFor(owner);
      if (expiresAt(live) >= expiresAt(saved?.credential)) {
        // The token decides whose login this is; keep that profile's account info.
        const account = sameToken(owner) ? (saved?.oauthAccount ?? liveAccount) : liveAccount;
        writeSavedLogin(owner, { credential: JSON.stringify({ claudeAiOauth: liveOauth }), oauthAccount: account });
      }
    }
    if (owners.length === 0) {
      const backup = path.join(getClaudeDir(), ".credentials.json.bak-cpr");
      fs.writeFileSync(backup, live ?? "", { mode: 0o600 });
      notes.push(`The current login (${accountEmail(liveAccount)}) belongs to no profile; kept a copy in ${backup}.`);
    }
  }

  if (liveOauth && owners.includes(name)) {
    const fresh = loginFor(name);
    if (fresh && expiresAt(fresh.credential) > expiresAt(live)) setLiveOauth(fresh);
    writeActiveProfileMarker(name);
    return notes;
  }

  const others = liveHomeSessions();
  if (others > 0) {
    notes.push(`${others} other claude session(s) use ~/.claude and switch to this account too.`);
  }

  setLiveOauth(target);
  notes.push(
    target
      ? `Signed in as ${accountEmail(target.oauthAccount)} (${name}).`
      : `No saved login for ${name}: type /login in claude and sign in with this account.`
  );
  writeActiveProfileMarker(name);
  return notes;
}

export function extractApiKey(settings: Settings): string | null {
  const direct = settings.env?.ANTHROPIC_AUTH_TOKEN ?? settings.env?.ANTHROPIC_API_KEY;
  if (direct) return direct;
  const m = settings.apiKeyHelper?.match(/^bash -c 'echo (.*)'$/s);
  return m ? m[1].replace(/'\\''/g, "'") : null;
}

/**
 * Environment for the claude process. `dir` null means the normal ~/.claude.
 */
export function buildClaudeEnv(
  name: string,
  dir: string | null,
  base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  if (dir) env.CLAUDE_CONFIG_DIR = dir;
  else delete env.CLAUDE_CONFIG_DIR;

  const settings = readSettings(getProfileFilePath(name));
  if (isOauthProfile(settings)) {
    // Inherited gateway vars would disable Remote Control and bypass the login.
    for (const key of AUTH_ENV) delete env[key];
  } else if (!dir && settings) {
    // Gateway profile on the shared ~/.claude: apply it per process, never to settings.json.
    const profileEnv = settings.env ?? {};
    for (const key of ["ANTHROPIC_BASE_URL", ...MODEL_ENV_KEYS]) {
      if (profileEnv[key]) env[key] = profileEnv[key];
    }
    const token = extractApiKey(settings);
    if (token) env.ANTHROPIC_AUTH_TOKEN = token;
    delete env.ANTHROPIC_API_KEY;
    // Tool search is off for non-Anthropic hosts unless asked for.
    env.ENABLE_TOOL_SEARCH ??= "true";
  }
  return env;
}

export interface ProxyConfig {
  mode: "gateway" | "oauth";
  scheme?: string;
  host?: string;
  port?: number;
  basePath?: string;
  token?: string;
  credentialsFile?: string;
  forceModel?: string;
  tiers: { opus?: string; sonnet?: string; haiku?: string };
}

/**
 * Describe where the inference calls of a split session should go.
 */
export function buildProxyConfig(inference: string, opts: { model?: string } = {}): ProxyConfig {
  const settings = readSettings(getProfileFilePath(inference));
  if (!settings) throw new Error(`Provider profile not found: settings.${inference}.json`);
  const env = settings.env ?? {};
  const tiers = {
    opus: env.ANTHROPIC_DEFAULT_OPUS_MODEL || undefined,
    sonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL || undefined,
    haiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL || undefined,
  };

  if (isOauthProfile(settings)) {
    if (process.platform === "darwin") {
      throw new Error("Using a second Claude account for inference is not supported on macOS (keychain).");
    }
    const credentialsFile = path.join(getAccountDir(inference), ".credentials.json");
    return { mode: "oauth", credentialsFile, forceModel: opts.model, tiers: {} };
  }

  const baseUrl = env.ANTHROPIC_BASE_URL;
  const token = extractApiKey(settings);
  if (!baseUrl || !token) {
    throw new Error(`Profile ${inference} needs ANTHROPIC_BASE_URL and an API key to serve inference.`);
  }
  const url = new URL(normalizeBaseUrl(baseUrl).url);
  return {
    mode: "gateway",
    scheme: url.protocol.replace(":", ""),
    host: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
    basePath: url.pathname.replace(/\/+$/, ""),
    token,
    forceModel: opts.model,
    tiers,
  };
}

/**
 * Model names a split session should show and request, so the status line
 * and /model reflect the gateway's models. Existing env always wins.
 */
export function splitModelEnv(config: ProxyConfig, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (config.mode !== "gateway") return {};
  const out: NodeJS.ProcessEnv = {};
  const set = (key: string, value: string | undefined): void => {
    if (value && !base[key]) out[key] = value;
  };
  if (config.forceModel) {
    set("ANTHROPIC_MODEL", config.forceModel);
    return out;
  }
  set("ANTHROPIC_DEFAULT_OPUS_MODEL", config.tiers.opus);
  set("ANTHROPIC_DEFAULT_SONNET_MODEL", config.tiers.sonnet);
  set("ANTHROPIC_DEFAULT_HAIKU_MODEL", config.tiers.haiku);
  set("ANTHROPIC_MODEL", config.tiers.sonnet);
  return out;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

function waitForPort(port: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  return new Promise((resolve) => {
    const attempt = (): void => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve(true);
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() > deadline) resolve(false);
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

function findMitmdump(): string | null {
  const bin = process.env.CPR_MITMDUMP || "mitmdump";
  const res = spawnSync(bin, ["--version"], { stdio: "ignore" });
  return res.error ? null : bin;
}

/**
 * The claude executable: CPR_CLAUDE_BIN, else `claude` on PATH, else the
 * native installer's ~/.local/bin (often cut off the end of a long Windows PATH).
 */
export function claudeBin(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CPR_CLAUDE_BIN) return env.CPR_CLAUDE_BIN;
  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  const dirs = (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean);
  dirs.push(path.join(os.homedir(), ".local", "bin"));
  for (const dir of dirs) {
    const file = path.join(dir, exe);
    if (fs.existsSync(file)) return file;
  }
  return "claude";
}

function forwardExit(child: ChildProcess, cleanup: () => void): Promise<number> {
  return new Promise((resolve) => {
    child.once("error", (err) => {
      cleanup();
      console.error(
        `Could not start ${claudeBin()}: ${err.message} (set CPR_CLAUDE_BIN to the claude executable)`
      );
      resolve(1);
    });
    child.once("exit", (code) => {
      cleanup();
      resolve(code ?? 0);
    });
  });
}

export interface RunOptions {
  inference?: string;
  model?: string;
  share?: boolean;
  /** false: keep this account's sessions separate (default: shared). */
  sessions?: boolean;
  home?: boolean;
}

export async function runClaude(name: string, claudeArgs: string[], opts: RunOptions = {}): Promise<number> {
  const settings = readSettings(getProfileFilePath(name));
  if (!settings) throw new Error(`Provider profile not found: settings.${name}.json`);
  const oauth = isOauthProfile(settings);

  const dir = opts.home ? null : prepareAccountDir(name, { share: opts.share, sessions: opts.sessions });
  // One shared ~/.claude, one account at a time: swap in this profile's login.
  // Split launchers only need some claude.ai login for Remote Control.
  if (!dir && oauth && (!opts.inference || opts.inference === name)) {
    for (const note of activateHomeLogin(name)) console.error(note);
  }
  const env = buildClaudeEnv(name, dir);
  if (dir && oauth && !hasLogin(dir)) {
    console.error(`First run of ${name}: type /login in claude and sign in with this account.`);
  }

  if (!opts.inference || opts.inference === name) {
    const child = spawn(claudeBin(), claudeArgs, { stdio: "inherit", env });
    return forwardExit(child, () => undefined);
  }

  if (!oauth) {
    throw new Error(
      `Split mode needs ${name} to be a claude.ai login profile (that's what keeps Remote Control on).`
    );
  }
  const config = buildProxyConfig(opts.inference, { model: opts.model });
  const mitmdump = findMitmdump();
  if (!mitmdump) {
    throw new Error("Split mode needs mitmproxy: install it (pipx install mitmproxy) or set CPR_MITMDUMP.");
  }

  const work = path.join(getAccountsRoot(), ".proxy", String(process.pid));
  fs.mkdirSync(work, { recursive: true, mode: 0o700 });
  const configFile = path.join(work, "config.json");
  const addonFile = path.join(work, "addon.py");
  fs.writeFileSync(configFile, JSON.stringify(config), { mode: 0o600 });
  fs.writeFileSync(addonFile, PROXY_ADDON_PY);

  const confdir = path.join(os.homedir(), ".mitmproxy");
  const port = await freePort();
  const proxy = spawn(
    mitmdump,
    [
      "-q",
      "--listen-host",
      "127.0.0.1",
      "--listen-port",
      String(port),
      "--set",
      `confdir=${confdir}`,
      "--allow-hosts",
      "^api\\.anthropic\\.com(:443)?$",
      "-s",
      addonFile,
    ],
    { stdio: "ignore", env: { ...process.env, CPR_PROXY_CONFIG: configFile } }
  );

  const cleanup = (): void => {
    proxy.kill();
    fs.rmSync(work, { recursive: true, force: true });
  };

  const ready = await waitForPort(port, 30_000);
  const ca = path.join(confdir, "mitmproxy-ca-cert.pem");
  if (!ready || !fs.existsSync(ca)) {
    cleanup();
    throw new Error("mitmproxy did not start (or has no CA yet). Run mitmdump once, then retry.");
  }

  const proxyUrl = `http://127.0.0.1:${port}`;
  const child = spawn(claudeBin(), claudeArgs, {
    stdio: "inherit",
    env: {
      ...env,
      ...splitModelEnv(config, env),
      HTTPS_PROXY: proxyUrl,
      https_proxy: proxyUrl,
      NODE_EXTRA_CA_CERTS: ca,
    },
  });
  return forwardExit(child, cleanup);
}
