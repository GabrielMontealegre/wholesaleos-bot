# County ranking: approved source refused the first request

2026-10-15, after the Leads zero-count fix#362 passed188/0/0 and live checks.

Architect answer#358 approved Census Reporter,51state requests,max1/second,
stop on4xx/5xx. The build-only refresh made exactly ONE request:

`https://api.censusreporter.org/1.0/data/show/latest?table_ids=B01003,B25077&geo_ids=050%7C04000US01`

Result: `county_acs_http_403_state_01_stopped_after_1_requests`.
No retry, alternate host, credential, proxy, browser workaround or API-key request.
No ACS artifact was written;no production access or stored-data mutation.
The HTTP refusal is not evidence that county statistics do not exist.

## Local checkpoint only, not releasable

- Build-only fetch function stops before the next state on any non-success.
- Pure parser requires ACS2024 five-year release,table metadata,FIPS state and
  per-row provenance;sentinel/missing values remain null.
- Pure ranking scaffold leaves any missing component unranked,uses explicit
  approved county buyer coverage only,and never mutates lead/store inputs.
- Proposed fallback weights30population/30median value/15disclosure/10foreclosure/
  15buyers are NOT claimed to reproduce the absent October12 formula;no live
  rankings have been calculated. Architect may specify the exact old bands.
- No route,UI,artifact or live ranking integration in this checkpoint.

Blocked under AGENTS network invariant and section10. Recommendation: provide
an explicitly permitted accessible ACS bulk source/export or approve a concrete
alternative access path. Do not bypass this source's403. Continue independent
P0 UI cleanup while waiting;other feature/source work stays paused.
