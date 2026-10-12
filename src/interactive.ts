import chalk from "chalk";
import * as p from "@clack/prompts";
import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import { PRESETS, MODEL_ENV_KEYS, DEFAULT_MODEL_HINTS } from "./constants.js";
import {
  describeLauncher,
  installShellIntegration,
  readLaunchers,
  removeLauncher,
  saveLauncher,
} from "./launchers.js";
import type { PresetKey } from "./constants.js";
import type { Settings } from "./types.js";
import {
  createApiKeyHelper,
  isValidProviderName,
  getSettingsPath,
  readSettings,
  normalizeBaseUrl,
  fetchModels,
} from "./utils.js";
import {
  listProfiles,
  detectActiveProfile,
  switchProfile,
  duplicateProfile,
  addClaudeAccount,
  writeProfile,
  getActiveProviderDisplay,
  deleteProfile,
  getProfileFilePath,
} from "./profiles.js";

/**
 * Interactive prompt to add a new provider
 */
export async function addProviderInteractive(): Promise<string | null> {
  const preset = await p.select({
    message: "Add provider: choose a preset (or Custom)",
    options: [
      ...Object.entries(PRESETS).map(([key, value]) => ({
        value: key,
        label: value.display,
      })),
      { value: "custom", label: "Custom (enter base URL + token)" },
    ],
  });

  if (p.isCancel(preset)) return null;

  const profiles = listProfiles();
  const existingNames = new Set(profiles.map((p) => p.name.toLowerCase()));

  let providerName: string | null = null;

  const baseName = preset === "custom" ? "custom-provider" : String(preset);

  while (!providerName) {
    if (preset !== "custom" && existingNames.has(baseName.toLowerCase())) {
      p.note(
        `${chalk.yellow("Already exists:")} ${chalk.cyan(baseName)}\n` +
          "Please choose a different name.",
        "Provider exists"
      );
    }

    const inputName = await p.text({
      message: "Provider name (used as settings.<name>.json)",
      placeholder: baseName,
      initialValue: baseName,
      validate: (v) => {
        if (!v) return "Name required";
        if (!isValidProviderName(v)) return "Use letters, numbers, _ or -";
        if (existingNames.has(v.toLowerCase())) return "Provider already exists";
        return undefined;
      },
    });

    if (p.isCancel(inputName)) return null;
    providerName = inputName;
  }

  let settings: Settings | null;

  if (preset !== "custom") {
    settings = await buildPresetSettings(preset as PresetKey);
    if (!settings) return null;
  } else {
    settings = await buildCustomSettings();
    if (!settings) return null;
  }

  const file = writeProfile(providerName, settings);

  p.note(
    `${chalk.green("Created")} ${path.basename(file)}\nLocation: ${file}`,
    "Provider profile added"
  );

  const makeActive = await p.confirm({
    message: `Switch to ${providerName} now?`,
    initialValue: true,
  });

  if (p.isCancel(makeActive)) return null;

  if (makeActive) {
    switchProfile(providerName);
    p.note(`Active provider is now: ${chalk.cyan(providerName)}`, "Switched");
  }

  return providerName;
}

async function buildPresetSettings(presetKey: PresetKey): Promise<Settings | null> {
  const template = PRESETS[presetKey];
  const env: Record<string, string> = { ...template.env };

  const apiKey = await p.password({
    message: "API key / token",
    mask: "•",
    validate: (v) => (!v ? "Token required" : undefined),
  });
  if (p.isCancel(apiKey)) return null;

  const settings: Settings = {
    apiKeyHelper: createApiKeyHelper(apiKey),
    env,
    model: template.model,
  };

  // Optional model override
  const model = await p.text({
    message: "Default model (optional, leave blank to keep preset defaults)",
    placeholder: DEFAULT_MODEL_HINTS[presetKey],
  });

  if (p.isCancel(model)) return null;

  if (model?.trim()) {
    const modelName = model.trim();
    for (const key of MODEL_ENV_KEYS) {
      if (key in env) {
        env[key] = modelName;
      }
    }
    settings.model = modelName;
  }

  return settings;
}

async function buildCustomSettings(): Promise<Settings | null> {
  const baseUrl = await p.text({
    message: "ANTHROPIC_BASE_URL (Anthropic-compatible endpoint; a trailing /v1 is fine)",
    placeholder: "https://example.com/v1",
    validate: (v) => (!v ? "Base URL required" : undefined),
  });
  if (p.isCancel(baseUrl)) return null;

  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.stripped) {
    p.log.info(
      `Using ${chalk.cyan(normalized.url)} (Claude Code adds /v1/messages itself, so the trailing /v1 was removed).`
    );
  }

  const token = await p.password({
    message: "API key / token",
    mask: "•",
    validate: (v) => (!v ? "Token required" : undefined),
  });
  if (p.isCancel(token)) return null;

  let model: string | symbol = "";
  const wantFetch = await p.confirm({
    message: "Fetch the model list from <base>/v1/models?",
    initialValue: true,
  });
  if (p.isCancel(wantFetch)) return null;

  if (wantFetch) {
    try {
      const ids = await fetchModels(normalized.url, token);
      if (ids.length > 0) {
        const picked = await p.select({
          message: "Default model",
          options: ids.slice(0, 50).map((id) => ({ value: id, label: id })),
        });
        if (p.isCancel(picked)) return null;
        model = picked;
      } else {
        p.log.warn("Endpoint returned no models.");
      }
    } catch (e) {
      p.log.warn(`Could not fetch models: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!model) {
    model = await p.text({
      message: "Default model id (optional)",
      placeholder: "qwen-plus / glm-4.6 / deepseek-chat ...",
    });
    if (p.isCancel(model)) return null;
  }

  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: normalized.url,
  };

  let modelName: string | undefined;
  if (model?.trim()) {
    modelName = model.trim();
    for (const key of MODEL_ENV_KEYS) {
      env[key] = modelName;
    }
  }

  return {
    apiKeyHelper: createApiKeyHelper(token),
    env,
    model: modelName,
  };
}

/**
 * Suggest saving current configuration as a profile
 */
async function suggestSavingCurrentConfig(): Promise<void> {
  const currentSettings = readSettings(getSettingsPath());
  if (!currentSettings) return;

  const baseUrl = currentSettings.env?.ANTHROPIC_BASE_URL || "";
  const providerHint = baseUrl.includes("z.ai")
    ? "zai"
    : baseUrl.includes("moonshot")
      ? "kimi"
      : baseUrl.includes("fireworks.ai")
        ? "fireworks"
        : baseUrl.includes("aliyun") || baseUrl.includes("dashscope")
          ? "qwen"
          : baseUrl.includes("minimax")
            ? "minimax"
            : baseUrl.includes("deepseek")
              ? "deepseek"
              : baseUrl === ""
                ? "anthropic"
                : "custom";

  p.note(
    `Base URL: ${chalk.cyan(baseUrl || "(native Anthropic)")}\n` +
      `Suggested name: ${chalk.green(providerHint)}`,
    "Current configuration detected"
  );

  const shouldSave = await p.confirm({
    message: "Would you like to save this as a profile?",
    initialValue: true,
  });

  if (p.isCancel(shouldSave) || !shouldSave) return;

  const providerName = await p.text({
    message: "Provider name",
    placeholder: providerHint,
    initialValue: providerHint,
    validate: (v) => {
      if (!v) return "Name required";
      if (!isValidProviderName(v)) return "Use letters, numbers, _ or -";
      return undefined;
    },
  });

  if (p.isCancel(providerName)) return;

  const file = writeProfile(providerName, currentSettings);
  p.note(
    `${chalk.green("Saved")} ${path.basename(file)}\nProvider: ${chalk.cyan(providerName)}`,
    "Profile created"
  );
}

/**
 * Main interactive menu
 */
export async function runInteractiveMenu(): Promise<void> {
  const profiles = listProfiles();
  const active = detectActiveProfile(profiles);

  // If no profiles exist or current config is unknown, suggest saving it
  if ((profiles.length === 0 || !active) && readSettings(getSettingsPath())) {
    await suggestSavingCurrentConfig();
    // Refresh profiles after potentially saving
    const updatedProfiles = listProfiles();
    const updatedActive = detectActiveProfile(updatedProfiles);

    // If still no active after suggesting, just show the menu
    return runInteractiveMenuWithProfiles(updatedProfiles, updatedActive);
  }

  return runInteractiveMenuWithProfiles(profiles, active);
}

/**
 * Display interactive menu with profiles
 */
async function runInteractiveMenuWithProfiles(
  profiles: ReturnType<typeof listProfiles>,
  active: string | null
): Promise<void> {
  // Get display name - use detected provider even without saved profile
  const displayName = getActiveProviderDisplay(profiles);
  const isSaved = active !== null;
  const activeLabel = isSaved
    ? chalk.cyan(displayName)
    : chalk.yellow(`${displayName} (not saved)`);
  p.note(`Current active provider: ${activeLabel}`, "claude-provider");

  const choice = await p.select({
    message: "Select a provider to activate",
    options: [
      ...profiles.map((pr) => ({
        value: pr.name,
        label: pr.name,
        hint: pr.name === active ? "active" : undefined,
      })),
      { value: "__add__", label: "✙ Add provider" },
      { value: "__account__", label: "👤 Add another Claude account" },
      { value: "__launchers__", label: "🚀 Start commands (claude <name>)" },
      { value: "__manage__", label: "⚙ Manage providers" },
      { value: "__exit__", label: "Exit" },
    ],
  });

  if (p.isCancel(choice) || choice === "__exit__") {
    p.outro("Bye!");
    return;
  }

  if (choice === "__add__") {
    await addProviderInteractive();
    p.outro("Done.");
    return;
  }

  if (choice === "__manage__") {
    await manageProvidersMenu(profiles, active);
    return;
  }

  if (choice === "__launchers__") {
    await launchersMenu(profiles.map((pr) => pr.name));
    return;
  }

  if (choice === "__account__") {
    const name = await p.text({
      message: "Name for the new Claude account profile",
      placeholder: "anthropic-secondary",
      validate: (v) => {
        if (!v) return "Name required";
        if (!isValidProviderName(v)) return "Use letters, numbers, _ or -";
        if (profiles.some((pr) => pr.name.toLowerCase() === v.toLowerCase())) return "Already exists";
        return undefined;
      },
    });
    if (p.isCancel(name)) return;
    try {
      for (const note of addClaudeAccount(name)) p.log.info(note);
      p.outro("Done.");
    } catch (e) {
      p.outro(`${chalk.red("Failed:")} ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
    return;
  }

  try {
    const { notes } = switchProfile(String(choice));
    for (const note of notes) p.log.info(note);
    p.outro(`✅ Switched to ${chalk.cyan(choice)}. Run ${chalk.bold("claude")} then /status.`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    p.outro(`${chalk.red("Failed:")} ${message}`);
    process.exitCode = 1;
  }
}

/**
 * Create, change and remove start commands (launchers).
 */
async function launchersMenu(profileNames: string[]): Promise<void> {
  const all = readLaunchers();
  const pick = await p.select({
    message: "Start commands",
    options: [
      ...Object.entries(all).map(([name, l]) => ({
        value: name,
        label: `claude ${name}`,
        hint: describeLauncher(l),
      })),
      { value: "__new__", label: "✙ New start command" },
      { value: "__shell__", label: "Enable `claude <name>` in my shell" },
      { value: "__back__", label: "← Back" },
    ],
  });
  if (p.isCancel(pick) || pick === "__back__") return runInteractiveMenu();

  if (pick === "__shell__") {
    try {
      for (const { file, result } of installShellIntegration()) p.log.success(`${result}: ${file}`);
      p.log.info("Open a new terminal, then: claude <name>");
    } catch (e) {
      p.log.error(e instanceof Error ? e.message : String(e));
    }
    return launchersMenu(profileNames);
  }

  if (pick !== "__new__") {
    const action = await p.select({
      message: `claude ${pick}`,
      options: [
        { value: "change", label: "Change" },
        { value: "remove", label: "Remove" },
        { value: "__back__", label: "← Back" },
      ],
    });
    if (p.isCancel(action) || action === "__back__") return launchersMenu(profileNames);
    if (action === "remove") {
      removeLauncher(String(pick));
      p.log.success(`Removed claude ${pick}`);
      return launchersMenu(profileNames);
    }
  }

  const existing = pick === "__new__" ? undefined : all[String(pick)];
  let name = existing ? String(pick) : "";
  if (!existing) {
    const input = await p.text({
      message: "Command name (you will type: claude <name>)",
      placeholder: "keno",
      validate: (v) => {
        if (!v) return "Name required";
        if (!isValidProviderName(v)) return "Use letters, numbers, _ or -";
        if (all[v]) return "Already exists";
        return undefined;
      },
    });
    if (p.isCancel(input)) return launchersMenu(profileNames);
    name = input;
  }

  const profile = await p.select({
    message: "Profile to start (its login/provider)",
    initialValue: existing?.profile,
    options: profileNames.map((n) => ({ value: n, label: n })),
  });
  if (p.isCancel(profile)) return launchersMenu(profileNames);

  const home = await p.confirm({
    message: "Use the normal ~/.claude login and data? (No = own config dir, e.g. for a second account)",
    initialValue: existing?.home ?? false,
  });
  if (p.isCancel(home)) return launchersMenu(profileNames);

  const inference = await p.select({
    message: "Send model requests through another profile? (keeps Remote Control on this login)",
    initialValue: existing?.inference ?? "__none__",
    options: [
      { value: "__none__", label: "No" },
      ...profileNames.filter((n) => n !== profile).map((n) => ({ value: n, label: n })),
    ],
  });
  if (p.isCancel(inference)) return launchersMenu(profileNames);

  try {
    const { shim, shimConflict } = saveLauncher(
      name,
      {
        ...existing,
        profile,
        home: home || undefined,
        inference: inference === "__none__" ? undefined : inference,
      },
      { create: !existing }
    );
    p.log.success(`claude ${name}: ${describeLauncher(readLaunchers()[name])}`);
    p.log.info(`Also available as "cpr launch ${name}"${shim ? ` and ${path.basename(shim)}` : ""}.`);
    if (shimConflict) p.log.warn(`${shimConflict} already exists and is not ours; left untouched.`);
  } catch (e) {
    p.log.error(e instanceof Error ? e.message : String(e));
  }
  return launchersMenu(profileNames);
}

/**
 * Manage providers menu (edit, delete)
 */
async function manageProvidersMenu(
  profiles: ReturnType<typeof listProfiles>,
  active: string | null
): Promise<void> {
  if (profiles.length === 0) {
    p.note("No providers to manage.", "Manage Providers");
    p.outro("Done.");
    return;
  }

  const provider = await p.select({
    message: "Select a provider to manage",
    options: [
      ...profiles.map((pr) => ({
        value: pr.name,
        label: pr.name,
        hint: pr.name === active ? "active" : undefined,
      })),
      { value: "__back__", label: "← Back" },
    ],
  });

  if (p.isCancel(provider) || provider === "__back__") {
    // Return to main menu
    return runInteractiveMenu();
  }

  const providerName = String(provider);

  const action = await p.select({
    message: `What do you want to do with "${providerName}"?`,
    options: [
      { value: "edit", label: "Edit provider" },
      { value: "duplicate", label: "Duplicate" },
      { value: "delete", label: "Delete" },
      { value: "__back__", label: "← Back" },
    ],
  });

  if (p.isCancel(action) || action === "__back__") {
    return manageProvidersMenu(profiles, active);
  }

  if (action === "duplicate") {
    const newName = await p.text({
      message: `Name for the copy of "${providerName}"`,
      initialValue: `${providerName}-copy`,
      validate: (v) => {
        if (!v) return "Name required";
        if (!isValidProviderName(v)) return "Use letters, numbers, _ or -";
        if (profiles.some((pr) => pr.name.toLowerCase() === v.toLowerCase())) return "Already exists";
        return undefined;
      },
    });
    if (!p.isCancel(newName)) {
      try {
        const file = duplicateProfile(providerName, newName);
        p.note(`${chalk.green("Created")} ${path.basename(file)}`, "Profile duplicated");
      } catch (e) {
        p.log.error(e instanceof Error ? e.message : String(e));
      }
    }
    const updated = listProfiles();
    return manageProvidersMenu(updated, detectActiveProfile(updated));
  }

  if (action === "edit") {
    const filePath = getProfileFilePath(providerName);
    const platform = os.platform();
    const editor = platform === "win32" ? "notepad" : "nano";
    
    p.note(`Opening ${chalk.cyan(path.basename(filePath))} in ${editor}...`, "Edit Provider");

    const child = spawn(editor, [filePath], { stdio: "inherit" });
    
    child.on("error", () => {
      console.log(chalk.yellow(`Could not open ${editor}. You can manually edit:`));
      console.log(chalk.dim(filePath));
    });

    child.on("close", () => {
      p.outro("Done editing.");
    });
    return;
  }

  if (action === "delete") {
    if (providerName === active) {
      p.note(
        `${chalk.yellow("Warning:")} This is your currently active provider.`,
        "Delete Provider"
      );
    }

    const confirmDelete = await p.confirm({
      message: `Are you sure you want to delete "${providerName}"?`,
      initialValue: false,
    });

    if (p.isCancel(confirmDelete) || !confirmDelete) {
      // Return to manage menu
      const updatedProfiles = listProfiles();
      const updatedActive = detectActiveProfile(updatedProfiles);
      return manageProvidersMenu(updatedProfiles, updatedActive);
    }

    try {
      deleteProfile(providerName);
      p.note(`${chalk.green("Deleted")} ${providerName}`, "Provider Removed");
      // Return to manage menu
      const updatedProfiles = listProfiles();
      const updatedActive = detectActiveProfile(updatedProfiles);
      return manageProvidersMenu(updatedProfiles, updatedActive);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      p.outro(`${chalk.red("Failed:")} ${message}`);
      process.exitCode = 1;
    }
    return;
  }
}
