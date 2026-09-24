# Cycle 44: County appraisal evidence (Ellis pilot)

This change adds a local, read-only county appraisal adapter. It does not run an
acquisition batch, update saved leads, or put new owners on the live dashboard.
The operator supplies a county export and an existing snapshot file; the join
uses exact address or explicit parcel/geo ID. No county request is made per row.

## Verified public source

The [Ellis CAD GIS page](https://www.elliscad.com/gis-data/) links to a public
Google Drive folder. Its `ellis_ownership.zip` contains a DBF attribute table,
not a CSV. The adapter reads an extracted DBF directly; no new package is needed.
The observed table contains 102,906 rows and 84,836 distinct complete-address
keys. These are county-export counts, **not** WholesaleOS lead counts. The
repository does not contain the current full 254-row Dallas-area snapshot, and
the dashboard's latest response caps its returned rows at 100. Consequently,
owner/mailing yield and a real top five for all 254 rows are **not measured**.
Ellis CAD is authoritative for Ellis County only. It cannot supply Dallas
County ownership merely because those rows appear in a Dallas-area queue.

The bulk table supplies parcel and geographic IDs, situs and mailing addresses,
owner name, legal description, acreage, state code, and a county appraised value.
It does not establish beds, baths, living area, full deed history, homestead,
or a verified year built. The `imprvactua` field is retained only as an
improvement-actual year, not silently relabeled as year built. The rendered
single-property county page supplies those additional fields when visible.

For the known 3808 Kings Dr record, the bulk table joins exact address to
property ID 292247 and owner WITTE JACOB & ADRIANA. Its 2026 appraised value
is $246,266. The rendered county detail reports 1,374 square feet main area,
year built 2023, three bedrooms, two baths, and a 5,000-square-foot land row.
The bulk acreage is 0.1148 acre, approximately 5,001 square feet when rounded;
that is not silently treated as the exact portal land-table figure. A prior
listing screenshot showed 4,791 square feet, so a conflict must remain visible.

## Safety and use

- County appraised value is a pricing **clue**, not a sold comp, ARV, debt,
  equity amount, or offer. The adapter does not change any comp or offer gate.
- `LIKELY_EQUITY`, `LIKELY_THIN`, and `LIKELY_NONE` are tenure-based screening
  clues. Unknown current debt remains unknown. The bulk file alone lacks the
  full deed chain needed to establish years held, so its equity signal is
  normally `UNKNOWN`.
- A missing or ambiguous exact match is not joined. County/state mismatch is
  not joined. A portal 403, 429, or access wall stops further portal reads for
  that county in the same process.
- The county property-detail URL is an official record link. No private portal
  API, token, authorization header, listing-site fetch, or paid service is used.
- Only county-record fields are source-verified. This does not confirm a phone
  number, screenshot comp, or contact outcome.

To measure a complete real snapshot offline, provide the extracted DBF and a
read-only JSON export of the full stored rows to
`scripts/cycle-44-select-test-property.js` with `--rows`, `--bulk`, `--county Ellis`,
and `--state TX`. The script prints aggregate counts and five ranked rows; it
does not write any row back. Do not call that output a full-market result when
the input is only the dashboard's first 100 rows.

This backend-only work should remain in a PR until a later approved release can
deploy it together with an explicit, previewable import path. Merging into main
would trigger Railway deployment, so "merge now but do not deploy" is not a
safe operation in this repository.
