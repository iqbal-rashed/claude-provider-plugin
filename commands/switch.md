---
description: Switch to a profile (example: /provider:switch kimi)
---

Use the argument text as the profile name: "$ARGUMENTS".

Call MCP tool `provider.switch_profile` with:
- profile: "$ARGUMENTS"

Then tell the user:
- whether the switch succeeded
- and that they should restart Claude Code for the new backend/model config to take effect.
