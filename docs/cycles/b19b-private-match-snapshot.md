# B-19b Private Read-Only Match Snapshot

Base main48f2904, B19a532 released331/0/0, auto7876130763 and bounded public
checks PASS. New API exposes that pure index only. No UI, old score, existing
matching consumer, data writer, automatic refresh, source import or paid action
changes. B19 remains incomplete for evidence integration and both matching views.

## Writer And Reader Trace

Existing validated buyer reports/approvals and reviewed deals/comp reviews write
the canonical store. Existing db.readDBStrict reads JSON without mkdir/write or
fallback-empty behavior. Existing user records identify approval actors; no
credentials or actual production record were read during this work. New
sourced-match-routes -> strict store -> existing B19a build -> derived snapshot
with unchanged source captures/criterion provenance and an explicit generation
timestamp. No output writer or persisted match snapshot is introduced.

Server mounts /api/dashboard/sourced-matches no-store + requireAdmin + GET/body/
query boundary BEFORE express body parsers, following the existing Ask pattern.
The GET registration repeats those protections. Unknown query, request body,
transfer encoding and non-GET methods never invoke private storage. There is no
HTTP clock, policy, approval or fixture flag override.

Missing/invalid store or projection failure returns only generic unavailable503,
never a private error message or fallback empty data. Valid empty collections
return empty index honestly. Response is read_only/derived_workflow, not source
evidence or a permission to contact/offer. Deed/sign-up coverage remains explicitly
not_integrated. The index DTO contains no deal address, deal source URL, comp
details, ARV/MAO/spread amount, funds check or unsigned-JV package data.

## Synthetic Verification

New sourced-match-routes.test checks real Express registration/loopback with
synthetic strict readers: unauth401/nonadmin403 before malformed-body parsing;
GET-only405; body/query400 without reads; populated paired index; true empty;
unsigned-JV street/source sentinel absent; malformed/throwing store generic503;
no write/permissive fallback; all responses no-store; global live-fetch spy empty.
Existing Ask boundary and pure match index also PASS. No existing assertion changed.

First local route attempt could not load Express in the isolated dependency
folder. Added compatible Express4.21.2 (repo range^4.19.2) there only, ignore-scripts,
no repo dependency or lockfile changes. Next local sandbox attempt denied loopback
EACCES for both route fixtures. Authorized localhost-only execution then PASS;
no runtime/test assertion was changed to hide either prerequisite failure.

Hosted exact-head full suite remains the gate. After green merge, wait automatic
deployment and perform fixed health200/devices401/distress401 plus new unauth
sourced-matches401 and exact-source static booleans. Cancel private response
bodies; no authenticated production snapshot/DB/credentials/cookie transfer,
actual source/provider query or business write. B19c UI work comes separately.
