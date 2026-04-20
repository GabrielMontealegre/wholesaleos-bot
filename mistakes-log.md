# WholesaleOS — Mistakes Log & Rules
## Purpose
This file documents every deployment mistake made during WholesaleOS development.
Claude must read this before every push. These rules are permanent and non-negotiable.

---

## RULE 1 — NEVER use unescaped apostrophes in single-quoted JS strings
**Date:** 2026-04-20
**Crash:** Railway healthcheck failure — server.js crashed on boot
**Root cause:** `opener:'Hi, I'm a local...` — apostrophe in I'm broke the string literal
**Fix:** Changed to `'Hi, I am a local...'` (avoid contraction) OR use double quotes `"Hi, I'm..."`
**Prevention rule:**
- Before every server.js push, search for pattern: `'[^']*'[a-z][^']*'` in new code
- NEVER write contractions (I'm, don't, it's, you're, we'll) inside single-quoted strings
- Always use double quotes when the string contains apostrophes
- Always use: `var s = "Hi, I'm ready";` NOT `var s = 'Hi, I'm ready';`

---

## RULE 2 — NEVER call renderLeads/renderFn with no args when fn takes parameters
**Root cause:** `origFn()` called without args when fn required lead object
**Prevention:** Always pass: `origFn.call(null, ...args)` in wrappers

## RULE 3 — NEVER stack more than one wrapper on same function
**Root cause:** Chained wrappers caused infinite loops
**Prevention:** Replace, don't chain. Check if window.X is already patched before wrapping.

## RULE 4 — ALWAYS place specific routes BEFORE wildcard :id routes
**Root cause:** `app.get('/api/leads/validate')` returning 404 because `app.get('/api/leads/:id')` matched first
**Prevention:** Routes like /api/leads/validate, /api/leads/rebuild-links MUST be registered BEFORE /api/leads/:id

## RULE 5 — NEVER push server.js without running a syntax audit first
**Prevention checklist before every server.js push:**
1. Count backticks — must be even number
2. Search for unescaped apostrophes in single-quoted strings
3. Verify no truncated routes (missing closing }); )
4. Verify all new routes have proper function() or arrow syntax
5. Verify db.writeDB exists before calling it
6. Test via dry-run API call if possible

## RULE 6 — NEVER use optional chaining (?.) in server code without verifying Node version
**Prevention:** Use `obj && obj.prop` instead of `obj?.prop` for max compatibility

## RULE 7 — Always use function() in forEach/map callbacks in server.js (not arrows)
**Prevention:** Arrow functions are fine in Node 14+ but `function()` is always safe

## RULE 8 — NEVER build the new dashboard in a single massive JS block
**Prevention:** Break patches into small named functions. Test each one independently.

## RULE 9 — ALWAYS check for route conflicts before adding new routes
**Prevention:** Search for existing routes with same path before adding new ones

## RULE 10 — ALWAYS run dry_run:true before any destructive DB operation
**Prevention:** POST /api/leads/validate-fix must always be called with dry_run:true first

---

## Deployment Checklist (run before every push)
- [ ] Backtick count is even
- [ ] No unescaped apostrophes in single-quoted strings  
- [ ] Specific routes placed BEFORE wildcard :id routes
- [ ] All new functions have proper syntax
- [ ] db.writeDB called correctly with full dbData
- [ ] No duplicate route registrations
- [ ] Tested endpoint logic mentally before push
