# Glendale AZ Code Violations

Category: code violation

Interface: ArcGIS FeatureServer.

Adapter: `arcgis_adapter`

Valid lead requires:
- property address
- case/violation type

Expected evidence:
- FeatureServer URL
- layer ID
- object ID
- address
- case type
- status
- opened date
- captured timestamp

Freshness:
Use ArcGIS edit/open date fields when available. Stale after 30 days if no active status recheck exists.

Verification:
Open the ArcGIS layer/record and confirm address, case type, and current status.

Repair workflow:
Route missing object ID, missing address, inactive ambiguous cases, or FeatureServer parser failures to source repair.
