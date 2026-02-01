---
description: Add a new provider profile with preset or custom configuration (example: /provider:add kimi)
---

Parse "$ARGUMENTS" to get the provider preset and optional API key.

Supported presets: anthropic, kimi, qwen, deepseek, minimax, zai

If "$ARGUMENTS" contains a preset name only (e.g., "kimi"):
- Call MCP tool `provider.list_presets` to get preset details
- Ask the user for their API key for that provider
- Then call `provider.add_profile` with the preset and API key

If "$ARGUMENTS" contains "custom":
- Ask the user for: base URL, API key, and model name
- Call `provider.add_profile` with type "custom" and the provided values

After creating the profile, ask if the user wants to switch to it.
