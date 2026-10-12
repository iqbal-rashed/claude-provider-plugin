import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeBaseUrl } from "../src/utils.js";
import {
  addClaudeAccount,
  detectActiveProfile,
  duplicateProfile,
  listProfiles,
  switchProfile,
  writeProfile,
} from "../src/profiles.js";
import { readLiveCredential, writeLiveCredential } from "../src/credentials.js";

let home: string;
const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "cpr-test-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.CPR_SWAP_CREDENTIALS;
});

afterEach(() => {
  process.env.HOME = saved.HOME;
  process.env.USERPROFILE = saved.USERPROFILE;
  fs.rmSync(home, { recursive: true, force: true });
});

const claudeJson = () => path.join(home, ".claude.json");
const account = (email: string) => ({ emailAddress: email });

describe("normalizeBaseUrl", () => {
  it("strips /v1 and trailing slashes", () => {
    expect(normalizeBaseUrl("https://x.io/v1")).toEqual({ url: "https://x.io", stripped: true });
    expect(normalizeBaseUrl("https://x.io/v1/")).toEqual({ url: "https://x.io", stripped: true });
    expect(normalizeBaseUrl("https://x.io/api/v1")).toEqual({
      url: "https://x.io/api",
      stripped: true,
    });
  });
  it("leaves other URLs alone", () => {
    expect(normalizeBaseUrl("https://x.io/anthropic")).toEqual({
      url: "https://x.io/anthropic",
      stripped: false,
    });
    expect(normalizeBaseUrl("https://x.io/v10")).toEqual({ url: "https://x.io/v10", stripped: false });
  });
});

describe("duplicateProfile", () => {
  it("copies a profile and refuses to overwrite", () => {
    writeProfile("kimi", { env: { ANTHROPIC_BASE_URL: "https://k" }, apiKeyHelper: "x" });
    duplicateProfile("kimi", "kimi2");
    expect(listProfiles().map((p) => p.name)).toEqual(["kimi", "kimi2"]);
    expect(() => duplicateProfile("kimi", "kimi2")).toThrow(/already exists/);
    expect(() => duplicateProfile("nope", "z")).toThrow(/not found/);
    expect(() => duplicateProfile("kimi", "bad name")).toThrow();
  });
});

describe("Claude account swapping", () => {
  it("keeps two OAuth accounts separate across switches", () => {
    writeProfile("anthropic-main", { env: {} });
    fs.writeFileSync(claudeJson(), JSON.stringify({ oauthAccount: account("main@x"), other: 1 }));
    writeLiveCredential("TOKEN-MAIN");
    switchProfile("anthropic-main");

    const notes = addClaudeAccount("anthropic-secondary");
    expect(notes.join(" ")).toMatch(/saved current Claude login for anthropic-main/);
    expect(readLiveCredential()).toBeNull();
    expect(JSON.parse(fs.readFileSync(claudeJson(), "utf8"))).toEqual({ other: 1 });

    // user runs /login as the second account
    writeLiveCredential("TOKEN-SECOND");
    fs.writeFileSync(claudeJson(), JSON.stringify({ oauthAccount: account("second@x"), other: 1 }));

    switchProfile("anthropic-main");
    expect(readLiveCredential()).toBe("TOKEN-MAIN");
    expect(JSON.parse(fs.readFileSync(claudeJson(), "utf8")).oauthAccount).toEqual(account("main@x"));
    expect(detectActiveProfile(listProfiles())).toBe("anthropic-main");

    switchProfile("anthropic-secondary");
    expect(readLiveCredential()).toBe("TOKEN-SECOND");
    expect(JSON.parse(fs.readFileSync(claudeJson(), "utf8")).oauthAccount).toEqual(
      account("second@x")
    );
    expect(detectActiveProfile(listProfiles())).toBe("anthropic-secondary");
  });

  it("logs out instead of keeping the old account when the target has no saved login", () => {
    writeProfile("keno", { env: {} });
    writeProfile("nils", { env: {} });
    fs.writeFileSync(claudeJson(), JSON.stringify({ oauthAccount: account("keno@x") }));
    writeLiveCredential("TOKEN-KENO");
    switchProfile("keno");

    const { notes } = switchProfile("nils");
    expect(readLiveCredential()).toBeNull();
    expect(JSON.parse(fs.readFileSync(claudeJson(), "utf8")).oauthAccount).toBeUndefined();
    expect(notes.join(" ")).toMatch(/logged out locally/);

    switchProfile("keno");
    expect(readLiveCredential()).toBe("TOKEN-KENO");
  });

  it("does not touch the login when switching to an API-key profile", () => {
    writeProfile("anthropic-main", { env: {} });
    writeProfile("kimi", { env: { ANTHROPIC_BASE_URL: "https://k" }, apiKeyHelper: "x" });
    writeLiveCredential("TOKEN-MAIN");
    switchProfile("anthropic-main");
    switchProfile("kimi");
    expect(readLiveCredential()).toBe("TOKEN-MAIN");
    expect(fs.existsSync(path.join(home, ".claude", "credentials.kimi.json"))).toBe(false);
  });

  it("refuses add-account when a login exists but no OAuth profile holds it", () => {
    writeLiveCredential("ORPHAN");
    expect(() => addClaudeAccount("second")).toThrow(/no OAuth profile is active/);
  });

  it("can be disabled with CPR_SWAP_CREDENTIALS=0", () => {
    process.env.CPR_SWAP_CREDENTIALS = "0";
    writeProfile("a", { env: {} });
    writeProfile("b", { env: {} });
    writeLiveCredential("T");
    switchProfile("a");
    switchProfile("b");
    expect(fs.existsSync(path.join(home, ".claude", "credentials.a.json"))).toBe(false);
  });
});
