# P0 filter hygiene from architect answer358

## Trace

`modules/deals/reviewed-deals.js` list returns measured summary counts;it is
unchanged. `dashboard/wos-todays-deals.js` async load writes its local data,
markup reads count fields and emits filter details/actions;paint preserves
the user's expanded state. `dashboard/wos-marketplace.js` already performs
initial phone collapse;the renderer now starts collapsed on phones too,
avoiding a first-render flash. Existing observer and viewport behavior remain.
Data-attribute click delegation navigates Import to Buyers found and Glossary
to the glossary;only their placement moves. No business writer is added.
`dashboard/index.html` asset version12 invalidates the old bundle.

## Acceptance and negative proof

- Absent/null summary metrics hidden,never coerced into measured0.
- Actual measured0 stays visible after a GET-only reload.
- Phone filters initially collapsed,open/close normally;desktop behavior retained.
- Import and Glossary visible outside filter details and navigate as before.
- Actual dashboard fixture1366x768/1920x1080/400x915/412x915,both Deals and JV;
  no overflow,no external calls,no browser writes,store unchanged.
- Existing assertions unchanged. Synthetic screenshots contain no real records.
- Prior Leads release metadata is recorded only after exact deploy/live proof.

Full suite189passed/0failed/0skipped,600s/file;new proof7.10s,mount14.55s,
shared filters12.45s,Today28.36s,county-notice fixture15.17s. Full per-file
durations in `docs/test-results/issue-341-filter-hygiene-final.txt`.
Merge and exact deploy/live verification pending. Ranking is separately BLOCKED#358
after its approved source returned403 on request1. Draft#363 is not shipped here.
