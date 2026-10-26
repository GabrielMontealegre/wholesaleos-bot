# Owner Priority1: Private Assistant Snapshot / Today

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
No454 runtime implementation,import,full gate or release is claimed yet.

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
