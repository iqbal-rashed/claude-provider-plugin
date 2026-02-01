---
description: Switch to a profile (example: /provider:switch kimi)
---

If "$ARGUMENTS" is empty or not provided:
- First call MCP tool `provider.list_profiles` to get available profiles
- Show the user the list of available profiles
- Ask the user which profile they want to switch to
- Wait for their response before proceeding

Once you have the profile name (from $ARGUMENTS or user input):
- Call MCP tool `provider.switch_profile` with the profile name

Then tell the user:
- whether the switch succeeded
- and that they should restart Claude Code for the new backend/model config to take effect.
