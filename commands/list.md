---
description: List installed settings profiles and show which one is currently active
---

Call the MCP tool `provider.list_profiles` and display the result to the user.

Show the profiles in a clear format with the active one marked.

If no profiles are found:
- Call MCP tool `provider.get_profile_info` to detect the current provider from settings.json
- Suggest saving the current configuration as a profile using the detected provider name (e.g., "kimi", "anthropic", "zai", etc.)
- Ask the user if they want to save the current settings as a profile with the suggested name
- If yes, call `provider.snapshot_current` with the suggested name
