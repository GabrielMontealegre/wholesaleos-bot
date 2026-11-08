# 455.4B4 Template Date Labels

Architect handoff: https://github.com/GabrielMontealegre/wholesaleos-bot/issues/496

## Trace

- modules/email/template-approvals.js save writes append-only reviewed template
  recorded_at from server now and appends the activity record. validTemplate
  validates its original timestamp; list projects recorded_at/captured_at.
- GET/POST registration is through modules/records/conversation-routes.js;
  operator-profile expansion supplies a separate draft preview, not provenance.
- dashboard/wos-email-templates.js renders the selected template recorded_at.
  modules/email/buyer-messages.js consumes policy only, not this date display.
- dashboard/index.html loads shared clock3 before templates; only template
  cache2->3 changed. Shared clock, backend writers and policy remain unchanged.

## Change

Reuse shared strict recorded formatTime. Recent => weekday/time; old => month/
day with differing year. Future/invalid/missing-clock => Time not confirmed.
No date-only or numeric-slash inference. No source text, operator, template
subject/body, version, digest, approval, send, profile, auth or writer changes.
No existing assertion changed. New synthetic test includes 11 date cases,
Tokyo timezone, UTC-7 midnight boundaries, no source mutation or network/write,
session-clear check and minimum44px controls/no overflow at1366/400/412.

## Honest Gates

New template-time-labels.test.js FIRST PASS. Three positive isolated-component
images inspected under docs/screens/2026-11-07-template-time-labels. They are
not full signed-dashboard proof. Recent, old and prior-year labels are visible.

Existing email-template-approvals-ui.test.js focused FAILED at first fetch,
scripts/verify-email-template-approvals.js:14:31, TypeError fetch failed.
Its imported pure template assertions passed before that failure. This matches
its1.66s failure in device-head08b59b7 first full gate (all306 timings retained).
Focused command naturally exited1, wall5.3967335s, not a per-file gate timing.
No cause proven, no environment attribution, no auth/assertion/fixture changes,
no unchanged retry. BLOCKED/needs-architect under D065c. Full suite on this
template candidate NOT RUN; no push/PR/CI/merge/deploy/production verification.

## Architect Question

What bounded real fix should address the repeated routes/UI first-fetch failure
without weakening admin401, review400, stale409, cap413, explicit save/reload,
kind isolation, escaping,44px/no-overflow, no-send and store-preservation checks?
Recommendation: review fixture transport and safe error classification using
synthetic metadata only. Keep all existing assertions and negative gates;
component proof cannot replace this routes/UI gate or excuse the earlier97
full-suite failures. No unchanged rerun or unproven root-cause claim.
