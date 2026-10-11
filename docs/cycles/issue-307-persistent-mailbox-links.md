# Persistent Gmail conversation links

Email: open an Inbox message, enter the person's name, choose their role and
enter any known references, then **Save conversation link**. The role has no
default. The server reads that exact message from your connected mailbox;
your browser cannot submit mail dates, content or a guessed identity as proof.
This records your association, not a confirmed seller contact outcome.
Missing browser thread links remain missing; the application does not guess
which of your signed-in Gmail accounts is browser account0. Exact server
message/thread IDs still provide the receipt locator and future matching.
The first explicit link requires the email's exact RFC Message-ID; missing
headers are refused, not replaced by a guessed address, name or browser URL.

Dashboard: **Check linked email replies** stays read-only. If exact replies
match, **Save linked replies** rechecks the latest30 Inbox headers against the
current store and appends new receipts. It does not send, alter Gmail, mark mail
read, or change lead facts. Neither action runs on page load or a schedule.

Saved receipts survive reloads and subsequent assistant conversation reports.
They feed the existing reminders and shared operator brief. An older reply
does not make a conversation hot. Closed/ambiguous/unmatched/self-sent/unknown
mail never becomes a new waiting-on-you fact. Subjects are labeled subjects;
message bodies are not stored or guessed, and obsolete drafts are withheld.
Duplicates are quiet. Conflicting content under one message identity is refused.

## Trace

- `mailbox_replies`: server-owned `mailbox-conversation-sync.persist` is the
  writer; `conversations.upsert` preserves it across imports. Pure evidence
  validation, exact matcher, `conversations.list`, operator brief and Dashboard
  are readers. No lead/candidate/snapshot field is written.
- Receipt key uses exact RFC Message-ID when present, otherwise the mailbox's
  message ID. Appends retain subject/date/source locator, captured_at and
  linked_by. One generic count-only Activity audits a save; no bodies/senders
  or reported person names enter aggregate logs.
- `email_message_ids`/channels: explicit link associates an operator-entered
  person/role/refs with a server-fetched message. Existing reports/history
  are preserved; overlapping identity anchors refuse reassignment.
- `last_in`/due/status/draft: derived by existing conversation read model from
  immutable receipts and existing reports/activities; persisted mail never
  writes contact_workflow_complete, readiness, ARV or other property facts.
- POST email-link/email-sync: requireAdmin + no-store, one overlapping-reader
  guard; bounded30 sync and one exact message link; fresh read after network
  await before synchronous write. No anchors/duplicates means no store write.
- Email UI provides explicit link form; Dashboard provides explicit save only
  after a matching preview. No sending/confirmation control was added.

## Tests and release scope

Positive/negative persistence and explicit UI tests, plus actual-document
phone/desktop proof. Existing assertions unchanged; two lightweight GET-only
test doubles gain inert post() so they can register the new routes.
Full suite uses600s/file; durations recorded with the release.
Synthetic screenshots are not presented as live production pixels.

Live verification never submits either save action or creates a conversation.
It observes form/buttons, existing records, service health and console only.
#307 remains open for email templates/approvals, then JV stages and lead triage;
#304 round2 visible bugs1-7 follows #307, then the user's recorded source order.

## Verified release

PR #324 merged as dc4d7b3; exact Railway success,health200. Final150 passed,
0 failed,0 skipped,600s/file; all durations committed. Persistence4.11s,
UI0.23s,mobile23.86s,county-notice12.77s. No existing assertions changed.

Actual live Inbox30 messages,Connected(App Password); opened message renders
blank person/role and Save conversation link. No form submitted. Both changed
surfaces served conversationsv3/emailv2; form controls44px and horizontally
inside1366/400/412 viewports with no overflow. Existing reply check reports
no exact anchors/nothing fetched; save disabled. No real link/receipt seeded.
Persistence/duplicate/concurrent/negative behavior is synthetic-service-tested,
not claimed tested by writing to production.

One startup Leads GET502 logged at2026-10-11T00:49:29.827Z; one subsequent fresh
load100 Leads/card open-close,zero fresh console errors. Recorded in existing
incident #209; cause unknown,not claimed fixed. Header-only live screenshot
capture timed out; labeled synthetic screenshots remain separate from live proof.
Viewport restored and temporary tab closed. No send/batch/contact/confirmation.
