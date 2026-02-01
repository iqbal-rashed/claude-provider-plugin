---
description: Save current settings.json as a named profile (example: /provider:snapshot kimi)
---

If "$ARGUMENTS" is empty or not provided:
- Ask the user what name they want to give to this profile snapshot
- Wait for their response before proceeding

Once you have the profile name (from $ARGUMENTS or user input):
- Call MCP tool `provider.snapshot_current` with the profile name

Print the result.
