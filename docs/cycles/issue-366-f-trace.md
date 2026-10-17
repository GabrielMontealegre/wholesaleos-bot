# Email Layout: Trace Before Implementation

Status: locally implemented, NOT released. Based on origin/main927147f after
C PR#378. C exact deploy/live proof completed; feed reconciliation alone is
BLOCKED on#379 and does not block this independent read-only layout slice.

## Existing Writers And Readers

- modules/email/mailbox-reader.js reads IMAP with a read-only mailbox lock or
  Gmail metadata/raw APIs. It returns connected_mailbox direction, from/to,
  subject, snippet/date, ids and body. No Mark read, label mutation or send here.
  IMAP envelope already contains structured sender names; OAuth metadata has
  a From header. Reuse the installed parser rather than infer a person's name
  from the email local part. A missing name must remain missing.
- modules/email/thread-view.js links messages to conversations only through
  canonical message/thread evidence. Unknown and ambiguous links remain so.
  Its conversation DTO carries role/provenance and exact deal references, not
  an inferred identity. Do not loosen the linking predicate for a role color.
- dashboard/wos-email-reader.js owns folder/role/message selection, sequence
  guards, GET loading, read-only thread opens and explicit linking form POST.
  threadRows currently displays the full from string and a Link to a person
  chip for unknown roles on every row. reading() already puts the linking
  action inside a details form. Keep that single explicit action there.
- dashboard/wos-role-chips.js is the existing shared role-color vocabulary;
  reuse it for established roles only. Empty roles need no repeated link pill.
- dashboard/wos-inbox.css owns the three-pane grid and phone open-thread view.
  It currently has min-height500px but no bounded desktop viewport/list scroll.
  The duplicated physical-folder and role-filter lists are too tall for fixed
  44px targets at768px. Group secondary physical folders in an accessible menu,
  not a clipped/unclickable overflow pane. Keep Inbox/Sent and requested roles
  reachable, and do not imply all-mail search over the actual30-message cap.
- Reply Send remains disabled by the old generic route. C enables only its
  separate reviewed buyer messages. F is layout/readability, not permission to
  enable arbitrary reply/bulk outreach or change conversation provenance.

## Acceptance And Negatives

Fixed folder choices; bounded independently scrolling message list and right
reading pane on desktop. Phone list/detail navigation stays usable. Sender name
when actually supplied, subject, snippet, human time and known-role color; never
invent a name, role, conversation, message, read receipt or delivery.

Real dashboard synthetic tests1366/400/412 must exercise folders/roles/thread
open/back, long senders/subjects, unknown/ambiguous role, empty/unavailable
mailbox, stale responses, keyboard navigation and no page overflow or clipped
controls. Reads/open/filter never issue POST or send mail. Do not test live
link/save/send actions. Existing mailbox/thread/auth/privacy assertions stay.

## Implementation

Bounded viewport flex/grid; fixed folder choices, independently scrolling list
and reading body. Secondary physical folders/notes use a native chooser so
44px controls remain reachable at1366x768 and400/412x915 without folder scroll.
Sender-name DTO is ephemeral mailbox header data; annotate preserves it via
the existing spread, and the UI escapes it. Bad/missing header parsing yields
an empty name, never a failed inbox, a guessed name or raw error. No new fetch.
Unlinked rows omit the repeated link pill; the small explicit linking form in
the reading pane remains. Thread evidence, directions, roles, auth and Send
guards are unchanged. Assets inbox CSS2/reader JS4.

New inbox-load-layout test proves IMAP/Gmail source names, parser failure
redaction, actual full-dashboard1366/400/412 reachability/independent scrolling,
long-name fit, unknown role/name, thread/back and zero writes/external requests.
Existing mailbox/thread/state and inbox/linking proofs pass. The inbox browser
driver now selects notes/physical labels from the chooser; every original
assertion, including missing-label failure clearing and disabled Send, stays.
Full hosted suite and exact deployment/read-only proof are pending.
