# Dallas TX Code Cases

Category: code violation

Interface: Socrata API.

Adapter: `socrata_adapter`

Valid lead requires:
- property address or usable location
- violation/case type

Expected evidence:
- Socrata row ID
- address/location
- case status
- violation type
- dataset URL
- captured timestamp

Freshness:
Use Socrata update metadata when available. Stale after 30 days without row update metadata.

Verification:
Open the Dallas Open Data record and confirm location/status before outreach.

Repair workflow:
Route missing address, missing case type, malformed location, or weak evidence to source repair.
