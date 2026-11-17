# 454 Board Stage Contract - Source Boundary Inventory

2026-11-08, fetched main f2294a7. Source-only inventory; no private snapshot,
production JSON, business write, UI capture, provider or release polling.
Branch from main with owned proof/docs only; blocked batch77608f7 module/test
and blocked455 runtime/tests are NOT carried.

Confirmed actual chain:
- modules/records/assistant-snapshot.js validates imported deals with exact
  fields and six stage values: finding_buyer, offer_out, under_contract,
  buyer_assigned, closed, dead. IDs are unique within that snapshot. The import
  writer appends assistant_snapshots with actor, receipt and source metadata;
  it does not establish canonical deal identity or independently prove events.
- assistant-snapshot-routes.js GET uses latestSnapshot for the signed actor.
- dashboard/workspace/assistant-model.js validates source deals, projects each
  explicit stage and marks provenance assistant_snapshot_import/reported:true.
  It groups deals by the same six STAGES, not inferred status or address.
- assistant-sheet.js renders those groups and opens detail by projected deal
  ID, retaining source labels and reported log. This is reported-stage display,
  not a canonical stage-transition writer or proof of message delivery.

The requested New/Analyzed/Questions sent/They answered/Offer sent/Negotiating/
Ready to sign/Under contract/Buyer committed/Closed plus Dead-reason board
cannot be a label-only remap of these six values. Free-text log/status and
open-item pick do not supply typed event identity, delivery proof, stage reason
or cross-snapshot property identity. Address-only merging is not authorized.

ASSUMED under AGENTS3: preserve existing reported grouping while tracing typed
event and identity writers/readers before choosing an additive board contract.
No new stage enums, inference, migrations or canonical writer changes here.
The preliminary snapshot path above is now supplemented by the bounded canonical
identity/event trace below. It is not an exhaustive audit of every legacy writer
or proof of actual production data. No runtime/tests/dependencies changed and no
test suite/full/CI/release performed.

## Canonical Identity and Workflow Boundaries

| Boundary | Writer and Reader | Actual Authority |
| --- | --- | --- |
| Reviewed deal identity | reviewed-deals.js ingest/applyDealUpdate; reviewed-deal-routes.js | Created canonical id; source URL plus address duplicate check within reviewed deals. Updates require one matching reference; not a global property merger. |
| Record references | record-activity.js assign/assignOnAction/assignMissing; listActivity/search | Explicit namespaced refs across leads/deals/buyers/matches. recordEvent links record IDs/refs. Reads preserve legacy history and attribution; not a stage reducer. |
| Legacy reviewed status | reviewed-deals.js update/evaluate/list | Operator status path found/vetted/holder_confirmed/contract_verified/jv_signed/buyer_committed/closed plus dead, checks/evidence and attribution operator_report. Do not relabel as independent provider proof. |
| Typed JV workflow | jv-workflow.js record/recordSignatureReview/view; reviewed-deal-routes.js | Separate ordered event stream with actor, happened/recorded time, checks, source URL/text, buyer binding and signature/terms versions. Existing status/history preserved. Invalid chain and changed terms stay blocked by existing reader. |
| Reported interaction | record-activity.js validateInteraction/importInteraction/listActivity | Unique ref target required. Imported event can be typed email_sent but is attribution imported_report, not SMTP acceptance. |
| Conversation report | conversations.js validate/upsert/project; conversation-routes.js | Person plus exact sorted refs identify report. Refs must uniquely resolve across collections. Closed/ambiguous cases do not silently merge; displayed incoming/outgoing status can still be reported evidence. |
| Connected incoming mail | mailbox-conversation-preview.js matchMessages; mailbox-conversation-sync.js persist/link; mailbox-reply-evidence.js savedReplies | Exact RFC/thread anchor graph; ambiguous owners excluded. Persisted incoming metadata source_kind connected_mailbox, with link actor/capture time. Subjects are not body text or deal-stage semantics. |
| Reviewed thread linkage | email/thread-view.js annotate; thread-reply-policy.js context | Exact message/thread anchors plus unique record ref produce typed kind/id/ref links. Snapshot open_items refs and free-text status are not this contract. |
| Outgoing acceptance | email/reviewed-thread-replies.js and buyer-messages.js | Existing default-OFF reviewed send paths append accepted receipt and email_sent activity attributed smtp_accepted only after acceptance checks. SMTP accepted is explicitly NOT delivery confirmation or proof the message was a question/offer. Nothing invoked here. |

Actual server registrations are server.js registerReviewedDealRoutes,
registerRecordActivityRoutes, registerConversationRoutes; snapshot and answer
registrations remain separate. Existing routes enforce their own authorization
and write policy; this inventory does not register or exercise them.

Typed JV stages are found/holder_interested/buyer_teaser/buyer_interested/
jv_signed/full_package/emd_at_title/assigned/closed plus dead. They are neither
the snapshot six-stage enum nor the requested board. A buyer criteria match
(record-activity registerMatch) explicitly is not a commitment or offer. JV
buyer_interested binds one matched buyer and an explicit recorded buyer_price;
generic buyer-number fields or prose cannot supply that evidence.

## Synthetic Diagnostic

454-board-stage-diagnostic.json records actual appendSnapshot, model.project,
importInteraction, conversations.upsert and jv.view calls on generated in-memory
fixtures with injected time. Eight boolean observations hold, no input mutation
or ambient clock/network/filesystem effects. Equal reported/canonical deal IDs
do not join records or change canonical status. Imported email_sent remains an
imported report without SMTP receipt. Ambiguous cross-collection refs reject.
No-event JV remains found. This is a diagnostic, not a new stage acceptance
contract, production occurrence claim, signed browser proof or release waiver.
Diagnostic source retained outside Git at
.wholesaleos-release-proof/454-board-stage-diagnostic.cjs.

## Bounded Architect Question

Handoff: https://github.com/GabrielMontealegre/wholesaleos-bot/issues/503
Created2026-11-08T06:00:06Z. No runtime change or failed-gate waiver.

The remaining board projection is BLOCKED on explicit identity/evidence policy,
not on a presumed common cause of historical tests. Provide one bounded Codex
contract prompt resolving:

1. The exact stable source-to-canonical binding for an assistant deal across
   snapshots. Receipt+reported ID is artifact identity only; address, source-file
   path and equal IDs are not independent property identity. Decide typed binding
   fields, unique-resolution behavior and unlinked/ambiguous fallback without a
   production migration or automatic merge.
2. Which typed evidence and attribution can support each requested board stage,
   distinguishing assistant reports, operator reports, connected incoming mail
   and SMTP acceptance. In particular Ready to sign, Under contract, Buyer
   committed, Closed and Dead reason must not be inferred from free text,
   generic event names, price, drafts or a different workflow's stage label.

Until answered, preserve the existing reported grouping and canonical workflows.
No new stage enums, stage reducer, write, provider call, messages, agreement or
money change. This handoff does not block unrelated read-only UI/contract work.
