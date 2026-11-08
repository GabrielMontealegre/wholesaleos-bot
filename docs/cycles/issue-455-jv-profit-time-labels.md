# 455.4B5 JV and Profit Date Labels

Architect handoff: https://github.com/GabrielMontealegre/wholesaleos-bot/issues/497

## Writer/Reader Trace

modules/deals/jv-workflow.js apply/review writes happened_at normalized from
explicit operator input and recorded_at from context.now; event/review readers
validate ordering, source, signing and stage prerequisites. The view projects
these events/reviews. dashboard/wos-jv-workflow.js renders happened_at and
recorded_at in stage history and happened_at in signature-review history.
No action input conversion, signing date, closing day or backend writer changed.

modules/records/pipeline-reports.js validate/upsert retains captured_at from
an exact-reference source report; project creates field_provenance for amounts.
modules/deals/match-profit.js passes this provenance through forMatch into
reviewed-deal/buyer projections. dashboard/wos-match-profit.js renders that
captured_at beside each safe HTTPS reported-source link. No money, provenance,
eligibility, review or funds gate changed. This is not a source-date resolver.

The match-profit asset loads before shared clock3, but its markup function runs
later through deal/buyer renderers. The new helper looks up clock at render
time; no startup dependency or script reordering. Missing clock is unconfirmed.
Only match-profit cache1->2 and JV workflow cache2->3 changed; sharedclock3 unchanged.

## Implementation and Positive Proof

Both helpers reuse strict recorded formatTime with UTC-7 recent weekday/time,
old month/day, different year, invalid/future => Time not confirmed. No numeric
slash parsing, date-only midnight invention or browser-local fallback.

New jv-profit-time-labels.test.js FIRSTPASS,1366/400/412 Tokyo,11datecases,
UTC-7 midnight, delayed shared-clock loading, missing clock, actual helper
rendering, immutable synthetic DTOs, literal source prose, unchanged money,
three source links,44px profit links/no overflow/no writes/external/errors.
Six positive isolated metadata-region images inspected under
docs/screens/2026-11-07-jv-profit-time-labels. These are renderer display fixtures,
not a validated stage-history chain or signed full-dashboard verification.

## Honest Failed Gates

Existing match-profit-ui.test.js focused naturally exit1, wall4.3777154s,
page.goto ERR_NETWORK_ACCESS_DENIED at tests/match-profit-ui.test.js:13:48.
Same failure as original08b59b7 full gate (2.69s). Do not bypass or retry denial.
Its imported reviewed-deal/pipeline/buyer-context/profit pure assertions passed.

Existing jv-signing-review-ui.test.js focused naturally exit1, wall2.9737051s,
TypeError fetch failed at scripts/verify-jv-signing-review.js:15:31 first fetch.
Same failure as original08b59b7 full gate (2.31s). Its imported JV workflow and
signing-review pure assertions passed. Wall values are not full-gate timings.
Both historical rows remain in the original306-row failed full proof.

Cause unproven; no environment attribution, unchanged retry, auth/assertion/
fixture change or waiver. Slice BLOCKED / needs-architect under D065c. Full
suite on this candidate NOT RUN after repeated focused failures; no push/PR/
CI/merge/deploy/production verification. Prior template/device runtime excluded.

## Architect Question

Bound a real fix for repeated browser navigation and signed-route first-fetch
failures while preserving all existing source, auth, signing, stage, money,
no-send, no-write, escaping and layout assertions. These failures now block
device, template and JV/profit independent slices; AGENTS4 calls for examining
a rule/blocker that spans items. Recommendation: safe fixture/startup/transport
observability using synthetic error classes only, then one genuinely changed
head gate. Do not assume one shared cause, bypass denial, replace routes/UI
coverage with route-fulfilled components, or retry unchanged code for green.
