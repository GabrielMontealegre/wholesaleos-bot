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
Root-store outward readers are selective in that prior trace;new hash collection
still needs actual-server sentinel/export/telemetry tests BEFORE registration or
real persistence. Local helper tests use in-memory stores/synthetic injected entropy.

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

Complete new-collection serializer/export/telemetry audit and actual signed-admin
creation/list/revoke tests before registering/persisting. Resolve issuer account
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
must list/revoke metadata without redisplaying any secret;actual route tests pending.

Then Settings create/download ONCE for owner himself,revocation metadata,local
scripts/upload-assistant-snapshot.js exact1MB/newest snapshot/no-retry401403/
counts+receipt-time-only output. Owner handles REALkey/file;agent only synthetic
fixtures,never production keycreate/import/POST/settings/copy/send for proof.
No hidden7:40/7:50 scheduler;first real upload waits owner-createdkey. No plaintext
in repo/logs/exports/stats/AI payloads;canonical buyers/deals/POF/readiness untouched.
Whole454 remains OPEN;455/456 deferred. No new standalone unwired-module deploy.
