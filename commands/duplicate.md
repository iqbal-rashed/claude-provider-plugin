---
description: Duplicate a profile (example: /provider:duplicate kimi kimi-work)
---

Parse "$ARGUMENTS" as `<source> <new-name>`. If either is missing, call MCP tool `provider.list_profiles`, show the profiles, and ask the user for the missing value.

Then call MCP tool `provider.duplicate_profile` with `source` and `name`. Only set `withCredentials` if the user explicitly asks to copy the saved Claude login.

Tell the user whether it succeeded.
