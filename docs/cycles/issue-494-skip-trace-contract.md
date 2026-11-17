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

## Local Pure Preflight Slice

BLOCKED on frozenfcc78b0 after FIRST306-file full209/97/0, naturalexit1,
600s/file. All timings and exact handoff question in proof-494-skip-trace-preflight.
NewtestPASS0.88/registrytestPASS0.89 do not waive full. No unchangedretry/fullrerun/
CI/push/PR/release. Prior matching failed names do not establish common cause.

modules/research/paid-skip-trace-preflight.js is an UNREGISTERED additive reader;
no existing provider, guard, execute, route, env or legacy worker is changed.
It snapshots only known registry identifiers, never calls provider methods or
reads actual env, owner data, authorization or spend records.

forecastBudget accepts exact own data fields daily_cap_microusd, spent_microusd,
reserved_microusd, max_unit_cost_microusd and units. All amounts are nonnegative
safe integers, cap/unit cost positive, units1-100. BigInt intermediate arithmetic
prevents silent rounding; unsafe result magnitudes reject. Reservations and
entire projected request count against the cap, exact cap is allowed, prior
over-cap commitment remains unavailable. Unknown values reject, never become0.
This is arithmetic on supplied numbers, not a vendor quote or financial record.

describeCapability accepts provider_id, strict boolean switch_on and nullable
budget. Unknown identifiers are not echoed. Results ALWAYS enabled:false and
execution_available:false, with stable blockers for disabled/unknown provider,
switch/budget, unverified quote/subject/owner authorization and disabled adapter.
Affordable arithmetic plus switch:true never authorizes paid execution. Output
is detached. No fictitious approval reference or ready-to-spend state is invented.
Future verified identity/quote/authorization adapters require separate scoped
implementation; this model deliberately cannot stand in for them.

New paid-skip-trace-preflight.test.js FIRSTPASS on generated inputs: cap edges,
reserved/projected amounts, overflow/fractions/strings/NaN/negative/null, exact
keys, accessors/prototypes/symbols, unknown identifiers, detached results, input/
registry preservation and zero provider/network/filesystem/ambient-clock calls.
No actual provider method, legacy module, production record or credential used.
First full gate still required; no hosted CI/push/PR/release acceptance claim.
Whole494 and parent backlog incomplete; owner-card UI/activation not implemented.
