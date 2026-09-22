# Cycle 36 - Manual Value Source Unlock

## What changes for Gabriel

Texas automated comps remain disabled. A separate manual value lane now lets an operator-confirmed screenshot comp count only after the existing strict comp grid accepts it. Three accepted confirmations move the property work status to `PROPERTY_READY`; contact work remains separate and can stay locked.

The dashboard shows:

- Contact status and property status on separate lines.
- Confirmed strict comps, confirmed comps rejected by the grid, and unconfirmed candidates.
- Missing subject facts that prevent a comp from passing.
- A plain-English leverage dossier with evidence links.
- A clue-only equity estimate and `LIKELY`, `TIGHT`, `NONE`, or `UNKNOWN` room to offer.

## Confirmation safety

A sold comp counts only when one explicit operator action records all of:

- `confirmed: true`
- a non-empty authenticated operator identity
- a valid ISO confirmation timestamp

The confirmation is necessary but not sufficient. Distance, sale date, price floor, property type, similarity, provenance, and the other strict-grid checks still apply. One request can confirm or unconfirm only one comp. OCR and automated processes never confirm evidence.

## Debt and equity wording

Original loan amount means the amount at origination, not the current balance. Liens, tax due, judgments, auction minimum bids, and unlabelled source amounts remain separate facts. Equity is always a clue. Missing debt or missing value evidence keeps equity and room to offer unknown.

## Operating steps

1. Open a row with a complete source-supported property address.
2. Capture or upload one sold-comp screenshot.
3. Review every proposed field against the image.
4. Confirm that one comp explicitly.
5. Repeat until three comps pass the strict grid, or follow the shown rejection and missing-evidence reasons.

No production batch is required for this cycle. The new state and counts are derived read-only from the stored snapshot and manual evidence packet.
