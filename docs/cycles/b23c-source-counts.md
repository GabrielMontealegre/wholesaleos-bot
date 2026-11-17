# B-23c2 Saved Source Counts

Base: released main16d1558. B-23a513, B-23b517 and B-23c1/524 are released,
automatic-deployed and fixed public/static verified. Hosted gates respectively
320/0/0,322/0/0,323/0/0. Earlier failed evidence remains retained and failed.

## Contract

GET `/api/dashboard/public-distress-sources` requires the existing requireAdmin
middleware and sets Cache-Control:no-store. It never triggers a source fetch,
refresh, scheduled job, import, provider or write. Query parameters cannot
select a file or request refresh. Store/parse errors return a fixed503 code,
without paths, exceptions or source text.

The report covers configured source metadata and the latest saved preview
outcome per source in retained scout jobs (currently at most100). It is not an
all-time ledger, source-capture timestamp, freshness certificate or evidence of
completed daily collection. snapshot_updated_at is explicitly the job snapshot
timestamp. collection_enabled stays false, preview_only true, should_ingest false.

rows_found is a parsed document count. unique_preview_rows comes from the
mapper's new_leads count within that document, not newly saved business leads;
updated_duplicate_rows counts duplicate updates within that same parse. No
aggregate row sum is invented for sources without observations.

Missing outcomes/counts, wrong source/kind, inherited fields, invalid timestamps,
non-integer/negative/unsafe counts and internally inconsistent counts stay
unknown/null. A newer blocked outcome does not borrow an old successful count.
Equal-time conflicting saved outcomes remain unknown, independent of order.
Only configured IDs, controlled status values and typed counters are projected;
cards, proof rows, row audit, names, addresses and free-form messages never leave
the store-reader projection or appear in the aggregate response.

## Writer And Reader Trace

1. Adapter summarizes the parsed document with mapper.summarizeSource.
2. PR524's normalizeAdapterResult retains distress_summary in adapter_results.
3. Existing findme-scout-jobs.runJob stores those results at
   source_summary.acquisition_core_adapter_results with job.updated_at.
4. New listDistressSourceOutcomes strictly reads the existing store, returns an
   empty observation set only on ENOENT, and projects known counts/metadata.
   It does not use safeParseStore (which mkdirs and masks parse errors).
5. Pure buildSourceCounts applies latest/conflict semantics and current profile
   readiness. The GET route calls it only after the actual admin middleware.

No source writer, catalog entry, scheduling decision, paid switch, mailbox,
date/price authority, customer record or authentication rule changes.

## Verification

New synthetic tests cover projection/privacy, exact source/kind and own-property
checks, numeric/calendar validity, latest blocked/tied outcomes, missing counts,
no clock/network/input mutation, strict file reads without mkdir/write, malformed
store failure, auth-before-read401/403, admin200, no-store, generic503 and required
dependencies. PASS locally. Original assertions remain unchanged.

Full hosted exact-head gate is mandatory before merge. After automatic deployment,
verify fixed public/static source plus this endpoint's unauthenticated401 only;
do not authenticate to inspect customer data. Actual source retrieval, source
settings/host fixes, catalog/daily wiring and collection verification remain
B-23c follow-ups, not completed by this endpoint.
