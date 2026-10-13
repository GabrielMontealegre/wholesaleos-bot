# Dashboard waiting cards

The latest #325 architect check found raw ISO timestamps, empty filler lines,
multiple competing actions and urgency ordering on Dashboard conversation cards.
This slice changes their presentation, not outreach or reminder decisions.

- Owner-time format comes from the shared card-clock module. Date-only due dates
  stay date-only; a missing time is never supplied.
- Display order is overdue first, then due today, then the rest. It uses the
  response's owner-calendar today and validated due dates, not a guessed urgency.
- Empty incoming/outgoing/draft/link/message/next-step lines are hidden.
- Source attribution moves to hover text. Stored role metadata supplies role
  chips, borders and the primary action color; names/subjects never imply roles.
- One primary action: Reply opens the recorded conversation, or Open deal uses
  a known exact globally unique reviewed-deal ref. Unknown links get no action.
  The unsent draft is collapsed and its existing Copy control stays secondary.

## Trace

Conversation writers remain validate/upsert (reported imports), explicit mailbox
link/sync and activity reports. list reads those sources and projects summaries;
its new linked_deals field contains only exact id/ref pairs and is never saved.
Global reference counts include leads/buyers/deals/matches so an ambiguous ref
never gains an Open deal label. Existing closed filtering/reminders/counts stay.

wos-conversations loads the same stored-summary GET on Dashboard and uses the
pure conversation-cards renderer. Mailbox preview and explicit reply-save handlers
are unchanged. Reply links perform no send; Open deal uses the existing authenticated
record_ref navigation and exact record-search reader. No new route or dependency.

Two old VM fixtures load the new pure helper before the same existing controller;
all their assertions about no auto mailbox reads, escaped subjects, stale drafts,
secret-safe errors and explicit sync remain unchanged. New negative tests cover
invalid/missing dates, forged urgency, unsafe URLs, missing/duplicate/cross-kind
refs, escaped markup, no inferred role/action, purity and unchanged stores.

Full-index synthetic1366/400/412 screenshots and a UI test prove urgency order,
human times, role colors, clean cards, one primary action when sourced and no
writes/external calls. Full-suite durations and release observations are in BACKLOG.
No real Send, Reply, save, sync, contact, evidence confirmation or batch is used
as a release test. #325 remains open for exact JV conversation/template integration.
