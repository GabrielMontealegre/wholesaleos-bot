# Leads Geography: Trace Before Implementation

Status: implementation in progress; not released. Focused unit/real-route and
browser checks pass. Full cloud suite and post-deploy verification still required.

The browser proof now waits for authenticated startup hydration before setting
its two-row page size and explicitly requesting page one. The old fixture raced
the initial 300-row request: all four synthetic rows loaded successfully while
the test waited for two. Existing product loading/count guards stay unchanged.

## Existing Writers And Readers

- `dashboard/index.html:21366` builds the active `/api/leads` request. It always
  sends a legacy operational mode and sometimes the metro flag. Clearing the
  visible state therefore does not necessarily clear the server's region filter.
- The following active loader writes rows, totalAll, totalFiltered and paging
  state. Preserve its request sequence guard and explicit-zero handling. Add
  aggregate location facets from the response without replacing total counts.
- `getLeadToolbarFilters` reads local storage and defaults an empty filter to
  one county. `readLeadToolbarFiltersFromDom`, `applyLeadFilters` and
  `clearLeadFilters` update that state. Trace all callers before replacing them.
- `leadMatchesToolbarFilters` separately applies legacy mode and county/state
  matching to the already paginated result. Its non-location search, quality,
  workflow and source checks must remain intact.
- `syncLeadFilterControls` discovers counties only in the loaded page and can
  overwrite a shared county control. Do not reuse that limited list as a full
  directory. The canonical renderer is `renderLeads` near line 26262; the first
  data columns are currently reference then address.
- `renderRegionalModeControls`, `activeLeadFilterChips`, `setOperationalMode`
  and queue shortcuts expose or retain legacy regional state. New geography
  selection must not remain constrained by hidden legacy flags.
- `server.js` GET `/api/leads` near line 1281 filters before pagination and
  returns totalAll/totalFiltered/offset/has_more. Preserve old API consumers;
  any new shared-geography mode must filter before pagination and return
  aggregate location counts over the complete stored list, not page one.
- `dashboard/wos-list-filters.js` is the existing pure shared State/County/City
  component: normalize/change/matches/render/restore/persist. Reuse its cascade
  and exact comparisons, including child reset when a parent changes.
- `dashboard/wos-todays-deals.js` already loads
  `/api/dashboard/filter-counties` and uses aggregate location_counts. Reuse
  that directory contract; do not add a ranking source while ranking is paused.
- Checkbox rules in `dashboard/wos-marketplace.css` currently enlarge the
  checkbox itself. Keep a phone-friendly hit target but normal-size check marks.

## Acceptance And Negative Cases Still To Build

1. All states really removes old regional constraints, loads server pages and
   shows loading/counts. A real zero stays zero; stale replies cannot replace
   a newer selection. Server paging and client matching agree.
2. State changes clear county/city; county changes clear city. Options/counts
   include rows outside the first page. Invalid or mismatched geography must
   not silently widen a restrictive selection.
3. Address is the first human title/column; missing address stays explicitly
   missing rather than substituting a source id as a property name.
4. Shared filter controls work at 1366 and 412, normal checkbox visuals retain
   usable hit targets, rows open and close, console stays clean.
5. No source routing, admission/readiness/provenance rule, business-data writer,
   outreach action or county-ranking change. No automatic refresh or capture.

Read the newest #366 comments before implementation. They also report badge
count drift, generic tooltips and buyer feed/match gaps; trace ownership before
bundling anything beyond this letter. C and B remain separate PRs and are not live.
