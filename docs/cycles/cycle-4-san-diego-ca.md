---
market: San Diego County
state: CA
status: survey_verified_open
pr: pending
main_sha: d9e4a54
blocker: none
---

# Cycle 4 - San Diego County, CA

## Verdict Summary

**VERIFIED OPEN.** San Diego County Treasurer-Tax Collector publishes a free,
no-login PDF — "Notice of Impending Power to Sell Tax-Defaulted Property" —
that parses into ~1,034 parcel rows with APN, owner name, street address, and
delinquent redemption amount. This is the first California lane cleared to
build. See [[cycle-3-jefferson-al]] (blocked) for contrast and the
[[../WHOLESALEOS_OPERATOR_MAP|operator blocker table]] for the honest source map.

## Probe table (normal browser UA, free public only)

| Source | URL | HTTP | Status | Property rows | Notes |
|---|---|---|---|---|---|
| Power-to-Sell notice PDF | sdttc.com/.../Notice-of-Impending-Power-to-Sell-Tax-Defaulted-Property-June-5-12-19-2026.pdf | 200 | **OPEN** | ~1,034 | text-layer PDF, 6 pages, parses with pdf-parse; APN + owner + street address + $ redeem amount |
| Property Tax Sales page | sdttc.com/content/ttc/en/tax-collection/property-tax-sales.html | 200 | open landing | none | links to notices + auction platform; not a row source itself |
| Auction platform | sdttc.mytaxsale.com | 200 | **register/sign-in gated** | behind registration | $1,000 deposit + $35 fee to bid; parcel list gated — REJECT as a lane source |
| Legal ads page | sdttc.com/.../property-tax-sales/legal-ads.html | 200 | open | notices | index to the PDF notices above |

## Row structure (from the parsed PDF)

`APN  OWNER_NAME  STREET_ADDRESS  $AMOUNT_TO_REDEEM`

Real examples:
- `278-080-16-00 GARDUNO MANUEL E G 16311 SALIDA DEL SOL $29,963.98`
- `105-093-26-00 FIGUEROA RICARDO M et al 01639 HILLCREST LN $3,716.72`
- `187-540-52-27 KENNEDY DARLA 01299#27 DEER SPRINGS RD $21,925.52` (timeshare/unit)
- `597-241-11-00 VELASQUEZ GRACIELA EST OF 00000 CUPENO CT $54,819.90` (00000 = no street number, vacant/placeholder)

## Honesty constraints for the build

- `00000`-prefixed rows have NO real street number (vacant land / placeholder) —
  they must NOT become full INSPECT_NOW addresses; treat as APN-only /
  source-proof rows, never a fabricated street.
- The `$` figure is the **delinquent amount to redeem**, NOT a price, NOT ARV,
  NOT MAO — label it explicitly and keep ARV/MAO locked.
- Owner name IS visible here (unlike TX foreclosure notices) — a real owner clue.
- City is grouped by region/city headers in the PDF, not on every row —
  derive it from source structure, never guess.
- This is a pre-sale power-to-sell notice (power-to-sell date 2026-07-01), an
  official public distress signal — legitimately actionable, source-proof-linked.

## Evidence

- `../../exports/cycle4-san-diego-ca-gate/probe-results.json` (to be written by the build run)
- Source PDF is linked in the profile; every row keeps it as source_document_url.

## Related

- [[cycle-3-jefferson-al]]
- [[san-diego-ca]]
- [[los-angeles-ca]]
- [[../WHOLESALEOS_OPERATOR_MAP|Operator blocker table]]
