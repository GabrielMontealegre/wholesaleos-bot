# B-23b Adapter Integration Review

Preserves Claude's original PR517 and merges released mainf9bdb7e, including
B-23a's case/property identity and physical row references. No force push.
The adapter is registered but no source-catalog entry or daily job is added.

Synthetic review of the original adapter parsed1003 rows but sliced the mapper
input at1000. The1001st addressed row, following missing-address proof row and
final duplicate update never reached the mapper. First failing output retained
locally at `.wholesaleos-release-proof/517-synthetic-row-preservation-first.txt`.

Correction: MAX_ROWS remains1000 for ArcGIS/Socrata/CKAN request planning. All
already-parsed rows are mapped; no extra network request is introduced. Existing
diagnostic rows_capped becomes0 because nothing parsed is discarded. Mapper
duplicate audit now travels as distress_audit instead of being discarded. It is
row-level evidence, not a counts-only report; do not log it as an aggregate.

Writer/reader trace: readers write rows; adapter maps them, mergeLeads deduplicates
and emits audit, candidateFromLead copies keys/dates/lane into candidates, and
candidateToFindMeCard builds previews. Addressless records use source_proof_rows.
distress_summary comes only from summarizeSource and remains counts-only.
No existing production consumer reads distress_audit or rows_capped; the new
regression is its first reader. source-adapter-registry registers the runner;
source-acquisition-orchestrator still selects only catalogued sources. No new
catalog entry exists. Existing allowlists, blocking statuses and pacing stay.

New synthetic regression proves1001 addressed candidates plus1 proof-only row,
last duplicate current evidence and old-value/row-reference audit, counts-only
summary, unverified addresses, no clock read with explicit capture time, no live
network, preview_only true, should_ingest false and no global mutation. PASS.
Original distress-list-acquisition-adapter.test.js also PASS, unchanged.

Tradeoff: large file results now retain all parsed rows, so output memory grows
with the already-bounded response instead of silently truncating records. Remote
service pagination beyond its request-page cap remains B-23c follow-up; this PR
does not claim complete retrieval from a truncated remote service.

Full hosted CI on the integrated PR head and automatic deployment/public checks
remain required. No provider, real import, business write or source run performed.
