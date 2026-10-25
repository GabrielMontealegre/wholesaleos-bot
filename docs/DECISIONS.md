# Decisions

ASSUMED: D-063B active-folder counts are optional timestamped MESSAGE snapshots,
not grouped conversation totals or a cursor. Fetch separately after metadata
hydration,with one bounded read/no retries and reserved interactive capacity.
Late results update only status text,never repaint/rebind a draft/review;global
401 locking remains unchanged. Unknown/stale/unavailable counts stay absent.
Local expiry clears text without provider polling -- D-063,source truth and
preserved acquisition/reply workflow --2026-10-25.

ASSUMED: D-063B attachment manifests first expose only allowlisted metadata
from an already explicit bounded MIME read. No download/content/base64/headers
or unopened-list presence is implied. Unknown arrays/fields stay unknown;real
zero-byte parts remain0. Inline parts are labeled,not rendered;filenames are
escaped and unsafe names withheld. Reader uses shared styles,no new CSS layer;
existing D-061 text-only send schema stays unchanged -- D-063,AGENTS privacy/
source truth and official MailParser contract --2026-10-25.

ASSUMED: D-063B snippets initially use already-returned Gmail provider preview
or an exact-identity parsed body the operator explicitly opened. Native opened
excerpts are500-character session-only derived text,cleared on request/session/
view invalidation;unopened IMAP previews remain unavailable. This avoids a50-body
metadata batch and separates actual parser availability from fallback display
strings. No new read request,writer,storage or send authority -- D-063,AGENTS
source truth/privacy and bounded provider load --2026-10-25.

ASSUMED: D-063B starts with a small read-state provenance prerequisite before
folder totals. Already-returned IMAP flags/Gmail label IDs are the only evidence;
absent/malformed values remain null, not inferred read/unread. Native grouping
requires all members known read to say read; a confirmed unread member remains
unread. This adds no request, cache persistence, mailbox writer or count. Other
B snippets/attachments/cursors/search remain ordered separate pieces -- D-063,
AGENTS data truth and the documented provider flag gap --2026-10-25.

2026-10-25: #442 short-window containment is verified repaired by PR444 on
exact main ddab0a8, automatic deployment1d8e39bd-22a3-4f73-a4d0-999d820c81f6.
Fixed system folders never use inner scrolling; long labels remain available
through the explicit Mail labels drawer. Only <=650px explicit composer focus
temporarily replaces the source pane; Close restores it. Original tall-viewport
reader-height assertions remain unchanged. Five-size synthetic plus truthful
1038x503 signed live checks supplement approved #435 mixed proof. PR441's
failure and verified rollback443 remain history, not relabeled success. D-063A
technical release is not whole412/design approval; B then capability-gated C
remain separate. No send/auth/backend/settings/business-data change.

## D-063: Phased Gmail Capability Boundaries

Architect439 comment6392281483 (2026-10-25) approves A -> B -> C and permits
441 to finish gates/merge/release under A. A is read-only Gmail structure:
rail/dense full-width list/replacing reader/collapsed history/bottom Reply/
bounded search/categories/sourced context. Unsupported controls are visibly
disabled icons with "Not available yet: open in Gmail" tooltips plus a Gmail
fallback per thread. Counts/snippets/chips require sources; unknown is not0.
D-061 remains unchanged; owner design approval is still required before Deals.

B follows in separately traced/tested read-only pieces: sourced snippets,
attachment manifests, provider unread totals/cursor pagination, provenanced
provider/WOS labels and bounded mail search. Cross-search may only read existing
read-only lead/buyer APIs, never provider discovery or fabricated totals.

C follows B, one capability/PR/boundary/default-OFF owner switch. C1 reversible
mark/star/archive/label/snooze(label+date)/Trash-only writes require idempotency,
per-action audit,10-second Undo,1request/second,stop401/403/429. No permanent
delete/empty Trash. C2 new-thread Compose/Forward must EXTEND D-061: exact
preview/review/explicit message confirm,no automatic send,30/hour cap,recipient
validation,operator-picked attachments <=10MB total,reviewed Profile signature.
Legacy generic send/reply stays410. Each C PR needs forged/stale/duplicate/
rate-limit/provider-error tests and stop policy. No production test sends,
credential/settings changes or business writes are authorized for verification.

2026-10-25: architect/owner412 comment6389032123 is the current detailed
Gmail-structure contract and supersedes the earlier clarification request.
Implement its read-only visual foundations independently; unsupported mailbox
mutation/new-thread Send capabilities remain affected-slice BLOCKED439.
No visual request relaxes D-061 or authorizes production writes. Full Gmail
comparison/owner approval and later native Deals gates remain outstanding.

Owner2026-10-24: live compact Email still needs another layout adjustment.
Technical427/425/424 releases are not design approval; keep new native Deals
migration gated. Request the remaining space/width/control detail or marked
screenshot before changing the layout further. Existing D-061 transport stays
default OFF; no production Preview/Send or settings change is authorized.

Historical pre-answer435 assumption (superseded by architect decision below):
ASSUMED: missing exact-size live evidence from the Chrome viewport tool is
not proof of an application regression. Keep the affected acceptance gates
pending in435 and preserve the healthy exact-source deployment; never claim
1366/400/412 from actual1280-wide output or silently substitute synthetic
proof. Independent draft-branch reconciliation/testing may continue, but is
not a waiver to merge/deploy the next screen or enable sending -- AGENTS3/5/7,
data truth and conservative behavior; architect question435 --2026-10-23 UTC.

ASSUMED: continue D-061 phase2 implementation/tests locally while phase1's
merged release is blocked by workspace deployment availability (#423), but
keep its PR draft/unmerged until exact phase1 deployment and read-only
verification pass. A workspace Limited Access banner alongside fully
operational public status is not proof of billing trouble or permission
to change settings. Preserve the healthy running version; no automatic
deploy retries or false live claim -- AGENTS3/7/10 --2026-10-21.

Provider evidence for423: Railway's official deployments reference says the
exact Limited Access indicator is temporary resource-allocation priority
for higher tiers, with existing deployments unaffected and queued builds
processing automatically when capacity returns. Public operational status
is consistent with this. No upgrade, billing change or duplicate manual
build; unlike the earlier incident418, no unreplayed-trigger claim applies.
https://docs.railway.com/deployments/reference#deployments-paused---limited-access
--2026-10-21.

ASSUMED: source-only reply defaults use a separate signed-admin GET context
route, only after explicit Reply and enabled status; never persist a preview
merely to populate fields. User-typed additions are explicit preview input.
35s client timeout covers response-body reading as well as headers; a lost
send response is uncertain and cannot auto-retry. Composer keeps uncertainty
across local close/reopen; durable API attempt gates survive reload/restart.
No new credentials, sending enablement or production test send --D-061,
AGENTS3/5 --2026-10-21.

ASSUMED: #416's Hey Gabriel pending panel reads existing saved buyer drafts,
canonical open conversations and uniquely linked bounce activity. A bounce
report has no stored resolution, so label it reported and disclose that current
mailbox delivery status is not connected. Never infer delivery, a resolved
bounce, why a provider refused a send, or a new contact action. Unknown/sending
drafts direct the operator to check Sent mail; no retry control is added.
Use the existing PR425/shared Today system. Historical424-first order is
superseded by D-062:427,425,424,426 -- AGENTS3/5,#412/#416 --2026-10-24.

## Architect Decision: Live Viewport Proof (435)

Issue435 comment6388258726,2026-10-24: required live viewport proof equals
exact-size pinned Playwright checks on the deployed SHA for unauthenticated
screens and health, plus truthful-size existing signed-in Chrome observations
and an exact-size synthetic actual-app journey against that same source.
Required public sizes1366x768,400x915,412x915 must be measured and included in
screenshot filenames. Never transfer cookies/credentials to authenticate the
headless browser. Owner phone screenshots are helpful but NON-BLOCKING.
Mask private names,phones,emails,street addresses before persisting images.
No rollback of healthy source solely for viewport tooling limitations.
After this evidence, complete431/422 live checks and continue427,then backlog.

ASSUMED: Gabriel's2026-10-21 annotated Email screenshot makes the compact
reading-space correction the next UI priority before the Deals migration.
Email-only native hover titles replace its reserved blank help strip; Today
help is unchanged. On phones an open message keeps Inbox/Sent/More folders,
Back/Reply/Gmail, while Back restores category tabs and the folder summary.
Error/loading/unavailable-reference status is never hidden. This changes
layout only, not message contents, role/source labels, auth or send gates.
Keep release prerequisites under423 and explicit owner sign-off -- AGENTS3/5/7,
owner feedback and #412 ordered migrations --2026-10-21.
## D-062: Bounded Merges During Railway Build Outage

Architect#423 answer6350507039,2026-10-22: continue backlog work. A full-suite
green, self-reviewed non-sensitive item may merge as MERGED - deploy pending
(Railway builds unavailable), at most THREE merged-but-unverified items on
main, including already-merged422. Send/call gates, auth, credentials and data
migrations stay unmerged until deployable/verifiable individually. After
official Hobby recovery/no equivalent live build, retain Gabriel's ONE
unconsumed exact-main retry; verify every pending item's own read-only gates
and1366/400/412 screenshots. Revert only an item failing its live gate. Never
change Railway plan, billing, settings or variables. Order429,427,425,424,426.

Architect#428 answer6350507659: Gabriel performs credential rotation. Never
view/print/copy/change secret values or edit Railway variables. After builds
return AND Gabriel confirms rotation, verify configured integration status
and Gmail/Drive reads without writes; report missing NAME only. No code is
required for rotation itself; keep428 open until owner confirms completion.

ASSUMED: split D-061 into an independently tested default-OFF transport/API
slice and a subsequent existing-composer binding. Review the security and
durable idempotency boundary before enabling any UI path; never describe the
first slice as working dashboard Send. No actual message is authorized.
WOS_EMAIL_REPLY_ENABLED must be exactly true and WOS_EMAIL_REPLY_DISABLED
must not be true; implementation/verification changes neither variable.
Use signed admin plus fixed same-origin Origin/JSON/custom-header checks
for route-scoped CSRF, not a new credential or unsigned x-user-id path.
Exact uniquely linked deal/buyer receipts only; unlinked threads retain a
private receipt without a guessed entity. New-thread compose/attachments
and package/template/legal flows stay outside this API -- AGENTS3/5,D-061
and architect415 --2026-10-21.

ASSUMED: PR421's rollback-parent8e2c849 has a byte-identical tree to current
main506707f (empty git diff). Preserve its exact full-tested head instead of
force-rebasing merely to copy a merge-only ancestor. GitHub merged cleanly,
no conflict resolution/product change, and live exact source373855d verified.
No safety or test gate was waived -- AGENTS3/6 --2026-10-20.

ASSUMED: a provider-wide build pause before any new deployment exists is
an external RELEASE BLOCKED state, not a failed application verification.
Keep the last verified healthy deployment; do not revert working source or
change provider settings to manufacture a deploy. Retry the exact merged
SHA once the workspace resumes builds (Railway says paused triggers are
not replayed), then perform every live gate before calling it released --
AGENTS3/7, public Railway incidentJUA1PC5H --2026-10-20.

ASSUMED: apply AGENTS7 literally to PR417's live initial-load/category race:
revert that merge only, restore the last verified product tree, and fix/test
the race in a separate PR. No stored business data is changed or deleted;
feature source/proof remains recoverable in Git and the preserved branch.
Provider incidentJUA1PC5H is resolved; it is not the current blocker --2026-10-20.

D-061 remains APPROVED by architect#415,2026-10-20: generic signed-admin,
CSRF-protected, exact-thread reviewed/versioned/idempotent owner replies,
uncertain-send no retry, receipt, rate cap and kill switch in their own PR
AFTER the read-only Email migration is live. No production send is authorized.
Existing buyer/JV/legal/template gates remain. The rollback does not revoke
this decision; implementation is waiting on a failed live prerequisite.

## D-061: Generic Owner Reply Transport

Architect#415 answer2026-10-20 approves OptionA under#288/D-046, as its
own reviewed PR AFTER the read-only native Email migration. Signed admin,
CSRF, exact connected-mailbox thread participants, reviewed preview/version,
explicit click, per-version idempotency, uncertain-send no retry, timeline
receipt without bodies, rate limit and default-safe kill switch are required.
Existing buyer/JV/legal/template gates remain for their own flows. New-thread
compose is later. Until that PR merges, OptionB: visibly unavailable Send
plus Open in Gmail. This authorizes implementation, not a production test
message, outreach or any secret/variable change.

ASSUMED: read-only Email keyboard e expands/collapses earlier messages;
it never archives or writes mailbox state. j/k select threads and r opens
the local composer, ignored inside editing fields/dialogs. Exact shortcut
meaning is exposed in accessible help, not silently mapped to a write.
Suggested text stays blank if no reviewed exact-context reply is supplied;
never invent an offer or promise -- AGENTS3/5,#412,D-061 --2026-10-20.

ASSUMED: native Email People/Alerts is operational grouping, not evidence a
sender is human or a verified buyer. Only an exact automated mailbox name on
a recognized listing domain is an alert. Agents, unknown senders and mixed
threads stay in People; no message is deleted and unavailable/conflicting
references remain counted. Server exact thread keys and role provenance are
authoritative; never guess identity from an email -- AGENTS3/5,#412 --2026-10-20.

ANSWERED ARCHITECT QUESTION #415 -- see D-061 above. Original conflict:
#412 requires usable generic reply
Send while keeping APIs unchanged. Current /api/gmail/send,/reply and
/api/email/send intentionally return410; only buyer-specific reviewed SMTP
exists. Do not repurpose buyer/package routes or enable a legacy endpoint.
Recommend a separate bounded#288 exact-thread anchored, reviewed/versioned,
explicit/idempotent reply transport PR. Only Send is blocked; independent
read-only Email layout migrates first on the shared design system; OptionA
transport is now authorized as a separate subsequent PR, not blocked.

ASSUMED: #412 starts with an isolated browser-native workspace, one shared
stylesheet/component system and existing signed-cookie auth/APIs, not a
React/build-chain rewrite. Explicit /app?preview=1 opts into the new shell;
default /app and /dashboard remain classic until parity. No Railway flag
change or business API is needed. Real recorded Today work exercises the
foundation; non-migrated screens remain working classic links, not fake
pages. Email migrates in the next ordered PR -- AGENTS3/5,#412 --2026-10-20.

Owner priority update via architect#412,2026-10-20: design system and
usable Email are priority1 before new features, superseding the prior
money-first visual pause. Design system/shell/shared components first,
then Email, Today, cards and Pipeline in ordered PRs. Remove old styling
writers as each screen migrates; no new one-off patch stylesheet layers.
PR413 buyer-source tracking stays draft/deferred. API/auth/data/money and
outreach safeguards remain unchanged. Framework choice is technical and
must be logged, with old dashboard retained until functional parity.

ASSUMED: #393's same profit in drafts means an admin-only review panel,
not private net/cost/source information in the recipient's email. Reuse
the exact canonical card DTO. Bind its content into the existing preview
version so changed price reports invalidate a prior review before save or
send. Existing explicit approval, source gates and SMTP whitelist remain
unchanged. No live preview/send is authorized by this slice --2026-10-20.

ASSUMED: #393 profit-card slice reuses one canonical pending price report
for the exact buyer/deal pair. A match ceiling or asking price is never a
buyer/contract price. Multiple current reports require reconciliation;
flagged, hidden, terminal, malformed or future evidence yields unknown.
No installed cost default is guessed and no report/review establishes
funds. Existing matching, spread, readiness and ordering remain unchanged.
Draft-owner profit review is the next bounded slice; never place private
net/cost information in recipient email text -- AGENTS3/5,#393 --2026-10-20.

ASSUMED: #395's buyer max means the existing approved matcher's criteria
ceiling for the exact linked buyer/deal, not an agreed buyer price. Reuse
reviewed-deals.evaluate without changing it; retain unknown when no current
sourced eligible match exists. Hide criteria sources for unsigned JV rows.
Display derived-as-of provenance and keep all reported money/net and funds
statuses separate. This closes a display gap, not a new matching or offer
policy -- AGENTS3/5,#395/#393 --2026-10-20.

ASSUMED: #395 operator report review is acknowledgment/correction metadata,
not buyer approval, proof-of-funds verification, an offer, price agreement
or deal closing. Store append-only receipts separately from immutable
pending imported revisions. Require the exact current report, source check
and target/review version; a changed source/reference/target or a later
review requires a fresh check. Flagging retains the row and its group/date,
not a fabricated closed outcome. Keep unsigned source details withheld and
review disabled until existing sharing checks pass. Agents cannot submit
reviews through the signed assistant importer -- AGENTS3/5,#395 --2026-10-20.

ASSUMED: #395 producer accepts only an explicitly named structured JSON
Pipeline file, never parses pipeline.md or prose outcomes into financial
facts. Require an explicit local reference baseline for offline exact-ref
validation; it is not represented as a live production snapshot. Existing
four default file paths, pending import authority and submit budgets stay
unchanged. No automatic file discovery or real submit is authorized by
building this option -- AGENTS3/5,D-058,#395 --2026-10-20.

ASSUMED: #395 slice2 composes existing canonical pending approvals and open
conversations with typed pending reports, not legacy saved-lead status.
Each task belongs to exactly one waiting group; totals precede pagination.
A conversation is never mined into an offer or proof of funds. An approval
alone has no scheduled next date: show unknown, not a fabricated deadline.
Existing conversation rules and explicit report dates are reused on Calendar.
No match ceiling substitutes for an agreed buyer price or known total costs.
The new screen is read-only; review opens existing workspaces, never submits
or approves anything -- AGENTS3/5,#395 ordered slices --2026-10-20.

ASSUMED: Calendar close/Escape browser assertions must observe detachment
after the native asynchronous close event, not assume synchronous node
removal. Add bounded Playwright waits and retain all four zero-count
assertions and every product close handler -- AGENTS4 test scaffolding
policy; repeated local immediate-count failures --2026-10-20.

ASSUMED: #395 ships in ordered reviewable slices. First establishes a typed
pending workflow report and pure money/read projection; then producer,
operator review and shared Pipeline/Today/Calendar screens. Existing signed
import authority carries reports only, never confirms funds or offers.
Each revision is retained and pending; a reported closed outcome does not
close the underlying lead/deal. Two/five-day due dates are review tasks;
no automatic closure or message -- AGENTS2/3/4/5,#393/#395 --2026-10-20.

ASSUMED: #393's malformed assignment-cost default is not guessed. Explicit
reported total costs or an injected labeled per-state/path estimate can
produce a potential range; missing inputs stay unknown and loss stays
negative. Partner share must be explicit before showing our share. No buyer
reply/approval/match/report becomes confirmed funds or an agreed offer.
This calculator never produces ARV, MAO or a readiness decision --2026-10-20.

ASSUMED: #396 accepts a file's exact named array with sibling metadata,
retaining bare arrays and strict items-only wrappers. A wrong/ambiguous
payload container is rejected; metadata never enters row validation or
submission. The500-row examination cap is per file, with raw/considered/
truncated counts. Any truncation remains a file-level preflight error and
blocks submit before credentials/network; never silently post a partial
file. The existing10-request run and50-item/byte caps remain unchanged;
reading more rows does not authorize a larger live run -- AGENTS3/5,#396
--2026-10-19.

Owner priority update via architect#393,2026-10-19: feed#396 first, then
Pipeline#395, profit on cards, offer machine#375, then AI/chat. Pause further
visual rebuilding behind these money-workflow priorities. Existing paid,
outreach, evidence and owner-sign-off gates remain; a feature request does
not authorize real submissions, paid calls, offers or messages.

D-058 -- Architect#379,2026-10-19: assistant routines write local private
exports only; no producer currently calls /api/assistant/finds. Add a local
CLI with offline dry-run/counts by reason by default; explicit submit uses
the existing signed pending path and preserves operator edits/approvals.
No PII output, no automatic submit or approval. Fixture-only tests. Read-only
live reconciliation follows the first separately authorized real submission.

D-059 -- Architect#383 and Gabriel,2026-10-19: profile I is limited to
storage and canonical reviewed JV/template/email draft consumers. Legacy
contracts/fill remains unavailable for profile autofill; repair separately.
Signature presentation is draft-only, never signature evidence. Gabriel
puts no money down: no earnest money, due-diligence fee or deposit from
Gabriel. Required deposits are buyer-funded at assignment or blank for
review; never compute an earnest-money amount automatically.

D-060 -- Architect#390,2026-10-19: released C/B UI satisfies the bounded
read-only#372 demo prerequisite for the next#370 slice. Show feed incomplete;
reuse canonical views. No AI provider/key, capture, import, confirmation,
send, profile/contract fill, paid service or production business write.
This is not#366 owner sign-off;#369/#361/#351 stay gated. When#369/#375
open, buyer acquisition and proof-of-funds tracking precede offer volume.

ASSUMED: #379 offline duplicate counts are relative only to supplied input,
or to an explicit local baseline, never presented as production counts.
No signed read endpoint exists for all buyer/deal state; do not add one or
read dashboard secrets to fake a live preview. Agents have no buyer/deal
contract and are counted as unsupported, never coerced. File-level errors
block submission; individual rejected rows stay excluded while valid rows
use the existing pending path. Uncertain responses stop without retry --
AGENTS3/5,D-058 and existing partial pending-import behavior.

ASSUMED: #388 a failed body read does not prove a failed mailbox login. Keep
the already-read message list and connection label for ordinary read errors;
clear private content on dashboard401/403 as before. Render only fixed known
size/stale/missing/invalid/busy explanations, never provider error text. Unknown
failure stays unknown; no retry, larger byte cap or credential change is a
diagnostic fix -- AGENTS3/5,#388 --2026-10-18.

ASSUMED: #366 architect copy/help corrections describe navigation and recorded
workflow only. Today headings use existing reported person/buyer names or the
same JV-permitted property heading; a reference is metadata, not a guessed name.
Unknown names stay missing, unsigned street addresses stay withheld. Approval
counts/targets and all eligibility/sort rules remain canonical. Unmapped sidebar
pages get no generic fake explanation. Voice toolbar is a sibling of its field
label, not a nested label inheriting unrelated help -- AGENTS3/5,#366 comments --2026-10-18.

ASSUMED: #370 privacy overrides ordinary browser speech fallback. Chrome's
default recognition can transmit audio to a service, so accept only explicit
processLocally=true with available installed language support; otherwise type/
keyboard hint with no privacy promise about the user's keyboard. Never install
a pack or enable a provider automatically. Read aloud requires a localService
voice and a tap. Ship reusable composer controls first; assistant commands
integrate with#372 when its actual data surface exists -- AGENTS3/5,#370 --2026-10-18.

ASSUMED: #366J Connected means only that Google's read-only account check
accepted the existing Drive authorization, not that backups or folder sync
occurred. Show only recognized provider reason codes and missing variable
names, never raw provider errors or account details. Setup is owner guidance,
not an automated grant, credential change or backup -- AGENTS3/5,#366J --2026-10-18.

ASSUMED: #366H Stage/Search narrow the existing eligible JV read pool before
the display cap, never alter eligibility or stored records. Search covers only
permitted card fields, not an unsigned subject address. Existing advanced
filter values remain active under More with a count; phone outer collapse and
Today layout are retained -- AGENTS3/5,#366H --2026-10-18.

ASSUMED: #366E Skip means hide this exact pending row version for the current
session, not reject or change business data. A changed version reappears and
Show skipped reverses it. Approval still requires the existing explicit review
and version gate. Briefs read canonical evaluation only, preserve preliminary/
list-price labels and split-adjusted share, and never infer a purchase from a
buyer claim, type or workflow approval -- AGENTS3/5,#366E --2026-10-18.

ASSUMED: #366B Calendar is a read-only projection of existing activity,
conversation and explicit calendar/deadline records, not a new ingestion or
reminder writer. Existing conversation rules supply labeled derived due dates;
natural-language promises are not parsed into commitments. Prepare follow-up
opens the existing recorded draft for Gabriel, never sends it. Manual local
events remain local and labeled. Missing/ambiguous identity or date evidence
does not gain a guessed click target or sale date; no production import is
performed to populate the screen -- AGENTS3/5/7,#366B --2026-10-18.

ASSUMED: #366F keeps Inbox/Sent and the requested role filters fixed; secondary
physical Gmail folders/labels and recorded notes stay reachable in one native
Other folders chooser rather than a clipped or internally scrolling folder
column. Role filtering remains local to the actual bounded mailbox response,
never a claim of all-mail search. Sender names come only from structured IMAP
headers or the existing MIME parser for Gmail headers, not a conversation's
private record name or an email local part. Unknown names/roles remain unknown.
F changes layout/readability only; existing read-only locks, thread evidence,
link/save guards and disabled generic Reply Send remain -- #366F,AGENTS3/5,
D-056 --2026-10-17.

ASSUMED: #366C sends only a buyer buy-box enquiry or the existing canonical
blind JV teaser, to one approved buyer's published email after preview, saved
draft and a separate reviewed Send click. No arbitrary recipients, attachments,
HTML, private deal fields or automatic sends. Reuse D-046/D-050 and the existing
JV teaser/value/availability gates; preserve old disabled bulk/generic routes.
Persist sending before SMTP; uncertain attempts stay non-retryable by draft id.
SMTP acceptance is not delivery, a reply, seller contact or a JV-stage change.
Source-reported buyer type never changes matching classification/approval; an
operator override survives imports. Never infer institutional purchase proof.
Legacy import freshness is unknown until an actual normal import records it;
release verification must not import a feed to improve counts --2026-10-17.

ASSUMED: #366G uses the existing shared geography matcher and county directory,
with full-store aggregate location facets before pagination. geography=1 opts the
dashboard out of legacy regional restrictions; old API consumers keep their
existing behavior. Explicit location changes clear legacy county-only quality
shortcuts, retain other deliberate filters, and never change stored rows or
readiness. Missing location facts stay missing -- AGENTS3/5,#366G --2026-10-17.

ASSUMED: owner2026-10-17 authorizes cloud CI and opt-in scrubbed Sentry before
the existing#366 order;no new Sentry DSN/account/paid plan or production variable
change is authorized. CI reuses the Windows PowerShell runner and pinned browser;
no lockfile exists,so use npm install --ignore-scripts transparently rather than
pretend npm ci works or churn dependency ranges. Full hosted gate,not CLEAN merge
state,is evidence. Heartbeat tooling cannot pin effort;never claim it did and
skip autonomous implementation if medium/standard cannot be established.

ASSUMED: #366A bounds the existing lead table's row-scroller and keeps column
headers sticky only inside it; the old MODE toolbar flows normally rather than
floating over content. Preserve all diagnostic/filter sections instead of hiding
them to force a viewport fit. Letter G owns replacing regional modes/checkboxes.
Overlay hygiene delegates dismissal to existing modal/notification/native dialog
closures or removes only an existing legacy overlay; no save/send action or login
screen is included. Escape closes only the highest overlay; no backend rewrite
or form auto-save -- AGENTS3/5 and #366A scope --2026-10-15.

Owner order #366,2026-10-15: D,A,G,C,F,B,E,I,H,J,one PR per letter and live
1366/412 click-through. Pause county ranking; notify Gabriel when C and B are
actually live so he can inspect/sign off #341. No premature sign-off assumed.

ASSUMED: #366D recent-record buttons use a unique server-resolved kind/id,
never reference-prefix inference or a generic buyer-page fallback. Missing or
ambiguous targets open Activity. Explicit deal navigation ignores existing UI
price/type/verdict filters only for that exact requested record, preserving
backend admission, evaluation and original filters on Back. Overdue starts
collapsed, keeps its actual count, and preserves expansion on refresh. Queue
membership and readiness are unchanged. An empty live Best list cannot be
seeded for proof: exercise its handler with synthetic fixtures and report the
live empty state plus real recorded-deal opening -- AGENTS3/5,#366D --2026-10-15.

ASSUMED: D-056 card Room reads the existing canonical estimated_spread.low,
after the recorded JV split; never the larger gross max-minus-asking or a
fallback when split/value is missing. Label derived/before-costs/not-offer.
Buyer counts retain the existing approved geographic-match meaning; opening
them does not approve a deal or authorize contact. Holder remains Holder,
not inferred Owner -- AGENTS3/5,existing evaluator and prior#344 --2026-10-13.

ASSUMED: D-056 buyer contact time is labeled Last contact report, not an
inferred channel/reply status. The existing projection supplies only an
attributed history timestamp. Hide absent optional card fields, retain unknown
match status and all provenance cautions; card navigation reuses the existing
detail opener without writes -- AGENTS3 truth and conservative UI --2026-10-13.

ASSUMED: GitHub#341 being CLOSED alone does not replace Gabriel's required
final P0 sign-off. Its comments contain no such acceptance and remaining UI
criteria are not complete. Continue only P0 slices and keep source/comps
features paused -- direct owner order and D-056 --2026-10-13.

ASSUMED: D-056 bell uses existing stored alerts plus the canonical Today work
queue, not new job/message writers. An explicit Mark read changes only existing
notification read flags; opening a row does not post, zero IDs never posts, due
work cannot be dismissed via read status, duplicate IDs fail closed. Missing
delivery/job producers stay missing; no new Telegram/outbound action is needed
for a read-only UI release. Reuse routes/retention/auth and direct UI openers
instead of guess record links or rewrite backend -- AGENTS3/5,D-056 --2026-10-13.

ASSUMED: #347's flag is a compiled UI rollout flag, not an auth/data gate.
First release stays OFF; its exact deployed /dashboard,health and assets must
pass before a separate tested activation commit. No production data/settings
write or Railway variable is used. Immutable release metadata sits outside
mutable data; original failed-deploy cause remains unproven -- #347 and AGENTS
truth/deploy precedence -- 2026-10-13.

ASSUMED: #344's room criterion uses the existing evaluator's calculated
estimated share (JV split already applied), not a larger invented gross profit.
Interim grades label all stored evaluations; the best reviewed list remains
conservatively restricted to current reviewed value-backed positive-share
Diamond/Gold records. Grade never changes offer/readiness/contact permissions.
The real test fixture6625 is Gold for missing room>=10000 -- AGENTS3 value
truth,existing canonical math and #344 -- 2026-10-13.

Architect answers on#344/#347/#349,2026-10-13: use stored-fact interim grades
without changing canonical value/offer readiness; re-release Today behind a
default-off flag and verify exact-head dashboard200 before enabling; buyer/deal
and changed-comp approvals satisfy the current P0 contract, with missing draft/
request producers deferred. Sources are those issue comments, not guessed data.

ASSUMED: pinned Tabler1.6.1 is scoped to rebuilt component roots via a generated
CSSOM stylesheet; original assets/license/hashes are retained. Reuse existing
proven mobile drawer handlers rather than impose conflicting kit layout
classes on legacy pages. No runtime CDN, framework migration, auth or backend
change. Remaining P0 screens adopt the same kit boundary as rebuilt -- data
safety/architecture consistency and #341's permitted conflict alternative,
AGENTS3 -- 2026-10-13.

ASSUMED: #341's live approval action-color defect is corrected immediately in
a separate CSS-only follow-up, with computed-style tests and full release gates.
The guarded buyer/deal workspace remains available; no approval is performed and
the slice is not marked complete until the visual correction is live. This avoids
an availability rollback for a presentation-only cascade defect; auth, handlers,
records and safety gates are unchanged -- data/operational safety precedes style,
AGENTS3 -- 2026-10-13. A functional or data failure still requires AGENTS7 rollback.

D-056 -- Gabriel via #341, issued2026-10-13 UTC: usability first. Menu returns
to LEFT, superseding #325's right-side choice. Pause new features until Gabriel
signs off on the complete P0 shell/action center/Approvals/bell/clickable-card UI.
Source: https://github.com/GabrielMontealegre/wholesaleos-bot/issues/341.

ASSUMED: #341 may ship ordered,fully tested UI sub-PRs for read-only live
inspection; its parent remains open and no paused feature resumes until the
required Gabriel sign-off. Preserve all legacy routes behind More rather than
delete their nodes/handlers/counts. Unimplemented P0 pages are not represented
as functioning links in the shell foundation -- AGENTS sections2/3/5, D-056
and #341's acceptance/sign-off wording -- 2026-10-12 owner day.

ASSUMED: #325 waiting-card hygiene uses the existing owner-time formatter,
sorts displayed rows by real due date (overdue,today,rest), hides empty source/
draft lines, and puts source attribution in hover text. Roles/colors come only
from recorded role metadata. Reply opens the existing recorded thread; otherwise
Open deal needs an exact globally unique reviewed-deal ref, not a WOS-prefix
guess. Unknown/ambiguous links get no invented action. linked_deals is a read-only
id/ref projection, never persisted; mailbox sync/copy handlers and reminders
remain unchanged. No actual reply/send/sync as release proof -- AGENTS truth/
privacy precedence and latest #325 architect comment -- 2026-10-12.

ASSUMED: #325's JV workspace ships in ordered slices: first keep recorded active
JVs visible separately from current buyer readiness, show partner/buyer/money
and the canonical next stage, and retain the existing guarded progress controls.
Invalid history never labels a record active or ready. Closed/dead/rejected
records remain under the existing explicit hidden-record filter. Near misses
remain visible with canonical reasons; visibility grants no sharing permission.
The existing nine D-048 stages win over the mockup's ten visual segments. This
slice relocates the existing single saved-draft control without changing its
explicit save route; the exact linked conversation/template integration follows before
closing #325. #288/#336 own actual Send. Section counts say loaded because the
existing response cap is100 -- AGENTS sections2/3/5,D-048,#325 mockup -- 2026-10-12.

ASSUMED: #325 clean buyer-card counts are reviewed-deal candidates from the
unchanged canonical evaluator, not the old saved-lead geography count. Match
requires known comparable value/buyer maximum/asking and an active record;
price/value/geography near misses are kept separate with sourced reasons.
Canonical buyer notes remain check items, not exclusions. Pending/AI-ineligible
buyers never receive matches. This view does not authorize an introduction,
offer or marketing; existing JV privacy and contact gates still apply. Last
contact is labeled an operator status report, never derived from source capture
or a preset status. List is compact; all old source/contact/approval/draft/history
controls stay on the open card -- AGENTS truth/preservation and #325 mockup --
2026-10-12.

ASSUMED: #325 Inbox is an ordered read-only workspace slice before #288 Send.
The mockup's missing role types extend the explicit conversation-role allowlist;
legacy holder/partner display as JV partner. Roles are not inferred from senders,
subjects or Gmail folder names. Exact mailbox headers/thread anchors plus stored
operator/imported-report linkage supply role context; conflicting links remain
unlinked for review. Closed historical links may label mail without reopening a
conversation. Threads cover the latest30 messages in the selected folder, not
unseen cross-folder history, and say so. A selected thread uses one read-only
IMAP lock/connection with sequential bounded reads; no seen/star/label change.
WOS notes remain reported next steps, not real email. Send stays explicitly
disabled until its guarded slice; no live link/save/send during verification --
AGENTS sections2/3/5, D-046/D-050 and #325 mockup comment -- 2026-10-12.

ASSUMED: #325 clocks ship as ordered presentation-only slices, reviewed deals
first. Server-stamped first_seen_at means added to WholesaleOS, not the source
event date; captured_at remains separately labeled. Only the existing reviewed
deal's normalized closing/auction projection is a displayed deadline. No preview
sale-date copies or source-date parsing are added. Owner time is fixed UTC-7,
calendar days are derived and never affect a gate. Actions are labeled recorded
reports, not proof that contact/closing occurred; a preset stage without a matching
recorded transition has unknown age. Missing clock facts remain Unknown despite
the general empty-field hiding preference, because the owner's explicit clock
requirement and data truth take precedence. Saved-lead/property clocks follow;
no acquisition/contact action is triggered -- AGENTS sections2/3/5 and #325
owner comment -- 2026-10-12.

ASSUMED: #325 replaces separate help buttons with existing-label hover/focus and
touch hold. The full glossary remains; short definitions are informational, not
evidence. Unknown labels receive conservative generic context, not guessed domain
facts; person/property-name headings are excluded from term inference. Native
dynamic titles and disabled states remain untouched. Long/cancelled/stale-target
holds consume their action click, never an operator confirmation; normal explicit
clicks retain behavior -- AGENTS truth/no hidden automation and owner #325
hover/long-press decision -- 2026-10-12.

ASSUMED: #325 ships ordered UI-only slices. The latest owner comment supersedes
#294's light default; prior light tokens remain as an optional switch. Move
existing nav nodes to the right/groups, preserving identity, routes and role
visibility; add a Settings gear shortcut without replacing auth/admin pages.
The explicit local UI preference contains no credentials. Hover help/clocks and
email/buyer/JV redesign follow separately; D-048 canonical stages remain, and
actual Send waits for #288 -- AGENTS sections2/3/5 and the #325 owner design
comment, 2026-10-12.

ASSUMED: #307C is split at the required read-only dry-run gate. The original
9,000 archive range applies to proposed new moves, excluding existing archives;
all archived rows still reconcile in the full report. Unknown/ambiguous source
events prevent an old-tax archive but never become fresh dates. Upcoming dates
count only for explicit sale origins within twelve months. Only an explicit
source-backed address-repair receipt counts as an attempt; no existing producer
was found, so placeholder/counter history cannot invent one. Geography uses
existing approved-buyer provenance and fit logic, without price/type exclusions.
No apply/undo or production move in this slice -- AGENTS truth/preservation,
D-049 and #307's dry-run-before-bounded-move contract -- 2026-10-12.

ASSUMED: #307's email-template slice saves explicitly reviewed operator-input
text, with append-only revisions, separately from actual email approval/delivery.
The first20 policy counts only unique, unambiguous accepted SMTP Message-IDs
matched to exact reviewed draft digests. Template saves/imported interactions
never count as sends. No send/SMTP/IMAP writer or automatic personalization is
added. #288 must compose through current JV privacy guards, obtain the required
exact-message approval and persist real transport receipts; template approval
is not permission to disclose an unsigned JV address. Explicit Send is always
required,even after20. Literal templates remain visible/editable,not guessed
from inbox text -- AGENTS truth/no hidden automation,D-046/D-050 -- 2026-10-11.

ASSUMED: #307 signing re-review appends a separate operator report tied to the
current holder terms and a stale-card version. It requires the original real
signed stage, all signing checks, raw signing-date proof and current contract/JV
document URLs. It never changes a stage, erases prior signing history or asserts
that anything was sent. Missing terms and malformed reviews remain locked;
production verification makes no real review -- AGENTS truth/preservation and
D-048 -- 2026-10-11.

ASSUMED: #307 JV controls reuse the canonical server stage/check schema and the
existing source-backed term updater. Preview is GET-only and never asserts a
send. Action time is entered explicitly in Gabriel's UTC-7 zone; no stage,
signature or check is automatic. Legacy history/status and split-only editing
remain compatible; signature amendment/re-review is the next bounded slice,
not a silent overwrite. #325 owns the global theme/menu/clock consolidation --
AGENTS truth/data preservation and D-048 -- 2026-10-11.

ASSUMED: #307 JV stages are split into data foundation then workspace actions.
D-048 supplies the authoritative stage order; #325's different visual step labels
must not infer extra actions. Existing legacy statuses/history remain intact,
never auto-migrated into signed or contacted facts. New full-package previews
require the explicit raw signing date, verified contract-copy report and current
terms fingerprint, independently of the legacy introduction label. No live
reports or sends are made during release verification. Gabriel's latest order
is JV stages, email templates/approvals, triage; then #325 dark UX, #288 send,
#304 bugs1-7/12 then8-11, government property timelines, FL sales/deed-backed
buyers, briefs/photos/map/Deal Check -- AGENTS sections2/3/5, D-048 and Gabriel's
updated order -- 2026-10-10.

Decisions that agents must follow. Gabriel's decisions outrank architect decisions; both outrank
agent assumptions. Agents append `ASSUMED` entries at the bottom; the architect promotes or
corrects them during review.

## Gabriel's decisions

ASSUMED: #294 follows the newer 2026-10-08 marketplace design comment: light is
the default; Night desk/light-toggle persistence is phase 2. Exact approved
tokens are preserved. Amber-on-amber measures 4.176:1, so warning chips use ink
text and retain amber border/background; no palette value is changed. Missing
photos use a labeled neutral placeholder. Buyer legitimacy stays at its existing
sourced trust label until #262 defines grades; do not invent Gold/Silver/Bronze.
Compact JV titles withhold the subject street address until the recorded signed
stage, and calculated room is labeled before fees/split, not an offer. All new
behavior is presentation/view navigation; backend gates and field values stay
unchanged -- AGENTS section 3 truth/contrast precedence and latest #294 comment --
2026-10-08.

ASSUMED: #297's explicit bulk reference operation is capped at 500 assignments,
defaults to buyers/reviewed deals/existing matches, and does not evaluate new
matches or expiry. Every deal namespace reserves 1030; supplied reserved references
remain valid. Legacy leads receive a reference only on a validated explicit
single-record action; GETs stay read-only. A private byte-for-byte database backup
and executable fact/history preservation check precede the bulk write -- because
the architect's 2026-10-08 comment and Gabriel's authorization permit metadata
only, not 12,039 lead assignments or workflow changes -- 2026-10-08.

ASSUMED: replace only the ambiguous-slash fixture's relative date with fixed `10/09/2026` in dashboard-public-deal-queue.test.js. On 2026-10-07 the relative +3-day value became `10/10/2026`, a single-valid-reading date, invalidating the fixture's intent. Null assertions and product resolver stay unchanged — AGENTS section 4 incidental date scaffolding — 2026-10-07.

ASSUMED: #283's first-panel requirement is a release gate; the old public panel's later prepend defeats the new wrapper. Revert PR #291 without touching data, preserve its implementation for an ordered repair, and require actual dashboard mount/hydrate/re-render proof — AGENTS section 7 — 2026-10-07.

| ID | Date | Decision |
|---|---|---|
| D-001 | 2026-09-26 | **Texas is parked, not abandoned.** Texas sale prices are not public. No new Texas comp machinery beyond the operator-browser lane and the paid-comp switch (off). Texas leads still get ranking, cards, links, phones, CRM. |
| D-002 | 2026-09-26 | **Charlotte (Mecklenburg County, NC) is the first automatic-comp market.** Wake County, NC is the fallback if Mecklenburg data needs a mailed request. Detroit (Wayne County, MI) second. |
| D-003 | 2026-09-26 | **Detroit ballpark comps**: county data has no bedrooms/baths, so comps may match on sq ft, year, lot, distance and recency, labeled "Ballpark — bedrooms/baths not confirmed". MAO from these is labeled ballpark. A screenshot or the call upgrades to verified. |
| D-004 | 2026-09-26 | **Paid comps switch exists, off by default.** Estimates/AVMs are never comps. No provider chosen. |
| D-005 | 2026-09-30 | **2 verified comps = preliminary value** (always labeled preliminary). 3 = verified. |
| D-006 | 2026-09-30 | **Possible phone numbers** from any source (skip trace, people-search page, screenshot, the call) are shown labeled "Possible number — not confirmed", with the source. A sourced possible number makes the lead callable. If none: show people-search links. The system tries first in the operator's browser. |
| D-007 | 2026-09-30 | **Texting**: Gabriel picks up to 20 leads at a time; messages are human-sounding; sent from the operator's phone (tap-to-send). No automated sending. |
| D-008 | 2026-09-30 | **One CRM timeline per lead**: every interaction logged with date, time and who (Gabriel or which VA): acquired, opened, closed, reopened, calls, texts, notes. Plus lead clocks: sale/event date, stale date, last touch. |
| D-009 | 2026-09-30 | **Passed sale dates are not dead leads.** They move to an "After the sale" lane (postponed, still-owner, bank-owned, sold to investor, redemption) — never discarded. |
| D-010 | 2026-09-30 | **Loan interest rate matters** (low rate → subject-to). It is a call question; a typical-rate clue from the loan date is allowed, labeled. |
| D-012 | 2026-09-30 | **No paid services yet.** Everything must work free first. |
| D-013 | 2026-10-01 | **Generic adapters for every state.** No county-specific naming in new code; Dallas, Ellis, etc. are profiles. |
| D-014 | 2026-09-26 | **VA materials** exclude MAO, spreads, buy boxes and title companies. |
| D-015 | 2026-09-26 | **Offer math**: MAO = ARV × band% − repairs − fee. Band: 70% under $120k ARV; above that, the course chart up to 80–83%. Repairs before condition is known: $20/sq ft light to $50/sq ft heavy, labeled estimate. |
| D-016 | 2026-10-01 | **Codex merges and deploys when all gates are green.** The architect reviews after merge. Gabriel is asked only for business, money, legal and outreach decisions. |
| D-017 | 2026-09-30 | **Presentation**: professional, plain English, not crowded. |
| D-018 | 2026-10-01 | **"Ready to reach out" replaces "call ready".** A lead is ready when we know enough to contact the owner by any channel (verified address + owner identity, not proven to belong to someone else, not do-not-contact). A phone number is a route, not a gate: the card shows the best route (call → text → email → mail/visit → find-a-phone links). Unknown dates show a caution instead of locking the lead. Full rules: AGENTS.md §5 Contact. |
| D-019 | 2026-10-01 | **No county names as labels.** Never call anything "the Dallas adapter" in code names, UI, reports, PR titles or tests. Sources are county profiles in one generic system; the county appears only as data ("Dallas County notice"). |
| D-020 | 2026-10-06 | **Land is a first-class deal type**, starting in Dallas–Fort Worth. Same truth rules as houses: sourced parcels, sourced demand signals, no invented values. Land buyers (builders, developers, funds) go in the same buyer database. |
| D-021 | 2026-10-06 | **The buyer database is a core asset.** Every buyer has a source and a consent status per channel. Good-fit buyers get a first look at a deal before it is posted publicly; then it can go to groups. |
| D-022 | 2026-10-06 | **Contact people who publicly posted a matching want.** When someone posts in a Facebook group (or similar) that they are looking for a property or land that matches a deal, Gabriel may contact them one-to-one, himself, from his own account or at the contact they published, even if they never contacted us. Up to 20 per batch, logged; stop at the first "no". |
| D-023 | 2026-10-06 | **Texas texting cleared by Gabriel's lawyer** (reported by Gabriel). A-017's Texas texting switch may be on. Unchanged: Gabriel chooses each batch of up to 20, no automatic sending, Do-Not-Call respected, the §1101.0045 disclosure on every Texas deal summary. Contact from the app (call, text, email) is a top priority. |
| D-024 | 2026-10-06 | **Land starts in all the major growth counties, not one.** Texas metro growth rings first (Dallas–Fort Worth, Houston, Austin, San Antonio), then the Charlotte ring. Order comes from public growth data (B-16). Land is treated as a wholesale deal. |
| D-025 | 2026-10-06 | **WholesaleOS inside the browser for Facebook, Zillow and Redfin, never Skool.** What Gabriel reads there can be saved into WholesaleOS and sorted into opportunities. Muse is Gabriel's personal assistant; Gabriel does the outreach himself. |
| D-026 | 2026-10-06 | **Gabriel's AI assistant helps in his accounts; Gabriel sends.** The assistant is Claude in Chrome, running in Gabriel's own Chrome (Gabriel: "use you instead of Muse"; Muse is US-only, A-020). It finds groups, reads posts, collects buyers and public wants, and drafts deal posts and messages. Each post or message is sent only after Gabriel approves that one (A-016); nothing is posted or messaged automatically or in bulk, because Facebook restricts accounts that do that. WholesaleOS gives the assistant tasks and takes in what it finds (B-20); WholesaleOS itself never sends. *Amended 2026-10-06; the earlier text let the assistant post and message on its own.* |
| D-027 | 2026-10-06 | **Nationwide.** All US counties, rolled out state by state from free statewide data. Texas and Florida first, then the Charlotte ring, Michigan, and other states with free statewide parcel files. Free sources only at the start (D-012); paid apps only after the free version proves what works. |
| D-028 | 2026-10-06 | **Gabriel calls and texts from his own Texas and Florida numbers.** No paid sending service is needed for B-10. |
| D-029 | 2026-10-06 | **One click per batch.** Before Gabriel's assistant sends seller or realtor texts or calls, Gabriel approves each batch (up to 20) with one click. Buyer and public-want messages follow D-022 and D-026. |
| D-030 | 2026-10-06 | **Florida is a first automatic-comp market, next to Charlotte** (amends D-002). Florida publishes sale prices statewide, and Gabriel has a Florida number. |
| D-031 | 2026-10-06 | **75% offer band for ARV $120k–$200k** until the course gives a number (fills the gap in D-015). |
| D-032 | 2026-10-06 | **Land area tiers for the 10-15-20 rule** (A-018): new homes nearby sell under $350k = lower-income (buy 10% / sell 15%); $350k to under $1M = suburban (15% / 20%); $1M+ = high-end (20% / 25%). New-home prices must be sourced. |
| D-033 | 2026-10-06 | **The assistant may act in Gabriel's Facebook up to the send button** (extends D-026). Claude in Chrome may join real-estate groups for him (no email or phone typed into join questions) and type a drafted message into each person's chat box; Gabriel presses send. It never presses send, posts or comments. It never types Gabriel's PINs or passwords. |
| D-034 | 2026-10-06 | **A "Buyers found" tab on the dashboard is the next product priority** (first slice of B-18/B-20). It shows the buyers the assistant finds each morning, with the drafted message, a profile link and the status (messaged / replied / not a fit). |
| D-035 | 2026-10-06 | **Gabriel approves everything the assistant brings back.** Buyers and deals found by the assistant (Facebook now, Craigslist next) arrive categorized as `pending`. Only buyers and deals Gabriel approves are used for matching and outreach. Rejected items stay stored, hidden. Craigslist is read in Gabriel's own browser only, at human pace (A-001), and covers the "real estate wanted" and "for sale by owner" sections. |
| D-036 | 2026-10-06 | **Build the machine before the paint.** One end-to-end golden-path test (#264) walks a deal from public notice to buyer outreach. Backlog items turn its steps green, and the front-end pass (B-15) waits until steps 1–8 pass. |
| D-037 | 2026-10-06 | **Separate tabs, one engine.** Leads, Buyers, Title Companies, Outreach and Deals (the machine view of each deal's golden-path stage) are separate tabs that read and write the same records, so a change in one shows in all. The dashboard summarizes them. |
| D-038 | 2026-10-06 | **Keep what is real, label the rest.** Existing dashboard buyers that check out on the public web (a real company with a current buy box) keep their buy boxes and are labeled verified. Only those that can't be found are labeled "AI-generated, unverified" and kept out of matching. Nothing is deleted (amends #262). |
| D-039 | 2026-10-06 | **Usability floor before the golden path** (amends D-036). Every URL is a link, every lead row opens the lead, every count opens its list, filters by state and county work, junk rows and wrong-property links are never shown as leads, and nothing can be sent to test or unverified buyers. This is access and correctness, not redesign; the visual redesign (B-15) still waits (issue #269). |
| D-040 | 2026-10-06 | **Every lead gets a use; not every deal is a wholesale deal.** Each lead shows which strategies fit (cash wholesale, subject-to, seller financing, novation, fix and flip, land, rental, after the sale) with a reason and the seller question, and sits in one lane: reach out, creative finance, land, after the sale, direct mail, research, buyer intel, market data, or not a property. Nothing is discarded. A Deal Check panel tops every lead (issue #275). |
| D-041 | 2026-10-06 | **The first deal happens in Tampa Bay, Florida** (Hillsborough first, then Pinellas and Pasco). Florida has real public sale prices (verified comps), 9 of the 24 approved buyers, normal remote closing, and an online title company. Gabriel has a Florida number. Dallas continues with Texas list-price comps (A-023) but is not the first-deal market (issue #277). |
| D-042 | 2026-10-06 | **Vetted deals come first.** The dashboard opens on Today's Deals: at least 10 vetted deals a day from good wholesaling markets (wholesaler posts, Xome, Auction.com, HUD, HomePath, Craigslist, county auctions, own leads). Each has our comps, our ARV, the matched buyer's max price, Gabriel's estimated spread, the deadline and a verdict. JV deals in Florida are structured so Gabriel holds a contract interest and fees are paid by the title company at closing (issue #283). |
| D-043 | 2026-10-07 | **JV deals have rules and an expiration date.** A JV deal shows in the JV tab only when: it is fresh (posted ≤ 14 days, closing ≥ 7 days away); still alive (re-checked, holder confirms); the numbers are real (our ARV from ≥ 2 real sales within 6 months, asking ≤ the buyer's max or within 10% to negotiate); and an approved buyer matches, in any state. It expires on the holder's closing date (or posted + 14 days) and is never deleted. Before any buyer introduction: the holder's contract copy is verified and a JV agreement is signed, with Gabriel co-holding the contract interest and fees paid by the title company (#283). |
| D-044 | 2026-10-07 | **Every term has a (?) help.** Plain-English tooltips and a glossary for JV, ARV, MAO, comps, strategies, lanes and statuses (#285). |
| D-045 | 2026-10-07 | **Gabriel is a foreign person for US tax** (not a US citizen or green-card holder). Expect the closing agent to apply FIRPTA withholding (up to 15%) on amounts he receives from US property interests, assignment fees included, unless the agent advises otherwise. He reclaims any excess through a US tax return (ITIN). Get a CPA who works with foreign investors before the first closing. |
| D-046 | 2026-10-07 | **Email from the dashboard** (amends A-012 for email only). Cards can create Gmail drafts in the connected account, and "Send" sends on Gabriel's explicit click, one email or an approved batch of ≤ 20 (D-029). Nothing is sent automatically. Every draft and send is logged. Buyer emails never include a deal's address before the JV is signed (D-043) (#288). |
| D-047 | 2026-10-07 | **Delete the test buyers** (Gabriel). The 4 test records in production are exported to a private backup and then deleted, and placeholder or test buyers can't be created again outside test fixtures. Real and assistant-found buyers are never deleted (#262). |
| D-048 | 2026-10-08 | **JV deal → buyer pipeline** (Gabriel's flow, made safe; refines D-043). Stages, in order, each logged with a date: (1) **Found** (holder's post or email, our comps); (2) **Holder interested** (holder says yes to a JV; we record their split or fee, contract price, closing date, title company); (3) **Buyer teaser** (matched approved buyers get a blind teaser: area, beds/baths/sq ft, condition, price, our ARV with comps count, closing date; **no street address, no holder name**); (4) **Buyer interested** (a buyer says yes at a stated price); (5) **JV signed** (holder's contract copy verified + JV agreement signed: Gabriel co-holds the contract interest, non-circumvention and non-solicitation for 24 months, fees only through the title company, irrevocable disbursement letter); (6) **Full package** to that buyer (address, photos, access, contract-interest terms); (7) **Earnest money at title**; (8) **Assigned**; (9) **Closed / dead** with a reason. The address and holder never go to a buyer before stage 5. A holder who asks for the buyer to "message me directly" gets the JV agreement first. Holder questions to ask before signing: see `docs/knowledge/JV_CHECKLIST.md`. |
| D-049 | 2026-10-08 | **Saved-lead triage: keep, park or archive, never delete** (Gabriel: "if not viable, toss them out"). "Toss" means the archived lane with a reason, reversible, never a delete. Archive: tax-lien rows older than 3 years with no current distress event, and rows with no street address after one repair attempt. Park ("no buyers here yet"): leads outside the markets where we have approved buyers; they come back when a buyer covers that market. Keep and comp: leads in buyer markets with a verified street address and a distress event dated within 12 months; the daily comps job fills these (up to 10 a day) through the operator-browser lane. Show the counts per bucket on the Leads tab. |
| D-050 | 2026-10-08 | **Conversations and reminders in the dashboard** (Gabriel: "remind me… you need to send a message"). Every active conversation (holder, buyer, partner) is a record: person, ref, channel, last message both ways, what they said, our next step, due date, status (hot / to send / follow-up / waiting on deal / closed). Dashboard home shows "People waiting on you" first, hottest and overdue first, with a ready message and the right link (Messenger chat, Gmail thread). Follow-up cadence Day 0 / 2 / 5, then weekly while the deal is alive. Emails: the first 20 of each kind (holder JV reply, buyer buy box, buyer teaser, follow-up) are shown to Gabriel before sending; his edits become the template. Facebook messages stay manual: Gabriel sends them. |
| D-051 | 2026-10-09 | **Wider comp radius when the 1-mile area is thin** (Gabriel: "yes 2.5 miles"; amends the strict grid distance only). The strict grid stays at 1 mile. When fewer than 3 sales pass the grid within 1 mile, sales from 1 to 2.5 miles may count, if they pass every other grid rule (6 months, ±20% living area, ±1 bed/bath, ±15 years, lot ±30%) and the operator reviews them. Each such comp is labeled "wider area" with its distance. An ARV that uses any wider-area comp is at most **Preliminary**, even with 3 or more comps, and the card says "Wider area: up to 2.5 miles". The operator can exclude a comp with a written reason during review (e.g. "sold as-is, needs work"). Rural profiles keep their own limit. Found on WOS-FL-1012: only 1 sale within 1 mile, but 6 within 2.5 miles. |
| D-052 | 2026-10-10 | **House photos on every card** (Gabriel: "yes for the street view pictures"). (1) **Street View:** an outside photo of the subject and of every comp through Google's Street View Static API. Check Google's free metadata call first; if there is no imagery, show "No Street View for this address". Gabriel creates the key; it lives only in Railway (`GOOGLE_MAPS_API_KEY`), restricted to the Street View API and our dashboard host, with a daily quota cap set in Google Cloud so the monthly total stays inside Google's free usage. Follow Google's terms on caching (no long-term storage of images). Label each photo "Google Street View" with the image date. Off until the key exists (§5 money switch). (2) **Listing photos:** a "See photos" link to the comp's or listing's own page only. Never copied or fetched by the server (A-001). (3) **Seller-side photos:** the holder's photo folder link on the card, plus operator upload. Photos never change a value or a gate. |
| D-053 | 2026-10-10 | **Deal volume first: trustee sale lists** (Gabriel: "we need to be able to get hundreds of deals a day that are good"). Foreclosure law firms (substitute trustees) publish public lists of upcoming sales. Example: Brock & Scott, 898 sales, 213 in NC, 17 in Mecklenburg on 2026-10-10, no login or CAPTCHA. New generic source kind `trustee_sale_list`: one profile per firm (multi-state), with allowlisted host, at most 1 request/second, stop on 401/403/429, and the site's terms respected. Each row becomes a lead in the working (pre-sale) lane with: sale date and time from the firm's labeled sale field; trustee file number; court case number; source URL and page; captured date. Each lead is then enriched from the county profile, with no listing or people-search sites: parcel (owner of record, mailing address, assessed value, last sale), and recorded sales for comps where the county publishes prices. Then the strict grid gives the ARV (D-005/D-051 unchanged), Deal Check ranks the spread against the matched buyer's max (#275), and the top finds go to Today's Deals. Report counts honestly: "leads found" vs "deals that pass" (ARV + buyer max + spread). Order: #310 → #301 slice 1 (re-scoped to this, Mecklenburg/Charlotte first, then more firms and buyer markets) → #307 → #299 → photos (D-052) → the rest. State press-association public-notice sites are the next source kind after this. |
| D-054 | 2026-10-12 | **Texting from the cards through Twilio** (Gabriel: "I want to send texts to buyers, sellers, JV from the cards… when I push the send button"). Amends D-007 (texts from his own phone) and A-015 (Twilio off). Twilio is enabled as a paid provider (registry entry + environment switch; the key only in Railway). A text goes out only when Gabriel presses **Send** on a card, or approves a batch of at most 20 that he selected. Rules: STOP/opt-out honored and stored; for sellers, the National Do-Not-Call list and our own do-not-contact list are checked before sending; quiet hours 8 AM–9 PM in the recipient's time zone; the sender is identified by name; no automatic or AI replies to sellers; Texas numbers stay blocked until A-017 is cleared; carrier registration (A2P 10DLC or toll-free verification) must be approved before the first send. If that registration requires a US business, it's Gabriel's decision. Every text and reply is logged on the card's conversation. |
| D-055 | 2026-10-12 | **Public records requests as a lead source** (from the YouTube review, #335). The dashboard drafts records-request emails to official county and city offices (code enforcement, tax collector, clerk/probate, recorder) using contacts from the county targets research. Gabriel approves each batch, and it is sent from his Gmail at no more than 50 a day. Web request portals (GovQA, NextRequest and similar) are prepared as copy-ready text for Gabriel to submit himself. Replies are linked, and returned files are imported with the office, request date and file name as provenance, one record per parcel (#301). This covers foreclosure filings, tax-delinquent lists, code violations and new probate estates, wherever the office releases them. |

## Architect decisions (Gabriel may veto)

| ID | Date | Decision |
|---|---|---|
| D-011 | 2026-09-30 | **Estimated equity band (High / Medium / Low / Unknown) for sorting only**, only where the actual loan is known (loan date + original amount from a recorded notice or deed of trust). Never a dollar amount on a card, never an offer input. |
| A-001 | 2026-10-01 | Server-side work uses public government sources only. Listing and people-search sites are used only in the operator's browser via the local helper. |
| A-002 | 2026-10-01 | Every lead lives in exactly one lane with a plain reason; nothing is silently dropped. |
| A-003 | 2026-10-01 | B-03 (saved-leads 502): close as not reproducible (issue #209, option B). Keep the existing pagination/serialization regression coverage. If a 502 recurs, record timestamp, URL and response and reopen. |
| A-004 | 2026-10-01 | Lane snapshots (e.g. after-the-sale records) are stored in full, but dashboard and batch responses return a bounded page (newest 20 + total count). Stored proof text is an excerpt of at most 1,000 characters plus a SHA-256 of the full text. |
| A-005 | 2026-10-01 | Legacy generated ("Auto-generated for market") buy boxes stay stored but are hidden from every read and match path, and new ones are rejected (confirms B-02 assumption, PR #207). |
| A-006 | 2026-10-01 | A date whose origin is not a sale field never supplies a sale date; it is kept as raw text with reason NON_SALE_DATE_ORIGIN (confirms B-04b, PR #211). Use one shared allow-list of sale origins, not a deny-list (issue #224). |
| A-007 | 2026-10-01 | A state rule is `verified` only when the backlog or a decision states it and its citation supports it; otherwise `unverified`. Only a verified trustee-sale-day rule may resolve an ambiguous numeric date (confirms B-04c, PR #212; PR #215's TX mortgage-trustee "no redemption" = verified is accepted because B-04 states it). |
| A-008 | 2026-10-01 | Tax-default notices are `tax_sale` / `notice_only`; land-bank inventory is `listing_only`. Neither proves a completed sale or a price (confirms B-04d, PR #213/#215). |
| A-009 | 2026-10-01 | Existing county-named parsers stay as compatibility wrappers while identity, name and URL come from the county profile (confirms B-04g, PR #216; renaming is B-00a). |
| A-010 | 2026-10-01 | Only an explicitly sourced sale date, proven past, from an allowlisted host puts a notice in the after-sale lane; a workflow label alone never does (confirms B-05a, PR #217). |
| A-011 | 2026-10-01 | The after-sale classifier never sets original-owner contact to true on its own; contact is decided by the shared contact rules (D-018) once wired (confirms B-05b, PR #218). |
| A-012 | 2026-10-01 | The server never sends texts or emails. Until B-10's tap-to-send exists, server send routes return a disabled response; message previews stay available (issue #223; D-007, D-012). |
| A-013 | 2026-10-02 | A sale date comes only from a labeled sale field (sale date, date of sale, trustee/foreclosure sale date, auction date, or the "Date, Time, and Place of Sale" section), read by one shared helper. No "first date in the text" fallback anywhere. After-sale records carry `sale_date_origin` and `property_address_origin`; an address in servicer, mortgagee, trustee, attorney, courthouse or "whose address is" context is never a property (issue #229; extends A-006 and A-010). |
| A-014 | 2026-10-03 | Every `/api` route requires a signed dashboard session by default. The only exceptions sit in one allowlist, each with a reason: login and session endpoints, local-helper routes that check their own agent token, and signed provider webhooks. Existing admin-only routes stay admin-only. No cross-origin wildcard (issue #233). |
| A-015 | 2026-10-03 | Extends A-012: the server never places phone calls either. Calls go from the operator's own phone (`tel:` links). The Twilio dialer stays off until Gabriel enables a paid provider (D-012) and decides on call recording and the automated greeting (issue #234). |
| A-016 | 2026-10-06 | WholesaleOS never stores or uses Gabriel's logins for Facebook, Skool or other social sites, and the server never automates them. Posting and messaging happen in the operator's own account, by the operator or the operator's own assistant (for example Meta Muse) with approval on each action. The app prepares the text and logs what was done (extends A-001, D-007). |
| A-017 | 2026-10-06 | Texas SB 140 (effective 2025-09-01) makes texts "telephone solicitations": registration with the Texas Secretary of State ($200 fee and $10,000 security) unless an exemption applies, and $500–$1,500 per violation. No texting to Texas numbers (sellers or buyers) is switched on until Gabriel records his decision (registered, or an exemption confirmed by a lawyer). Every Texas deal summary carries the written equitable-interest disclosure (Occupations Code §1101.0045). |
| A-018 | 2026-10-06 | Land value and offers (updated with the course rules in playbook §4c; Gabriel may veto). **Builder first:** if a builder or land buyer in the buyer database has a stated price for this kind of lot in this area, their price is the land buyer's price, and buyers expect at least ~$5k below comparable lots on market. **Otherwise, lot comps:** sourced lot sales from the last ~6 months, widening to 2 years and a bigger radius if needed. **Otherwise, the 10-15-20 rule** (share of the finished new-home value, sourced from nearby new-construction sales): buy at 10% / 15% / 20%, sell at 15% / 20% / 25%, for lower-income / suburban / high-end ($1M+) areas. The area tier comes from sourced new-home prices; the lower-income/suburban boundary is $350k (D-032). **Teardowns:** value = lot value, not the house; course example: lots sell at $100k → offer about $80k, sell to the builder about $90k (demolition $5–15k). Acreage uses per-acre comps only. **Offer types:** (1) assignment offer = land buyer's price − fee; (2) opening offer for very motivated owners: the 10-15-20 buy column, or 50–60% of list on stale land listings (course); (3) terms offer (seller financing or option), with no invented terms. Every number shows its method and sources, labeled "land estimate". Regional averages, appraised values and list prices are context, never comps. |
| A-019 | 2026-10-06 | The "WholesaleOS browser" (D-025) is a WholesaleOS side panel in Gabriel's own Chrome (an extension), not a browser running on our server. A server browser would put his logins on our server, and Facebook locks accounts and Zillow and Redfin block visits from data-center servers. The panel runs only on facebook.com, zillow.com and redfin.com. It never reads or stores passwords and saves only what Gabriel clicks to save. It never scrolls, opens, posts or messages by itself. Saved items are sorted by fixed rules first; an AI sorter is an optional paid switch, off until Gabriel turns it on. Facebook names and posts are contact data: never in logs or aggregate reports. |
| A-020 | 2026-10-06 | No VPN inside WholesaleOS. The app already runs on US servers, and a VPN only changes the location of the device it runs on. Claude in Chrome runs in Gabriel's own Chrome and works outside the US. Muse is US-only and runs in Meta's cloud; using it through a VPN is Gabriel's choice on his own device (Meta's terms risk). We never use any AI product's private, unofficial API. |
| A-021 | 2026-10-06 | AI stays free at the start. Fixed rules first. Claude in Chrome (already in Gabriel's plan) is the browsing assistant. Gemini's free tier (3.5 Flash) only for text with no personal data, because Google may use and human-review free-tier data. Paid AI only when Gabriel enables it. |
| A-022 | 2026-10-06 | America.gov (launched 2026-09-29) is a sign-in federal services portal (passports, Medicare, disaster relief). It is not a source of land titles, ownership, debt or phone numbers. Property records are county records, and phone numbers are not government records. Not a data source. |
| A-023 | 2026-10-06 | **Texas list-price comps** (Gabriel may veto). In Texas, sale prices are hidden, but public listing pages show a sold home's sale date and last list price. Captured in the operator's browser (never by the server), these form a labeled tier, "Texas list-price comps". It counts toward a Preliminary value and never toward Verified. A sold price learned from an agent, title company or buyer upgrades that comp to Verified, with its source. Florida, North Carolina and Michigan use public county sale prices. |

## Open questions

(Agents add questions here only if they cannot open a `needs-architect` GitHub issue.)

- ~~2026-10-06 (Gabriel): Do you call and text US sellers from a US phone number?~~ Answered: yes, Texas and Florida numbers (D-028).
- ~~2026-10-06 (Gabriel): Keep one click from you to approve each batch of up to 20 seller texts or calls?~~ Answered yes (D-029).
- ~~2026-10-06 (Gabriel): Add Florida as a first automatic-comp market?~~ Answered yes (D-030).
- ~~2026-10-06 (Gabriel): The course chart gives no multiplier for ARV $120k–$200k. Use 75% there?~~ Answered: yes (D-031).
- ~~2026-10-06 (Gabriel): For the land 10-15-20 rule, treat areas where new homes sell under $350k as lower-income?~~ Answered: yes (D-032).

## Agent assumptions (ASSUMED)

ASSUMED: #283 references/activity ships in an ordered foundation slice: reviewed deals and buyer finds receive immutable refs on explicit import/update; existing aliases/history survive; old records receive no automatic startup/GET backfill. A separate admin metadata-only assignment is explicit and reversible, with no production execution during verification. Unknown state uses reserved XX without inventing geography; four-digit exhaustion/conflicts fail without writes. Use the signed account/agent attribution, keep imported who/direction as reports, and never infer a send, contact outcome, approval or evidence confirmation. The existing activities table is canonical; legacy card history is read-projected, not rewritten. Expiration observations persist on the next explicit write, not a background timer — AGENTS sections 2, 3, 5 and 7; #283 architect addition — 2026-10-07.

ASSUMED: deliver #283's architect answer in ordered slices: re-land the reviewed feature and fix only Dashboard mounting first, then reference numbers and append-only activity, then broad legacy help coverage. Keep #283 open until those added criteria pass; close only the resolved #292 finding after read-only live proof. The full-document regression uses the actual HTML/scripts with local read-only data fixtures, blocks every external source/helper run, and asserts ordering across real init/hydrate/render/timer paths — AGENTS sections 2 and 3; architect comment on #283 at 2026-10-07T08:56:49Z — 2026-10-07.

(Format: `ASSUMED: <what> — because <rule> — <date> — <PR link>`)

ASSUMED: #283 imports proposed deals into one reviewed-deal collection shared by Today and JV; explicit operator source/comp review is required before matching or value tiers. Submitted ARV/verdicts remain claims; the unchanged strict grid is recomputed with a six-month window. Literal buyer percentages and known caps produce a conservative buyer ceiling, not MAO. Unknown constraints block matching. Same-day holder confirmation is required to enter JV; contract and signed-JV checks additionally gate introductions. Expiration is computed read-only, retaining history. The ten-per-day number is a visible target, never fabricated inventory; acquisition remains the following backlog work — because source truth, D-035 and D-043 outrank auto-verification or filling a quota — 2026-10-07.

ASSUMED: #269 is delivered in ordered slices, first the P0 display/matching safety paths plus their navigation prerequisites. A property needs the existing structured-source marker and matching source text, not a backfilled normalized address; unknown records remain saved and reachable in a research list. Lists use bounded pages with a full matching total. Test-only clocks pin dated historical scenarios after the UTC day rollover, preserving their assertions and every production date rule — because data truth and deterministic verification outrank treating historical test dates as perpetually upcoming — 2026-10-06 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/282.

ASSUMED: #271 authorizes the signed admin's explicit already-approved checkbox as an exception to #260's individual approval assumption. Only newly created, explicitly classified end buyers receive it; unknown/out-of-market/partner/caution/non-buyer records stay pending and duplicates preserve existing approvals. Previews live in bounded memory (20 at once), belong to the admin, expire after five minutes and are consumed on successful import — because explicit operator intent and preserving existing decisions outrank automatic approval or stale-preview reuse — 2026-10-06 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/279.

ASSUMED: #260's 2026-10-06 update supersedes its original 25-item cap with 50; 8 KiB per item, 256 KiB per request and 12 requests per paired token per hour bound the drop box. Counts use UTC calendar days and Monday-based weeks — because the update sets the batch size and deterministic limits satisfy the unchanged safety rules — 2026-10-06 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/274.

ASSUMED: #260 requires dashboard approval even for finds described as previously approved; the agent cannot assert approval. An approved unknown-category buyer may match known criteria, while partner/caution/non-buyer categories remain outside end-buyer matching. An email/phone duplicate associates the supplied find with the existing buyer and keeps its prior fields; the association is shown for review — because D-035 and data preservation outrank automatic verification or merging away source data — 2026-10-06 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/274.

ASSUMED: #260's fit preview evaluates known state, exact city/county/metro, ZIP, property type and numeric asking/list price, requires one known agreement, and reports missing facts. Other buy-box fields are stored but wait for B-19; no inferred price, location or value is supplied. #262 remains responsible for the broader legacy buyer audit — because the issue explicitly requests a bounded read-only correlation preview before the full match engine — 2026-10-06 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/274.

ASSUMED: B-01's existing PR branch is updated from current main with a merge commit rather than a force-pushed rebase — because the backlog explicitly names PR #205 and preserving its reviewed history is the safer way to satisfy the current-main requirement — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/205 — **architect: confirmed (one-off)**

ASSUMED: B-02 hides legacy market-generated buy boxes from read APIs and matching without deleting their stored records — because safety and data preservation outrank showing invented buyers — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/207 — **architect: confirmed → A-005**

ASSUMED: B-03 remains BLOCKED rather than being marked fixed when the reported 502 cannot be reproduced or attributed — because data truth forbids a speculative root cause and saved-lead safety forbids a speculative mutation — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/issues/209 — **architect: superseded by A-003**

ASSUMED: B-04b treats a date explicitly sourced from filed_date, created_at, posted_at or date as non-sale evidence even when the text is unambiguous ISO or a registered adapter is present; a separately sourced sale_date or auction_date remains eligible — because source provenance outranks convenient date parsing and a filing timestamp does not prove a sale event — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/211 — **architect: confirmed → A-006**

ASSUMED: B-04c marks any post-sale or disclosure rule whose general legal effect is not established by its cited primary source as unverified, even if the backlog gives a shorthand; only the cited trustee-sale day rule can resolve an ambiguous date — because legal uncertainty must not become an automated eligibility fact — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/212 — **architect: confirmed → A-007**

ASSUMED: B-04d registers California tax-default sources under the tax-sale process but marks them notice_only; neither a completed sale nor a sale price follows from a notice — because provenance and the value gates outrank a convenient category label — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/213 — **architect: confirmed → A-008**

ASSUMED: B-04g keeps the existing primary-notice parser and planning module as compatibility wrappers while their source identity and URL come from the county profile — because D-013 requires generic registration but preserving tested ingestion behavior is safer than rewriting a working parser — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/216 — **architect: confirmed → A-009**

ASSUMED: B-05a treats a historical workflow label alone as insufficient to place a row in the after-sale candidate output; an explicitly sourced sale date must also be proven past and the source host must be allowlisted — because source provenance and the no-inferred-outcome rule outrank a convenient status label — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/217 — **architect: confirmed → A-010**

ASSUMED: B-05b leaves original-owner contact false even for a newer notice or later same-owner record until the existing contact gates are wired to the after-sale lane; an unknown original owner cannot establish a third-party grantee — because contact safety and provenance outrank an early outcome label — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/218 — **architect: confirmed → A-011**

ASSUMED: B-05c accepts a row-reference-only notice only when it also points to an allowlisted official document or list that is not the profile's generic index page; a row number on a landing page is not property-specific proof — because AGENTS.md §5 requires an exact file/page/row reference and source truth outranks preserving a weak candidate — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/219 — **architect: confirmed**

ASSUMED: B-05c stores proven-past notice candidates in a separate preview-only market snapshot collection and shows a read-only panel before the final outcome tab exists — because retaining sourced records without mixing them into active leads is the smallest safe, verifiable step toward D-009 — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/219 — **architect: confirmed (covered by A-002, A-004); acceptance rules tightened by A-013**

ASSUMED: B-05d suppresses only the source-proof fallback for an exact document URL represented by an after-sale candidate, including a mixed document; active property candidates and unrelated proof documents remain — because one document must not create an extra address-less active row when its past notice is already retained in the after-sale lane — 2026-10-02 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/228 — **architect: confirmed**

ASSUMED: Issue #243 recognizes additional explicit property-address phrases for active notice extraction but leaves the existing three-origin after-sale allowlist unchanged; a complete unlabeled address remains a review candidate with no verified normalized address — because retaining source data must not bypass the stricter property-proof and contact gates — 2026-10-05 — https://github.com/GabrielMontealegre/wholesaleos-bot/issues/243

ASSUMED: #304 exposes approved geographic buyer candidates on pending deals;
this is a criteria match, never deal approval, contact authority or offer readiness.
Unknown ceilings/spreads remain null. Percentage ranges use their low end.
Unstructured notes remain checks; only an explicit recognized flood requirement
and a different explicit deal flood zone exclude on that note. Known numeric/type
conflicts still exclude; unknown facts remain checks. Vetted/JV counts still
require reviewed value and a calculable ceiling -- AGENTS truth precedence and
the architect's #304 matcher comment -- 2026-10-08.

ASSUMED: #304 uses explicit kind deal_update by an existing unique deal reference,
not silent duplicate upserts. Its eight whitelisted fields are validated through
the existing deal/comp validator; source URL, captured time and evidence text
are mandatory. A preview version protects concurrent edits, and older per-field
evidence cannot overwrite newer evidence. Changed comps reset approval/review,
not historical signed stages; same comps and non-comp updates preserve review.
One append-only activity carries changed old/new values and provenance. Existing
bulk buyer approval never approves a deal update. Card terms require a real
operator note/URL; release verification performs no import or terms write --
AGENTS data preservation and #304 update-by-ref acceptance -- 2026-10-08.

ASSUMED: #288 is split into a mailbox-read release first. Configured App Password
is preferred over the known expired Google login; absent App Password, Google
login remains available. Inbox/replies, Sent and connection checks perform only
admin read-only operations; missing labels are reported, never created. MIME
HTML is displayed as plain text. No send, draft APPEND, deletion, activity sync
or scheduler is enabled. D-046's explicit-send phase remains later work.
Maintained clients imapflow 2.3.0 / mailparser 3.9.37 are pinned and require
Node 20+, so engines follows that minimum; prior dependencies unchanged.
This avoids a hand-written protocol/parser and fabricated connection claims --
AGENTS truth/security precedence and #288's phased acceptance -- 2026-10-08.

ASSUMED: #310 enables D-051 only in operator-reviewed deal value evaluation.
The shared grid accepts a service-supplied reviewed/count context, never a stored
row or imported comp flag. Official/screenshot callers without that context keep
their one-mile default and existing rural exception. Both passes use the same
rejection/provenance logic; only distance-only failures enter the wider pass.
Comp exclusions bind the full submitted-fact fingerprint and require an admin's
written reason; a changed comp or stale card is rejected. Existing exclusions
and append-only history survive updates; no real exclusion or approval is made
during verification. Any wider-area price band is Preliminary; Texas last-list
prices remain explicitly labeled, never promoted to recorded sales -- because
D-051 authorizes only this distance exception, and data truth outranks a larger
comp count -- 2026-10-10.

ASSUMED: #301's first publisher is disabled pending permission to reuse its
material commercially. Public visibility alone does not resolve the Terms of
Use restriction on copying/redistribution. No finding of an explicit automation
ban is made. Obtain written permission or choose an expressly permitted source;
architect/legal choice recorded in #315. Do not reinterpret the restriction or
contact the publisher automatically -- AGENTS sections3/5/10 -- 2026-10-10.

ASSUMED: #307D preserves the existing background-ingestion enable guard for
scheduled owner briefings; it does not turn on collection or change variables.
Read-only diagnostics distinguish configured from delivery-tested and expose
the schedule guard honestly. Owner notifications are not seller/buyer outreach;
the destination is fixed in existing configuration. No real send is used as a
release test. A committed import cannot be reported failed because its alert
failed, and duplicate imports cannot notify again -- #307 acceptance and AGENTS
truth/security precedence -- 2026-10-10.

Architect #315 answer, 2026-10-10: #301 slice1 may proceed government-primary
sources first (NC court access check, then official county notice sources).
Only the first private publisher stays blocked; do not block the entire kind.
Every enabled publisher needs terms URL/date/clause/verdict, plus access checks;
unclear restrictions/login/CAPTCHA are recorded and skipped, never bypassed.

ASSUMED: #307A is delivered in ordered slices. A1 adds reported conversation
records through the existing admin preview/commit import, read-only activity
projection and home reminders. Gmail synchronization, paired dropbox extension
and per-kind email approvals/templates remain A2; there is no send control in
A1. Unknown person roles and drafts are not inferred. Day0 is the first outgoing,
Day2/Day5 then weekly are anchored to reported sends; overdue dates stay overdue
until another report, rather than advancing merely because time passed --
AGENTS sections2/3/5 and D-050 -- 2026-10-10.

ASSUMED: #307's owner briefing reads the shared conversation model once explicit
conversation reports exist, while retaining legacy activity projection until
then. Totals precede display caps; only refs and allowlisted channels, never
names/message bodies, enter its aggregate summaries. No schedule switch or
real send is used as verification -- data truth/privacy and conservative
compatibility under AGENTS sections3/5, D-050 -- 2026-10-10.

ASSUMED: #307 email linkage is first exposed as an explicit, admin-only,
read-only inbox preview (latest30 headers). It connects only exact reported
Message-ID anchors or supported Gmail thread IDs, including header chains;
overlapping anchors are ambiguous, never guessed from person/subject/ref text.
Opaque Gmail browser IDs are not decoded. No anchors means no mailbox request.
Mail subjects remain subjects, reported next steps are not inferred, and old
drafts are withheld after a newer reply. The optional email_message_ids field
uses the existing audited conversation import; preview does not save reports,
send alerts, enable a schedule, or satisfy contact/value gates. Full persistent
Gmail synchronization and email approvals/templates remain later #307 work --
AGENTS sections2/3/5 and D-050 -- 2026-10-10.

ASSUMED: #307 persistent Gmail linkage is explicit, not an automatic scheduler.
An operator names the person/role/known refs for an exact server-read message;
later exact replies are saved by a separate explicit action. Missing/ambiguous
associations are never guessed from email names or subjects. Append-only
server-owned metadata receipts, not message bodies, feed existing reminders
and the shared brief; old imports preserve them. No contact outcome, lead fact
or send is asserted. Production release verification creates no link or receipt
and does not press either save action -- AGENTS sections3/5/7,D-050 -- 2026-10-10.

D-057 -- Architect answer#358, confirmed2026-10-15: county ranking may use
Census Reporter API ACS2024 five-year tables B01003/B25077, once per state in
a build/refresh script, maximum1request/second, stop on4xx/5xx. Preserve per-row
source URL, table IDs, vintage and retrieval date; label Census ACS2024 (via
Census Reporter). No Census key, PEP substitution or page-load data collection.
Score0-100 uses population, median value120k-350k, disclosure, nonjudicial
foreclosure and approved county buyers with explanatory components; missing
data remains unranked at the bottom. Lead evidence/readiness stay independent.
Proceed after the Leads zero-count fix. Also hide unmeasured deal summary
metrics, keep phone Filters collapsed, move Import/Glossary outside filters.
This supersedes the ACS-source block below, not the lead-safety invariants.

ASSUMED: #358's independent P0 hygiene hides any unmeasured summary metric,
including Submitted, rather than substitute a0 or show Not measured. Real0
is still rendered. Import/Glossary remain the same navigation actions outside
the filter details. Initial phone collapse is explicit in the renderer and
existing user-expanded state survives repaint -- architect answer#358,
AGENTS sections3/5/11 --2026-10-15. County ranking hit first-request403 and
stopped;only a blocked draft checkpoint exists in#363,no source workaround.

ASSUMED: #341 count fallback accepts only nonnegative safe integer counts
(including numeric strings); zero is authoritative. Missing or invalid counts
fall back to existing total/loaded compatibility paths, never to stale prior
filter counts. No API filter, eligibility, stored data or gate change --
AGENTS sections3/4/5 and the reproduced count defect --2026-10-15.

ASSUMED: #341 shared filters ship in ordered UI slices. The first exposes exact
State/County/City filters on Today's Deals and JV, counts before the display cap,
per-tab location persistence and bookmarks, and the full official county directory.
County ranking remains BLOCKED in #358: current Census API guidance requires a key,
and the cached ACS response is HTML. No credential lookup/signup or unapproved data
request is performed. Gazetteer/PEP establish identities only; they are not relabeled
ACS, median values are null, and no score is invented. Alphabetical unranked counties
are explicitly labeled. Buyer-coverage scoring, other list rollouts and full type/
stage/tier/deadline filtering remain later P0 slices, not claimed delivered here.
No legal table, market score, source routing, contact/value gate or stored fact
changes -- data truth and independent progress under AGENTS sections2/3/5/10 --
2026-10-14.

ASSUMED: D-056 Approvals adds a narrow workflow adapter over existing buyer/deal
approval services, not new value/match/readiness rules. Source disclosure never
checks consent automatically. New explicit decisions require review, a current
row fingerprint, and a rejection reason; changed/ambiguous/terminal rows refuse.
Counts and membership share one projection. No writer exists for pending email
drafts/records requests, so their counts are null/not connected, not fabricated
zeroes or approved templates mislabeled as drafts. Unsigned JV address and
subject coordinates stay withheld; stored data remains intact. Sign-out only
adds UI cache cancellation before the unchanged auth action. No production
decision is used as a test -- AGENTS sections3/5,D-043,D-056 -- 2026-10-13.

ASSUMED: The #412 Today action queue derives overdue/due-today ordering only from
the canonical projected due_date; a waiting-on-someone-else group requires the
recorded waiting_on_deal status, and elapsed waiting days require last_out.
Missing timestamps stay unmeasured. A recorded message remains reported activity,
not proof of delivery. Queue and best-deal actions only open their existing
record; they never send, approve, capture or change business data. Existing
reviewed-deal evaluation remains the sole source of displayed value/spread --
AGENTS sections3/5 and #412/#416 read-only Today scope -- 2026-10-21.
