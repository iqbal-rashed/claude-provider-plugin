import fs from "node:fs";
import path from "node:path";
import type { Profile, Settings } from "./types.js";
import {
  ensureClaudeDir,
  getClaudeDir,
  getProfilePath,
  getSettingsPath,
  readSettings,
  stableStringify,
  writeSettings,
  generateTimestamp,
} from "./utils.js";

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
  if (baseUrl.includes("aliyun") || baseUrl.includes("dashscope")) return "qwen";
  if (baseUrl.includes("minimax")) return "minimax";
  if (baseUrl.includes("deepseek")) return "deepseek";
  return "custom";
}

/**
 * Detect which profile is currently active based on ANTHROPIC_BASE_URL
 */
export function detectActiveProfile(profiles: Profile[]): string | null {
  const active = readSettings(getSettingsPath());
  if (!active) return null;

  // Primary: match by base URL (most reliable for provider detection)
  const activeBaseUrl = active.env?.ANTHROPIC_BASE_URL;

  // Match by base URL first
  for (const profile of profiles) {
    const settings = readSettings(profile.file);
    if (!settings) continue;

    const profileBaseUrl = settings.env?.ANTHROPIC_BASE_URL;

    // Exact base URL match
    if (activeBaseUrl && profileBaseUrl && activeBaseUrl === profileBaseUrl) {
      return profile.name;
    }

    // Handle empty/undefined base URLs (Anthropic native)
    if ((!activeBaseUrl || activeBaseUrl === "") && (!profileBaseUrl || profileBaseUrl === "")) {
      return profile.name;
    }
  }

  // Fallback: exact JSON match (if settings were manually copied)
  const activeNormalized = stableStringify(active);
  for (const profile of profiles) {
    const settings = readSettings(profile.file);
    if (settings && stableStringify(settings) === activeNormalized) {
      return profile.name;
    }
  }

  // No matching profile, but try to detect provider from URL
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
  const settingsFile = getSettingsPath();
  if (!fs.existsSync(settingsFile)) return null;

  const backupPath = path.join(getClaudeDir(), `settings.backup.${generateTimestamp()}.json`);
  fs.copyFileSync(settingsFile, backupPath);
  return backupPath;
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

  // Merge: start with current settings as base, then apply new profile's env
  // This preserves all user settings (permissions, attribution, etc.) while
  // only updating the provider-specific env vars
  const mergedSettings: Settings = {
    ...currentSettings,
    ...newSettings,
    // Deep merge env: combine current env with new profile's env vars
    // New profile's env vars take precedence for conflicts
    env: {
      ...currentSettings?.env,
      ...newSettings.env,
    },
    // Deep merge enabledPlugins: combine both current and new
    enabledPlugins: {
      ...currentSettings?.enabledPlugins,
      ...newSettings.enabledPlugins,
    },
  };

  // Write merged settings
  writeSettings(dest, mergedSettings);

  return dest;
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
}

/**
 * Get the file path of a provider profile
 */
export function getProfileFilePath(name: string): string {
  return getProfilePath(name);
}
