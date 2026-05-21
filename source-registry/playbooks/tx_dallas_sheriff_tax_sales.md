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
- judgment amount
- suggested minimum bid
- strike-off amount
- appraisal value
- case/cause/suit number
- sale date
- source URL
- auction/detail URL
- file/PDF/row reference

The adapter returns dry-run preview candidates only:

- `dry_run: true`
- `should_ingest: false`
- `lead_type: dry_run_preview`

## Real Field Mapping

Dallas County sheriff/tax sale and resale materials do not use one single money field. The adapter must preserve the meaning of each money field instead of flattening them.

| Source field / label | Normalized field | Confidence | Repair fallback if missing | Notes |
| --- | --- | --- | --- | --- |
| `Property Address`, `situs`, portal address, notice heading | `address` | high when exact; medium when legal description only | `missing_address` | Address is the primary lead locator. If only a legal description exists, keep it in raw payload and evidence. |
| `Owner`, `Taxpayer`, `Defendant`, `Borrower` | `owner_name` | medium | none | Optional on some resale rows and not always a legal owner of record. |
| `Parcel`, `APN`, `account`, `tax account`, `DCAD account`, `property ID` | `parcel` / `apn` | high when exact | weak evidence if absent | Preserve exact county/DCAD account string. |
| `Cause #`, `Cause Number`, `Suit Number` | `case_number` | high | weak evidence if absent | Trustworthy on foreclosure notices and useful for source traceability. |
| `Judgment amount`, `amount of judgment`, `principal amount` | `judgment_amount` and `amount_owed` | high | `missing_amount` | This is the best candidate for amount owed when the notice includes it explicitly. |
| `Suggested minimum bid amount`, `minimum bid`, `opening bid`, `bid amount` | `minimum_bid_amount` | high | `missing_amount` if no other amount exists | This is a bid floor, not a mortgage balance. Do not label it as mortgage debt. |
| `Sheriff's deed strike off amount` | `strike_off_amount` | medium-high | weak evidence if only historical | Historical bid/result field. Useful for sale context, not current debt. |
| `DCAD value`, `appraised value`, `assessed value`, `property value` | `dcad_value` | high | optional | Appraisal value, not amount owed. Keep distinct from tax/debt fields. |
| `Sale date`, `Date of Sale`, `auction date` | `sale_date` / `auction_date` | high | timing not verified | This is the key urgency field. |
| `Instrument #`, `file date`, `recorded date` | `instrument_number`, `instrument_file_date` | medium-high | weak evidence if missing | Important evidence reference for resale/recorded-document traceability. |
| `Tax years included in judgment`, `post judgment tax years` | `tax_years_in_judgment`, `post_judgment_tax_years` | medium | optional | Clarifies what the judgment covers versus what may still be owed after judgment. |
| `Mapsco`, `legal description`, `lot/block` | `mapsco`, `legal_description` | medium | optional | Useful when address is incomplete. Preserve raw text exactly. |
| `Status`, `sale status` | `sale_status` | medium | optional | Indicates whether the property is pending, sold, held, or accepting bids. |
| `Trustee`, `Sheriff`, `Substitute Trustee` | `trustee` | medium | optional | Trustee is usually more relevant for foreclosure notices than tax sale resales. |
| `Plaintiff`, `lender`, `mortgagee`, `beneficiary` | `plaintiff` | medium | optional | More relevant to foreclosure notices. |
| PDF/file name, page number, row number, record ID | `source_reference` / evidence ref | high | `weak_evidence` | Preserve the exact file and page/row reference. |

## Amount Meaning

- `judgment_amount`: the clearest debt-like amount when explicitly present.
- `minimum_bid_amount`: bid floor, not amount owed.
- `strike_off_amount`: historical sale result, not current debt.
- `dcad_value`: appraised value, not debt.
- `amount_owed`: only set when the source explicitly provides a debt-like amount or a judgment amount. Do not infer it from appraisal value.

## Evidence Expected

Minimum useful evidence:

- official county source URL
- auction/detail URL or county row/file/PDF reference
- address or legal description that can be repaired into an address
- amount owed/minimum bid/judgment amount when available
- sale date when available
- parcel/APN/account or case/cause number when available
- if the row comes from a PDF, preserve the PDF file name plus page and row when available
- if the row comes from a portal, preserve the record URL or detail URL plus any visible source record ID

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

## Preview / Review Workflow

Use the controlled Dallas preview pipeline for operator review only:

1. Paste a small batch of copied visible portal rows, PDF text, or manual export text into the preview queue.
2. Normalize the batch through the Dallas dry-run adapter.
3. Review Source Truth, Lead Intelligence Brief, and repair flags.
4. Mark each preview candidate as:
   - Approve For Ingestion
   - Reject Candidate
   - Needs Repair
5. Approved candidates may be converted only through the controlled preview ingestion action. The action is one-candidate-at-a-time, duplicate-checked, defaults to dry-run behavior, and requires explicit operator confirmation before creating a lead.

The preview queue is capped at small batches and keeps `should_ingest: false` on every candidate.
