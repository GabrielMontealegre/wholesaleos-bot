# 455.4B2 Recorded Context Timestamps

Trace before edits, from verified mainbca8fefc. Owned492 docs-only proof
carried as78ea05f; no runtime replay or unrelated export/debug staging.

## Writers And Readers

- record-activity.js append/recordEvent/reference-assigned writes ts from
  injected server now. Imported interactions require UTC-Z, normalize via
  toISOString and retain the existing five-minute future tolerance. Legacy
  activity created_at/card history at remain raw stored values. No writer,
  tolerance, server sort/filter, source attribution, reference or store change.
- listActivity preserves all events and legacy histories, strips private body/
  contact/digest fields and returns ts plus actor/source attribution. Activity
  page and inline card timelines share wos-record-activity.js rows/date.
  Only the display label changes: strict shared timestamp policy, or literal
  strict date-only day/year. Ambiguous/invalid/unconfirmed future instants
  show Time not confirmed; rows/source text remain, no silent row filtering.
- ask-workspace.js reads canonical Today/Calendar/deal/buyer projections,
  applies existing signed-JV/mixed-reference gates, and returns explicit server
  now, linked events.at and conversation due_date. No projection or guard edit.
- wos-ask-demo.js is the legitimate recorded-data Ask surface. Its timestamp
  helper uses shared formatTime with snapshot now; due days use formatDate.
  Snapshot/context/local questions, links, voice, X/Escape and auth aborts stay.
- Classic/native HTML change Ask cache4->5; Activity cache3->4 in classic only.
  Shared clock3 is unchanged. Device expiry/template/JV/profit and active legacy
  source-day readers remain separate; no inferred dates or native Deals rewrite.

## Acceptance

Actual synthetic Ask context/Activity at1366/400/412 in a Tokyo browser zone:
recent UTC-7, older month/day, prior year, literal date-only year, missing/
ambiguous/invalid calendar/future unknown, escaped unchanged source prose,
canonical references/attribution retained, no row loss/mutation and GET-only.
Existing Ask and record timeline/navigation/auth/privacy regressions remain.
No private files/mail/keys/import/answers/provider/outreach/paid/business writes.
New local/CI/release gates required; this trace is not completion.

Initial new test stopped on a case-mismatched source-prose expectation
(Source versus source), before images. Bind the assertion to the exact fixture
summary and additionally count both unknown event times; no runtime change or
escaping/source/row assertion weakened for this setup correction.
Next run passed Ask but the driver used an unsupported Activity workspace URL.
Use the same existing navigate(record_activity) path as the original Activity
verifier, not a product routing change or dropped assertion. Initial single
Ask image retained externally before final three-width captures.
Functional three-width acceptance then passed, but visual inspection found the
background mask covered the entire Ask dialog rectangle, producing blank
captures. Preserve those initial images externally; remove masking for these
entirely synthetic captures and add positive in-viewport dialog geometry.
No product change, privacy-gate relaxation or weakened functional assertion.

## Filter Boundary Regression

Six original focused checks PASS (Ask40.17s,native15.57s,boundary1.11s,
ActivityUI16.27s,record metadata0.62s,routes1.13s). Trace then found Activity
From/To still used browser-local midnight, inconsistent with UTC-7 labels.
New Tokyo-browser boundary regression FIRST FAILED: source query started
Nov2T15:00Z instead of Nov3T07:00Z. Align only front-end UTC from_ts/to_ts
bounds to the existing fixed owner day; server filters/writers/tolerance stay.
Tests include before/start/end/after day edges using actual listActivity,
invalid range with no GET/stale rows/false zero, and genuine measured zero.
Missing/unloaded rows now say Activity not loaded, not No recorded activity.
This is read-only filter/display consistency, not a source-date resolver or
deadline/sale-date calculation. Original source fields/records remain intact.
The corrected boundary/invalid-range/real-zero check PASS at1366/400/412,
9.31s. Earlier six positive timestamp images remain the inspected unfiltered
Ask/Activity proof; the filter correction does not change their visible state.
Existing Activity UI verifier also PASS after the boundary correction, with
all original timeline/reference/search/import-parser/no-write assertions.
No existing assertions changed. Historical pre-full checkpoint: first305-file
full gate was still required.

## First Full Gate And Historical Fixture Clocks

Frozen8fe2d5f completed NATURALLY302/3/0 of305,600s/file. Every row is retained
in proof-455-recorded-context-times/first-local-full.json; sum is not wall time.
Failures: active-notice-address-origin, after-sale-frozen-chain and
shared-dashboard-login. This remains a FAILED full gate, not302/1 or passed.

The first two tests assert fixed May2026 past/November2026 future cases while
omitting a fixed reference clock. The frozen after-sale corpus already uses
Oct2 capture metadata, but the orchestrator supplies ambient startedAt to the
adapter; direct notice calls also default to the ambient reference. Reuse the
existing historical-fixture helper tests/helpers/fixed-clock.js with
2026-10-02T12:00:00Z in these TWO test files, restore in finally. This matches
the existing cycle45/48/50/52 test convention. Keep every original assertion,
notice/date/address value, origin/source/rejection/purity and immutable-history
guard. No source-adapter/resolver/backend runtime change. Both corrected
focused tests PASS naturally. No unchanged full retry.

The shared-login cause remains UNPROVEN; no assertion/auth/runtime change or
unchanged retry. No environment/Node/flakiness attribution. First corrected-head
hosted CI must be observed before a green release claim under D065c.
