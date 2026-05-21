# Cook County IL Tax Liens

Category: tax delinquent

Interface: Socrata API.

Adapter: `socrata_adapter`

Valid lead requires:
- property address
- amount owed or tax/lien amount
- source row reference when available

Expected evidence:
- Socrata row ID
- address
- PIN/parcel when available
- amount owed
- tax year
- dataset URL
- captured timestamp

Freshness:
Use Socrata row or dataset metadata timestamp when available. Stale after 21 days if no update metadata is present.

Verification:
Open the Cook County Socrata record/API query and confirm address, PIN, tax year, and amount.

Repair workflow:
Route missing address, missing amount, missing source URL, or weak row ID evidence to source repair.
