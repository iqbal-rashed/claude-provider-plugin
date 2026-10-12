import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getClaudeDir, getClaudeJsonPath } from "./utils.js";

/**
 * Per-profile Claude Code login (OAuth) storage, so several Claude
 * subscriptions can be swapped on switch.
 *
 * Live login location:
 *   - macOS:         keychain, service "Claude Code-credentials"
 *   - Windows/Linux: ~/.claude/.credentials.json
 * Account identity (email/org shown in /status) is the `oauthAccount`
 * block of ~/.claude.json and is swapped together with the credential.
 *
 * Saved snapshot: ~/.claude/credentials.<profile>.json (mode 0600).
 */

const KEYCHAIN_SERVICE = "Claude Code-credentials";

export interface SavedLogin {
  credential: string;
  oauthAccount: unknown | null;
}

export function isMacOS(): boolean {
  return process.platform === "darwin";
}

export function getCredentialPath(profile: string): string {
  return path.join(getClaudeDir(), `credentials.${profile}.json`);
}

function getLiveCredentialFile(): string {
  return path.join(getClaudeDir(), ".credentials.json");
}

function getKeychainAccount(): string {
  return os.userInfo().username;
}

export function readLiveCredential(): string | null {
  if (isMacOS()) {
    try {
      const out = execFileSync(
        "security",
        ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", getKeychainAccount(), "-w"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
      );
      return out.trim() || null;
    } catch {
      return null;
    }
  }
  try {
    const raw = fs.readFileSync(getLiveCredentialFile(), "utf8").trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function writeLiveCredential(token: string): void {
  if (isMacOS()) {
    if (token.includes("\n")) {
      throw new Error("keychain credentials must be a single-line JSON string");
    }
    const account = getKeychainAccount();
    try {
      execFileSync(
        "security",
        ["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", account, "-w", token],
        { stdio: "ignore" }
      );
    } catch {
      try {
        execFileSync("security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account], {
          stdio: "ignore",
        });
      } catch {
        // No existing entry is fine.
      }
      execFileSync(
        "security",
        ["add-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w", token],
        { stdio: "ignore" }
      );
    }
    return;
  }
  const file = getLiveCredentialFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, token, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // chmod may fail on Windows
  }
}

export function clearLiveCredential(): void {
  if (isMacOS()) {
    try {
      execFileSync(
        "security",
        ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", getKeychainAccount()],
        { stdio: "ignore" }
      );
    } catch {
      // Nothing to clear.
    }
    return;
  }
  fs.rmSync(getLiveCredentialFile(), { force: true });
}

function readClaudeJson(): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(getClaudeJsonPath(), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readOauthAccount(): unknown | null {
  return readClaudeJson()?.oauthAccount ?? null;
}

/** Set (or, with null, remove) the oauthAccount block, preserving the rest of ~/.claude.json. */
export function writeOauthAccount(account: unknown | null): void {
  const json = readClaudeJson();
  if (!json) {
    if (account === null) return;
    fs.writeFileSync(getClaudeJsonPath(), JSON.stringify({ oauthAccount: account }, null, 2) + "\n");
    return;
  }
  if (account === null) delete json.oauthAccount;
  else json.oauthAccount = account;
  fs.writeFileSync(getClaudeJsonPath(), JSON.stringify(json, null, 2) + "\n");
}

export function hasSavedCredential(profile: string): boolean {
  return fs.existsSync(getCredentialPath(profile));
}

export function readSavedLogin(profile: string): SavedLogin | null {
  let raw: string;
  try {
    raw = fs.readFileSync(getCredentialPath(profile), "utf8").trim();
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version === 1 && typeof parsed.credential === "string") {
      return { credential: parsed.credential, oauthAccount: parsed.oauthAccount ?? null };
    }
  } catch {
    // Fall through: legacy file holding the bare credential blob.
  }
  return { credential: raw, oauthAccount: null };
}

export function saveCredentialForProfile(profile: string): {
  saved: boolean;
  reason?: string;
  path: string;
} {
  const credPath = getCredentialPath(profile);
  const credential = readLiveCredential();
  if (!credential) {
    return {
      saved: false,
      reason: "no logged-in Claude session found (run /login in claude first)",
      path: credPath,
    };
  }
  const body = { version: 1, credential, oauthAccount: readOauthAccount() };
  fs.mkdirSync(path.dirname(credPath), { recursive: true });
  fs.writeFileSync(credPath, JSON.stringify(body) + "\n", { mode: 0o600 });
  return { saved: true, path: credPath };
}

export function restoreCredentialForProfile(profile: string): {
  restored: boolean;
  reason?: string;
  path: string;
} {
  const credPath = getCredentialPath(profile);
  if (!fs.existsSync(credPath)) {
    return { restored: false, reason: "no saved credential for profile", path: credPath };
  }
  const login = readSavedLogin(profile);
  if (!login) {
    return { restored: false, reason: "credential file is empty", path: credPath };
  }
  writeLiveCredential(login.credential);
  if (login.oauthAccount) writeOauthAccount(login.oauthAccount);
  return { restored: true, path: credPath };
}

/** Log out locally (credential + cached account) so `/login` can add another account. */
export function clearLogin(): void {
  clearLiveCredential();
  writeOauthAccount(null);
}

export function copySavedCredential(src: string, dest: string): boolean {
  const from = getCredentialPath(src);
  if (!fs.existsSync(from)) return false;
  fs.copyFileSync(from, getCredentialPath(dest));
  try {
    fs.chmodSync(getCredentialPath(dest), 0o600);
  } catch {
    // chmod may fail on Windows
  }
  return true;
}

export function deleteSavedCredential(profile: string): void {
  fs.rmSync(getCredentialPath(profile), { force: true });
}

export function listSavedCredentials(): string[] {
  const dir = getClaudeDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("credentials.") && f.endsWith(".json"))
    .map((f) => f.replace(/^credentials\./, "").replace(/\.json$/, ""))
    .sort();
}
