# WholesaleOS — Development Rules

## Core Principles

**Incremental changes only.**
Every fix is a targeted patch. One problem, one fix. Never rewrite a working section to solve an unrelated issue.

**Preserve working logic.**
Before touching any function, confirm it is actually broken. If it works, leave it alone. Working code is not a starting point for cleanup.

**Do not rebuild modules.**
`server.js`, `db.js`, `ai.js`, and `dashboard/index.html` are production files. Do not replace them. Patch via `dashboard/patch_v4.js` and route additions only.

**Avoid full-file rewrites.**
If a fix requires more than ~50 lines to be changed, stop and identify the real root cause. Rewrites introduce regressions.

**Keep UI state consistent.**
`APP.leads`, `APP.filtered`, `APP.buyers`, and `APP.page` are the single source of truth. Never create a parallel copy of leads. Never mutate state during a render cycle.

**Validate each lead individually.**
Deal math (MAO, spread, assignment fee, buyer profit, equity) must be computed per-lead, never as a global average or cached across all leads. Use `calcDealMath(lead)` per instance.

**Minimize repeated computations.**
Cache API results with a TTL (10 min default). Skip re-fetching leads that have not changed. Batch AI calls when generating outreach. Never call the same endpoint twice in the same render cycle.

**Minimize token usage.**
Do not re-evaluate every lead on every render. Compute only what changed. Use the `window._cache` store. Reuse message templates before calling AI. Only call AI for validated deals.
