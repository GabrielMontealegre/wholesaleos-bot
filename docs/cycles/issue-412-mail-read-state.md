# D-063 B: Source-Backed Read State

Bounded prerequisite to unread totals, not a totals/pagination/snippet release.
Missing IMAP flags previously became unread=true; missing Gmail labels became
read=true. Both are unknown, not facts. No new provider request is needed.

## Writer / Reader Trace

- mailbox-reader.metadata: IMAP list and UID-validated body paths consume the
  already-requested flags Set. A valid empty Set means unread; Seen means read.
  Missing/wrong-shape/malformed members now return null read/unread/origin.
- OAuth list metadata and raw body: labelIds strings determine UNREAD. Valid
  empty labels mean read; missing/wrong-shape/malformed labels remain unknown.
- registerMailboxReads -> thread-view.annotate: spreads the provider fields
  through existing signed-admin/no-store list/message/thread GETs. No storage.
- Native email-model: read/unread tri-state survives duplicate/thread grouping.
  Contradictory fields are unknown. A confirmed unread member makes a thread
  unread; read requires all members confirmed read. Unknown never becomes false.
- email-screen and classic wos-email-reader only highlight confirmed unread
  via existing booleans. Neither renders a new count or claims unknown is read.
  Notifications and comms unread counters are separate domains, untouched.
- No persisted business reader/writer consumes these mailbox state fields.
  Sender, identity, roles, content, drafts and D-061 gates remain unchanged.

## Evidence / Tests

Official provider contracts checked2026-10-25:
https://imapflow.com/docs/guides/fetching-messages/#flags
https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages
Installed exact ImapFlow2.3.0 types use Set<string> for flags. Gmail labels are
message label IDs, not authoritative per-folder totals. No provider estimate
or missing list is promoted to a count. Source origin travels with known state.

New hermetic tests call actual injected adapters, MIME parser, annotate and
native projection: Seen/unseen/empty, absent/null/wrong-shape/invalid members,
list/body parity, read-only locks, exact unchanged metadata/body request counts,
and blocked external network. Existing duplicate-known-unread assertion remains.
Projection adds unknown/conflicting/partial thread negatives and purity checks.
No existing assertion removed or weakened. Email model cache version2 only;
no layout/control/CSS changes. Final5c54245 full249/0/0 hosted40196573234,
600s/file;exact merge74dfd39 and automatic5caaadc7 Active/source verified.
Public12true3sizes and same-merge pinned5size native journey pass. Signed
actual1038x503 list/body preserve provider-origin/read parity;full reader and
disabled empty reply remain usable. Unknown/malformed cases tested only in
hermetic fixtures. Complete safe proof: ../screens/2026-10-25-pr445-release.

ASSUMED: establish truthful per-message state before computing per-folder
totals, because D-063B/AGENTS data truth outrank a fabricated count. B snippets,
attachments, totals, cursors and search remain separately bounded later work.
