# B-23a Row Preservation Review

Original `44f82f3` synthetic probes failed: two properties sharing one case became
one retained lead; CSV references ignored blank/multiline physical lines; XLSX
references ignored blank worksheet rows; an overflowing epoch was not retained
as INVALID. First failures are retained locally in
`.wholesaleos-release-proof/513-synthetic-{row-preservation,provenance}-first.txt`.

The correction distinguishes case/property identities with an opaque address
component, falling back to the source row when addressless. It never verifies an
address. Same-case/same-property rows still merge with audit after moving, and
source-less identity behavior remains unchanged. No live ledger exists from
these unshipped, unscheduled building blocks; no migration/deletion is performed.

Writer/reader trace: readers emit `row_reference`; mapper retains it in
`source_row_reference` and `provenance.row_reference`. Mapper writes `lead_key`;
mergeLeads uses it, and B-23b copies it into candidate `distress_lead_key` and
source-proof rows. Counts-only summaries do not expose keys. Raw address/date
evidence and the false address-verification flag stay intact.

New `distress-list-row-preservation.test.js` covers distinct properties, moved
duplicates and audit, missing addresses, source isolation, immutable inputs,
physical CSV/XLSX positions, safe/invalid epochs and no clock/network/file writes.
Focused test passed locally using isolated declared parser packages; Node20
hosted full suite remains the required gate. Existing assertions are unchanged.
Release depends on green/verified #433 and #434. No source scheduling, real
collection, imports, provider calls, mailbox changes or business writes occur.

## First Corrected Hosted Gate

Head `0b1be9e` failed run44156436749:319 passed,1 failed,0 skipped,total320.
The failure was `lead-age-calendar-ui.test.js:41`: selected control was empty
instead of `1` after the API-read and filtered-row assertions had passed.
The original failed artifact remains retained; it is not reclassified or retried.

Active loader trace: _leadsLoading is cleared before awaiting buyers and calling
leadQueueRenderWhenStable; renderLeadActionToolbar recreates the filter bar from
options without selected attributes and queues syncLeadFilterControls at0ms.
The verifier now separately waits for rendered Today/Any Time selections before
the unchanged assertions. All original assertions, clock fixtures, widths and
timeouts remain unchanged. This closes a provable readiness gap without claiming
an observed CI event timeline, a flaky environment or a changed date rule.
#433/#434 are now released and public/static verified. A new exact-head full
hosted gate is still required before B-23a merge; no red merge is authorized.

Changed verifier PASS locally with the installed declared Playwright1.44.0 and
cached Chromium: synthetic1366/400/412 Tokyo contexts, real dashboard/filter/API
loader, original exclusions/Any Time restoration/no overflow/no writes checks.
Pure lead-age-calendar and distress-list-row-preservation tests also PASS.
No original assertion was changed or removed; two waits were added and the
10-second timeout was not changed. No runtime file changed in this correction.
