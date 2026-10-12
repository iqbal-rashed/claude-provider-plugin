import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeProfile } from "../src/profiles.js";
import { launch, readLaunchers, removeLauncher, saveLauncher, upsertBlock } from "../src/launchers.js";

let home: string;
const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "cpr-launch-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.CPR_BIN_DIR = path.join(home, "bin");
  writeProfile("anthropic-keno", { env: {} });
  writeProfile("anthropic-nils", { env: {} });
  writeProfile("omniroute", { apiKeyHelper: "bash -c 'echo K'", env: { ANTHROPIC_BASE_URL: "https://gw" } });
});

afterEach(() => {
  process.env.HOME = saved.HOME;
  process.env.USERPROFILE = saved.USERPROFILE;
  delete process.env.CPR_BIN_DIR;
  fs.rmSync(home, { recursive: true, force: true });
});

const shim = (name: string) =>
  path.join(home, "bin", process.platform === "win32" ? `claude-${name}.cmd` : `claude-${name}`);

describe("launchers", () => {
  it("creates, changes and removes start commands with shims", () => {
    saveLauncher("keno", { profile: "anthropic-keno", home: true }, { create: true });
    saveLauncher("omni", { profile: "anthropic-keno", home: true, inference: "omniroute" }, { create: true });
    expect(readLaunchers()).toEqual({
      keno: { profile: "anthropic-keno", home: true },
      omni: { profile: "anthropic-keno", home: true, inference: "omniroute" },
    });
    expect(fs.readFileSync(shim("keno"), "utf8")).toContain("launch keno");

    expect(() => saveLauncher("keno", { profile: "anthropic-nils" }, { create: true })).toThrow(/already exists/);
    saveLauncher("keno", { profile: "anthropic-nils", args: ["--resume"] });
    expect(readLaunchers().keno).toEqual({ profile: "anthropic-nils", args: ["--resume"] });

    removeLauncher("keno");
    expect(readLaunchers().keno).toBeUndefined();
    expect(fs.existsSync(shim("keno"))).toBe(false);
  });

  it("never overwrites or deletes a same-named file it did not create", () => {
    fs.mkdirSync(path.join(home, "bin"), { recursive: true });
    fs.writeFileSync(shim("omni"), "@echo off\r\nrem user's own wrapper\r\n");
    const res = saveLauncher("omni", { profile: "anthropic-keno", inference: "omniroute" });
    expect(res.shim).toBeNull();
    expect(res.shimConflict).toBe(shim("omni"));
    expect(readLaunchers().omni).toBeDefined();
    removeLauncher("omni");
    expect(fs.readFileSync(shim("omni"), "utf8")).toBe("@echo off\r\nrem user's own wrapper\r\n");
  });

  it("rejects bad names, reserved claude subcommands and unknown profiles", () => {
    expect(() => saveLauncher("bad name", { profile: "anthropic-keno" })).toThrow();
    expect(() => saveLauncher("mcp", { profile: "anthropic-keno" })).toThrow(/subcommand/);
    expect(() => saveLauncher("x", { profile: "nope" })).toThrow(/not found/);
    expect(() => saveLauncher("x", { profile: "anthropic-keno", inference: "nope" })).toThrow(/not found/);
  });

  it("launch runs the stored profile with stored + extra args", async () => {
    const out = path.join(home, "out.json");
    const script = path.join(home, "fake.js");
    fs.writeFileSync(
      script,
      `require("fs").writeFileSync(${JSON.stringify(out)}, JSON.stringify({dir: process.env.CLAUDE_CONFIG_DIR ?? null, args: process.argv.slice(2)}))`
    );
    saveLauncher("nils", { profile: "anthropic-nils", args: [script, "--a"] });
    saveLauncher("keno", { profile: "anthropic-keno", home: true, args: [script] });
    process.env.CPR_CLAUDE_BIN = process.execPath;
    try {
      expect(await launch("nils", ["--b"])).toBe(0);
      expect(JSON.parse(fs.readFileSync(out, "utf8"))).toEqual({
        dir: path.join(home, ".claude-accounts", "anthropic-nils"),
        args: ["--a", "--b"],
      });
      expect(await launch("keno", [])).toBe(0);
      expect(JSON.parse(fs.readFileSync(out, "utf8")).dir).toBeNull();
    } finally {
      delete process.env.CPR_CLAUDE_BIN;
    }
    await expect(launch("missing", [])).rejects.toThrow(/not found/);
  });
});

describe("shell integration block", () => {
  it("is appended once and replaced in place", () => {
    const file = path.join(home, "profile.ps1");
    fs.writeFileSync(file, "Set-Alias claude x\n");
    const block = (v: string) => `# >>> claude-provider launchers >>>\n${v}\n# <<< claude-provider launchers <<<`;
    expect(upsertBlock(file, block("one"))).toBe("installed");
    expect(upsertBlock(file, block("one"))).toBe("unchanged");
    expect(upsertBlock(file, block("two"))).toBe("updated");
    const text = fs.readFileSync(file, "utf8");
    expect(text.startsWith("Set-Alias claude x\n")).toBe(true);
    expect(text.match(/>>> claude-provider/g)).toHaveLength(1);
    expect(text).toContain("two");
    expect(fs.existsSync(`${file}.bak-cpr`)).toBe(true);
  });
});
