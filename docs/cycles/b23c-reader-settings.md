# B-23c3 Schema-Bound Reader Settings

Base: released mainaf59c6a. Source-count PR525 passed325/0/0, automatic
deployment7869884489 and fixed public/static plus unauthenticated counts401.

Three pre-existing ArcGIS profiles now use explicit field maps and object-ID
reader options from data, not county-specific code. Settings apply only when
source ID, kind, exact normalized URL and reader match the reviewed entry.
Changed source identity/URL/format does not inherit stale settings. Settings and
evidence metadata are frozen on profiles. No runnable/source count changes.

## Evidence

The existing deterministic discover-public-parcel-apis.inspectArcgisLayer helper
was used on three already-open explicit layers, wrapped with fixed URL allowlists,
redirect:error, no credentials,12-second deadline and1-second per-host pacing.
Six GETs fetched only metadata and returnCountOnly responses. No property row,
lead, owner record, import, provider activation or source promotion occurred.
Projection retained at [schema review](proof-b23c-reader-settings/schema-review.json).

- [Mecklenburg schema](https://meckags.mecklenburgcountync.gov/server/rest/services/TaxForeclosures/MapServer/0?f=json):
  situs, parcel_id, due_amount, status, zip; lower-case objectid row reference.
- [Guilford schema](https://gcgis.guilfordcountync.gov/arcgis/rest/services/Foreclosure/ForeclosuresPublic/FeatureServer/0?f=pjson):
  LOCATION_ADDR, PARCEL_ID, AuctionDate, FLAG_STATUS, Owner; OBJECTID is the
  published OID, not OBJECTID_1. AuctionDate is published as an ArcGIS date field.
- [Davidson schema](https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Property_Standards_Violations_2/FeatureServer/0?f=json):
  Property_Address, Request_Nbr, Property_Owner, City, ZIP, Status; ObjectId row ID.

Field descriptors prove column names/types, not address verification, actual row
truth, source completeness, freshness or legal readiness. Count-only numbers are
dated discovery observations, not saved/imported lead counts. The Charlotte
service metadata fetch timed out; no layer was verified and layer0 was not guessed.
Script-driven publicsearch portals remain manual/settings-needed.

## Trace And Safety

distress-list-reader-settings.json -> buildProfile bound/frozen reader_options
and field_map -> adapter merges reader options with its platform plan -> readers
emit exact row references -> mapper merges profile defaults with explicit own
caller overrides -> existing candidate/card/proof normalization retains origins.
The caller can override a targeted mapping; other profile defaults survive.
Missing explicit columns never fall back to another guessed address or date.

No assessed amount becomes price/due/ARV; no mailing/auction venue becomes a
property address; no deed or case-receipt date becomes sale/recording date.
List addresses stay unverified. Ambiguous dates stay quarantined. Defaults for
preview-only/no-ingestion and all auth/paid/mailbox safety remain unchanged.

## Tests

First synthetic schema fixture on main produced0 candidates instead of1; failed
output retained locally at b23c-reader-settings-first.txt. New regression now PASS:
actual column names and IDs, epoch/date origin, missing property/venue/mailing,
ambiguous auction date, assessment-not-price, changed profile binding, frozen
settings, targeted overrides and no network. Existing adapter, pipeline, mapper
row retention and source-count tests also PASS.
The broader local importer precheck stopped at missing cheerio in isolated scratch
dependencies (MODULE_NOT_FOUND), not a behavioral assertion. It was not rerun or
reclassified as green; the hosted suite installs declared dependencies and is the
required gate. No fixture/timeout/assertion was changed for that local result.

Existing assertion changes: none. Existing fixture-only change:
tests/distress-list-acquisition-adapter.test.js:110 arcBody SITE_ADDRESS -> LOCATION_ADDR,
SALE_DATE -> AuctionDate. Same address, epoch and every original assertion kept;
the fixture now reflects the primary schema rather than generic invented columns.

Full exact-head hosted gate/release verification remain required. First-list
HTML/PDF/XLSX settings, unresolved host/layer fixes, pagination, catalog/daily
wiring and actual collection verification remain TODO. No source is scheduled.
