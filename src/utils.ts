import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SettingsSchema } from "./types.js";
import type { Settings } from "./types.js";

/**
 * Get the Claude configuration directory path
 */
export function getClaudeDir(): string {
  return path.join(os.homedir(), ".claude");
}

/**
 * Get the main settings.json path
 */
export function getSettingsPath(): string {
  return path.join(getClaudeDir(), "settings.json");
}

/**
 * Get profile file path for a given provider name
 */
export function getProfilePath(name: string): string {
  return path.join(getClaudeDir(), `settings.${name}.json`);
}

/**
 * Ensure the Claude directory exists
 */
export function ensureClaudeDir(): void {
  const dir = getClaudeDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read and parse a JSON settings file
 */
export function readSettings(file: string): Settings | null {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return SettingsSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Write settings to a file with proper permissions
 */
export function writeSettings(file: string, settings: Settings): void {
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n", "utf8");
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // chmod may fail on Windows, which is fine
  }
}

/**
 * Build the command format expected by Claude settings apiKeyHelper.
 */
export function createApiKeyHelper(apiKey: string): string {
  return `bash -c 'echo ${shellSingleQuoteContent(apiKey)}'`;
}

function shellSingleQuoteContent(value: string): string {
  return value.replace(/'/g, "'\\''");
}

/**
 * Stable JSON stringify for reliable comparison
 */
export function stableStringify(obj: unknown): string {
  const seen = new WeakSet<object>();

  const sortRecursive = (value: unknown): unknown => {
    if (value === null || typeof value !== "object") {
      return value;
    }

    if (seen.has(value)) return value;
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map(sortRecursive);
    }

    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortRecursive((value as Record<string, unknown>)[key]);
    }
    return sorted;
  };

  return JSON.stringify(sortRecursive(obj));
}

/**
 * Generate ISO timestamp for backup files
 */
export function generateTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_");
}

/**
 * Validate provider name format
 */
export function isValidProviderName(name: string): boolean {
  return /^[a-z0-9][a-z0-9_-]*$/i.test(name);
}
