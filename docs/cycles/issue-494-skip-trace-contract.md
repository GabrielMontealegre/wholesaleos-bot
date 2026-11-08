# 494 Skip-Trace Contract Inventory - Source Only

2026-11-08, fetched main f2294a7. Already-read architect request: paid skip trace
behind registry and switch; owner enablement remains required. No paid provider,
credentials, production JSON, actual owner lookup, source scraping, route, cron,
business write, env setting or deployment invoked. This is inventory, not feature
acceptance or permission to enable anything. Branch from main plus owned docs/
proof only; blocked voice37c36f2, batch77608f7 and 455 runtime/tests not carried.

## Existing Boundaries

- modules/research/paid-skip-trace-provider.js has two disabled placeholder
  entries, explicit env opt-in and cap variable names, expected fields and
  unverified quote metadata. These source strings are NOT verified vendor names,
  current prices, available capabilities, credentials or owner budget approval.
- describePlan always reports enabled:false, network_calls:0, preview_only:true,
  should_ingest:false; it describes supplied row fields only. No runtime caller
  of this paid module was found outside its unit test. execute always throws
  paid_skip_trace_execute_disabled. No HTTP adapter or registry-backed owner-card
  action exists in these traced paths.
- assertMayExecute checks supplied provider enabled:true, exact env string true,
  positive cap and spentToday below cap. It does not establish a verified unit
  quote, projected per-request cost, authoritative spend accounting, owner
  authorization receipt or source-bound subject identity. This is a FUTURE gate
  integration gap, not evidence of a paid call or spend: execute is disabled.
- paid-provider-fallback-registry.js is a DIFFERENT lane. It rejects unverified
  placeholder/max-row-cost metadata and checks projected cap and a budget flag.
  Its flag is not itself a human approval receipt. Do not substitute fallback
  or comp env variables for the paid skip-trace switch.
- modules/agents/skip-trace-agent.js is a separate legacy browser/DB worker with
  free-people-search functions and runSkipTraceAgent export. Do not require or
  invoke it as the new paid adapter. Source server registrations include legacy
  per-lead and batch POST paths plus background-ingestion-guarded crons. Global
  authorization, actual production env, runtime reachability and cron activity
  were NOT verified; source declarations do not prove active production jobs.
- reviewed-deal/source-queue tests explicitly prohibit using legacy agents in
  their bounded paths. A new owner-card button must not call these legacy routes
  or reinterpret person names/taxpayer clues as verified person identity.

## Conservative Next Boundary

ASSUMED under AGENTS3: next independent scope is a pure fail-closed capability/
budget validation contract with synthetic inputs, not an executable provider,
new production route, paid enablement or owner-card lookup. Treat unverified
quotes, missing/ambiguous subject binding, unknown/nonfinite/negative spend,
unverified authorization and insufficient projected budget as unavailable.
Do not invent a vendor quote, owner approval or working adapter. Existing
execute must remain disabled; do not add network or credential reads.

Before UI integration, trace an explicit source-bound owner/record target and
its privacy boundary. Reported assistant who/name/address is not canonical owner
identity;503 may govern that binding. Owner-only activation/budget/provider
selection remains separate. Do not weaken auth, introduce generic retries,
change env/Railway settings, replace legacy routes or rewrite ingestion.

No new test/full gate/CI/push/PR/release. Whole494 and parent backlog incomplete.
