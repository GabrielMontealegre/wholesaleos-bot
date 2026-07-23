---
market: Los Angeles County
state: CA
status: survey_verified_open
pr: pending
main_sha: 4419429
blocker: none
---

# Cycle 5 - Los Angeles County, CA

## Verdict Summary

**VERIFIED OPEN.** Los Angeles County Treasurer and Tax Collector publishes a free public auction book PDF that exposes APN, owner or owner-clue text, street addresses for many rows, and minimum bid evidence. The lane is buildable from the official public PDF. See [[los-angeles-ca]] for the market note and [[../WHOLESALEOS_OPERATOR_MAP|operator blocker table]] for the honest cross-market map.

## Probe table (normal browser UA, free public only)

| Source | URL | HTTP | Status | Property rows | Notes |
|---|---|---|---|---|---|
| Auction book PDF | ttc.lacounty.gov/wp-content/uploads/2026/03/2026A-Auction-Book.pdf | 200 | **OPEN** | 1,000+ | text-layer PDF; rows expose APN, legal description, location, and property address or APN-only proof |
| Schedule of upcoming auctions | ttc.lacounty.gov/schedule-of-upcoming-auctions/ | 200 | open landing | none | official auction timing, redemption dates, and contact information |
| Auction general information | ttc.lacounty.gov/auction-general-information/ | 200 | open | none | official TTC auction guidance page |
| Notice of auction or sale | ttc.lacounty.gov/notice-of-auction-or-sale/ | 200 | open | notices | official notice landing page |

## Row structure (from the parsed PDF)

`ITEM  AIN  MIN BID  IMP  NSB#  LEGAL DESCRIPTION  LOCATION  PROPERTY ADDRESS`

Real examples:
- `2006-010-026 $3,083 ... COUNTY OF LOS ANGELES VACANT LOT` (APN-only / no street)
- `2020-019-012 $14,276 ... 8210 BOBBYBOYAR AVE LOS ANGELES CA 91304-3507`
- `2023-013-005 $40,183 ... 22138 RUNNYMEDE ST LOS ANGELES CA 91303-1112`
- `2048-013-089 $38,911 ... 28915 THOUSAND OAKS BLVD AGOURA HILLS CA 91301-2108`
- `2064-025-124 $30,371 ... 4240 LOST HILLS RD NO 1708 CALABASAS CA 91301-5350`
- `2130-027-025 $17,125 ... 19350 SHERMAN WAY UNIT 112 LOS ANGELES CA 91335-3764`

## Honesty constraints for the build

- `00000`-style or no-street rows stay APN-only / source-proof only.
- The displayed minimum bid is **not** price, ARV, or MAO.
- Cities are derived from the source structure when the PDF groups rows by region/city.
- No guessed zip, no fabricated suffix, no invented contact, no fabricated comps.

## Evidence

- `../../exports/cycle5-los-angeles-ca-gate/probe-results.json`

## Verbatim Codex Prompt

```text
Los Angeles County survey complete: the official TTC auction book PDF is open and usable.
Build the CA lane from the verified public PDF and keep all honesty gates intact.
```

## Related

- [[los-angeles-ca]]
- [[san-diego-ca]]
- [[../WHOLESALEOS_OPERATOR_MAP|Operator blocker table]]
