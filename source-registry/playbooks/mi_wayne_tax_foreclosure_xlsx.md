# Wayne County MI Tax Foreclosure XLSX

Category: tax delinquent

Interface: Excel file discovered from Wayne County Treasurer foreclosure page.

Adapter: `csv_excel_adapter`

Valid lead requires:
- property address
- parcel ID
- source URL or file reference

Expected evidence:
- parcel ID
- owner/taxpayer name when available
- tax due/opening bid when available
- auction/sale date when available
- XLSX file URL/name/hash
- worksheet name
- row number

Freshness:
Use discovered XLSX file date or capture date. Stale after 30 days or sooner when auction status changes.

Verification:
Open the Wayne County Treasurer foreclosure page, download the current XLSX, and verify parcel/address/amount row before outreach or offer work.

Repair workflow:
Route Column header rows, missing address, missing parcel, missing amount, or malformed workbook rows to source repair.
