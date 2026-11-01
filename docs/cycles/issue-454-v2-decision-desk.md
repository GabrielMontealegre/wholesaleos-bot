# Decision Desk v2

## Local Answer Readback Polish

Owner notes now appear alongside the recorded answer after GET readback,
separately from assistant drafts, with escaped multiline text. A completed
answer restores focus to its choice; an uncertain/stale choice restores focus
to Refresh instead of a disabled control. Switching tabs during the operation
keeps focus in the selected tab. Synthetic three-width UI checks cover every
A/B/C append and a lost POST response: the persisted C answer is recovered by
GET, never a blind repeat write. Existing answer history remains append-only.
All original assertions remain; new checks cover focus, stored note display,
the complete button row's 44px/in-card geometry and unknown-outcome recovery.
Three answer-readback viewport images were inspected at 1366/400/412 in
../.wholesaleos-release-proof/decision-desk-answer-readback. Additional whole-
card development captures were inspected; mobile captures did not include the
bottom note, so the explicit scrolled viewport captures above establish its
visible placement. This is synthetic development proof, not live verification.

## Local Pure Follow-Up Engine

modules/deals/follow-up-schedule.js consumes outreach identity/state and an
explicit recorded-interaction projection, with today injected. No existing
follow-up schedule consumer/producer was found in the scoped trace. The new
module is pure and not a hidden timer, sender, provider adapter or log writer.
It computes F1 +1 day after questions, F2 +2 after F1, F3 +3 after F2, F4 +7
after F3, then parks. A late actual step shifts the next due date from that
recorded step. Missing questions/agent withhold follow-ups. Any agent reply
stops all of that agent's property sequences and reports needs-decision.
Reported answered=true is also a conservative stop, never send authority.

Only one recommendation per agent is returned, chosen by property priority/ref;
the daily cap spans questions/follow-ups across every property. The output is
derived identifiers/dates/status only: no sendable text or prices. Exact joins,
unique event IDs/receipts, valid prior steps/cadence and strict canonical days
reject forged, stale, future, duplicate or malformed records. Empty/missing
history never invents a question. Same-day replies stop conservatively because
day precision cannot establish intraday ordering. The contract is logged as an
assumption, not a claim that an untrusted source_kind authenticates a message.

New test first failed MODULE_NOT_FOUND, honestly exposing the missing module.
The 20-row synthetic batch now passes all F1/F2/F3/F4/park stages, exact due
dates, boundaries, any-property reply stop, shared-agent daily cap, stable
ordering, missing/forged/stale/future/duplicate/accessor negatives, input
nonmutation and clock/filesystem/network purity spies. Self-review corrected
an initially too-strict same-day reply ordering before checkpointing.
No runtime outreach ingestion, real interaction capture or message automation
is implied. Coordinated acceptance/review is still pending; no full suite, CI,
PR, push, merge, deployment or whole-v2 release claim.

## Local Desk UI Checkpoint

Decision Desk now renders full tier 1-3 context, reported people/history/numbers,
escaped multiline drafts, A/B/C consequences and optional notes. Tiers 4-5
remain counts only. Agents and Outreach are read-only tabs. Their summary uses
the validated Today-workspace day through an injected callback, never a browser
clock or snapshot-generation date. No provider or canonical writes are added.

An explicit answer click binds the current receipt/item/note to a fresh UUID.
Controls lock during POST; uncertain or stale outcomes require GET refresh,
never an automatic POST retry. Server readback is checked against receipt,
item, choice, note and server clock. Source-filtered latest-per-item GET supports
large answer histories while the default GET still exposes append-only history.
Unauthorized or late responses cannot restore a destroyed signed view.

Actual synthetic localhost UI tests pass at 1366/400/412: whole-file import,
full-context tier visibility, escaped draft, unknown versus zero, answer append,
double-click exclusion, GET readback, stale-source refusal, keyboard tabs,
auth clearing and 44px/no-overflow checks. Nine synthetic Desk/Agents/Outreach
screenshots were inspected and retained outside the repo under
../.wholesaleos-release-proof/decision-desk-ui-first. They are local development
proof, not a release. Pure response negatives, answer log/routes, v1/v2 import
integration, v1 model and existing three-width v1 UI also pass. The v1 UI's
unsupported-version example intentionally moves 2 to 3 under #487 support for 2.
First new UI assertion incorrectly counted existing icon images; its corrected
selector checks only injected img[src=x], preserving escaped-draft intent.
One focused command used a nonexistent assistant-model.test.js path after four
passing files; the actual assistant-sheet-model.test.js subsequently passed.

Still required: pure follow-up engine with 20-row acceptance batch, remaining
UI edge-case review and coordinated #487 acceptance. No full suite, CI, PR,
push, merge, deployment or complete-v2 claim. Earlier unimplemented-UI notes
below describe historical checkpoints only. Existing unrelated exports remain
unstaged; pending PR486 merge approval is not retried or bypassed.

## Local Owner-Answer Log

New pure assistant-decision-answers.js appends owner answers to a separate
assistant_decision_answers array, never to the imported file, canonical buyers,
outreach, provider messages or snapshot pick. Inputs name the exact latest
actor-owned v2 receipt and item. Choice is exactly A/B/C; note is bounded text;
answered_at comes from the injected server clock. Client actor/time fields refuse.
An explicit UUID request is actor-scoped and idempotent; conflicting reuse or
a new answer for a superseded/foreign/missing receipt refuses. Exact old replay
returns its prior receipt without a write, even after another import. A later
intentional answer appends rather than overwriting history.

Snapshot-route registration now adds GET/POST assistant-snapshot-answers behind
the same signed-admin guard, no-store, exact same-origin/header requirement,
strict small JSON payload and redacted error handling. It is not a mailbox or
send endpoint. Upload-only keys are not accepted as sessions. GET is owner-only,
paged with a bounded limit and exact own cursor; it omits operator/request IDs.
History is fail-closed for malformed, duplicate, foreign-source, future-dated or
nonmonotonic receipts. No private input values enter diagnostics.

The new pure test first failed because the answer module did not exist, an
honest missing feature. Pure and local synthetic route tests now pass, covering
append/readback, two actors, stale/forged/conflicting requests, idempotence,
privacy/CSRF/type/size/error boundaries and no canonical mutation/clock/network
or filesystem effects. Existing snapshot v1/v2 routes/integration still pass.
Actual A/B/C UI clicks, Desk/Agents/Outreach screens and follow-up engine remain
unimplemented; no full suite, CI, PR, production write or release claim.

## Local Integration Checkpoint

Version2 now runs both the existing base-field validator and shared extension
validator before any append. Exact original bytes still determine the hash;
actor ownership, append-only history, request replay and v1 acceptance remain.
Stored-receipt/latest validation accepts mixed v1/v2 history and rejects corrupt
v2 data. API keeps its compatible version1 capability field and adds explicit
supported_versions:[1,2]. The local uploader accepts either payload version;
its upload-key format, target, redirects, caps and request ownership are unchanged.

The shared extension implementation lives in dashboard/workspace as a pure
browser/CommonJS asset; the server adapter re-exports it. Native loading order
loads it before assistant-model3. Model projection retains v1 output, adds full
tiers1-3 with tier4-5 counts, reported agent/outreach data and provenance. Imported
pick becomes reported_pick, never an authoritative owner answer. Due counts
remain unknown without an injected day. Decision Desk controls/screens, answers
log/API and follow-up engine are STILL NOT IMPLEMENTED. No whole-v2 completion.

Focused v2 import/read/model/browser-VM/local-admin-route tests pass, including
whole-file bad-tier/duplicate/future/base-source rejection, exact bytes, mixed
history and nonmutation. Existing v1 snapshot/model/routes and uploader tests
pass; existing reply-reader checks are retained. New VM test initially failed
on undeclared result scaffolding; explicit globalThis corrected that harness
without changing assertions. Restricted localhost fetch attempts failed; the
same focused route tests passed under escalated localhost hermetic execution
with external requests blocked. No product/environment cause attribution.

Existing assertions intentionally changed: assistant-snapshot.test.js and
upload-assistant-snapshot.test.js unsupported version2 -> version3 because487
now explicitly supports2. The same rejection intent remains; uploader gained
a real synthetic-key/local-route v2 positive case. No safety assertion weakened.
These local changes are not pushed, in a PR, full-suite tested, or released.
The earlier preparation-only notes below describe the previous local checkpoint.

## Current Scope

Issue487/D-065 authorizes additive snapshot v2, Decision Desk, an append-only
signed-admin answers log/readback, Agents/outreach lists and a pure follow-up
engine. Version1 remains accepted. This is LOCAL implementation preparation,
not a completed slice or release. PR486's execution restriction remains; no
merge, deployment or denied-comment retry is performed by this branch.

## Trace

- Current writers: assistant-snapshot.js decode/appendSnapshot/appendKeySnapshot
  and assistant-snapshot-routes.js plus the scoped-key upload transport.
- Stored receipts are append-only, actor-scoped, with exact original byte hashes.
  latestSnapshot revalidates retained receipts. No writer is changed here.
- Current readers include the private latest-snapshot API and Today sheet model.
  They remain version1-only until coordinated v2 import/projection/UI integration.
- New assistant-snapshot-v2-fields.js validates only the three additive arrays;
  it has no runtime caller yet. Existing base schema/transport safety is not
  replaced, relaxed or bypassed. Later integration must validate both base and
  extension fields before any append and preserve original file-byte hashes.

## Local Contract

ASSUMED for integration: reuse value_fixed for reported value after repairs;
v2 buyer_number is nullable numeric (not the v1 per-deal buyer object).
Agent rows require id for exact outreach.agent_id joins; missing identities
remain null, never guessed. Open-item and agent IDs share the existing snapshot
ID namespace; outreach refs are distinct reference keys, unique in that queue.
Reported status/channel text is bounded but not mapped to invented enums.
Due/follow-up days may be future; happened/last-touch dates cannot exceed the
file's generated_at. Null unknown flags/numbers remain null; zero remains zero.
These assumptions implement487's fields using current source-truth conventions;
they do not infer provider contact/response/approval or authorize any send.

## Tests and Remaining Work

The new test first failed because the new module did not exist: an honest
missing-feature failure, not an existing regression. It then passed strict
field/tier/date/unknown/duplicate/reference/accessor cases and a20-row synthetic
batch, nonmutation and purity checks. Existing v1 snapshot tests pass unchanged.
No real snapshot, private contents, credentials, network or production writes.

Still required: wire whole-file v2 validation and capabilities with v1 support;
add all-or-nothing route tests and safe plain rejection reasons; Decision Desk
projection/tiers/counts/provenance; append-only admin answers/readback; Agents
and Outreach views; the requested pure follow-up engine and20-row acceptance;
focused/full suite, self-review and bounded D-065 release gates. No full suite,
CI, PR, release or complete-v2 claim is made by these local component tests.
