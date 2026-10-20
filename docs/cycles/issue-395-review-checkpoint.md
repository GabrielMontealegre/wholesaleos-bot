# Next Slice Checkpoint

Current verified main: d1034fbe849093c7c1aba506ccb59399aa99b67d (PR405).
222 passed,0 failed,0 skipped,600s/file; exact healthy deploy7191209997.
Pipeline screen from404 is verified1366/400/412.73 recorded tasks/13 due;
all waiting on Gabriel. No typed reports submitted to production.

## Remaining Review Trace

- `pipeline-reports.upsert` is the only new report writer through the existing
  signed mixed importer. It always appends pending immutable revisions.
- `pipeline-reports.project` checks the digest, exact references, origin/time
  and pending metadata. Do not mutate that metadata to an unsupported status.
- `pipeline-workspace.build`, Today summary and Calendar share that projection.
- `dashboard/wos-pipeline-workspace.js` only GETs and opens existing workspaces;
  no report-specific review control exists yet.
- Existing approval-workspace decisions cover buyers/deals, not report review.
  Reusing buyer approval as verified funds would violate the contract.

Next implementation must distinguish an operator's acknowledgment of a
reported workflow from evidence that funds/offer/closing actually exist.
Keep imported revisions immutable, exact revision identity and stale-review
protection, admin session and existing transaction/auth patterns. Never infer
funds, convert a pending report into source evidence, close a business record,
send a message or allow an agent to press a production review control.

Before coding: read current origin/main AGENTS/BACKLOG/DECISIONS and issue395
comments again. Settle review semantics conservatively under AGENTS3 or file
a genuine section10 question if a gate change is required. Test forged,
stale, changed-reference, missing/ambiguous/wrong-origin cases. One bounded
PR with full suite and read-only1366/400/412 proof. Private reports/config
remain unread; real reconciliation needs separate explicit authorization.

Later owner order remains: finish395, profit on cards,375 offer machine,
then372/393 chat. Profile394 and demo397 remain draft. County ranking paused.
