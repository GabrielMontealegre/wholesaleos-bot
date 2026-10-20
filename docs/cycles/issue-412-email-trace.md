# Native Email Migration Trace

Status: native read-only Email screen is built locally and focused tests
pass. Full-suite/review/PR/release gates pending. Classic stays unchanged.
Architect#415 OptionA is approved as D-061: generic reply transport follows
as a separate PR after this read-only visual migration. It is no longer an
unanswered blocker. Until then, OptionB is explicit Send unavailable/Gmail.

email-model.js groups only connected-mailbox rows on existing server thread
keys, keeps mixed threads in People, quarantines conflicting message refs
for an explicit unavailable count, preserves unread across duplicate refs,
and requires timed role provenance. Names never come from splitting email
addresses. workspace-email-model.test.js verifies these boundaries with
denied network/current-clock/storage/import effects. New module is unused
by the native controller; no production behavior changed before release.

## Existing Contracts

- modules/email/mailbox-reader.js owns signed-admin read routes:
  GET /api/gmail/messages?folder=...&limit=30; GET /api/gmail/message/:id;
  GET /api/gmail/thread?ids=...; GET /api/gmail/test. IMAP mailbox locks are
  read-only. Listing is bounded, folder IDs allowlisted, message references
  validated, stale UID validity rejected. Never change those protections.
- modules/email/thread-view.js annotates exact connected-mailbox anchors,
  thread_key, direction, role source and linked deal refs. Unlinked/ambiguous
  messages stay unlinked/ambiguous. A sender name is source text, not guessed
  from an email. A role is never inferred from a subject or from AI.
- dashboard/wos-email-reader.js currently groups by server thread_key, loads
  bodies only on explicit selection, escapes plain text, retains the list on
  bounded message failures, and clears private state on login failure. It is
  the classic reader, not a module to load into the native stylesheet stack.
- dashboard/wos-email-templates.js and modules/email/template-approvals.js
  own reviewed templates and approval history. Native suggestions must use
  recorded reviewed text/exact context or remain unknown; no invented offers,
  promises, private addresses or inferred buyer/holder identity.
- POST /api/gmail/send,/api/gmail/reply,/api/email/send intentionally410.
  Buyer-specific modules/email/buyer-messages.js is not an arbitrary-reply
  transport. Its package/recipient/JV/template/stale-preview gates must stay.
  Working generic reply Send is blocked on architect#415, not a PIN issue.

## Frontend Boundary

Use the released workspace shell/components and append only shared design
system rules, never another patch stylesheet or mutation layer. Two sibling
panes: compact message list and full-height reader; phone shows one at a time.
No nested message-body scrollbox. Compact folder controls, People/Alerts views,
latest thread expanded with earlier messages collapsed, visible To/Subject/
Send composer. No auto send, draft save, archive, label write or conversation
link. Any unavailable write is explicit, never a simulated success.

Default People must not claim a sender is a verified human/buyer. Any alert
separation is deterministic operational classification, with conservative
source-backed exact automated sender rules and no deletion. Preserve access
to every message in its folder and the original source metadata.

Keep session-generation cancellation, keyboard focus, X/Escape and private
state clearing. Scope shortcuts away from inputs/textarea/dialogs. The
Gmail-like archive expectation for e cannot silently create a mailbox write
through the unchanged read-only API; settle with the architect boundary.

## Next Proof

Synthetic old/new Email at1366/400/412 with long message, long subject, older
thread collapse, alerts/people, Inbox/Sent/empty/error, source roles, keyboard,
composer not sent, stale/401 response cancellation and zero load writes.
Lighthouse90+ and paint<2s are local measured gates. Hosted full suite600s/file
on final head; exact deploy, bounded read-only live verification. Never claim
live paint from HTTP timing or access hidden browser state to measure it.
