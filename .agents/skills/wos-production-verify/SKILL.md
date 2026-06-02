---
name: wos-production-verify
description: Verify production releases without changing files.
---

# wos-production-verify

Use this for every production release check.

- `/health` returns 200
- dashboard loads
- leads hydrate
- Open Lead works
- search works
- pagination works
- AI Deal Analyzer still opens
- bad addresses stay blocked
- valid links still work
- ARV and MAO stay locked without evidence
- no runtime console errors

Verification tasks should not change files.
If no files changed, say "safe to continue".

