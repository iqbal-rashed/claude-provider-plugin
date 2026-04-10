import chalk from "chalk";
import * as p from "@clack/prompts";
import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import { PRESETS, MODEL_ENV_KEYS, DEFAULT_MODEL_HINTS } from "./constants.js";
import type { PresetKey } from "./constants.js";
import type { Settings } from "./types.js";
import { createApiKeyHelper, isValidProviderName, getSettingsPath, readSettings } from "./utils.js";
import {
  listProfiles,
  detectActiveProfile,
  switchToProvider,
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
    switchToProvider(providerName);
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
    message: "ANTHROPIC_BASE_URL",
    placeholder: "https://example.com/anthropic",
    validate: (v) => (!v ? "Base URL required" : undefined),
  });
  if (p.isCancel(baseUrl)) return null;

  const token = await p.password({
    message: "API key / token",
    mask: "•",
    validate: (v) => (!v ? "Token required" : undefined),
  });
  if (p.isCancel(token)) return null;

  const model = await p.text({
    message: "Default model id (optional)",
    placeholder: "qwen-plus / glm-4.6 / deepseek-chat ...",
  });
  if (p.isCancel(model)) return null;

  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: baseUrl.trim(),
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

  try {
    switchToProvider(String(choice));
    p.outro(`✅ Switched to ${chalk.cyan(choice)}. Run ${chalk.bold("claude")} then /status.`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    p.outro(`${chalk.red("Failed:")} ${message}`);
    process.exitCode = 1;
  }
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
      { value: "delete", label: "Delete" },
      { value: "__back__", label: "← Back" },
    ],
  });

  if (p.isCancel(action) || action === "__back__") {
    return manageProvidersMenu(profiles, active);
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
