# D-063 B: Read-Only Data Trace (Preparation Only)

No B implementation, provider request, business write or release is claimed.
Phase A441 must complete its actual release gates first. This trace uses local
code, not private mailbox payloads, and does not justify bulk body fetching.

## Current Writers and Readers

`modules/email/mailbox-reader.js`: App Password list opens a read-only mailbox
lock and reads envelopes/UID/flags/size, max50. It emits an empty snippet and no
attachment manifest, cursor or folder total. OAuth list fetches metadata and
uses provider snippet/read labels, but does not return physical labels or a
cursor/total contract. Message/body reads parse MIME under2MB/message and
8MB/thread caps, at most30 exact same-mailbox/same-UIDVALIDITY IDs. Preserve
those caps, read-only locks, logger suppression and authentication boundaries.

`registerMailboxReads`: signed-admin/no-store GET list/body/thread adapters
call `thread-view.annotate`, which emits source-backed thread identity and
conversation role/deals/records. It deliberately does NOT expose stored raw
conversation.refs. Only unique canonical stored identities become records;
ambiguous identities remain withheld. The resulting 441 context consumer/test
was corrected to this ACTUAL contract before release.

`dashboard/workspace/email-model.js` validates source/time/message identity
and deduplicates before grouping. `mail-layout-model.js` accepts a snippet only
from consistent connected-source copies, categorizes using recorded role or
explicit report labels, and returns LOADED-thread counts. `email-screen.js`
escapes list text and body, never runs provider discovery for search, and keeps
metadata/body request ownership and private draft memory separate.

## Ordered B Acceptance to Implement After A

1. Snippets: preserve explicit provider preview provenance; do not manufacture
   preview from subject or the fallback "No readable text" placeholder. For
   App Password, design a bounded source-part read/cache strategy explicitly;
   do not fetch50 full2MB bodies on every metadata load. Prove no Seen mutation,
   byte/request limits, malformed MIME handling and session/source cancellation.
2. Attachments: metadata-only manifest from actual provider/MIME fields, not
   a paperclip guessed from subject. No auto-download/content/base64/logging.
   Missing name/type/size remain unknown; sanitize filenames and never execute
   HTML or follow remote-image links. Do not turn B into attachment sending.
3. Unread/totals: preserve provider source, captured scope and exactness. The
   current IMAP metadata defaults missing flags to unread; add malformed/missing
   flags negatives before treating unknown state as authoritative. Distinguish
   message totals from grouped thread counts and loaded display counts. Never
   label an estimated/provider-approximate result as exact N. True empty0 needs
   successful source confirmation; loading/error has no displayed count.
4. Pagination: trace immutable message identity/UIDVALIDITY and provider cursor
   lifetime; account for arrivals, deletion/expunge and sequence reordering.
   No offset guess, duplicate rows or changed-folder cursor reuse. Define strict
   limits and stale/wrong-folder/forged/duplicate cursor negatives before wiring
   arrows. Exact1-50ofN requires an exact source total with the SAME scope.
5. Labels/search: physical provider labels and WOS rule/record role provenance
   are different concepts. Never translate a name/subject guess into a person
   identity or mailbox mutation. Mail search remains bounded; cross-search may
   only read existing read-only lead/buyer APIs, not provider discovery routes.

Each piece needs its own writer/reader trace, tests, self-review and ordered
final-head/full-suite/release proof. Existing tests to extend include mailbox-
reader,mailbox-participants,inbox-thread-view,workspace-email-model,mail-layout-
model,workspace-email-loading and workspace-mailbox-chrome. Fixtures must come
through actual annotation/adapter contracts, not invented response fields.
No B provider behavior is assumed from this note; verify official SDK/API
contracts before implementation. No C switch is enabled or send tested here.
