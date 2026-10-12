import fs from "node:fs";
import path from "node:path";
import type { Profile, Settings } from "./types.js";
import { MODEL_ENV_KEYS, PRESETS } from "./constants.js";
import {
  clearLogin,
  copySavedCredential,
  deleteSavedCredential,
  hasSavedCredential,
  readLiveCredential,
  restoreCredentialForProfile,
  saveCredentialForProfile,
} from "./credentials.js";
import {
  isValidProviderName,
  createApiKeyHelper,
  ensureClaudeDir,
  getClaudeDir,
  getProfilePath,
  getSettingsPath,
  readSettings,
  stableStringify,
  writeSettings,
  generateTimestamp,
} from "./utils.js";

const PROVIDER_ENV_KEYS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "API_TIMEOUT_MS",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
  ...MODEL_ENV_KEYS,
];

const ACTIVE_PROFILE_MARKER = ".active-profile";

/**
 * Read the active profile name recorded in ~/.claude/.active-profile
 */
export function readActiveProfileMarker(): string | null {
  try {
    const markerPath = path.join(getClaudeDir(), ACTIVE_PROFILE_MARKER);
    if (!fs.existsSync(markerPath)) return null;
    const name = fs.readFileSync(markerPath, "utf8").trim();
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Record the active profile name in ~/.claude/.active-profile
 * Used as a tiebreaker when multiple profiles share the same base URL
 * (e.g. different Anthropic plans on the same account)
 */
export function writeActiveProfileMarker(name: string): void {
  try {
    const markerPath = path.join(getClaudeDir(), ACTIVE_PROFILE_MARKER);
    fs.writeFileSync(markerPath, `${name}\n`, { mode: 0o600 });
  } catch {
    // Non-fatal; detection will fall back to base URL matching
  }
}

/**
 * List all installed provider profiles
 */
export function listProfiles(): Profile[] {
  ensureClaudeDir();
  const dir = getClaudeDir();

  const allFiles = fs.readdirSync(dir);
  const filtered = allFiles.filter(
    (f) =>
      f.startsWith("settings.") &&
      f.endsWith(".json") &&
      f !== "settings.json" &&
      !f.startsWith("settings.backup.")
  );

  return filtered
    .map((f) => ({
      name: f.replace(/^settings\./, "").replace(/\.json$/, ""),
      file: path.join(dir, f),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Detect provider name from base URL pattern
 */
export function detectProviderFromBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl || baseUrl === "") return "anthropic";
  if (baseUrl.includes("z.ai")) return "zai";
  if (baseUrl.includes("moonshot")) return "kimi";
  if (baseUrl.includes("fireworks.ai")) return "fireworks";
  if (baseUrl.includes("aliyun") || baseUrl.includes("dashscope")) return "qwen";
  if (baseUrl.includes("minimax")) return "minimax";
  if (baseUrl.includes("deepseek")) return "deepseek";
  return "custom";
}

/**
 * Detect which profile is currently active.
 *
 * Priority:
 *   1. `.active-profile` marker file (set by `switchToProvider`) — required
 *      tiebreaker when multiple profiles share the same ANTHROPIC_BASE_URL,
 *      e.g. distinct Anthropic plans (Pro / Team / Enterprise) on the same
 *      account.
 *   2. Exact ANTHROPIC_BASE_URL match between settings.json and a profile.
 *   3. Exact JSON match (for manually copied settings).
 */
export function detectActiveProfile(profiles: Profile[]): string | null {
  const active = readSettings(getSettingsPath());
  if (!active) return null;

  // 1) Marker file: preferred when it points to an existing profile AND the
  //    profile's base URL is consistent with the current settings. The URL
  //    consistency check prevents stale markers from hiding a genuine switch
  //    (e.g. the user edited settings.json manually).
  const marker = readActiveProfileMarker();
  if (marker) {
    const markedProfile = profiles.find((p) => p.name === marker);
    if (markedProfile) {
      const markedSettings = readSettings(markedProfile.file);
      const activeUrl = active.env?.ANTHROPIC_BASE_URL ?? "";
      const markedUrl = markedSettings?.env?.ANTHROPIC_BASE_URL ?? "";
      if (activeUrl === markedUrl) {
        return marker;
      }
    }
  }

  // 2) Base URL match
  const activeBaseUrl = active.env?.ANTHROPIC_BASE_URL;
  for (const profile of profiles) {
    const settings = readSettings(profile.file);
    if (!settings) continue;

    const profileBaseUrl = settings.env?.ANTHROPIC_BASE_URL;

    if (activeBaseUrl && profileBaseUrl && activeBaseUrl === profileBaseUrl) {
      return profile.name;
    }

    if ((!activeBaseUrl || activeBaseUrl === "") && (!profileBaseUrl || profileBaseUrl === "")) {
      return profile.name;
    }
  }

  // 3) Exact JSON match (for manually copied settings)
  const activeNormalized = stableStringify(active);
  for (const profile of profiles) {
    const settings = readSettings(profile.file);
    if (settings && stableStringify(settings) === activeNormalized) {
      return profile.name;
    }
  }

  return null;
}

/**
 * Get the current active provider display name (even without saved profile)
 */
export function getActiveProviderDisplay(profiles: Profile[]): string {
  const active = readSettings(getSettingsPath());
  if (!active) return "none";

  // First try to match against saved profiles
  const matchedProfile = detectActiveProfile(profiles);
  if (matchedProfile) return matchedProfile;

  // Fallback: detect from base URL pattern
  const baseUrl = active.env?.ANTHROPIC_BASE_URL;
  return detectProviderFromBaseUrl(baseUrl);
}

/**
 * Create a backup of current settings.json if it exists
 */
export function backupCurrentSettings(): string | null {
  if (!isBackupEnabled()) return null;

  const settingsFile = getSettingsPath();
  if (!fs.existsSync(settingsFile)) return null;

  purgeOldBackups();

  const backupPath = path.join(getClaudeDir(), `settings.backup.${generateTimestamp()}.json`);
  fs.copyFileSync(settingsFile, backupPath);
  return backupPath;
}

function isBackupEnabled(): boolean {
  const value = process.env.CPR_BACKUP_SETTINGS;
  if (!value) return false;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function purgeOldBackups(): void {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  for (const file of fs.readdirSync(getClaudeDir())) {
    if (!file.startsWith("settings.backup.") || !file.endsWith(".json")) continue;

    const filePath = path.join(getClaudeDir(), file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore backup cleanup failures; switching should still proceed.
    }
  }
}

/**
 * Write a new provider profile
 */
export function writeProfile(name: string, settings: Settings): string {
  ensureClaudeDir();
  const file = getProfilePath(name);
  writeSettings(file, settings);
  return file;
}

/**
 * Switch to a different provider by merging its profile with existing settings
 * Preserves mcpServers (plugins) from the current settings
 */
export function switchToProvider(name: string): string {
  ensureClaudeDir();
  const src = getProfilePath(name);
  const dest = getSettingsPath();

  if (!fs.existsSync(src)) {
    throw new Error(`Provider profile not found: settings.${name}.json`);
  }

  backupCurrentSettings();

  // Read the new profile settings
  const newSettings = readSettings(src);
  if (!newSettings) {
    throw new Error(`Failed to read profile: settings.${name}.json`);
  }

  // Read current settings to preserve non-provider-specific fields
  const currentSettings = readSettings(dest);

  const mergedSettings = mergeProfileSettings(currentSettings, newSettings);

  // Write merged settings
  writeSettings(dest, mergedSettings);

  // Record the active profile for reliable detection on the next read.
  // This is the only way to distinguish profiles that share the same
  // ANTHROPIC_BASE_URL (e.g. multiple Anthropic plans on one account).
  writeActiveProfileMarker(name);

  return dest;
}

/**
 * Apply a normalized profile on top of existing settings, keeping every
 * non-provider setting and dropping provider keys the profile doesn't set.
 */
export function mergeProfileSettings(
  currentSettings: Settings | null,
  profileSettings: Settings
): Settings {
  const normalizedSettings = normalizeProviderSettings(profileSettings);
  const mergedSettings: Settings = {
    ...currentSettings,
    ...normalizedSettings,
    env: {
      ...currentSettings?.env,
      ...normalizedSettings.env,
    },
    enabledPlugins: {
      ...currentSettings?.enabledPlugins,
      ...normalizedSettings.enabledPlugins,
    },
  };

  if (!normalizedSettings.apiKeyHelper) delete mergedSettings.apiKeyHelper;
  if (!normalizedSettings.model) delete mergedSettings.model;

  for (const key of PROVIDER_ENV_KEYS) {
    if (!(key in (normalizedSettings.env ?? {}))) {
      delete mergedSettings.env[key];
    }
  }
  return mergedSettings;
}

function normalizeProviderSettings(settings: Settings): Settings {
  const env = { ...settings.env };
  const normalized: Settings = {
    ...settings,
    env,
  };

  if (!normalized.apiKeyHelper && env.ANTHROPIC_AUTH_TOKEN) {
    normalized.apiKeyHelper = createApiKeyHelper(env.ANTHROPIC_AUTH_TOKEN);
  }

  if (!normalized.model) {
    normalized.model =
      env.ANTHROPIC_MODEL ??
      env.ANTHROPIC_DEFAULT_SONNET_MODEL ??
      env.ANTHROPIC_DEFAULT_OPUS_MODEL ??
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
  }

  delete env.ANTHROPIC_AUTH_TOKEN;
  return normalized;
}

/**
 * Check if a provider profile exists
 */
export function profileExists(name: string): boolean {
  return fs.existsSync(getProfilePath(name));
}

/**
 * Delete a provider profile
 */
export function deleteProfile(name: string): void {
  const file = getProfilePath(name);
  if (!fs.existsSync(file)) {
    throw new Error(`Provider profile not found: settings.${name}.json`);
  }
  fs.unlinkSync(file);
  deleteSavedCredential(name);

  // Clear the active-profile marker if it pointed to the deleted profile.
  if (readActiveProfileMarker() === name) {
    try {
      fs.unlinkSync(path.join(getClaudeDir(), ACTIVE_PROFILE_MARKER));
    } catch {
      // Non-fatal.
    }
  }
}

/**
 * Get the file path of a provider profile
 */
export function getProfileFilePath(name: string): string {
  return getProfilePath(name);
}

/**
 * A profile uses the Claude subscription login (OAuth) when it carries no API key.
 */
export function isOauthProfile(settings: Settings | null): boolean {
  if (!settings) return false;
  return (
    !settings.apiKeyHelper && !settings.env?.ANTHROPIC_AUTH_TOKEN && !settings.env?.ANTHROPIC_API_KEY
  );
}

function isCredentialSwapEnabled(): boolean {
  const value = process.env.CPR_SWAP_CREDENTIALS;
  if (!value) return true;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

/**
 * Switch profiles and swap the Claude login with it: the outgoing OAuth
 * profile's login is saved, the incoming one's is restored. Opt out with
 * CPR_SWAP_CREDENTIALS=0. Returns human-readable notes.
 */
export function switchProfile(name: string): { path: string; notes: string[] } {
  const notes: string[] = [];
  const swap = isCredentialSwapEnabled();
  const outgoing = swap ? detectActiveProfile(listProfiles()) : null;
  let outgoingSaved = false;

  if (swap && outgoing && outgoing !== name) {
    const outSettings = readSettings(getProfilePath(outgoing));
    if (isOauthProfile(outSettings) && readLiveCredential()) {
      outgoingSaved = saveCredentialForProfile(outgoing).saved;
      if (outgoingSaved) notes.push(`saved Claude login for ${outgoing}`);
    }
  }

  const dest = switchToProvider(name);

  if (swap && isOauthProfile(readSettings(getProfilePath(name)))) {
    if (hasSavedCredential(name)) {
      const res = restoreCredentialForProfile(name);
      if (res.restored) notes.push(`restored Claude login for ${name}`);
      else notes.push(`login restore skipped: ${res.reason}`);
    } else if (outgoingSaved) {
      // Never leave the previous account's login active under this profile's name.
      clearLogin();
      notes.push(
        `no saved Claude login for ${name}: logged out locally; run claude and /login as this account (it is saved when you switch away)`
      );
    } else {
      notes.push(
        `no saved Claude login for ${name}; the current login was kept because it is not saved anywhere — run /login as this account`
      );
    }
  }

  return { path: dest, notes };
}

/**
 * Copy an existing profile under a new name. Saved logins are not copied
 * unless requested, so the copy can be logged in to a different account.
 */
export function duplicateProfile(
  src: string,
  dest: string,
  opts: { withCredentials?: boolean } = {}
): string {
  if (!isValidProviderName(dest)) {
    throw new Error("Use letters, numbers, _ or - for the profile name");
  }
  const from = getProfilePath(src);
  if (!fs.existsSync(from)) {
    throw new Error(`Provider profile not found: settings.${src}.json`);
  }
  if (profileExists(dest)) {
    throw new Error(`Provider profile already exists: settings.${dest}.json`);
  }
  const to = getProfilePath(dest);
  fs.copyFileSync(from, to);
  try {
    fs.chmodSync(to, 0o600);
  } catch {
    // chmod may fail on Windows
  }
  if (opts.withCredentials) copySavedCredential(src, dest);
  return to;
}

/**
 * Prepare an additional Claude subscription account: creates an OAuth profile,
 * saves the current login to the active profile, then logs out locally so
 * `/login` in claude signs in the new account.
 */
export function addClaudeAccount(name: string): string[] {
  if (!isValidProviderName(name)) {
    throw new Error("Use letters, numbers, _ or - for the profile name");
  }
  if (profileExists(name)) {
    throw new Error(`Provider profile already exists: settings.${name}.json`);
  }

  const notes: string[] = [];
  if (readLiveCredential()) {
    const active = detectActiveProfile(listProfiles());
    if (!active || !isOauthProfile(readSettings(getProfilePath(active)))) {
      throw new Error(
        "A Claude login exists but no OAuth profile is active to hold it. " +
          "Save it first: cpr credential save <profile> (after creating that profile)."
      );
    }
    const res = saveCredentialForProfile(active);
    if (!res.saved) throw new Error(`Could not save current login: ${res.reason}`);
    notes.push(`saved current Claude login for ${active}`);
  }

  writeProfile(name, { env: { ...PRESETS.anthropic.env }, model: PRESETS.anthropic.model });
  switchToProvider(name);
  clearLogin();
  notes.push(`created profile ${name} and logged out locally`);
  notes.push("next: run claude, then /login with the second account");
  return notes;
}
