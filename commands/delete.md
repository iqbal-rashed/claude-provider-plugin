---
description: Delete a provider profile (example: /provider:delete kimi)
---

If "$ARGUMENTS" is empty or not provided:
- First call MCP tool `provider.list_profiles` to get available profiles
- Show the user the list of available profiles
- Ask the user which profile they want to delete
- Wait for their response before proceeding

Once you have the profile name (from $ARGUMENTS or user input):
- Confirm with the user before deletion if the profile is currently active
- Call MCP tool `provider.delete_profile` with the profile name

Print the result.
