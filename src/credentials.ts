import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getClaudeDir } from "./utils.js";

/**
 * macOS keychain integration for swapping Claude Code OAuth credentials
 * across provider profiles that share the same ANTHROPIC_BASE_URL.
 *
 * Claude Code stores its OAuth session in the macOS keychain under
 *   service="Claude Code-credentials"  account=<unix username>
 *
 * When a user has multiple Anthropic plans on the same account (e.g.
 * Pro / Team / Enterprise), switching plans requires swapping the
 * keychain blob as well as settings.json. This module provides helpers
 * to snapshot, restore, and list those keychain credentials on a
 * per-profile basis.
 *
 * All functions are no-ops outside of macOS.
 */

const KEYCHAIN_SERVICE = "Claude Code-credentials";

export function isMacOS(): boolean {
  return process.platform === "darwin";
}

export function getCredentialPath(profile: string): string {
  return path.join(getClaudeDir(), `credentials.${profile}.json`);
}

function getKeychainAccount(): string {
  return os.userInfo().username;
}

/**
 * Read the raw credential blob from the macOS keychain. Returns null if
 * the entry doesn't exist or the platform isn't macOS.
 */
export function readKeychainCredential(): string | null {
  if (!isMacOS()) return null;
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", getKeychainAccount(), "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Write a credential blob to the macOS keychain, replacing any existing
 * entry. The blob is expected to be a single-line JSON string produced
 * by Claude Code itself; multi-line input can cause `security` to treat
 * the value as binary, which Claude Code then refuses to parse.
 */
export function writeKeychainCredential(token: string): void {
  if (!isMacOS()) {
    throw new Error("keychain integration is only available on macOS");
  }
  if (token.includes("\n")) {
    throw new Error(
      "keychain credentials must be a single-line JSON string; run `jq -c` before storing"
    );
  }

  const account = getKeychainAccount();
  try {
    execFileSync(
      "security",
      ["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", account, "-w", token],
      { stdio: "ignore" }
    );
  } catch {
    // Fallback: some keychain states reject the -U update; delete and re-add.
    try {
      execFileSync(
        "security",
        ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account],
        { stdio: "ignore" }
      );
    } catch {
      // No existing entry is fine.
    }
    execFileSync(
      "security",
      ["add-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w", token],
      { stdio: "ignore" }
    );
  }
}

/**
 * Snapshot the current keychain credential into
 * ~/.claude/credentials.<profile>.json (mode 0600).
 */
export function saveCredentialForProfile(profile: string): {
  saved: boolean;
  reason?: string;
  path: string;
} {
  const credPath = getCredentialPath(profile);
  if (!isMacOS()) {
    return { saved: false, reason: "macOS only", path: credPath };
  }

  const token = readKeychainCredential();
  if (!token) {
    return { saved: false, reason: "no keychain credential found", path: credPath };
  }

  fs.writeFileSync(credPath, `${token}\n`, { mode: 0o600 });
  return { saved: true, path: credPath };
}

/**
 * Restore a saved credential for the given profile back into the
 * keychain. Missing files are reported but not thrown.
 */
export function restoreCredentialForProfile(profile: string): {
  restored: boolean;
  reason?: string;
  path: string;
} {
  const credPath = getCredentialPath(profile);
  if (!isMacOS()) {
    return { restored: false, reason: "macOS only", path: credPath };
  }
  if (!fs.existsSync(credPath)) {
    return { restored: false, reason: "no saved credential for profile", path: credPath };
  }

  const token = fs.readFileSync(credPath, "utf8").trim();
  if (!token) {
    return { restored: false, reason: "credential file is empty", path: credPath };
  }

  writeKeychainCredential(token);
  return { restored: true, path: credPath };
}

/**
 * List saved credential profiles. Each entry is the bare profile name
 * parsed from credentials.<name>.json.
 */
export function listSavedCredentials(): string[] {
  const dir = getClaudeDir();
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("credentials.") && f.endsWith(".json"))
    .map((f) => f.replace(/^credentials\./, "").replace(/\.json$/, ""))
    .sort();
}
