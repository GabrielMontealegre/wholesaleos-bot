# Saved-lead triage diagnostic

This slice reports Keep and comp, Park and Archive counts on Leads after you
press **Check stored records**. It changes no stored record and has no move
button. Counts cover the full saved store, not the visible page. Reasons account
for every record. Already archived records are shown separately from proposed
new archives. The first twenty research candidates are IDs only.

Keep requires an existing verified property address, an approved buyer's actual
area, a source URL and a recent raw event date or explicitly upcoming sale.
Unknown dates, copied dates and ingestion timestamps cannot make a row fresh.
Current raw evidence overrides older tax history. Uncertain possible current
events prevent an old-tax archive proposal without becoming proven dates.
Park returns dynamically when an approved buyer covers the area; it is not a
permanent rejection. This report does not change reach-out or offer readiness.

New archive proposals need a typed, source-backed delinquent-tax year older than
three years with no newer/uncertain event, or an explicit completed address-repair
receipt and still no complete street address. No existing saved-lead producer
was found for that repair receipt; no placeholder is falsely called repaired.
Already archived duplicate records remain archived. Same-address source notices
are not silently deduplicated or erased. No new repair or duplicate writer added.

## Trace

- `db.insertLead` preserves raw source fields, source_details and enrichment_history.
  Its generic distress_history date is an ingestion timestamp, not event evidence.
- `socrata-extra` produces tax_delinquency with raw tax_year in source_details;
  root and nested raw copies must agree. Assessed years and derived years do not count.
- The existing raw-date normalizer and numeric resolver determine dates; sale
  proof cannot resolve an unrelated filing date. Derived ISO/lifecycle fields are ignored.
- Existing operational eligibility supplies address/source-conflict and buyer
  provenance guards. Existing buyer-fit supplies geography only; price/type notes
  do not redefine a buyer market. Buyer approval changes are reflected on next GET.
- New pure plan reads saved leads/buyers. New admin GET routes read the strict DB;
  needs-comps is registered before the generic lead-ID route and returns IDs only.
- The actual final renderLeads path is wrapped by the diagnostic panel. It only
  fetches on explicit Check; failed authentication clears prior counts.

## Safety and next gate

No apply, undo, acquisition, address repair, confirmation, send or batch exists in
this slice. No records are deleted, saved or assigned invented references.
The original move bounds are checked against proposed NEW archives, not records
already archived. They are a diagnostic flag, not permission to mutate.
Actual live counts must be posted to #307. Outside the original bounds, a move
is blocked pending architect guidance. Never tune the classifier to match 9,000.
An eventual move needs its own bounded implementation, private byte backup and
reversible audit/undo proof. The read-only needs-comps list captures no comps.

Tests use synthetic records and the real full dashboard and routes at
1366/400/412 widths. Screenshots are synthetic, not production evidence.
