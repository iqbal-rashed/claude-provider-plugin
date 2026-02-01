---
description: Add a new provider profile with preset or custom configuration (example: /provider:add kimi)
---

Supported presets: anthropic, kimi, qwen, deepseek, minimax, zai

If "$ARGUMENTS" is empty or not provided:
- First call MCP tool `provider.list_presets` to show available presets
- Ask the user which preset they want to use (or "custom" for custom configuration)
- Wait for their response before proceeding

If the preset name is provided (e.g., "kimi"):
- Call MCP tool `provider.list_presets` to get preset details
- Ask the user for their API key for that provider
- Then call `provider.add_profile` with the preset and API key

If the user chooses "custom":
- Ask the user for: base URL, API key, and model name
- Call `provider.add_profile` with type "custom" and the provided values

After creating the profile, ask if the user wants to switch to it.
