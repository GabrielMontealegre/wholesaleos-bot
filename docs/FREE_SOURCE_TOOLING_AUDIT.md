# Free-Source Tooling Audit — 2026-07-09

Scope: free, safe improvements for the public deal machine. Hard filters:
nothing that bypasses anti-bot/login/CAPTCHA/paywalls, no paid APIs, no
giant dependencies added blindly. Verified against the npm registry and by
live probes where noted. Current stack already includes: playwright,
tesseract.js, pdf-parse, cheerio, axios, csv-parse.

## Verdict table

| Tool / API | License | Use case | Risk | Install cost | Recommendation |
|---|---|---|---|---|---|
| **US Census Geocoder API** (geocoding.geo.census.gov) | Public domain (US gov) | Resolve OCR partial addresses (street+city+state → official ZIP, coords, county line data) | Very low: public federal API, no key, no ToS conflict; rate-courtesy only | Zero (plain HTTPS GET) | **ADOPT NOW — probed live: resolved both real NEEDS_ZIP_REVIEW addresses (4016 Poplar Point Dr → 75032; 3609 Kings Dr → 75119)** |
| Nominatim (OpenStreetMap) | ODbL data / GPL code | Fallback geocoding, reverse geocoding | Low-med: strict usage policy (1 req/s, attribution, no heavy use) | Zero (HTTPS) | HOLD — Census covers US addresses better for this use; keep as documented fallback |
| `parse-address` (npm 1.1.2) | ISC | US street-address parsing/normalization (Geo::StreetAddress::US port) | Low; unmaintained but stable | Tiny, zero deps | ADOPT LATER if regex address parsing starts failing; current regexes work |
| `addresser` (npm 1.1.20) | MIT | Address parse + normalize w/ zip validation | Low | Small | ALTERNATIVE to parse-address; pick one, not both |
| libpostal / `node-postal` (npm 1.3.0) | MIT | Best-in-class international address normalization | Med: native C build + ~2GB model download | Very high (breaks Railway build budget) | REJECT for this deploy target |
| `crawlee` 3.17 (Apache-2.0) | Apache-2.0 | Playwright crawling framework (queues, retries, fingerprints) | Med: fingerprint/stealth features edge toward anti-bot evasion; huge dep tree | High | REJECT — bespoke lanes suffice; stealth features conflict with safety rules |
| `pdfjs-dist` (fresh version) | Apache-2.0 | Newer PDF renderer than pdf-parse's bundled v2.0.550 | Low | Medium (swap render path) | LATER — current renderer works; revisit only if OCR quality plateaus |
| tesseract.js tuning (existing dep) | Apache-2.0 | `tessedit_char_whitelist`, page-seg modes for notice layouts | None (config only) | Zero | WORTH A SPIKE next OCR sprint |
| Serper (existing provider) | Commercial (free tier in caps) | Property-specific listing discovery (Zillow /homedetails/, Redfin /home/, Realtor detail URLs) | Low within caps | Zero | MOTHBALL FROM DEFAULT QUEUE — live proof showed generic category/filter pages, so keep the adapter for diagnostics only until it reliably returns property-specific URLs |
| Foreclosure.com / Auction.com scraping | — | Auction detail radar | HIGH: login/paywall-gated beyond teasers | — | REJECT (violates no-paywall rule beyond public teaser pages) |
| Chrome MCP / computer-use (Claude session tools) | — | Assisted manual browsing of blocked portals (Tarrant publicsearch, Denton captcha) during a Claude session | Low (human present) | Zero | NOTE ONLY — session tooling, not repo code; can't run unattended |

## The one that matters: US Census Geocoder

Live probe (2026-07-09, both were real rows on the board):

```
GET https://geocoding.geo.census.gov/geocoder/locations/onelineaddress
    ?address=4016+Poplar+Point+Dr,+Rockwall,+TX&benchmark=Public_AR_Current&format=json
→ matchedAddress: "4016 POPLAR POINT DR, ROCKWALL, TX, 75032"

GET ...?address=3609+Kings+Dr,+Ennis,+TX...
→ matchedAddress: "3609 KINGS DR, ENNIS, TX, 75119"
```

Why it's not "faking a zip": the ZIP comes from the federal TIGER/Line
address-range database — an authoritative public source, with provenance
recorded on the row (`ZIP_FROM_US_CENSUS_GEOCODER`). A Census match also
independently confirms the OCR street actually exists in that city. No match
→ row stays NEEDS_ZIP_REVIEW exactly as before.

## Ranked next adds (after this sprint)

1. **Census zip resolution** — built this sprint (see below).
2. Verified open county PDF profiles — Hunt/Navarro-style EasyDocs lanes beat
   Listing Radar because they expose official notice documents with source proof.
3. tesseract.js parameter tuning spike (free OCR yield).
4. `parse-address` adoption if/when address regexes hit their ceiling.
