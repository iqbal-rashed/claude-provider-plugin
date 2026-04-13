import { Command } from "commander";
import chalk from "chalk";
import { listProfiles, detectActiveProfile, switchToProvider } from "./profiles.js";
import { runInteractiveMenu } from "./interactive.js";
import { mcpServer } from "./mcp.js";

/**
 * Display list of installed providers
 */
function showProviderList(): void {
  const profiles = listProfiles();

  console.log(chalk.bold("Installed providers:"));

  if (!profiles || profiles.length === 0) {
    console.log(chalk.dim("  No providers installed. Run claude-provider to add one."));
    return;
  }

  const active = detectActiveProfile(profiles);

  for (const profile of profiles) {
    const marker = profile.name === active ? chalk.green(" (active)") : "";
    console.log(` - ${profile.name}${marker}`);
  }
}

/**
 * Direct switch to a provider by name
 */
function directSwitch(name: string): void {
  const profiles = listProfiles();
  const exists = profiles.some((p) => p.name.toLowerCase() === name.toLowerCase());

  if (!exists) {
    console.error(chalk.red(`Provider not installed: ${name}`));
    console.error(chalk.dim('Tip: run "claude-provider" or "cpr" to add providers interactively.'));
    process.exit(1);
  }

  // Find exact case-insensitive match
  const profile = profiles.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!profile) {
    console.error(chalk.red(`Provider not found: ${name}`));
    process.exit(1);
  }

  switchToProvider(profile.name);
  console.log(`✅ Switched to ${chalk.cyan(profile.name)}. Run "claude" then /status.`);
}

/**
 * Create and configure the CLI program
 */
export function createProgram(): Command {
  return new Command()
    .name("claude-provider")
    .description("CLI tool to switch between Claude Code API providers")
    .version("0.0.6")
    .argument("[provider]", "provider name (e.g. kimi, zai, qwen, minimax, deepseek)")
    .option("-l, --list", "list installed providers");
}

/**
 * Run the CLI application
 */
export async function runCli(): Promise<void> {
  const program = createProgram();
  program.parse(process.argv);

  const opts = program.opts<{ list?: boolean }>();
  const provider = program.args[0];

  if (opts.list) {
    showProviderList();
    return;
  }

  if (provider == "mcp") {
    return mcpServer();
  }

  if (provider) {
    directSwitch(provider);
    return;
  }

  await runInteractiveMenu();
}

runCli().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
