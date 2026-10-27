# 454 / D064 Reply Reader Compatibility

Base82ce792 after verified460;prior proof preserved byf927a13.457/D064 authorizes
optional genuine last_reply_at,non-future using injected server time;missing is
unranked and last_contact never becomes reply evidence. No owner review gate.

## Why Reader First

The actual82ce792 module was loaded from git and given a synthetic additive
receipt:latestSnapshot rejected with503 assistant_snapshot_store_invalid.
This is an expected compatibility limit,not a new production failure. If a new
writer were enabled immediately,rollback to82ce792 could not read that history.
Ship a real runtime reader first,then writer/projection/ranking in the next PR.
No real files,imports,keys or private contents were read to reproduce the limit.

## Writer / Reader Trace

modules/records/assistant-snapshot.js decodeSnapshot -> validate(default CLOSED)
is the sole raw upload decoder;appendSnapshot -> receipts -> validate(stored mode)
checks every existing receipt before preserving it. latestSnapshot -> receipts
uses the same stored mode,then signed actor/date ownership. The actual registered
GET in assistant-snapshot-routes returns only latest own actor with no-store;
POST uses default decode validation and still rejects last_reply_at for now.
Route/server/auth/storage serializers unchanged. Existing8field receipt envelope
unchanged;only additive buyer-property read validation is prepared. No schema
version bump,migration,history truncation or canonical buyer/POF/approval promotion.

Stored mode accepts only an own data-property last_reply_at with a real UTC ISO
timestamp not later than its recorded imported_at (trusted injected server clock
at receipt creation). No browser clock/contact/date-string coercion. Optional
means omitted if unknown;present null/malformed/future values fail closed503.
Imported timestamp and current read clock still validate independently. A genuine
timestamp after generated_at but before imported_at is not silently rejected:
D064 says server time,not browser or generation-time comparison. This remains an
assistant-reported timestamp,not independent provider reply verification.

Current browser assistant-model ignores this extra stored field and leaves
recent_replies null. No ranking/card/cache/route capability or writer permission
is advertised. Next writer can rollback to this reader without losing history.
The matching local assistant exporter must emit actual logged reply evidence;
never manufacture a source from last_contact. Optional writer support is NOT done.

## Tests / Gates

New assistant-reply-reader.test.js:old omitted and additive stored receipts;
unchanged8field shape;strict upload hold even with forged option flag;old-format
append preserves future history;latest IMPORT not latest reply;original transport
replay;wrong actor/source/unknown properties/sparse/duplicate/corrupt/future/time
and accessor/prototype negatives;new accessor never invoked;ambient clock/network
spies;actual local registered privateGET/no-store/auth/per-actor isolation/0writes.
Synthetic future fixture retains current hash/id algorithm,not a claim that the
still-disabled new writer accepts it. Existing snapshot and routes tests pass;
all original assertions retained. No dependency/lock changes.

Pending frozen-head full600s/file,self-review,currentmain,greenmerge,automatic
exact-source Details,approved435 read-only proof and merged-main full gate.
Backend-only: no new FCP/Lighthouse or visual redesign claim.454/457 stay OPEN;
no real production import/write/private file/key/send verification.
