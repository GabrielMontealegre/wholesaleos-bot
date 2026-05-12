# WholesaleOS — Known Failures & Operational Lessons

## 2026-05-12 — Phase 3C — Railway 502 on startup

**Cause:** Eager `require()` of connector modules in `enrichment-queue.js` top-level.
`server.js` eagerly requires `enrichment-queue.js`, which eagerly required 5 connector files.
Any failure in any connector → entire startup chain crashes → 502.

**Fix:** Roll back to inline fetch functions. No top-level connector imports.

**Prevention rules:**
- Never put external module requires at top-level of files server.js imports
- Use `try { return require(path) } catch(e) {}` factory pattern for optional modules
- Deploy one connector at a time with health check after each
- Test require() paths exist before deploying: connector filenames must exactly match

---

## Railway startup crash patterns

- `Cannot find module './modules/enrichment/connectors/X'` → eager require of non-existent file
- Multiple rapid pushes → Railway queues deploys; a broken intermediate deploy can persist
- Playwright in Dockerfile → builds take 3-5 minutes; don't poll health until 5 min elapsed

---

## MCP disconnect causes

- Large file operations (>600KB) cause tab/tool timeout
- Rapid repeated tool calls after timeout trigger extension freeze
- Recovery: navigate tab to dashboard URL, reinitialize session vars

---

## Stale SHA conflicts

- Always ghGet immediately before ghPut in same call
- Never reuse SHA from prior session
