import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiKeyHelper } from "../src/utils.js";
import { writeProfile } from "../src/profiles.js";
import {
  buildClaudeEnv,
  buildProxyConfig,
  extractApiKey,
  getAccountDir,
  prepareAccountDir,
  runClaude,
  clearAccountState,
  hasLogin,
  splitModelEnv,
  SESSION_ENTRIES,
  claudeBin,
  activateHomeLogin,
} from "../src/runner.js";
import { PROXY_ADDON_PY } from "../src/proxy-addon.js";

let home: string;
const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "cpr-run-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
});

afterEach(() => {
  process.env.HOME = saved.HOME;
  process.env.USERPROFILE = saved.USERPROFILE;
  fs.rmSync(home, { recursive: true, force: true });
});

describe("extractApiKey", () => {
  it("round-trips keys with quotes", () => {
    const key = "sk-a'b\"c";
    expect(extractApiKey({ apiKeyHelper: createApiKeyHelper(key), env: {} })).toBe(key);
    expect(extractApiKey({ env: { ANTHROPIC_AUTH_TOKEN: "t" } })).toBe("t");
  });
});

describe("prepareAccountDir", () => {
  it("creates an isolated dir with merged settings and no login", () => {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".claude", "settings.json"),
      JSON.stringify({ env: {}, permissions: { allow: ["Bash"] } })
    );
    fs.writeFileSync(
      path.join(home, ".claude.json"),
      JSON.stringify({
        oauthAccount: { emailAddress: "a@x" },
        mcpServers: { s: {} },
        cachedGrowthBookFeatures: { rc: true },
        replBridgePlaceholders: { x: 1 },
        remoteControlMachineId: "m",
      })
    );
    writeProfile("acc-b", { env: {} });

    const dir = prepareAccountDir("acc-b");
    expect(dir).toBe(getAccountDir("acc-b"));
    const settings = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
    expect(settings.permissions).toEqual({ allow: ["Bash"] });
    const json = JSON.parse(fs.readFileSync(path.join(dir, ".claude.json"), "utf8"));
    expect(json).toEqual({ mcpServers: { s: {} } });
    expect(buildClaudeEnv("acc-b", dir, { ANTHROPIC_BASE_URL: "https://x" }).ANTHROPIC_BASE_URL).toBeUndefined();
    expect(buildClaudeEnv("acc-b", dir, {}).CLAUDE_CONFIG_DIR).toBe(dir);
    expect(hasLogin(dir)).toBe(false);
  });

  it("inherits folder trust from ~/.claude.json on later runs without touching other state", () => {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    writeProfile("acc-b", { env: {} });
    fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ projects: {} }));
    const dir = prepareAccountDir("acc-b");
    const own = path.join(dir, ".claude.json");
    fs.writeFileSync(own, JSON.stringify({ oauthAccount: { emailAddress: "b@x" }, projects: { "C:/p1": { allowedTools: ["x"] } } }));
    fs.writeFileSync(
      path.join(home, ".claude.json"),
      JSON.stringify({ projects: { "C:/p1": { hasTrustDialogAccepted: true }, "C:/p2": { hasTrustDialogAccepted: false } } })
    );
    prepareAccountDir("acc-b");
    expect(JSON.parse(fs.readFileSync(own, "utf8"))).toEqual({
      oauthAccount: { emailAddress: "b@x" },
      projects: { "C:/p1": { allowedTools: ["x"], hasTrustDialogAccepted: true } },
    });
  });

  it("clearAccountState drops account-bound caches but keeps the dir's own login", () => {
    const dir = path.join(home, "acct");
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, ".claude.json"),
      JSON.stringify({ oauthAccount: { emailAddress: "b@x" }, mcpServers: {}, cachedGrowthBookFeatures: {}, remoteControlMachineId: "m", replBridgePlaceholders: {} })
    );
    expect(clearAccountState(dir).sort()).toEqual(["cachedGrowthBookFeatures", "remoteControlMachineId", "replBridgePlaceholders"]);
    expect(JSON.parse(fs.readFileSync(path.join(dir, ".claude.json"), "utf8"))).toEqual({
      oauthAccount: { emailAddress: "b@x" },
      mcpServers: {},
    });
  });
});

describe("shared sessions", () => {
  const sessionFile = "projects/C--p1/s1.jsonl";

  it("lets every account dir see sessions written by another", () => {
    writeProfile("acc-a", { env: {} });
    writeProfile("acc-b", { env: {} });
    const a = prepareAccountDir("acc-a");
    const b = prepareAccountDir("acc-b");
    fs.mkdirSync(path.join(a, "projects", "C--p1"), { recursive: true });
    fs.writeFileSync(path.join(a, sessionFile), "{}\n");
    expect(fs.readFileSync(path.join(b, sessionFile), "utf8")).toBe("{}\n");
    expect(fs.existsSync(path.join(home, ".claude", sessionFile))).toBe(true);
    for (const entry of SESSION_ENTRIES) expect(fs.lstatSync(path.join(b, entry)).isSymbolicLink()).toBe(true);
  });

  it("merges a pre-existing private dir into the shared one without overwriting", () => {
    writeProfile("acc-b", { env: {} });
    const shared = path.join(home, ".claude", "file-history");
    fs.mkdirSync(path.join(shared, "s1"), { recursive: true });
    fs.writeFileSync(path.join(shared, "s1", "v1"), "shared");
    const own = path.join(getAccountDir("acc-b"), "file-history");
    fs.mkdirSync(path.join(own, "s1"), { recursive: true });
    fs.mkdirSync(path.join(own, "s2"), { recursive: true });
    fs.writeFileSync(path.join(own, "s1", "v1"), "private");
    fs.writeFileSync(path.join(own, "s1", "v2"), "private");
    fs.writeFileSync(path.join(own, "s2", "v1"), "b");

    prepareAccountDir("acc-b");
    expect(fs.lstatSync(own).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(shared, "s1", "v1"), "utf8")).toBe("shared");
    expect(fs.readFileSync(path.join(shared, "s1", "v2"), "utf8")).toBe("private");
    expect(fs.readFileSync(path.join(shared, "s2", "v1"), "utf8")).toBe("b");
    expect(fs.readFileSync(path.join(`${own}.bak-cpr`, "s1", "v1"), "utf8")).toBe("private");
  });

  it("keeps sessions private with sessions: false", () => {
    writeProfile("acc-b", { env: {} });
    const dir = prepareAccountDir("acc-b", { sessions: false });
    expect(fs.existsSync(path.join(dir, "projects"))).toBe(false);
  });
});

describe("buildClaudeEnv on ~/.claude (home)", () => {
  it("applies a gateway profile per process and leaves CLAUDE_CONFIG_DIR unset", () => {
    writeProfile("gw", {
      apiKeyHelper: createApiKeyHelper("KEY"),
      env: { ANTHROPIC_BASE_URL: "https://gw", ANTHROPIC_MODEL: "m1" },
    });
    const env = buildClaudeEnv("gw", null, { CLAUDE_CONFIG_DIR: "x", ANTHROPIC_API_KEY: "old" });
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(env).toMatchObject({
      ANTHROPIC_BASE_URL: "https://gw",
      ANTHROPIC_AUTH_TOKEN: "KEY",
      ANTHROPIC_MODEL: "m1",
      ENABLE_TOOL_SEARCH: "true",
    });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});

describe("splitModelEnv", () => {
  it("advertises the gateway tiers unless already set", () => {
    const cfg = { mode: "gateway" as const, tiers: { opus: "o", sonnet: "s", haiku: "h" } };
    expect(splitModelEnv(cfg, {})).toEqual({
      ANTHROPIC_DEFAULT_OPUS_MODEL: "o",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "s",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "h",
      ANTHROPIC_MODEL: "s",
    });
    expect(splitModelEnv(cfg, { ANTHROPIC_MODEL: "mine" }).ANTHROPIC_MODEL).toBeUndefined();
    expect(splitModelEnv({ mode: "oauth", tiers: {} }, {})).toEqual({});
  });
});

describe("buildProxyConfig", () => {
  it("builds a gateway config from a /v1 profile", () => {
    writeProfile("gw", {
      apiKeyHelper: createApiKeyHelper("KEY"),
      env: {
        ANTHROPIC_BASE_URL: "https://gw.example.com:8443/sub",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "big",
      },
    });
    expect(buildProxyConfig("gw")).toMatchObject({
      mode: "gateway",
      scheme: "https",
      host: "gw.example.com",
      port: 8443,
      basePath: "/sub",
      token: "KEY",
      tiers: { opus: "big" },
    });
  });

  it("points an OAuth profile at its own credentials file", () => {
    writeProfile("acc-b", { env: {} });
    if (process.platform === "darwin") return;
    expect(buildProxyConfig("acc-b")).toMatchObject({
      mode: "oauth",
      credentialsFile: path.join(getAccountDir("acc-b"), ".credentials.json"),
    });
  });

  it("rejects a profile with no endpoint", () => {
    writeProfile("bad", { apiKeyHelper: createApiKeyHelper("K"), env: {} });
    expect(() => buildProxyConfig("bad")).toThrow(/needs ANTHROPIC_BASE_URL/);
  });
});

describe("runClaude", () => {
  it("launches claude with the isolated config dir and no inherited gateway vars", async () => {
    writeProfile("acc-b", { env: {} });
    const out = path.join(home, "out.json");
    const script = path.join(home, "fake.js");
    fs.writeFileSync(
      script,
      `require("fs").writeFileSync(${JSON.stringify(out)}, JSON.stringify({dir: process.env.CLAUDE_CONFIG_DIR, base: process.env.ANTHROPIC_BASE_URL ?? null, args: process.argv.slice(2)}))`
    );
    process.env.CPR_CLAUDE_BIN = process.execPath;
    process.env.ANTHROPIC_BASE_URL = "https://leak.example";
    try {
      const code = await runClaude("acc-b", [script, "-p", "hi"]);
      expect(code).toBe(0);
    } finally {
      delete process.env.CPR_CLAUDE_BIN;
      delete process.env.ANTHROPIC_BASE_URL;
    }
    expect(JSON.parse(fs.readFileSync(out, "utf8"))).toEqual({
      dir: getAccountDir("acc-b"),
      base: null,
      args: ["-p", "hi"],
    });
  });

  it("refuses split mode when the session profile is not a claude.ai login", async () => {
    writeProfile("gw1", { apiKeyHelper: createApiKeyHelper("K"), env: { ANTHROPIC_BASE_URL: "https://a" } });
    writeProfile("gw2", { apiKeyHelper: createApiKeyHelper("K"), env: { ANTHROPIC_BASE_URL: "https://b" } });
    await expect(runClaude("gw1", [], { inference: "gw2" })).rejects.toThrow(/claude.ai login/);
  });
});

describe("proxy addon", () => {
  it("is valid Python", () => {
    const file = path.join(home, "addon.py");
    fs.writeFileSync(file, PROXY_ADDON_PY);
    const py = ["python", "python3", "py"].find((c) => spawnSync(c, ["--version"]).status === 0);
    if (!py) return;
    const res = spawnSync(py, ["-c", `import ast,sys;ast.parse(open(sys.argv[1],encoding="utf-8").read())`, file]);
    expect(res.status).toBe(0);
  });

  it("routes only POST /v1/messages and handles threads, tiers and headers", () => {
    const py = ["python", "python3", "py"].find((c) => spawnSync(c, ["--version"]).status === 0);
    if (!py) return;
    const addon = path.join(home, "addon.py");
    fs.writeFileSync(addon, PROXY_ADDON_PY);
    const cfg = path.join(home, "cfg.json");
    fs.writeFileSync(
      cfg,
      JSON.stringify({
        mode: "gateway",
        scheme: "https",
        host: "gw.example",
        port: 443,
        basePath: "",
        token: "GWKEY",
        tiers: { opus: "auto/claude-opus", sonnet: "auto/claude-sonnet", haiku: "auto/claude-sonnet" },
      })
    );
    const harness = path.join(home, "harness.py");
    fs.writeFileSync(harness, ADDON_HARNESS);
    const res = spawnSync(py, ["-I", harness, addon, cfg], { encoding: "utf8" });
    expect(res.stderr).toBe("");
    expect(JSON.parse(res.stdout)).toEqual({
      thread: [400, "thread_unsupported_request"],
      opus: ["gw.example", "/v1/messages", "auto/claude-opus", "Bearer GWKEY", null, "ctx-1m"],
      onem: "auto/claude-sonnet",
      slash: "auto/custom",
      count_tokens_untouched: ["api.anthropic.com", "Bearer OAUTH"],
      other_host_untouched: "example.org",
    });
  });
});

const ADDON_HARNESS = String.raw`
import json, sys, types

class Headers(dict):
    def get(self, k, d=None): return super().get(k.lower(), d)
    def __setitem__(self, k, v): super().__setitem__(k.lower(), v)
    def __getitem__(self, k): return super().__getitem__(k.lower())
    def __delitem__(self, k): super().__delitem__(k.lower())
    def pop(self, k, d=None): return super().pop(k.lower(), d)

class Response:
    def __init__(self, status, body, headers):
        self.status_code, self.body, self.headers, self.stream = status, body, Headers(headers), False
    @staticmethod
    def make(status, body, headers): return Response(status, body, headers)

class Request:
    def __init__(self, method, host, path, body, headers):
        self.method, self.host, self.pretty_host, self.path = method, host, host, path
        self.scheme, self.port, self._body, self.headers = "https", 443, body, Headers(headers)
    def get_text(self): return self._body
    def set_text(self, t): self._body = t

class Flow:
    def __init__(self, req): self.request, self.response, self.metadata = req, None, {}

mitm = types.ModuleType("mitmproxy"); http = types.ModuleType("mitmproxy.http")
http.Response, http.HTTPFlow = Response, Flow
mitm.http = http
sys.modules["mitmproxy"], sys.modules["mitmproxy.http"] = mitm, http

import os
os.environ["CPR_PROXY_CONFIG"] = sys.argv[2]
ns = {}
exec(open(sys.argv[1], encoding="utf-8").read(), ns)

def call(method, host, path, body, headers=None):
    f = Flow(Request(method, host, path, json.dumps(body), headers or {"authorization": "Bearer OAUTH", "x-api-key": "k", "anthropic-beta": "oauth-2025-04-20,ctx-1m"}))
    ns["request"](f)
    return f

out = {}
f = call("POST", "api.anthropic.com", "/v1/messages", {"model": "claude-opus-5-5", "thread": {"type": "continue"}})
out["thread"] = [f.response.status_code, json.loads(f.response.body)["error"]["details"]["error_code"]]
f = call("POST", "api.anthropic.com", "/v1/messages?beta=true", {"model": "claude-opus-5-5"})
r = f.request
out["opus"] = [r.host, r.path.split("?")[0], json.loads(r.get_text())["model"], r.headers.get("authorization"), r.headers.get("x-api-key"), r.headers.get("anthropic-beta")]
out["onem"] = json.loads(call("POST", "api.anthropic.com", "/v1/messages", {"model": "claude-sonnet-5-5[1m]"}).request.get_text())["model"]
out["slash"] = json.loads(call("POST", "api.anthropic.com", "/v1/messages", {"model": "auto/custom"}).request.get_text())["model"]
f = call("POST", "api.anthropic.com", "/v1/messages/count_tokens", {"model": "claude-opus-5-5"})
out["count_tokens_untouched"] = [f.request.host, f.request.headers.get("authorization")]
out["other_host_untouched"] = call("POST", "example.org", "/v1/messages", {"model": "x"}).request.host
print(json.dumps(out))
`;

describe("claudeBin", () => {
  const exe = process.platform === "win32" ? "claude.exe" : "claude";

  it("falls back to ~/.local/bin when claude is not on PATH", () => {
    const bin = path.join(home, ".local", "bin");
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, exe), "");
    expect(claudeBin({ PATH: path.join(home, "empty") })).toBe(path.join(bin, exe));
  });

  it("prefers CPR_CLAUDE_BIN, then PATH", () => {
    const onPath = path.join(home, "p");
    fs.mkdirSync(onPath);
    fs.writeFileSync(path.join(onPath, exe), "");
    expect(claudeBin({ CPR_CLAUDE_BIN: "x", PATH: onPath })).toBe("x");
    expect(claudeBin({ PATH: onPath })).toBe(path.join(onPath, exe));
    expect(claudeBin({ PATH: "" })).toBe("claude");
  });
});

describe("activateHomeLogin (one ~/.claude, swapped login)", () => {
  const cred = (token: string, exp: number): string =>
    JSON.stringify({ claudeAiOauth: { accessToken: token, refreshToken: `r-${token}`, expiresAt: exp } });
  const live = (): string => fs.readFileSync(path.join(home, ".claude", ".credentials.json"), "utf8");
  const email = (): string => JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf8")).oauthAccount.emailAddress;
  const setLive = (token: string, exp: number, account: string): void => {
    fs.writeFileSync(path.join(home, ".claude", ".credentials.json"), cred(token, exp));
    const json = JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf8"));
    json.oauthAccount = { accountUuid: account, emailAddress: `${account}@x` };
    fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify(json));
  };

  beforeEach(() => {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ projects: { "C:/p": {} } }));
    writeProfile("acc-k", { env: {} });
    writeProfile("acc-n", { env: {} });
    writeProfile("gw", { env: { ANTHROPIC_BASE_URL: "https://gw", ANTHROPIC_AUTH_TOKEN: "t" } });
  });

  it("swaps logins both ways and keeps each account's refreshed token", () => {
    setLive("k1", 100, "keno");
    fs.writeFileSync(path.join(home, ".claude", ".active-profile"), "acc-k\n");
    // nils was logged in once in its isolated dir; a stale snapshot of keno sits under its name.
    const nilsDir = getAccountDir("acc-n");
    fs.mkdirSync(nilsDir, { recursive: true });
    fs.writeFileSync(path.join(nilsDir, ".credentials.json"), cred("n1", 200));
    fs.writeFileSync(path.join(nilsDir, ".claude.json"), JSON.stringify({ oauthAccount: { accountUuid: "nils", emailAddress: "nils@x" } }));
    fs.writeFileSync(
      path.join(home, ".claude", "credentials.acc-n.json"),
      JSON.stringify({ version: 1, credential: cred("k0", 50), oauthAccount: { accountUuid: "keno" } })
    );

    activateHomeLogin("acc-n");
    expect(JSON.parse(live()).claudeAiOauth.accessToken).toBe("n1");
    expect(email()).toBe("nils@x");

    setLive("n2", 300, "nils"); // claude refreshed nils's token while running
    activateHomeLogin("acc-k");
    expect(JSON.parse(live()).claudeAiOauth.accessToken).toBe("k1");
    expect(email()).toBe("keno@x");

    setLive("k2", 400, "keno");
    activateHomeLogin("acc-n");
    expect(JSON.parse(live()).claudeAiOauth.accessToken).toBe("n2");
    activateHomeLogin("acc-k");
    expect(JSON.parse(live()).claudeAiOauth.accessToken).toBe("k2");
    // Everything but the login is untouched.
    expect(JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf8")).projects).toEqual({ "C:/p": {} });
    expect(fs.readFileSync(path.join(home, ".claude", ".active-profile"), "utf8").trim()).toBe("acc-k");
  });

  it("keeps MCP OAuth tokens and trusts the refresh token over a stale oauthAccount", () => {
    fs.writeFileSync(
      path.join(home, ".claude", ".credentials.json"),
      JSON.stringify({ ...JSON.parse(cred("k1", 100)), mcpOAuth: { srv: { accessToken: "m" } } })
    );
    fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ oauthAccount: { accountUuid: "keno" } }));
    fs.writeFileSync(
      path.join(home, ".claude", "credentials.acc-k.json"),
      JSON.stringify({ version: 1, credential: cred("k1", 100), oauthAccount: { accountUuid: "keno" } })
    );
    fs.writeFileSync(
      path.join(home, ".claude", "credentials.acc-n.json"),
      JSON.stringify({ version: 1, credential: cred("n1", 200), oauthAccount: { accountUuid: "nils" } })
    );
    activateHomeLogin("acc-n");
    expect(JSON.parse(live())).toEqual({ ...JSON.parse(cred("n1", 200)), mcpOAuth: { srv: { accessToken: "m" } } });
    // A keno process still running rewrites oauthAccount; the token is still nils's.
    fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ oauthAccount: { accountUuid: "keno" } }));
    activateHomeLogin("acc-k");
    expect(JSON.parse(live()).claudeAiOauth.accessToken).toBe("k1");
    expect(JSON.parse(live()).mcpOAuth).toEqual({ srv: { accessToken: "m" } });
    const savedNils = JSON.parse(fs.readFileSync(path.join(home, ".claude", "credentials.acc-n.json"), "utf8"));
    expect(savedNils.oauthAccount).toEqual({ accountUuid: "nils" });
    const savedKeno = JSON.parse(fs.readFileSync(path.join(home, ".claude", "credentials.acc-k.json"), "utf8"));
    expect(JSON.parse(savedKeno.credential).claudeAiOauth.accessToken).toBe("k1");
  });

  it("logs out locally for a profile with no login, keeping an unowned login as a backup", () => {
    setLive("x1", 100, "stranger");
    const notes = activateHomeLogin("acc-n");
    expect(fs.existsSync(path.join(home, ".claude", ".credentials.json"))).toBe(false);
    expect(fs.readFileSync(path.join(home, ".claude", ".credentials.json.bak-cpr"), "utf8")).toBe(cred("x1", 100));
    expect(notes.join("\n")).toMatch(/\/login/);
  });

  it("runClaude --home swaps for login profiles but not for split launchers", async () => {
    setLive("k1", 100, "keno");
    fs.writeFileSync(
      path.join(home, ".claude", "credentials.acc-n.json"),
      JSON.stringify({ version: 1, credential: cred("n1", 200), oauthAccount: { accountUuid: "nils" } })
    );
    fs.writeFileSync(
      path.join(home, ".claude", "credentials.acc-k.json"),
      JSON.stringify({ version: 1, credential: cred("k1", 100), oauthAccount: { accountUuid: "keno" } })
    );
    const prev = process.env.CPR_CLAUDE_BIN;
    process.env.CPR_CLAUDE_BIN = process.execPath;
    try {
      await runClaude("acc-n", ["-e", "0"], { home: true });
      expect(JSON.parse(live()).claudeAiOauth.accessToken).toBe("n1");
      await expect(runClaude("acc-k", ["-e", "0"], { home: true, inference: "gw" })).rejects.toThrow();
      expect(JSON.parse(live()).claudeAiOauth.accessToken).toBe("n1");
    } finally {
      process.env.CPR_CLAUDE_BIN = prev;
    }
  });
});
