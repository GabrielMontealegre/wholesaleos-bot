# 454 Batch Decision Contract Inventory - 2026-11-08

Source-only inventory on current main f2294a7. No private snapshot, real file,
mailbox, production JSON, provider, or business write was inspected or invoked.
This document is not implementation, acceptance-test, UI, or release proof.

## Actual Writer and Reader Chain

1. dashboard/workspace/assistant-v2-fields.js validates exact open_items keys;
   modules/records/assistant-snapshot-v2-fields.js reexports that schema.
   An item has id, tier, status, title, who, happened, numbers, suggestion,
   options, pick, due, refs, and optional walk_plan. Options are exact A/B/C
   label/consequence pairs. Pick is null or A/B/C, not voice provenance or an
   owner submission. Status is free text, not a canonical stage. Refs expose
   thread/draft, not a stable deal identity. Walk-plan evidence stays unchanged.
2. dashboard/workspace/decision-desk.js renders Desk/Agents/Outreach and
   per-card notes plus choices. It validates public answer envelopes against
   the current receipt and item IDs. No round, batch Submit, overall note,
   voice provenance, or typed already-done record exists in this contract.
3. dashboard/workspace/assistant-sheet.js binds a choice directly to saveAnswer.
   Each click POSTs snapshot_id, item_id, choice, note, request_id to
   /api/dashboard/assistant-snapshot-answers. Notes live in an in-memory Map;
   existing localStorage sent-check flags are a different contract. Unknown
   transport outcomes disable choices and require refresh; there is no automatic
   POST replay. Refresh reads latest-only answers through GET.
4. server.js registers modules/records/assistant-decision-answer-routes.js.
   Routes enforce admin actor, limiter, no-store, methods, same-origin and
   explicit answer header, JSON/body bounds and sanitized errors. POST reads
   strict storage, invokes appendAnswer, then writes only if it returns a new
   store. GET reads actor-scoped answers with bounded pagination.
5. modules/records/assistant-decision-answers.js validates exact own data fields,
   actor, strict UTC timestamps, current v2 snapshot and item membership.
   Records are append-only under assistant_decision_answers. Request UUIDs are
   actor scoped; an identical retry is idempotent, a changed payload conflicts.
   Public answers omit operator/request/source metadata. GET latestOnly selects
   the last stored answer per item. Existing records have no round revision or
   option-label binding beyond immutable snapshot membership.

Relevant existing tests are assistant-decision-answers.test.js,
assistant-decision-answer-routes.test.js,
assistant-decision-answer-parser-order.test.js and
assistant-decision-desk-ui.test.js. They were inspected, not rerun here.

## Owner Requirement Delta

Previously read architect comments 6625407540, 6632655933 and 6660041703 require
pick/clear without writes, optional per-card and overall notes, one explicit
batch Submit, persistent reload-safe drafts, uncertain-submit GET recovery,
stale-round/forged-option/double-submit negatives, and version-bound choices.
The later no-picks-on-open rule takes precedence over earlier proposed voice
preselection. Voice-origin metadata must be explicit evidence, never inferred
from pick, text, status, names, or prices. Browser speech availability is not
authority to send audio to a service.

Batch format requested: submitted_at, round, overall_note and choices with id,
choice, choice_label, note, from_voice. An actor-scoped request UUID and exact
immutable snapshot/version binding are also required for safe submission.
Existing source imports and answer history cannot silently acquire these keys:
their exact validators reject unknown fields.

## Bounded Additive Sequence

ASSUMED under AGENTS3: first implement a pure, unregistered batch validator and
immutable append/read model with synthetic tests; then separately integrate the
admin route and UI after green required gates. A proposed round is bound to an
immutable snapshot receipt, not a free-text stage or invented property merge.
Record server acceptance time separately from client submitted_at. Resolve
choice_label against that receipt; never trust a client label as option truth.
Use an explicit revision/conflict contract before accepting a newer device
save; do not equate arbitrary client timestamps with newer authoritative saves.

No wire schema is finalized by this inventory. Before implementation, enumerate
limits, note-only/no-choice behavior, duplicate IDs, accessors/prototypes, actor
isolation, exact round/version binding, stale revisions, UUID payload conflicts,
all-or-nothing append, invalid/future times, privacy-safe public projection and
zero ambient clock/network/business mutation. Keep old single-answer history
readable; no destructive migration or silent reinterpretation.

Do not implement board stages, address-only identity merging, already-done
inference, comp/buyer-number inference, provider calls, outreach, canonical deal
mutations, or owner-only production batch writes as part of this record model.
The batch is an owner decision record, not a sent message, automated task,
stage transition, signed agreement, or fact about a property.

## Verification Status

Follow-on local implementation2026-11-08: assistant-decision-batches.js adds an
unregistered pure append/read model; no existing route/service/UI edited. Limits
and conservative policies are logged in DECISIONS. A separate collection retains
actor-scoped UUIDs, immutable round binding and server revisions. Atomic input
validation rejects forged options, stale round/revision, invalid times, inferred
voice provenance, duplicate IDs, accessors and prototype-bearing records. Public
read results are detached and actor scoped. Existing single-answer records are
unchanged. New synthetic model test first PASS; existing pure single-answer test
PASS. Further hostile-store/effect negatives added before the first full gate.
First full gate still required; these focused passes are not release acceptance.

Original inventory checkpoint e3ea30e: runtime/tests/dependencies unchanged from
main, with no tests or release actions then. The follow-on module and test above
are local only; no hosted CI, PR, push, deployment or production verification.
Remaining #454/#487 acceptance work stays open. No failed 455 gate is waived.
