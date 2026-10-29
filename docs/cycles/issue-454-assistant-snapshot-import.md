# Owner Priority1: Private Assistant Snapshot / Today

2026-10-26 backend prerequisite458 RELEASED/VERIFIED on maindd04d98,identical
tested03bd898. PR40370638496 and MAIN40385719994 each257/0/0,600s/file.
AutomaticRailwaye4da6bfb exactsourceActive/successful;approved435public12GET/
signedChromeGETcapabilities/latestabsent/nativeReplyClose/classicBack proof in
../screens/2026-10-26-pr458-release. NO real import/privatefile/send/settings/
businesswrite verification. NEXT Todayupload/sheet;whole454 remainsOPEN.

## Historical Preparation / Trace

2026-10-26. Issue454 goes first except open safety fixes;455 follows in separate
quick-win PRs. Native report category456 is preserved as a draft,UNMERGED and
UNDEPLOYED. Exacte114cd1 gate40331220702/job121600826075 finished256/0/0,
600s/file,14m37s job,816.95s per-file sum NOTwall;new test1.20s. All256
sanitized timings are preserved outside the repo in workspace
.wholesaleos-release-proof/pr456-candidate/timings.json. Final synthetic proof
is .wholesaleos-release-proof/pr456-final-synthetic (47.9/50.2/38.8ms,Lighthouse
98/98,notlive). Do not rerun/push a docs-only candidate just to churn CI.
This branch starts from deployed f7a7977,not456. No snapshot contents,
private assistant files,credentials or business records were read for this trace.
At that preparation checkpoint,pure validation/import and registered server
route candidates existed without a full gate/release. The verified backend
release above supersedes that status;Today UI remains separate.

## Actual Boundary Integration / Privacy Audit

The server now mounts a narrow private namespace protection BEFORE generic
parsers:existing requireAdmin,no-store and method/content-type guard. Actual
GET/POST registrations remain AFTER the shared session gate and repeat admin
authorization. No shared parser/session/auth behavior is rewritten. This also
prevents generic parser errors reflecting malformed private JSON before auth.

The scoped serializer/export/privacy audit is recorded in
issue-454-private-snapshot-audit.md. Actual-server api-session-gate regression
passes signed owner upload/read,header-only/forged/nonadmin refusal,no-store,
pre-parser bad-type/method refusal,exact byte hash and non-leakage to eight
existing read projections. An existing canonical DELETE still preserves the
new snapshot history. Sentry is disabled in that isolated synthetic server.
No production upload or private file inspection occurred. Runtime DB files,
untracked but previously not ignored,are now explicitly ignored.

Pure synthetic growth probe retains100imports/157400total file bytes;local
build190.17ms/latest2.72ms. This is a small test point,NOT production latency,
maximum-file performance or unlimited-history evidence. Preserve O(history)
validation risk and existing separate scaling work;never delete imports.

Next full final-head gate/self-review and exact automatic deployment/read-only
proof apply to this backend prerequisite. Today upload/sheet remains the next
ordered454 slice;neither the whole feature nor owner acceptance is complete.

## Historical 2026-10-26 Unregistered Preparation

`modules/records/assistant-snapshot.js` decodes at most1MB of exact UTF8 file
bytes,hashes those bytes (not re-serialized JSON),strictly validates v1 and
builds a new append-only assistant_snapshots array without I/O. Server-injected
clock and actor are mandatory;receipts carry assistant_snapshot_import origin,
file hash,filename,imported_at,generated_at and reported snapshot. Same-file
reimports and same-clock ties are retained with distinct deterministic append
IDs. Latest selection is last IMPORT for the requested actor,not newest source
generation time or another actor's data. Corrupt history fails closed;nothing
is removed or silently recovered from a forgiving database read.

Every root/row field in v1 is required;unknown fields (including structured
walk-away fields) reject the whole file. Unknown nullable facts use null rather
than guessed values. Limits are1000rows/section,100people/areas per row,1000log
events/deal,1000deal refs/buyer,3questions/call,with bounded text fields. IDs are
globally unique across deals/buyers/texts;references must name a deal in the file
or be explicitly null where allowed. Source_file accepts only a safe flat
deal-brains/*.md reported reference;it is NEVER opened or treated as proof.
Approval accepts approved/pending/rejected/null and POF boolean/null as reported
values only. Optional last_reply_at is NOT accepted without457's answer.

`assistant-snapshot-routes.js` is a registration function ONLY;server.js does
NOT import/register it yet. Synthetic tests register it over an in-memory store.
It requires the injected existing admin boundary before parsing,sets no-store
even on authorization/errors,checks canonical same-origin and explicit request
header,accepts only bounded application/octet-stream and returns code-only
errors. Private GET partitions by actual actor;upload returns a receipt,not
file contents. Real backend storage/export audit and production registration
are still pending. No UI,auth/session,global parser or settings changes.

Unit tests assistant-snapshot and assistant-snapshot-routes pass using synthetic
fixtures ONLY. They cover exact-byte hash,empty/zero/unknown,wrong version/date/
duplicate/path/field/reference/money/size,atomic rejection,PII-safe errors,
append-only/history/actor isolation,canonical non-promotion,purity,no-store,
unsigned/nonadmin/origin/type/size rejection and read/write storage failures.
One local proxy test initially failed because it used a fabricated Host in the
fetch fixture;the correction uses the server's actual host with HTTPS proxy
protocol and canonical URL origins. Strict cross-origin rejection stays intact;
the corrected test passes. No retries against production or claimed live fix.

Next:finish the serializer/private-storage audit,then integrate the existing
admin routes into the real server with synthetic actual-auth coverage before
adding the requested Today upload/sheet. No standalone unwired release or
production upload is implied by the local test results.

## Trace Before Implementation

- `server.js`: global express.json is1MB;urlencoded50MB;text/plain100MB.
  A file-byte hash cannot honestly be a hash of an already parsed/re-serialized
  object. Prefer a bounded route-local application/octet-stream raw parser,
  which the existing global JSON/text parsers ignore. Do not change their limits.
- `server.js requireAdmin`: verifies the existing signed dashboard session and
  admin role;sets req.currentUser. No header-only identity or agent bearer bypass.
  The new private snapshot routes must use this boundary and no-store on success
  AND errors. Add route-local same-origin/custom-request protection for upload;
  do not rewrite shared session/auth behavior or start455 login changes early.
- `db.js`: readDBStrict fails closed;writeDB atomically writes then renames the
  JSON store. New append-only snapshot receipts must preserve every unrelated
  collection and prior snapshot. Never use forgiving readDB fallback to create
  an empty store after a read failure. Check all serializers/exports before
  putting private snapshot contents into a new collection;this audit is not yet
  complete. No migration,deletion or canonical buyer/deal update is authorized.
- `modules/records/conversation-routes.js` registers Today through
  `modules/agents/today-workspace.js`;that projection currently reads canonical
  conversations,buyers,reviewed deals,activities and verified releases. Its money,
  readiness and approval gates must remain independent from assistant reports.
- `dashboard/workspace/today-model.js` groups canonical actions by due date and
  status. Introduce a clearly separated assistant sheet;do not turn imported
  numbers,pof booleans or approval strings into canonical verified evidence.
- `modules/records/pipeline-report-review.js` demonstrates injected clocks,
  explicit actor,strict request fields,append-only receipt/state handling and
  safe code-only errors. Reuse local conventions rather than a new auth/storage
  framework. Existing import preview/commit workflows must not be silently reused
  if they promote reported buyers/deals into operational eligibility.

## Bounded Delivery Order

1. Pure deterministic v1 decoder/validator and append-only importer over an
   injected immutable store. Exact file-byte SHA256,injected SERVER now,actor,
   imported_at and generated_at. Reject wrong version/schema,unknown fields
   (including private walk-away numbers),malformed UTF8/JSON,oversize files,
   invalid/future dates,duplicate IDs,invalid enums/numbers/links and forged paths.
   Whole-file rejection only;never echo offending values or partially import.
2. Signed-admin private upload/read boundary with raw byte/size/content-type,
   CSRF/actor checks,no-store,fail-closed storage and synthetic route tests.
   Keep every import;newest IMPORT,not newest generated_at,is displayed. Same
   timestamp/tie handling must be deterministic without overwriting old imports.
   No owner token/push endpoint or credential handling in this version.
3. Separate phone-first Today sheet in requested order:single owner action,
   calls,texts,waiting email,deals by reported stage,buyers. Explicit provenance
   and estimate labels on every imported value. Local sent toggles scoped by
   file hash/text ID and labeled device-only,never a send receipt. Escape all
   content;validate tel/sms/Gmail links;no automated launches or provider writes.

The source_file is an assistant-reported relative reference,not a path to open
and not independently verified evidence. Reject absolute/traversal/control/URL
or unsupported-prefix values. Do not scan exports/assistant or access the named
private source files. For entries lacking source_file in v1,an import filename
may identify the snapshot provenance,not a fabricated per-row source file.
All imported money/funds/approval/status stays reported or estimate;it must
never unlock comp/value/contact/finance/POF gates or create outreach authority.

Future-date validation uses one injected backend clock,not browser-vs-server
comparison. Do not silently reuse450's failed cross-machine future predicate.
Date-only fields must be real unambiguous ISO calendar dates,not numeric locale
dates. Use safe user-facing rejection reasons without names,phones,email,text
or raw JSON in logs/aggregate reports. No data or snapshots in git.

## Acceptance Gap To Clarify Separately

454 asks for top10 buyers by most recent REPLY,but v1 supplies only last_contact.
Contact is not reply evidence. Architecture question457 asks for an optional
explicit last_reply_at or truthful contact-order wording;only that acceptance
is affected. Recommend an optional explicit last_reply_at from
the exporter;until agreed,do not invent reply timestamps or label contact sorting
as reply sorting. This blocks only that ranking acceptance,not the private
importer or other independent sheet sections.

Use only synthetic fixtures,including duplicate/ref/path/future/PII-safe error,
atomic rejection,append-only preservation,unknown/missing/forged input,empty
and nonadmin/unsigned/401/403 cases. Never perform a real live import/upload,
send,call,sms launch,toggle,push-token/settings or business-data write as proof.
Full600s/file,self-review,green merge,exact automatic deployment and435 mixed
read-only proof still apply. Owner phone approval remains a separate sign-off.
