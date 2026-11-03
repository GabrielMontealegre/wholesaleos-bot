# Classic Email Reading Room

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
No safety assertion removed or weakened. Full-suite outcome is pending.

No live mailbox, private values/captures, real message/file, provider action,
business write or send was used. No push/PR/merge/deployment. The standing
branch-fetch restriction and rejected refresh are not bypassed. This local
candidate does not claim production completion or whole-backlog completion.
