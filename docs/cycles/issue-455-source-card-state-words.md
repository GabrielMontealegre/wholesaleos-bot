# 455 Compact Source-Card Status Words

Handoff: https://github.com/GabrielMontealegre/wholesaleos-bot/issues/501

## Trace and Scope

modules/research/lead-operations-state.js defines ROW_STATES, CONTACT_STATES and
PROPERTY_STATES. rowStateForDeal/contactStateForDeal/propertyStateForDeal derive
their exact states and reasons from canonical identity/provenance, route, contact,
comp, market-policy and lifecycle checks. deal-board-queue-service initial row
projection and repaired snapshot output set these fields through those helpers.
free-public-deal-board QUALITY_BUCKETS supplies the five quality fallback values.
No backend writers, state decisions, readiness, route roles or source gates changed.

Active wos-public-deals rowCard is used by queue panels, grouped rows and embedded
full records; dashboard/Deal Finder mount/render callers are traced in the source-
day contract note. Changes apply only to title/status captions and their source
detail disclosure. Other raw state comparisons in controls, urgency, grouping,
sorting and count chips remain exact and unchanged. Official/evidence sections,
summary labels and technical value/freshness/action wording are NOT all repaired;
this is not whole455.8 or a redesign.

## Implementation

Field-scoped fixed labels cover the canonical row/contact/property enums and
quality fallback, without inference from reasons or other prose. Unknown, missing,
prototype-like, wrong-type or wrong-field codes say Status not confirmed. A
property field cannot borrow a phone-ready contact label. Display captions retain
the exact adjacent reasons. Native Source status details preserves raw combined,
contact and property codes and the original combined reason, escaped, with a44px
summary supporting click and Enter. Identity/data-queue-key, source text, payloads,
buttons, conditions, next actions, money and all dates unchanged.

Only public-deals asset cache57->58. Scope uses the existing card, not native
Deals or a new backend abstraction. Badge gets inline-block wrapping so the
400px label stays together; original first images retained externally.

## Positive Checks

New source-card-state-words.test.js PASS: actual canonical enums, quality fallback,
unknown/prototype/wrong-field/type guards, exact codes/reasons/identity/action
preservation, immutable input and no network/write effects. New actual-renderer
UI testPASS1366/400/412, disclosure click/keyboard,44px/no overflow, wrong-field/
unknown cases, no nonGET/external/errors. Six final images inspected under
docs/screens/2026-11-07-source-card-words. These are isolated synthetic renderer
checks, not signed full-dashboard or production proof. Changed badge-wrap and
kind-type checks passed; no failed new-test run or unchanged retry.

## Existing Test Failures: Honest Record

FIRST dashboard-public-deal-queue.test.js focused naturally exit1,
wall9.9445329s, ERR_ASSERTION line874: expected public-deals cache57. Actual
index uses58 for this candidate. Raw retained externally as
455-source-card-first-existing-queue.txt. Under AGENTS4 incidental cache guard
policy, changed only line874 expected57->58, retaining the same assertion/message.

FIRST corrected-cache check naturally exit1, wall3.6137328s, ERR_ASSERTION
line931. Its message says current secure helper workbench, but the actual guard
duplicates the public-deals cache57 assertion. No separate helper asset was
changed. Raw455-source-card-corrected-cache-existing-queue.txt retained. Both
causes are directly explained by the duplicate hard-coded old asset version;
this is not an environment attribution or explanation of prior full-suite failures.

Same test has now failed twice. Under D065c the slice is LOCAL/BLOCKED; no
further guard edit, unchanged retry, skip, waiver, full/CI/PR/push/merge/deploy or
production verification. All other existing assertions remain unchanged. Prior
97-failure full gates and their unproven causes remain independent and retained.

## Architect Handoff

Please bound continuation after the two failures. Recommendation: account for
both duplicate asset guards in one reviewed incidental-scaffolding change to the
current58 asset while preserving their intent and all behavioral/security checks,
then permit one genuinely changed-head gate under D065c. Do not change helper
authorization, source fields, canonical state, readiness or any safety assertion.
Do not retry the unchanged failed test/head. No owner relay or business action
is needed; this is a technical release-gate handoff, not a runtime cause mystery.
