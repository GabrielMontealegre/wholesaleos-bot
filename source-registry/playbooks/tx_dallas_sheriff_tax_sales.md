# Dallas County TX Sheriff Tax Sales

Status: candidate/inactive
Source ID: `tx_dallas_sheriff_tax_sales_candidate`
Category: tax delinquent / sheriff sale

## Source Metadata

- Source name: Dallas County TX Sheriff Tax Sales
- State: TX
- County: Dallas
- Jurisdiction: Dallas County Tax Office
- Source URL: https://www.dallascounty.org/departments/tax/sheriff-sales.php
- Auction/verification URL: https://dallas.texas.sheriffsaleauctions.com/
- Official source: yes
- Interface type: searchable portal
- Acquisition method: browser-assisted capture / manual upload
- Parser adapter: `searchable_portal_adapter`
- Enabled: false
- Source status: candidate

## Acquisition Method

This source is not a background ingestion source. The Dallas County page points operators to monthly online sheriff sales and related tax foreclosure resale information. The v1 adapter only normalizes rows supplied by an operator-controlled dry run, manual export, copied visible portal text, or a saved test fixture.

Do not automate:

- login
- bidding
- CAPTCHA handling
- repeated portal navigation
- background capture loops

## Parser Strategy

Use `source-registry/adapters/tx-dallas-sheriff-tax-sales.js`.

The adapter accepts object rows or text rows and normalizes:

- address
- owner/taxpayer/defendant
- parcel/APN/account
- amount owed / judgment / minimum bid / opening bid
- case/cause/suit number
- sale date
- source URL
- auction/detail URL
- file/PDF/row reference

The adapter returns dry-run preview candidates only:

- `dry_run: true`
- `should_ingest: false`
- `lead_type: dry_run_preview`

## Evidence Expected

Minimum useful evidence:

- official county source URL
- auction/detail URL or county row/file/PDF reference
- address or legal description that can be repaired into an address
- amount owed/minimum bid/judgment amount when available
- sale date when available
- parcel/APN/account or case/cause number when available

## Freshness Rules

- Update frequency: monthly sheriff sale cycle.
- Stale after: 14 days unless a verified sale date is newer.
- Sale-date records are stale after the sale month unless manually reverified.
- All dry-run previews remain unverified until the operator confirms the source record.

## Verification Path

1. Open Dallas County Tax Office Sheriff Sales page.
2. Open the linked Dallas sheriff sale auction portal.
3. Search/verify the property or sale record.
4. Confirm address/legal description, amount, sale date, parcel/account, case/cause number, and source reference.
5. Only after manual verification should a future ingestion path write a production lead.

## Repair Workflow

Route candidates to Source Repair Queue when:

- `missing_address`
- `missing_amount`
- `missing_source_url`
- `parser_failed`
- `malformed_pdf_extraction`
- `weak_evidence`

Do not delete weak rows. Preserve raw payload, source URL, and source reference for repair.

## Dry-Run Validation

Run:

```bash
node source-registry/adapters/tx-dallas-sheriff-tax-sales.js --sample
```

The sample output is a fixture only. It is not a real production lead and must not be ingested.
