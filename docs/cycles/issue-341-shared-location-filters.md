# P0 shared location filters: first rollout

Scope: Today's Deals and JV. The same component provides State, County, City,
removable location chips, clearing and bookmarks. County counts are computed
before the existing 100-card display cap; a search can therefore reach a record
that was not in the initial cards. Location searches use exact normalized names,
not substring matches. County/County-suffix aliases are supported; other names
are not guessed. Older API callers retain their existing substring behavior.

## Truth boundary

The directory has all 50 states plus DC and 3,144 unique county/equivalent FIPS
identities from already-cached official 2025 Gazetteer and PEP files. No source
request or business-data operation is used to generate it. Reproduce with:

```powershell
node scripts/build-county-filter-catalog.js <cached-source-directory>
```

Inputs: `co-est2025-alldata.csv` and
`counties/2025_Gaz_counties_national.txt`, matching the existing market-index cache.
The generator cross-checks every population county identity against the Gazetteer,
rejects duplicate/missing identities, and never invents ACS statistics.
It emits a byte-identical runtime copy at
`modules/records/county-filter-directory.json`, pinned by a test, so a mutable
`data/` volume cannot hide the shipped directory. The route reads this immutable
copy through the same mtime/size cache. No volume or deploy configuration changes.
Original source download times are not established; 2025 is the geography vintage,
not a claim of a fresh source check.

Ranking is NOT delivered. Official Census guidance now requires an API key for
all data queries. The old `acs2024-counties.json` contains HTML, not statistics.
See [architect blocker #358](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/358).
No data API call, credential lookup, signup or workaround was attempted.
`data/county-rankings.json` explicitly records unavailable ranking and null ACS
population, home value and rank. Counties are visibly alphabetical, not called
best-to-worst. Zero-record counties remain selectable with zero counts.

Official source/terms preflight, read October14,2026:
- https://www.census.gov/data/developers/about/terms-of-service.html
- https://www.census.gov/data/developers/guidance/api-user-guide.Query_Limits.html
- https://www.census.gov/data/developers/guidance/api-user-guide.API_Key.html

The ACS requirement, verified state-rule coverage and runtime approved-buyer
coverage remain ranking work. No PEP population substitution is scored. Existing
market-demand weights/index and legal tables are unchanged. No price, value,
readiness, provenance, quarantine, contact or offer rule changes.

## Writer / reader trace

- `state`, `county`, `city`: existing reviewed-deal validate/import/update writers
  remain unchanged. `reviewed-deals.list` retains evaluation/admission/sort/cap and
  adds opt-in exact location matching plus aggregate location counts from the same
  admitted rows before location filtering/cap. Existing Today, buyer-match, grade
  and JV readers continue to use unchanged evaluation fields.
- `location_exact`: read-only query opt-in in `reviewed-deal-routes`; no stored
  field. Calls without it preserve legacy query semantics.
- County identities: cached-source generator is the only artifact writer;
  admin-only catalog GET uses mtime/size cache; browser consumes public geography
  metadata, never source evidence. No import-time FS write/network.
- Selection: the shared UMD component's pure matching function is used by the
  browser and exact API filter; browser persistence is explicit and injected.
  Per-tab localStorage and URL hash store location selection only, never secrets.
  State changes clear county/city; county changes clear city. A failed storage
  write is nonfatal. Old in-flight responses cannot repaint a newer selection.
  After the existing authenticated app initialization, a valid bookmark opens
  its named deal/JV tab. A record-reference link takes precedence; arbitrary hash
  routes are ignored. Login/session logic is unchanged.
- API aggregates contain state/county/city/count only, no street, owner, phone,
  email, mailing address or row body. Existing card privacy projection is intact.
- Mobile presentation already collapses filters on initial load. Repainting
  preserves the operator's expanded state; it does not close the panel after each
  selection. Detail-opening still uses the same existing card action.

## Tests and verification

New unit proof: full directory identity/unknown ranks, deterministic generation,
missing/duplicate identities, exact two/three-level membership, wrong state,
substring lookalikes rejected, cascade resets, clear, per-tab/hash persistence,
denied storage, escaped hostile text, admin registration and mtime cache.
121-row real-service fixture proves counts include all eligible rows and an exact
filter retrieves row121 beyond the first100; legacy query compatibility and no
mutation/readiness change pinned.

New synthetic browser proof at1366x768,1920x1080,400x915,412x915 covers dropdowns,
zero-record counties, result changes, chips/clear, collapse, reload/bookmarks and
per-tab isolation. All non-GET/HEAD requests and external hosts blocked. No real
approval, evidence, send, contact, capture, batch, source or helper action.
Screens: `docs/screens/2026-10-14-location-filters/` (synthetic, not real records).
Existing assertions changed: none. Common fixture adds the catalog GET and exact
query opt-in conversion; product assertions are not weakened.
Initial full run:184passed/2failed/0skipped. The unchanged API session test hit a
local server startup timeout72.75s. The unchanged Activity UI test hit Windows
UNKNOWN open/stat errors on the existing Today/bell/glossary files and therefore
could not load Today. Both passed unchanged when isolated; their affected files
have an empty diff against main. No assertion or health timeout was weakened.
Initial report retained; another complete run at the final state is required
before release. A focused final bookmarked-startup/mobile proof also passed.
Second full run:185passed/1failed/0skipped; API session and Activity passed.
The unchanged mount-order proof timed out42.34s, then also timed out in isolation;
an instrumented local run of that same exported proof passed with no captured
page error or HTTP failure. This is not claimed fixed or attributed to a proven
cause. Preserve both reports and perform one final quiet full run with no
concurrent repository edits/commits. Any remaining failure keeps the PR draft.
Final quiet full run completed:186passed/0failed/0skipped,600s per file.
Filters UI20.09s/unit0.64s; auth6.27s,mount15.64s,Activity22.63s,
Today37.08s,shell41.46s,phone24.47s,unchanged county-notice fixture10.99s.
All three previously failing checks passed in this complete run. This is green
gate evidence, not a claim that the intermittent startup/file-read cause is fixed.

Remaining P0: same component on Leads/Buyers/Approvals/Map, broader filter types,
source-backed rankings (#358), remaining detail hygiene and first-run guide.
Other features stay paused until Gabriel signs off. Live verification pending
the gated release; do not treat local screenshots as production proof.

LIVE VERIFIED in#359:main72fbaca0ae90e4a02df7c34df95338b5a97c2e1e,exact deploy
7080991586 SUCCESS2026-10-15T00:56:54Z,93s status interval. Health/dashboard/assets
200,served deal script?v=11/shared?v=1. Chrome1280x585:22cards;FL5,county/city
cascade,Tampa1,3chips;county removal reset city/restored5;clear22. JV Pinellas1,
bookmark reload reopened JV with selection;clear22. Today1,Leads100/drawer
opened/closed,0new captured errors. Browser extension reconnected; a few delayed
CDP input responses were checked against actual DOM outcomes,not bypassed with
forced input or mistaken for a product defect. No real approval,confirmation,
source visit,contact,capture,batch,helper or setting action. Final PR comment is
the deployed evidence;this documentation rides the next P0 PR to avoid an extra
docs-only deploy. Ranking still blocked#358;startup follow-up#360 is unproven.
