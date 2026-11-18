# B-07 Metadata Discovery And Scope Boundary

2026-11-18 UTC, base main ef94a6e. B23 code is DONE but all new sources remain
OFF; B24a OFF core is released330/0/0, auto7875176500 and public checks PASS.
No source/provider activation, real property row, import or business write.

Existing deterministic discovery ran with registered NC/Mecklenburg parcel
targets: zero targets, zero requests. There is no existing Mecklenburg profile
to promote. The generic disclosure-state-comp-resolution engine and strict grid
remain the required reuse path, not a new comp engine.

Official metadata sources:
- [County CAMA metadata](https://maps.mecklenburgcountync.gov/opendata/metadata/Tax_Parcels_with_CAMA_Data.html)
- [County CAMA navigator](https://maps.mecklenburgcountync.gov/metadata/item/tax-parcels-with-cama-data/)
- [County parcel-sales metadata](https://maps.mecklenburgcountync.gov/metadata/item/taxparcel-sales/)

Documented field names include saleprice/saledate, fullbath/halfbath, bedrooms,
heatedarea/yearbuilt, parcelid/gispid and validsale/naldesc. The backlog's earlier
third-party price/dateofsale/fullbaths/halfbaths names are not a verified map.
No qualification-code legend or exact live endpoint is confirmed. The metadata's
430000 count and 2024 dates are historical metadata statements, not a current API
count or source freshness check. Bathroom arithmetic may use full + half*0.5 only
after source-specific schema/row validation; no row was mapped here.

The official metadata versions disagree on daily/weekly update cadence and
distribution. One legacy-formatted navigator contains a paid/mailed-copy path;
another points to public Open Mapping. Do not infer today's access/cost or claim
the county has no free data. No paid action, guessed layer0 or form was attempted.

[Wake fallback index](https://services.wake.gov/realdata_extracts/) was inaccessible
through the read-only web tool. No retry/bypass/download. The named workbook's
columns remain unverified rather than guessed; no property rows were retrieved.

[Needs-architect #530](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/530)
asks for a compatible bounded OFF metadata/fixture-only implementation and separate
code/operational acceptance. Existing live10-property ingestion/PR-address clauses
conflict with current standing privacy/import boundaries. B21 live bulk ingestion
has the same conflict. Architect528's B23-specific scope is not generalized.
Until a genuinely new compatible answer, no blocked runtime/parser/test changes
or source promotion. Continue independent B19 pure matcher; hosted CI remains the
gate for every implementation. Our issue is not the architect's answer.

The [structured evidence](proof-b07-discovery/metadata.json) contains schema/control
metadata only. Unknown endpoint/count/qualification/freshness stays null; no parser
or actual source fixture is claimed. No new test assertion or safety gate changed.
