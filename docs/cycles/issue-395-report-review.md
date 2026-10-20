# Pipeline Report Review (Slice 4)

An admin can open **Review report** on a typed Pipeline report, read its
source excerpt and reported money, and either mark the report reviewed or
flag a correction. Reviewing requires the source checkbox; flagging requires
a note. X and Escape close the panel. Only its body scrolls on a phone.

These are report-review receipts, not independently verified facts. They
do not verify funds, send an offer, approve a buyer, change a price, move
a lead/deal, clear a readiness gate, change a due date or create a closed
outcome. A correction stays visible until a new sourced report is supplied.
Hidden unsigned JV sources cannot be reviewed from this panel.

## Writer And Reader Trace

The signed assistant importer still writes immutable pending
`pipeline_reports`; it cannot write review receipts. New admin-only POST
`/api/dashboard/pipeline-report-reviews` validates a bounded request and
appends `pipeline_report_reviews` plus one fixed document activity receipt.
Existing synchronous strict-read/atomic-write database APIs are reused.
No source report, buyer, deal, lead or contact is mutated.

`pipeline-report-review.project` reads only current validated report ids and
exact canonical targets. A content version covers the revision and target/
buyer records; an action version covers the latest review receipt. Changed
targets/references or a competing review cannot be overwritten by a stale
dialog. Duplicate requests are quiet. Old, invalid and conflicting receipts
remain stored with explicit coverage; they never become verified facts.

`pipeline-workspace.build` adds review metadata to typed rows. Today summary
and Calendar scheduling remain the same. The existing Pipeline renderer
shows the review state/correction note and opens the new native dialog.
The dialog posts only after an explicit operator action; it never retries
an uncertain write. Authentication loss closes it and clears cached rows.

## Verification

New pure tests spy network/clock/writes and cover unchanged business fields,
counts, money and pending status; exact revisions/targets, duplicate/stale,
forged origin with recomputed digest, future/invalid metadata, conflicts,
unlinked/hidden sources and malformed review stores. Loopback route tests
cover signed admin dashboard scope, regular/agent/x-user-id refusal, source
gate, stale/forged payloads, generic failures, no-store and quiet duplicates.
Actual-dashboard fixtures test1366/400/412, source/note no-post cases,
review/flag metadata, X/Escape, centered fitted controls,44px, body-only
scroll and stale/auth failures. No external requests or real business data.

No existing assertion, dependency, auth authority, source routing, comp,
contact, readiness or price gate changes. Full suite and exact-deploy
read-only baseline are required before release. Production verification
must never click a review submit control or manufacture a sample report.
The full Pipeline issue remains open for its remaining acceptance audit.
