---
name: wos-release-discipline
description: Keep implementation, verification, commits, and pushes under strict release control.
---

# wos-release-discipline

Use this for implementation, verification, release, and deployment work.

- Do not commit or push unless the user explicitly asks for that step.
- Verification-only tasks never create commits.
- If no files changed, say "safe to continue", not "safe to push".
- If files changed, report the exact files and wait for Gabriel before push.
- Keep changes scoped to the task; do not widen the release.

