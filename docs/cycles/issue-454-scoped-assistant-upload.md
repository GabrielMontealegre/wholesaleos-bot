# D064 Scoped Assistant Upload

## Local Preparation 2026-10-27

Current verified maina2dc46e/PR464;no duplicate454 key/uploader PR exists.
463 engineering is already DONE,owner GitHub protection action stays separate.
No owner phone gate or new private-file/key question. Current usable budget is
reserved for future security-boundary implementation plus full release/rollback;
this local helper is NOT independently releasable or a completed capability.

Trace before changes:assistant_upload_keys has no existing writer/reader.
Current assistant-snapshot append validates exact bytes and stores its original
8field receipts;requestReceiptId accepts ONLY actor-boundUUIDv4. Existing private
route uses shared signed admin gate,canonical origin/custom header/raw1MB and
no-store. Nothing in those modules/server/Settings/UI/CLI is changed here.
Prior eight-surface privacy audit covers snapshots,NOT this new key collection.
New collection audit is now bounded and tested below;actual management endpoint
integration with the shared signed-admin guard remains pending. Local helper/
controller tests use in-memory stores/synthetic injected entropy;the existing real
server audit uses a dedicated synthetic temporary DB,never production persistence.

## Implemented But Unwired

modules/records/assistant-upload-keys.js is pure:injected server time and48bytes
entropy;fixed append-only-snapshot scope. Token has separate public16byte identity
and32byte secret;only domain-separated SHA256 of the entire token is retained.
The create return carries the token once;the updated store contains only hash,
scope,issuer,created/revoked dates,public identity/sourcekind. This is a seven-field
KEY record,NOT an alteration to the existing eight-field import receipt.
No plaintext retrieval/list function;metadata contains only public id/time/revoked.
Collision rejects rather than overwrites. Explicit owner-scoped revoke copies the
record,keeps history/other keys,repeat revoke is idempotent. Auth requires exact
token/hash/timingSafeEqual/active record and returns ONLY actor+append scope,not
an admin/session object. Corrupt/wrongscope/sparse/accessor/future/backdated records
fail closed with fixed codes,no values. No ambient random/network/clock/files/writes.

tests/assistant-upload-keys.test.js covers fake hash-only creation/metadata/actor
isolation/independent revocation/collision,immutability and untouched canonical/
snapshot references,wrong/unknown/revoked keys,malformed clock/history/scope,
root/array/record accessors without invocation,and network/clock/random/write spies.
Focused tests PASS. NO full suite/PR/runtime persistence/UI/deployment claimed.

## Next Real Integration

Complete actual signed-admin creation/list/revoke integration tests before
registering/persisting in production. Resolve issuer account
eligibility with existing admin model;never turn key authentication into generic
req.currentUser/admin authority. Existing import URL gets a NARROW POST-only key
boundary,not a shared API/auth rewrite or a general bypass. Browser UUID/origin/
session/type guards remain exact. Key POST uses actual exact byte SHA identity
and same strict decoder/immutable receipt path;protect rollback/current8fields,
never add persisted request_id. Do not enable new SHA identity at browser boundary.

Creation transport replay also needs a stable owner-action identity before wiring:
derive the public16byte identity from actor+fresh create-action UUID (domain-separated),
inject fresh random32byte secret separately. Same identity with different injected
secret already rejects409 rather than overwrites/reveals again. Never simply generate
a new identity for transparent POST replay. This is distinct from upload fileSHA
identity and does not add a stored request_id. HTTP/UI uncertain-result recovery
must list/revoke metadata without redisplaying any secret. Unregistered controller
now implements identity derivation;injected-admin tests pass,actual server wiring
still pending.

Then Settings create/download ONCE for owner himself,revocation metadata,local
scripts/upload-assistant-snapshot.js exact1MB/newest snapshot/no-retry401403/
counts+receipt-time-only output. Owner handles REALkey/file;agent only synthetic
fixtures,never production keycreate/import/POST/settings/copy/send for proof.
No hidden7:40/7:50 scheduler;first real upload waits owner-createdkey. No plaintext
in repo/logs/exports/stats/AI payloads;canonical buyers/deals/POF/readiness untouched.
Whole454 remains OPEN;455/456 deferred. No new standalone unwired-module deploy.

## Collection Privacy Audit / Local Controller 2026-10-27

Existing actual-server API test now seeds a hash-only synthetic key record before
startup. Ten signed reads (stats/leads/buyers/Today/operator brief/calendar/
approvals/pipeline/settings/debug env) omit the fake credential/hash/identity/
collection. Existing snapshot GET omits the hash. The original private snapshot
sentinel assertions remain unchanged. A canonical DELETE still preserves exact
key records and snapshot history;server stdout/stderr omit fake key/hash/identity.
Final actual-server test PASS,247 existing static API registrations remain behind
the same gate. This does NOT claim the new management endpoints are registered.

Source outward trace:server settings reads settings only;debug env returns booleans;
Drive backup selects getLeads() into explicit CSV columns,never arbitrary root keys.
No Drive call/export was executed. Static roots do not serve runtime data/backend
modules. db.js backupReferenceStore copies the full DB into private-record-backups,
not an HTTP/export reader;no restore endpoint was found in this bounded trace.
Those private folders are already Git-ignored. Add their Docker-context exclusion
and strengthen the existing ignore-list test:local builds must not copy old private
root-store backups. No actual backup contents/presence was inspected;no live leak
or failure of the verified Git-sourced deployment is asserted.

Telemetry trace:observability/error-tracking disables integrations/logs/breadcrumbs;
shared beforeSend sanitizer drops request/body/headers/extra/contexts/user/free text.
Existing privacy test additionally passes a fake key/hash collection through the
actual sanitizer;original telemetry/browser assertions retained,zero SDK network,
PASS. Audit is scoped to the new collection/current readers,NOT whole-app security
certification or full disaster-recovery policy.

assistant-upload-key-routes.js now supplies UNREGISTERED management GET/create/
revoke handlers with mandatory injected requireAdmin/readDBStrict/writeDB,
no-store and exported pre-parser zero-body/method guard. Same-origin + explicit
action header;createUUID only,actor-domain identity + injected32byte entropy.
Create response exposes the synthetic credential once only AFTER write succeeds;
transport replay409 does not overwrite or redisplay. GET metadata/revoke never
returns hash/credential. No extra persisted request_id. Focused injected-admin
Express test PASS:unsigned/header-only/regular/cross-origin/bad-action/bad-UUID/
wrongmethod/body parser privacy,one-time/replay/otheractor/revoke/idempotence/
read+write failure/static errors/no-store. NOT actual signed-admin endpoint proof.

No server.js import/registration,Settings/UI/local CLI or key-auth snapshot POST
has been added. Existing browser UUID/origin/session/type/scope/receipt fields
unchanged. Next narrow POST integration must reuse the existing API limiter only
for the terminating key mode (no manual double-count),authenticate current issuer
eligibility before body parsing,and never assign generic req.currentUser/admin.
Other methods/paths must still require the unchanged signed session. Actual fileSHA
replay path and CLI/Settings remain to implement/test before any fullgate/PR/deploy.
