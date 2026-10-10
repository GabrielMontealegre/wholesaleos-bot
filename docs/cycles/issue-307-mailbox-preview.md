# Linked email replies: read-only preview

On Dashboard, **Check linked email replies** checks the latest30 Inbox headers
only when a reported conversation has an exact email anchor. It does not send,
save, mark mail read, enable background work, or alter a lead. Opening Dashboard
does not check Gmail automatically.

The assistant can include optional `email_message_ids` (at most10 exact RFC
Message-ID values, including angle brackets) in the existing conversation
import. These are message references, not an email-address/name guess.
Alternatively, a supported legacy hexadecimal Gmail thread URL matches the
mailbox's exact thread ID. Opaque browser thread IDs are unsupported rather
than reverse-engineered. App Password uses exact Message-ID/In-Reply-To chains;
OAuth additionally supports exact Gmail thread IDs. A reply linked to multiple
conversations is ambiguous and is not assigned to either.

The view shows checked/linked/unlinked/ambiguous/invalid counts, the email subject
separately from reported words, and the check time. The old draft is withheld
when newer email arrives. It does not invent a reply, next step, person, role,
or contact outcome. Returning to the normal view restores stored reports.
Self-sent or unknown-direction mail never marks an incoming reply. IMAP uses
the configured mailbox address versus exact sender addresses; OAuth uses the
Gmail SENT label. Preview remains a read model, not verified contact identity.

## Writer/Reader Trace

- `email_message_ids`: validated by conversations.validate; existing admin and
  paired import call the same validator/upsert; persisted in report/history;
  read only by mailbox-conversation-preview. Old inputs omit the field and
  preserve their prior normalized shape.
- `message_id`/`in_reply_to`: mailbox-reader reads installed ImapFlow2.3.0
  envelope fields and OAuth metadata headers. No bodies are fetched for preview.
- `thread_url`/`threadId`: reported URL and OAuth metadata, exact legacy Gmail
  identity only; host/credentials checked before matching.
- `last_in`/`ready_message`: changed only on copies in the pure preview; existing
  conversations.list calculates status/due date; source store stays unchanged.
- `email_subject`/`email_evidence`: ephemeral preview only; admin route returns
  exact message reference/captured time; UI escapes text, never renders HTML.
- GET route: requireAdmin/no-store, bounded30 Inbox messages, overlapping-request
  guard, sanitized503 errors; no anchors avoids mailbox access entirely.

## Remaining Scope

#307 remains open. Persistent Gmail synchronization, email approval counters and
templates, JV stages and reversible saved-lead triage are not delivered here.
User order after #307: #304 round2 bugs1-7, government-source property timelines
(#301/#315; NC,FL,TX terms first), B-21 Florida sales, B-09 deed-backed buyers,
#299/#304 menu grouping, #288 sends/packages/JV generator, #313 photos.

Verification uses synthetic mail and read-only live UI only. No actual email
link/import, send, contact outcome, evidence confirmation or batch is used.
Local screenshots are explicitly synthetic, not live production evidence.
