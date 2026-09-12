# Cycle 28 - Property Identity Before First Seller Phone

Status: build and test only; stop before commit for architectural QA.

## Ellis trace

The frozen Ellis notice contains both `Property address: 3808 KINGS DR ENNIS, TX 75119` and the sale venue `101 W. Main Street, Waxahachie, TX 75165`.

1. Source document: the scanned Ellis foreclosure notice carried both addresses. The subject address did not include a comma between `DR` and `ENNIS`.
2. Extraction: `modules/research/tx-trustee-notice-text-extractor.js` already rejected addresses preceded by courthouse and place-of-sale context. The scanned-source fallback did not use that guarded row extractor.
3. Board source proof: `modules/research/free-public-deal-board.js` `completeAddressFromText()` required a comma after the street suffix. It therefore missed `3808 KINGS DR ENNIS, TX 75119`, then accepted the later comma-delimited courthouse address. This is the exact displacement point.
4. Candidate and card: `modules/research/property-candidate.js` accepted the courthouse-shaped complete address because it had no venue-context check. The incorrect value then survived candidate-to-card transport.
5. Queue: `modules/research/deal-board-queue-service.js` projected and preserved the non-empty address without a separate sale-venue field.
6. Dashboard packet: `modules/research/manual-evidence-packet-service.js` labeled every non-empty normalized address `complete_source_address`, so the courthouse appeared complete.

## Corrected evidence

Before:

- `normalized_address`: `101 W Main St, Waxahachie, TX 75165`
- `sale_venue_address`: absent
- `address_state`: `complete_source_address`

After:

- `normalized_address`: `3808 Kings Dr, Ennis, TX 75119`
- `sale_venue_address`: `101 W Main St, Waxahachie, TX 75165`
- `address_state`: `complete_source_address`, because the normalized address is explicitly labeled as the subject property in source text and carries both existing source-identity signals
- Dashboard label: `Sale location ... (not the subject property)`

If only the venue is present, `normalized_address` stays empty and `address_state` is `partial_address_verify_first`.

The architectural QA pass also exposed an overlapping-label defect: the bare word `address` inside labels such as `Substitute Trustee address`, `mortgage servicer address`, `Mortgagee address`, and `Beneficiary address` was being treated as a subject-property label. Subject classification now requires an explicit property, situs, or subject qualifier. Institutional addresses are classified as non-property, actual auction venues remain separately classified as sale venues, and an explicit property label wins when it follows an institutional address. The candidate, card, board, and packet checks all consume that shared decision.

## Phone eligibility

An operator-confirmed screenshot route qualifies only when the screenshot supplies a source URL and capture timestamp, the displayed person matches a sourced owner/taxpayer identity on the row, and the displayed property address exactly matches the source-established subject address. Institutional numbers remain research-only. A quarantined `DATE_UNKNOWN_REVERIFY` row remains locked. Email is not required.

## Audit

The local snapshot is absent, so `exports/cycle-28-venue-audit/audit.json` records `UNREACHABLE`, `production_contacted:false`, and null production counts. The fixture audit detects one venue-as-subject row, one source-property mismatch, and one previously complete-labeled row that no longer qualifies, all under queue key `ellis-bad-venue`.

## Authentication design only

The proposed direct environment-variable read in `dashboard/index.html` is not viable because the dashboard is static browser JavaScript and cannot read Railway process environment variables without server injection. The no-default objective is correct, but the smallest safe correction is to remove the unconditional client bypass and rely on the existing `/api/auth/login` endpoint, which already reads the configured users through the server.

Exact one-line future change in `dashboard/index.html`:

```diff
-  if (apiSuccess || pin === correctPin || pin === '1234') {
+  if (apiSuccess || (correctPin && pin === correctPin)) {
```

Preflight before that security release must confirm Gabriel's real PIN succeeds through `/api/auth/login`; otherwise stop before deployment. Rollback is the inverse one-line change. No authentication code is changed in Cycle 28.
