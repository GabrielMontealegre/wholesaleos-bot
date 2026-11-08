# 455 Email Timestamp Contract Trace

Architect handoff: https://github.com/GabrielMontealegre/wholesaleos-bot/issues/499

Source/tests only; no real mailbox, provider, auth, private record or stored-data
actions. Independent main-based branch carries prior failure proof/docs only;
no blocked device/template/JV/age runtime or tests. No runtime change or release.

## Actual Writer/Reader Boundary

modules/email/mailbox-reader.js IMAP metadata converts the envelope Date to ISO;
parsed MIME body metadata similarly emits ISO. OAuth list metadata retains its
raw Date header, which can legitimately be an RFC mail date with numeric zone.
Do not replace this with a strict-Z input rule or rewrite the OAuth provider.

Crucially, registerMailboxReads passes list/inbox, message and thread outputs
through thread-view.annotate before JSON serialization. annotate uses receivedTime
from modules/records/mailbox-reply-evidence.js and emits canonical ISO or empty
date. This is the boundary the previous partial source trace had not yet followed.
The classic browser does not need to parse raw RFC headers on these four routes.

dashboard/wos-email-reader.js time currently reparses date before shared-clock
formatting and has a loose fallback when clock is absent. Thread grouping also
parses dates but is not a display-only change. Native workspace/email-model.js
already validates strict ISO; email-screen.js delegates to the shared clock.

The classic WOS notes path instead reads /api/dashboard/conversations and displays
captured_at. conversations.validate/upsert writes strict normalized UTC captured_at
and recorded_at, but legacy project rows can retain stored captured_at or derive
it from last_in/last_out. These are recorded metadata, not raw mail Date headers;
do not apply RFC fallback to notes. No conversation status/rank/deadline changes.

## Positive Contract Test

New email-timestamp-contract.test.js FIRSTPASS. Ten synthetic RFC/ISO/invalid/
future cases exercise all four actual registered admin read handlers with an
injected reader, and annotate directly. RFC zones/GMT map to expected ISO;
shared clock yields UTC-7 recent/old/prior-year/midnight labels. Numeric slash,
date-only and invalid ISO dates become unavailable; future display is Unknown.
Source fixture rows, subject and direction unchanged; no external provider,
ambient clock, write or credential usage. Admin-handler binding/no-store checked;
this is not a new authentication or network-server test. No existing assertion
changed. No full suite, hosted gate, PR, push or deployment for this test-only trace.

## New Invalid-Calendar Diagnostic

Actual annotate on synthetic "Mon, 30 Feb 2026 12:00:00 +0000" produces a
March2 ISO instant. receivedTime permits named-month/time text after Date.parse;
the named-mail branch does not round-trip the original calendar components.
Result booleans are retained in 455-email-invalid-calendar-diagnostic.json, not
asserted as a passing regression test. No production occurrence claimed.

This helper also feeds mailbox reply evidence and exact-thread linking. A frontend
strict formatter cannot recover an invalid raw date after canonicalization.
Its correction is therefore a bounded source/evidence boundary change, not a
cosmetic reader rewrite or authority to change provider/auth/linked workflow.

## Architect Question

Please bound a real-calendar validation change for supported RFC mail dates at
receivedTime/annotation while preserving legitimate ISO and RFC mail headers,
time zones, exact anchors, raw provenance, reply evidence and existing no-send/
unknown gates. Recommendation: use an existing proven RFC parser plus explicit
real-calendar validation; no blanket ISO-only rejection, browser locale guessing,
new source facts, provider request or auth change. Existing broad failure blockers
495-498 remain independent and are not attributed to this diagnostic.

Frontend timestamp follow-on is BLOCKED pending this upstream contract decision;
the source trace and positive contract test are complete locally, not released.
