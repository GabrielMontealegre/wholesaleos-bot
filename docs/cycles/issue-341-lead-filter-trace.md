# Next P0 slice: Leads shared location filters

Trace-only checkpoint after verified release#359, main72fbaca. No Leads product
change, migration, source operation or production write has been made here.

## Prerequisite found

The active loader at `dashboard/index.html:21391`/`:21392` uses truthy fallback
for total/filtered counts. Running those exact committed assignment lines in a
network-free VM with a synthetic response `{totalAll:12039,totalFiltered:0}`
produces filtered state12039 instead of0. This is count-state evidence only;
it is not a claim that the empty-result page visibly renders that number.
The later list render at26316/26317 also truthy-falls back and needs handling.

Fix present-zero semantics before integrating the shared cascade. Keep the total
source count separate from filtered and loaded counts, preserve missing legacy
response compatibility, and test explicit0/missing/stale/cancelled responses.
Do not add a product regression assertion that enshrines this diagnosed defect.
The temporary VM proof is only a local diagnostic,not part of the suite.

## Writer / reader map so far

- Loader definitions at10690 and16946 also assign totalAll with truthy fallback;
  the active reassignment is21375. `_wpOrig` captures a previous version; trace
  every reference before assuming old writers are unreachable.
- Combined hydration at21280 assigns `_leadsTotalAll` from `res[1]`/`ls`.
- Consumers: sidebar badge20903; list header26316/26317; pagination metadata,
  empty/loading/error states and local toolbar filtering.
- `buildLeadApiUrl`21354 is the common active request builder; it adds state/
  county but no city, plus regional/queue/source/workflow/verification filters.
- Active `renderLeads`26248 uses `renderLeadActionToolbar`; definitions at5510
  and26118 are superseded but must be audited before removing any code.
- Toolbar writers28154 onward:storage restore,getLeadToolbarFilters,DOM reader,
  regional-mode buttons,queue buttons,Clear,selection/search and explicit apply.
  Readers:server query builder,leadMatchesToolbarFilters,control synchronization,
  active chips,counts and list render. No changes made to these yet.
- County options currently come only from loaded rows,120 cap,and concatenate
  county/jurisdiction/market/source_county. This cannot be relabeled as a verified
  subject county or reused blindly as a national county directory.
- Regional mode is a separate UI/API filter,not source routing. A future State
  selection must not silently conflict with it. Settle/log the conservative
  behavior under AGENTS precedence; do not mutate any stored geographic fact.
- `/api/leads` atserver1281 applies current filters before pagination, then
  existing intelligence/quality/sanitization/operational eligibility. Preserve
  all admission/archiving/quality logic and old caller semantics. City/exact
  selection and location counts can be opt-in reporting additions only.
- Separate operational-leads GET1400 already has exact state/county/city matching,
  but replacing the whole Leads backend with it would change list semantics;
  no such rewrite is authorized or needed for this UI slice.

## Next delivery boundary

First a bounded count-correctness sub-PR if needed; then the shared catalog/model
from#359 on Leads. Test searches beyond the display cap,dependent reset,zero
count,unknown location retained in All,storage/hash,clear,normal lead drawer,
unchanged empty/error/auth and existing gates. Four-size synthetic screenshots,
full quiet600s/file suite,merge/deploy/read-only check. Do not modify the source
or readiness rules to make a location filter return more records.

County ranking remains blocked#358. Intermittent local test startup/file-read
behavior is tracked#360,not claimed fixed. Other features remain paused until
Gabriel's full P0 sign-off. No new implementation PR has been opened for this
trace-only checkpoint; verified-release documentation rides this next P0 slice.
