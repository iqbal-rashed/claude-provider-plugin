import fs from "node:fs";
import path from "node:path";
import type { Profile, Settings } from "./types.js";
import {
  MODEL_ENV_KEYS,
} from "./constants.js";
import {
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
function readActiveProfileMarker(): string | null {
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
function writeActiveProfileMarker(name: string): void {
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
  const normalizedSettings = normalizeProviderSettings(newSettings);

  // Read current settings to preserve non-provider-specific fields
  const currentSettings = readSettings(dest);

  // Merge: start with current settings as base, then apply new profile's env
  // This preserves all user settings (permissions, attribution, etc.) while
  // only updating the provider-specific env vars
  const mergedSettings: Settings = {
    ...currentSettings,
    ...normalizedSettings,
    // Deep merge env: combine current env with new profile's env vars
    // New profile's env vars take precedence for conflicts
    env: {
      ...currentSettings?.env,
      ...normalizedSettings.env,
    },
    // Deep merge enabledPlugins: combine both current and new
    enabledPlugins: {
      ...currentSettings?.enabledPlugins,
      ...normalizedSettings.enabledPlugins,
    },
  };

  if (!normalizedSettings.apiKeyHelper) {
    delete mergedSettings.apiKeyHelper;
  }
  if (!normalizedSettings.model) {
    delete mergedSettings.model;
  }

  for (const key of PROVIDER_ENV_KEYS) {
    if (!(key in (normalizedSettings.env ?? {}))) {
      delete mergedSettings.env[key];
    }
  }

  // Write merged settings
  writeSettings(dest, mergedSettings);

  // Record the active profile for reliable detection on the next read.
  // This is the only way to distinguish profiles that share the same
  // ANTHROPIC_BASE_URL (e.g. multiple Anthropic plans on one account).
  writeActiveProfileMarker(name);

  return dest;
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
