# Gmail-style Inbox workspace

Ordered #325 slice following the2026-10-12 mockup specs in the issue comments.
Folders/roles on the left; exact-thread rows in the middle; oldest-to-newest
plain-text conversation and reply composer on the right. Phone opens the reading
pane full-width. Unread is bold. Dark mockup palette, shared role colors, owner
UTC-7 times, green Send control disabled until #288. No pretend sends.

## Writer/reader trace

- conversations.validate/upsert write explicit reported role/channels/refs and
  email_message_ids with captured/recorded dates. The role whitelist adds seller,
  title, attorney, lender, agent and other; holder/buyer/partner are unchanged.
  All other validators, append-only reports, receipts and import guards remain.
- mailbox-conversation-sync.link records only explicit operator person/role/refs
  after an exact source Message-ID. persist remains incoming-only and unchanged.
- savedReplies supplies only the existing validated mailbox receipts. Gmail
  thread URL normalization reuses gmailThread; shared messageId/threadId and
  receivedTime validate exact anchors and timestamps. No subject/from-name joins.
- mailbox-reader.metadata and OAuth metadata/raw readers provide connected-mailbox
  message/thread/header/date origin. The missing OAuth source_kind is added.
  Single-message IMAP now delegates to the same bounded batch implementation.
  One read-only connection/lock, sequential UID reads,2MB/message and8MB/thread,
  max30 selected IDs; UIDVALIDITY, allowed folders, TLS and log guards preserved.
- thread-view is a pure read projection over current stored conversation links
  and returned mail. It groups exact connected headers/thread IDs, rejects future/
  forged/ambiguous links, and supplies role provenance and only unique known
  reviewed-deal IDs/refs. No person/property bodies enter this context payload.
- registerMailboxReads receives db for readDBStrict only. Existing reads add the
  context; one admin-only GET/thread is added. Every success/error is no-store.
  No flag, label, send, append, scheduler or database writer is added.
- wos-email-reader groups returned thread keys, filters locally, opens existing
  reviewed-deal cards, formats timestamps and displays plain text. WOS notes read
  the existing reported-conversations GET separately, not the real mailbox.
  Existing explicit email-link POST is retained; its role chooser stays blank.
  Stale requests cannot repaint a new view; failure clears mail and redacts errors.
  The reply composer is inert; its text never reaches a send endpoint.

The selected-folder latest30 scope is visible; this is not a claim that every
message across all Gmail folders was loaded. Sent/replies use the same reader.
Unknown roles say Link to a person; ambiguity says link needs review. No guessed
buyer/owner status and no contact/comps/source-date/value readiness change.

## Tests

Pure exact-chain roles and ambiguity/forged/future/missing/wrong-source negatives,
incoming/outgoing direction unchanged, role taxonomy, privacy/ref uniqueness,
network/write/clock spies. Real route/read mock: one IMAP connection/lock,
sequential sources, caps/UID stale/per-message/thread size,401/400/no-store,
zero product writes. UI stale-session/unsafe-error/disabled-Send negatives.
Full-index1366/400/412: group3 into1, unlinked sender not guessed, unread,
roles, oldest-first plain-text/XSS, known deal link, notes separation, local filters,
missing-label clearing, green Send survives global theme, no writes/external calls.

One intentional existing proof change: verify-marketplace-ui opens the new
collapsed Link to a person details before checking the same blank role chooser.
No existing safety assertion is removed or weakened. Initial sandbox localhost
fetch denial was environmental; unchanged mailbox-reader suite passed escalated.
Self-review caught unsent reply loss on Test connection; the local draft now
survives that repaint only in browser memory, never in Gmail/storage. A new view
or expired login clears it. Auth401/403 clears mail AND notes and says to sign in,
not that a mailbox password is wrong. No unsent draft is counted as a message.
Initial168/0/0 preserved in issue-325-inbox-workspace-initial.txt; final exact-state
SUMMARY passed=168 failed=0 skipped=0 total=168,600s/file.
Threadread4.18s,pureview0.19s,UIstate0.11s,InboxUI5.21s,mailbox2.38s,
mobile17.90s,county-notice12.73s. Every timing in issue-325-inbox-workspace.txt.
Synthetic screenshots: docs/screens/2026-10-12-inbox-workspace. Release/live pending.
