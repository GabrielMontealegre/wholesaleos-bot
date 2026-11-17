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
