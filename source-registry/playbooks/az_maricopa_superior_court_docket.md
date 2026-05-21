# Maricopa County Superior Court Docket Calendar

Category: foreclosure

Interface: court docket / searchable portal.

Adapter: `courthouse_portal_adapter`

Valid lead requires:
- case number
- party name
- docket/court reference

Expected evidence:
- case number
- party name
- docket date
- court URL
- captured timestamp

Freshness:
Court docket information is stale quickly. Stale after 7 days unless reverified manually.

Verification:
Open the court docket, search case or party, and confirm current docket status manually.

Repair workflow:
Route portal ambiguity, missing case number, missing party, or weak property linkage to manual source repair.
