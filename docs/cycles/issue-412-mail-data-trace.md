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

## 2026-10-25 Post-445 Snippet Trace / Next Bounded Contract

445 independently completes the read-state truth prerequisite: provider flags/
labels are now tri-state with origin, including body responses;native grouping
preserves unknown. It does NOT deliver folder totals or the remaining B pieces.

Next snippet slice can avoid any new provider load: an already explicit open()
in email-screen reads at most30 exact IDs through the existing body routes.
After validation, Back retains metadata but discards state.body;this is the
only existing point where a session-local opened-message excerpt could be kept.
load(),category/search cancellation,folderSequence/sequence and destroy() must
invalidate it;no storage/logging or background/bulk body reads are justified.
Keep source provenance separate from derived display truncation and search.

Important prerequisite from the actual writer: mailbox-reader's parse paths
currently collapse absent text into literal '(No readable text)'. A new excerpt
consumer MUST NOT infer actual source text merely because body is a string or
because it differs from that sentinel. Add an explicit parser/provider-origin
availability contract at the writer,then carry it through annotate,exact-ID
body validation and a pure bounded excerpt projection. Preserve current body
display compatibility;never promote a fallback/subject/draft into a snippet.

The explicit open() response currently validates IDs,uniqueness,source_kind and
body type,not a complete metadata/body identity fingerprint. Any retained
excerpt needs matching source ID,folder/UIDVALIDITY,canonical metadata identity,
request ownership and session lifetime;wrong/late/forged/conflicting response
must withhold it. The reply draft Map must never be an excerpt source.

Provider contracts verified2026-10-25: ImapFlow Fetching Messages documents
BODY.PEEK source reads and encoded/charset-sensitive partial bodyParts. Do not
assume a truncated raw MIME prefix is readable text or issue commands inside
the active fetch generator. Gmail Message.snippet is provider preview text,
not a total or attachment manifest. Official references:
https://imapflow.com/docs/guides/fetching-messages/
https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages

This is trace/preparation ONLY,no snippet implementation/test/release claim.
Next run should implement one bounded source-backed snippet piece with real
adapter/annotation fixtures,placeholder/malformed/oversize/stale/wrong-ID/
session/401 negatives and unchanged provider request-count assertions. Keep
unopened IMAP previews unavailable instead of secretly fetching50 bodies.
