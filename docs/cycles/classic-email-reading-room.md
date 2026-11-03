# Classic Email Reading Room

## Authorized Publication

Gabriel's direct2026-11-03 standing authorization supersedes the old no-fetch
restriction. Fetch succeeded; current origin/main326ad472 is an ancestor of
the candidate, so no history rewrite is required. The retained local failure
is not reclassified. Under D065/D065c, the first exact corrected-head hosted
CI is the next gate; no unchanged retry or cancel/skip/waiver. Merge/deploy
approval is already granted, conditional on passing checks and bounded proof.
Paid services, outreach, secrets and production business writes stay excluded.
Historical local-only/hold statements below describe their earlier checkpoints.

Direct owner request, 2026-11-03: make the classic Email screen readable,
relocate its tabs, reply only after opening, and show conversation context.

## Scope And Trace

- wos-email-reader.js owns local folder/role, loaded message metadata, selected
  thread and unsent reply state. List mode now uses compact top controls and
  the full list width. Opening replaces the list/controls with a full-width
  reader, a folder/role breadcrumb and Back. Older messages are collapsed;
  the latest message remains readable in one scrolling thread surface.
- Reply is explicit and below the thread. Close/Escape preserves the local
  unsent text for reopening; opening a different thread still clears it.
  Send remains disabled/inert. Voice controls remain explicit/local-only.
- thread-view.annotate joins source-backed mailbox identities to one recorded
  conversation. It now copies only a whitelisted stored conversation status,
  or null. No new join, provider request, classification or workflow writer.
  UI labels it Recorded, not proof of an actual send or current deal stage.
  Unknown/ambiguous links stay unknown; directions/subjects never infer status.
- Writers remain conversations.validate/upsert, exact email-link and mailbox
  reply persistence. None changed. Existing list/body GET routes, explicit
  operator link POST, authorization, error redaction and no-send guards remain.
- Only classic asset caches advance: inbox CSS3 and email reader6. Native Email,
  transport, OAuth deadlines/abort/retry-false and mailbox writers are unchanged.

## Verification

New actual full-dashboard regression passes 1366/400/412: full reader width,
minimum reading height, single scroll surface, collapsed history, explicit
reply/close/Escape/draft preservation/focus return, folder/role retention,
recorded/ambiguous/unknown context, escaped HTML, one explicit body GET and
zero writes/external requests. Six final synthetic images were inspected.
First mobile chooser clipped its selected label; corrected its CSS and added
a geometry assertion. Initial hover tooltip obscured status in one capture;
final captures park the pointer. Initial proof remains external, not final proof.

Existing thread-view purity/identity/ambiguity negatives now cover all stored
statuses and missing/unknown status. Inbox UI state and explicit link persistence
tests pass. Existing actual inbox layout, read-error and local-voice checks pass;
their setup now clicks Reply before inspecting its textarea/disabled Send.
No safety assertion removed or weakened.

## First Full Gate And Owned Verifier Correction

Frozen38be8b1d02e160799caceb20eba7805de677b59e completed naturally:
299 passed,4 failed,0 skipped of303,600s/file. Every timing is retained in
proof-classic-email-reading-room/first-local-full.json; sum is not wall time.
Failures: dashboard-deal-mount-order, inbox-workspace-ui,
notification-workspace-ui, today-workspace-ui. This remains a FAILED full gate.
No environment/Node/flakiness attribution and no unchanged full retry.

The inbox verifier failed at scripts/verify-inbox-workspace.js:27 because it
still clicked the removed vertical role button. Corrected setup uses the new
role select and clicks Reply before its textarea/disabled-Send checks. Its
three-message chronological/plain-text/HTML-escape assertions now select all
message bodies including collapsed history, and additionally require history
initially closed and composer initially absent. The full-width reading check
now covers desktop too. Existing exact grouping, no guessed identity, deal
link, blank operator role, draft preservation, notes separation, local filters,
missing-label clearing, zero writes/external/errors remain. This changed
verifier passes1366/400/412; runtime is unchanged from38be8b1.

The other three full failures have no proven cause in this slice. Two observed
stacks wait on Today-screen elements; no unrelated runtime fix/test weakening
or unchanged retry was attempted. No full green/CI/current-main/release gate
exists for the corrected head. The local-only candidate remains unreleased.

No live mailbox, private values/captures, real message/file, provider action,
business write or send was used. No push/PR/merge/deployment. The standing
branch-fetch restriction and rejected refresh are not bypassed. This local
candidate does not claim production completion or whole-backlog completion.
