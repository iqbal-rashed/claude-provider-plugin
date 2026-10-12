---
description: Add another Claude subscription account (example: /provider:add-account anthropic-secondary)
---

If "$ARGUMENTS" is empty, ask the user for a profile name (suggest `anthropic-secondary`).

Call MCP tool `provider.add_claude_account` with that name, then tell the user:
- the current login was saved to the active profile
- they must exit Claude Code, run `claude`, and `/login` with the second account
- afterwards `/provider:switch <name>` swaps between the accounts automatically
