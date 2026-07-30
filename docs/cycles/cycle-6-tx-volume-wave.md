---
market: Texas volume wave
state: TX
status: build
pr:
main_sha: 0b214cf
blocker: config-fit sources only
---

# Cycle 6 - Texas Volume Wave

Cycle 6 expands Texas outside the Dallas bucket. The hard rule for this cycle is that new lanes must be their own markets and must fit the existing TX county foreclosure adapter family: CivicPlus documents/archives, EasyDocs yearly lists, or official open document pages. No login, CAPTCHA, paywall, WAF bypass, or paid data.

Evidence artifact: [[../../exports/cycle6-tx-volume-wave-gate/probe-results.json]]

## Probe Table

| County | Metro route | URL | Status | Result | Decision |
|---|---|---|---:|---|---|
| Harris | Houston | https://www.cclerk.hctx.net/applications/websearch/FRCL_R.aspx | 200 | Search application page reached, but no direct per-notice document URLs visible to static fetch; only application chrome surfaced. | Deferred to Cycle 7; needs a search-app pattern, not a config entry. |
| Bexar | San Antonio | https://maps.bexar.org/foreclosures/ | web-open | Public map page says current foreclosure notices render and links a full PDF list. | Build Bexar/San Antonio lane using the official PDF. |
| Bexar PDF | San Antonio | https://www.bexar.org/DocumentCenter/View/505/Current-County-Clerk-Foreclosures | 200 | Text-layer PDF, 13 pages, rows shaped as DOCUMENT NUMBER / TYPE / ADDRESS / CITY/TOWN / ZIP. | Build; generic tabular TX list parser only, no county-specific code. |
| Travis | Austin | https://countyclerk.traviscountytx.gov/departments/recording/meetings/ | 200 | Official page points to search foreclosure notices / public records portals, not direct config-fit notice PDFs. | Deferred to Cycle 7. |
| Montgomery | Houston area | https://www.mctx.org/index_clerk/public_records/foreclosures/index.php | 200 | Official page says digital notices are on the records search website; page links portal/RealAuction, not direct docs. | Deferred to Cycle 7. |
| Fort Bend | Houston area | https://www.fortbendcountytx.gov/government/departments/county-clerk/search-for-foreclosures | 200 | Official page exposes current monthly foreclosure PDFs; August and July PDFs are open but oversized image scans under the current safe parsing cap. | Build Houston-area source-proof lane; property parsing deferred to future large-scan/OCR work. |
| Williamson | Austin | https://www.wilcotx.gov/308/Foreclosure-Trustee-Sales | 200 | Official page links Posted Legal Notices/Search Records, but no direct foreclosure notice documents found. | Deferred to Cycle 7. |
| Williamson notices | Austin | https://www.wilcotx.gov/1466/Posted-Legal-Notices | 200 | Posted Legal Notices page reached; no config-fit foreclosure document links found. | Deferred to Cycle 7. |

## Build Decision

Built:

- [[tx_bexar_county_foreclosure_notices]] under the San Antonio market. Uses Bexar's official DocumentCenter foreclosure PDF. It emits complete rows only when the source table has a street number plus city and zip; street-only rows stay proof/review with missing street number.
- [[tx_fort_bend_county_foreclosure_notices]] under the Houston market. Uses Fort Bend's official foreclosure list page and current monthly PDFs as source proof. The PDFs are open but 24-26MB scans, so they stay honestly skipped under the current 6MB server cap.

Deferred:

- Harris, Travis, Montgomery, and Williamson. They are public pages, but not config-fit document-index sources under the existing TX adapter family.

## Routing Contract

- Dallas keeps the exact previous Dallas lane set and does not inherit Bexar or Fort Bend.
- Houston/Harris/Fort Bend routes only to Houston-area verified lanes.
- San Antonio/Bexar routes only to Bexar.
- Austin/Travis/Williamson currently routes to no lanes and short-circuits honestly until a verified config-fit source exists.
- Detroit, San Diego, Los Angeles, and Cleveland routing stay unchanged.

## Prompt Used

BUILD ONLY. BRANCH: feat/cycle-6-tx-volume-wave (base: main 0b214cf). Cycle 6 - Texas volume wave. Probe Harris, Bexar, Travis, Montgomery, Fort Bend, and Williamson. Build only config-fit TX county foreclosure lanes as their own markets; keep Dallas byte-stable; add dynamic EasyDocs current-year URLs; no fake data, paid APIs, bypasses, Railway, preview, or production.
