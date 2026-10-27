# Owner454: Today Assistant Sheet

## Current Integrated Candidate

2026-10-26:the previously unwired local model is now connected to a separate
assistant-sheet controller and the existing Today shell. Actual server passes
an explicit assistantSnapshotImport capability ONLY where the private route
is registered;old/standalone registrars omit it. Canonical Today JSON still
contains no private contents. Existing assertions remain;actual server test
adds capability verification and retains eight-surface sentinel non-leakage.

Manual file choice does not upload. Explicit import sends exact raw bytes to
the existing origin/header/admin guard,then verifies the returned receipt ID
AND locally computed exact-byte SHA/filename through private GET. A forged
upload-receipt hash cannot claim success;the UI reports uncertainty and requires
read-only recovery. No canonical promotion or provider/paid/write-back action.
Static friendly rejection reasons never echo file contents. A30s deadline spans
headers AND response-body JSON. Unknown outcome locks import until GET recovery;
401/real403 clears private data,late responses cannot restore after destroy.
Canonical Show more preserves the mounted sheet;explicit Refresh deliberately
clears it. Email's composer/source lifecycle is untouched.

REAL browser experiment exposed transparent Chromium POST replays after a lost
response:one click initially persisted twice. Add an OPTIONAL per-action UUID
header,scoped to signed actor/exact file SHA+filename through the existing opaque receipt ID. Exact
replay returns the same receipt WITHOUT another disk write;conflicting reuse
rejects409,new explicit action retains a new import,legacy no-ID calls remain
distinct. All receipts keep the original EIGHT fields,including those made by
this UI,so the prior458 reader can read them on rollback. An intermediate
unmerged extra-field design was removed during self-review;no production data
or schema migration exists. Actual
route tests cover replay/conflict/new action and preserve original assertions.
Dropped-ALL-responses three-size test now persists one action and shows honest
uncertainty until GET recovery. This is transport idempotency,not a push token.

Existing browser auth helper uses a generic admin ID. To avoid crossing device
checks between actual operators,the private GET includes a one-way viewer_scope
derived from the REAL signed req.currentUser.id. It is not an authentication
credential or authority. Device storage keys hash viewer_scope+fileSHA+textID;
only boolean1 is stored,no names/phone/text/snapshot. Denied storage restores
the previously saved check and reports failure,never a send/delivery receipt.
Signed actor A/B tests prove separation despite the generic browser admin ID.
Final self-review adds per-row toggle versions:asynchronous key generation for
an older click cannot overwrite a newer checkbox intent. Three-size test holds
the first digest,finishes the second toggle,then releases the old result;only
the latest state survives. This changes the candidate head and requires a new
exact-head full gate,not reuse of the earlier run.

Performance gate correction:head77e3a5c's full functional gate passed,but a
broader Lighthouse performance audit measured82desktop/80phone despite100
accessibility. CLS0.468 came from painting canonical work before asynchronous
assistant expansion,not network/CPU latency. Do NOT call that head release
eligible. Place canonical work after the first assistant result (or error),with
an always-available explicit Open recorded work command during slow loading.
No fixed blank-height spacer or blocked canonical access. Three-size held-read
test proves the command works before the private response. Corrected phone
CLS0.120/performance95/accessibility100;full final-head audit and gate required.
Existing shell's smaller layout shift remains;do not claim zero CLS.

Phone-first unframed section precedes canonical work:Do this next,calls,explicit
Messages links,Email fallback,stage cards and full reported detail drawer,
reported buyer counts and a separate full/searchable buyer drawer. Source labels,
unknown/real0,reported-only approvals/POF/amounts,estimate wording,escaped content,
human dates,no visible internal IDs. Dead stage retained. Both drawers have X
and explicit Escape capture,including when native search would consume Escape.
No fake latest-reply ordering:457 remains only that unresolved acceptance gap.

Cache changes only CSS10->11,app7->8,new assistant model/sheet1. Unchanged
components5/nav2/emailmodel2/layout3/reply1/Email12/todaymodel1 retained. Failed
448layout4/Email13 and deferred456layout5/Email14 are NOT reused or combined.

Focused actual-import UI1366/400/412 PASS explicit choice/upload/raw hash,
rejection/previous-sheet preservation,uncertainty/replay,scope/local storage,
detail/buyer X/Escape/search,escaping/long text/null/0,read failure isolating
canonical work,late401/zero external requests/page errors. Existing canonical
Today action-center3size/navigation3size/mailbox5size pass. Synthetic before/
after audit against verifieddd04d98:current FCP80.4/55.2/36.6ms;Lighthouse13.5
accessibility100/100(before100/100),not live timing. Final-head full600s/file,
self-review/PR/merge/exactautomaticdeploy/approved435liveproof STILL REQUIRED.
No production upload/privatefile/send/settings/business write performed.

## Historical Local Model Preparation

2026-10-26 LOCAL preparation from verified maindd04d98;458 proof cherry438870d
preserved. No456 product code. Live remains458;no new release claimed.

## Trace / Separation

Private byte upload -> modules/records/assistant-snapshot-routes.js existing
signed-admin/no-store boundary -> strict assistant-snapshot.js append/receipts
-> private actor-partitioned GET -> future session-owned Today controller ->
new assistant-model.js pure view projection -> future escaped renderer.
Canonical Today remains modules/agents/today-workspace.js and existing app.js /
today-model.js. No import into canonical buyers/deals/conversations/POF/value
or readiness gates,not a native canonical Deals migration.

Current LOCAL model is UNWIRED:HTML/app/CSS/cache versions unchanged,no runtime
fetch/upload/route/capability/storage/provider call/PR/full gate/deploy. This is
not a standalone release or completion of454. Actual importer+latest receipts
feed synthetic tests,not hand-authored projection positives or private exports.

Every projected row carries assistant origin/generated_at/source_file. Deal
references retain their reported safe deal-brains path;rows without source_file
truthfully use the snapshot filename,not an inferred related deal file. Neither
is opened or independently verified. Reported money/approval/POF stays separate
and unknown remains null;actual0 survives. Receipt hash/id is a local identity
key,NOT authentication or independent evidence. The future controller must own
the signed response/request/session and discard late/obsolete responses.

Calls/emails use stable reported rank;Do this next provisionally uses newest
reported updated_at among nonempty needs_gabriel,stable input order for ties.
No unrecorded urgency inferred. All stage groups retained,including dead as a
separate historical group. Only reported drafted texts appear in the send queue;
reported sent/replied drafts are not queued again. Contact remains contact;
recent_replies explicitly null pending457,not a fabricated reply ranking.

Phone links accept only bounded plain7-15 digits with optional plus/separators;
no extension/query/control injection or guessed country prefix. SMS body is
percent-encoded,not sent. Unknown/malformed phone gives no link. Opaque draft
refs open existing Email entry,not a guessed Gmail URL. Buyer source URLs are
http(s),no credentials/control/whitespace. Renderer MUST escape all raw strings
and attributes,including source labels,search results and imported text.

Dates compare only within the SAME backend receipt (generation/import and row
dates),never browser Date.now versus server capture. No ambient clock/network/
disk/storage/callbacks;accessor/prototype/sparse/malformed/oversize guards reject
with static private-safe error. Projection does not replace backend v1 validation.

## Verified Release Checkpoint

PR459 merged7f3a326, automatic7e35879b Active/successful exact source; identical
tested aa28ddb tree. PR40420110916 and MAIN40421982834 each259/0/0,600s/file.
Public pinned true3size and signed read-only Today/Email/classic passed; same
19 classic cards restored after Back. Positive uploads only in real synthetic
local importer; no production uploads or private files. Final synthetic performance
99/96,accessibility100/100; corrected earlier82/80 CLS failure before merge.
Eight-field receipts preserve458 rollback compatibility; actor-bound opaque
receipt id dedupes transparent transport replay. See complete evidence in
docs/screens/2026-10-26-pr459-release.454 remains OPEN for owner phone review
and457 reply-evidence decision. Following implementation TODOs are historical.

## Historical Focused Tests / Remaining Work

assistant-sheet-model.test.js PASS:actual importer/actor receipt fixture,
provenance/money null/zero/reported POF/approval,unknown/empty,rank/dead retention,
forged identity/source/path/URL/dates/reference/type/sparse/accessor rejection,
SMS encoding/phone negatives,reply gap,immutability/purity/browser JSON realm.
One initial VM harness passed cross-realm objects and correctly hit the plain
object guard;test now JSON-parses in the browser realm. No product guard weakened.
Existing assistant-snapshot and today-model focused files also PASS. A mistyped
nonexistent workspace-today-model command was corrected to actualtoday-model;
not a product test failure. No full suite or UI proof claimed.

NEXT implement the actual Today import controller/renderer,not more Email work:
mount an unframed assistant section before canonical recorded work;explicit
file selection plus import command,static friendly errors,upload uncertainty
not blind retry;newest receipt source label;Do this next/calls/texts/emails/
stage cards and full detail drawer/buyer area search. Keep canonical summary
separate. Device-only sent checks scoped file hash+text ID and signed actor,
not a receipt/provider delivery claim;no imported PII in localStorage. No real
uploads/tel/SMS/provider writes/local toggle during production verification.

Use existingcomponents/dialog X+Escape/44px controls/dark role accents and
normal content scrolling. Reuse grid/row styles,unframed sections,phone400/412
first;no new decorative cards or marketing composition. Existing tests without
the new server capability must retain old Today shape/no extra private reads.
Trace the actual Today registrar before advertising availability;never rely on
a fabricated fixture capability. Late summary/request/401/auth switch must
clear private data and never reset unrelated composer/review/uncertain state.
No batch/body fanout,auto send,token/auth rewrite or discovery.

Needs actual browser three-size upload/detail/escaping/late/401/storage/error/
refresh/empty/unknown/zero tests,negative handler spy counts,UI before-after
FCP<2s/Lighthouse90+,full600s/file exacthead/selfreview/greenmerge/automatic
exactsource/approved435 read-only mixed proof. Ownerphoneapproval follows the
finished surface. No unchanged458/456 suites or old release verification loops.
