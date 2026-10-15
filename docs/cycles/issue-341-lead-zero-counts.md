# Leads: preserve zero-result counts

## Trace and scope

`server.js` GET `/api/leads` already returns separate overall and filtered
counts after existing admission/filter logic. No server change is required.
In `dashboard/index.html`, both named `loadLeadsFromAPI` declarations,
`loadMatchingData` combined hydration, and the final loader reassignment write
`APP._leadsTotalAll`; the final loader also wrote `_leadsTotalFiltered`.
`_wpOrig` has only its declaration (no invocation); earlier writers are still
corrected rather than assumed unreachable. Readers are `updateLeadsBadge` and
the final `renderLeads` page summary/pagination. The API query builder, regional
filters, toolbar local filters, empty/loading/error states and admission rules
remain unchanged.

Each hydration path now writes both counts through the same pure fallback.
Valid zero wins; absent/invalid counts retain legacy loaded-count fallback.
Numeric strings remain accepted. No network, clock, storage or inference in
the helper. Stale loader responses still return before any count write.

## Proof

- New unit test executes every actual writer and summary reader with explicit
  zero, missing, null, invalid, numeric-string and array payloads.
- Actual final loader is executed with deferred fake fetch responses: a stale
  nonzero response cannot replace a newer zero result; legacy array reload works.
- Browser fixture loads the real dashboard then changes a synthetic API response
  from one matching row to zero and back, preserving total12039 independently.
-1366x768,1920x1080,400x915,412x915 screenshots contain synthetic data only.
  Zero production writes or external source requests. No existing assertion changed.
- Initial browser test used nonexistent `#main-content`; corrected to the actual
  `#content`. This was a new-test selector defect, not a product failure.

Full suite:188passed/0failed/0skipped,600s/file. New unit0.13s/browser2.98s;
county-notice fixture19.81s;mount14.92s;shared filters9.98s;Today26.35s.
Complete per-file durations: `docs/test-results/issue-341-lead-zero-counts-final.txt`.
Exact deploy/live results will be recorded before completion.
County ranking is the next independent P0 slice under architect decision D-057.
