# Dallas County Complete Source Map v1

Status: planning only
Market: Dallas County, Texas
Updated: 2026-05-25

This source map is for classification, source truth, and implementation planning only. All sources below are candidate/inactive until a dry-run parser, evidence contract, freshness rule, duplicate rule, and repair path are validated.

## Safety Boundary

- No production ingestion is implied by this document.
- No scraping loops, CAPTCHA bypass, proxy/stealth behavior, bidding automation, login automation, or outbound contact workflow is allowed.
- Third-party valuation and comp sources are evidence-support layers only. They must not create fake comps, fake ARV, or final offer values without operator-reviewed evidence.
- Probate, public notices, 311, permits, fire, nuisance, and utility-adjacent signals are not property-level seller distress by themselves. They need property verification before entering an actionable queue.

## Source Tiers

### Tier 1: Acquisition-grade, implement first

| Source | Category | Why it matters | Adapter | Implementation priority |
| --- | --- | --- | --- | --- |
| Dallas County Tax Office Sheriff Sales | tax sale / delinquent tax | Official monthly online tax sale source with auction timing and property evidence | searchable_portal_adapter | 1 |
| Dallas County Clerk Foreclosure Notices | foreclosure / trustee sale | Official posted foreclosure PDFs and public search path | pdf_list_adapter / public_notice_adapter | 2 |
| Dallas County Public Works Tax Foreclosure Resales | tax foreclosure resale | Official struck-off/resale property evidence and linked tax-sale references | html_table_adapter / pdf_list_adapter | 3 |
| Dallas OpenData Code Violations | code violation | Official city code case data for property distress signals | socrata_adapter | 4 |
| Dallas Central Appraisal District property search | appraisal / property records | Official owner, situs, account, parcel, value, and legal-description verification | searchable_portal_adapter | 5 |
| Dallas County Official Public Records / Public Search | property records / foreclosure support | Official recorded documents, deeds, UCC, and foreclosure search support | court_docket_adapter / searchable_portal_adapter | 6 |

### Tier 2: Enrichment and support

| Source | Category | Why it matters | Adapter | Implementation priority |
| --- | --- | --- | --- | --- |
| DCAD GIS Data Products and property map | GIS / parcel map | Parcel geometry, account matching, legal boundary support | csv_excel_adapter / browser_assisted_capture_adapter | 7 |
| Dallas County GIS / NCTCOG regional data | GIS / parcel context | County map and regional GIS support; parcel source points back to DCAD | arcgis_adapter / manual_review_adapter | 8 |
| Dallas OpenData Building Permits | permits / inspections | Repair, demolition, remodel, and work-value context | socrata_adapter | 9 |
| Dallas 311 / service requests | nuisance / vacancy-adjacent | Public nuisance and service-request context; needs filtering and verification | socrata_adapter / manual_review_adapter | 10 |
| Dallas vacant building and nuisance code pages | unsafe / vacant / nuisance | Verification path and manual classification support | manual_review_adapter | 11 |
| Dallas Fire-Rescue active incidents / prevention pages | fire damage / unsafe structures | Possible condition signal; active incidents are not durable lead evidence by themselves | browser_assisted_capture_adapter / manual_review_adapter | 12 |
| Dallas County Probate Courts and Courts Portal | probate / estate | Estate and guardianship leads; usually needs property join through DCAD/OPR | court_docket_adapter | 13 |
| Dallas County Official and Legal Notices | public notices | County notice index for legal/public postings | public_notice_adapter | 14 |
| Dallas County unincorporated permits and nuisance pages | permits / nuisance | County-level support outside city limits | manual_review_adapter | 15 |

### Tier 3: Manual review / future

| Source | Category | Why it matters | Adapter | Implementation priority |
| --- | --- | --- | --- | --- |
| Linebarger tax sale list | third-party tax sale support | Tax sale property list linked from Dallas Public Works | browser_assisted_capture_adapter | 16 |
| Texas public notice / Daily Commercial Record | third-party public notice | Secondary legal-notice discovery; authority must be confirmed against county records | manual_review_adapter | 17 |
| Public utility shutoff indicators | utility / vacancy-adjacent | No reliable property-level public shutoff list identified; use only as future/manual support | manual_review_adapter | 18 |
| Zillow / Redfin / Realtor | comp / valuation support | Visible sold/listing candidates for operator-reviewed comps | browser_assisted_capture_adapter | 19 |
| Google Maps / Street View | condition / location support | Operator visual inspection, access, street condition, nearby context | manual_review_adapter | 20 |

## Category Coverage

- Tax / sheriff / delinquent tax sales: Dallas County Tax Office Sheriff Sales, Dallas County Public Works Tax Foreclosure Resales, Linebarger tax sale list.
- Foreclosure / trustee sale / auction notices: Dallas County Clerk Foreclosure Notices, Dallas Public Search, Official Public Records.
- Code violations: Dallas OpenData Code Violations, City Code Compliance pages.
- Unsafe structures / fire damage / nuisance: City Code Compliance vacant building/nuisance pages, Dallas Fire-Rescue prevention/active incident pages, Dallas 311.
- Permits / inspections: Dallas OpenData Building Permits, City Planning and Development permit pages, Dallas County unincorporated development permit page.
- Probate / estate / court records: Dallas County Probate Courts, County Clerk Probate Courts Division, Dallas Courts Portal.
- Public notices: Dallas County Official and Legal Notices, foreclosure notice PDFs, third-party notice sources as support only.
- Appraisal district / property records: DCAD property search, DCAD account search, DCAD property map, Dallas Official Public Records.
- GIS / parcel maps: DCAD GIS Data Products, Dallas County GIS page, Dallas County Open Data Hub, NCTCOG regional data.
- Open data / ArcGIS / Socrata: Dallas OpenData catalog, Code Violations, Building Permits, 311/service-request candidates.
- Utility shutoff / vacancy-adjacent: no property-level public shutoff source confirmed; use 311/vacant building/fire/nuisance signals instead.
- Comp / valuation support: Zillow, Redfin, Realtor, DCAD, Google Maps, county parcel/GIS, official records for deed/instrument context.

## Detailed Source Contracts

### tx_dallas_sheriff_tax_sales

- Source name: Dallas County Tax Office Sheriff Sales
- Source URL: https://www.dallascounty.org/departments/tax/sheriff-sales.php
- Official / third-party: official
- Source category: tax sale / delinquent tax
- Interface type: searchable portal / linked online auction portal
- Acquisition method: browser-assisted capture, manual review
- Adapter family: searchable_portal_adapter
- Expected fields: address, owner/taxpayer, parcel/account, sale date, case/cause number, minimum bid, judgment/tax amount when visible
- Amount/timing fields: sale date, minimum bid, judgment amount, tax due, auction cycle
- Evidence fields: county source URL, auction portal URL, row/card reference, property detail URL, parcel/account, case/cause number, captured_at
- Freshness/update frequency: monthly sheriff sale cycle
- Stale-after rule: 14 days or immediately after sale date
- Verification path: open county page, then linked Dallas sheriff sale auction portal, then verify address/parcel/case/amount/sale date
- Extraction difficulty: high
- Risk/limitations: portal may require session, registration, or manual verification; no login/bid automation
- Recommended priority: Tier 1, priority 1

### tx_dallas_county_clerk_foreclosure_notices

- Source name: Dallas County Clerk Foreclosure Notices
- Source URL: https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php
- Official / third-party: official
- Source category: foreclosure / trustee sale
- Interface type: document index / searchable PDF list / public search portal
- Acquisition method: direct download for PDFs where available; browser-assisted public search for newer notices
- Adapter family: pdf_list_adapter, public_notice_adapter
- Expected fields: borrower/grantor, trustee, property address, legal description, sale date/time/location, document/post date, file name
- Amount/timing fields: sale date, post date, substitute trustee sale time
- Evidence fields: PDF URL, file name, city/month grouping, page reference, document text match, public search URL
- Freshness/update frequency: monthly foreclosure posting cycle
- Stale-after rule: 14 days or immediately after sale date
- Verification path: open PDF or public search foreclosure result, confirm property address and sale date
- Extraction difficulty: medium-high
- Risk/limitations: PDF format varies; legal description may appear without clean situs address; some newer notices move to public search
- Recommended priority: Tier 1, priority 2

### tx_dallas_public_works_tax_resales

- Source name: Dallas County Public Works Tax Foreclosure Resales
- Source URL: https://www.dallascounty.org/departments/pubworks/property-division.php
- Official / third-party: official
- Source category: tax foreclosure resale / struck-off property
- Interface type: HTML page with linked list/documents
- Acquisition method: direct download when list is available; manual upload fallback
- Adapter family: html_table_adapter, pdf_list_adapter
- Expected fields: address, parcel/account, struck-off status, resale/bid details, participating taxing entity, source list reference
- Amount/timing fields: bid opening date, resale price/minimum bid when listed, struck-off date when available
- Evidence fields: county URL, struck-off list URL, file name, row number, linked Courts Portal reference, DCAD link
- Freshness/update frequency: periodically announced sales
- Stale-after rule: 30 days or after bid/sale date
- Verification path: open Public Works source page, open struck-off list, verify address and sale/resale instructions
- Extraction difficulty: medium
- Risk/limitations: some details may be in attachments; sealed-bid inventory is not equivalent to live motivated seller outreach
- Recommended priority: Tier 1, priority 3

### tx_dallas_code_violations_socrata

- Source name: Dallas OpenData Code Violations
- Source URL: https://www.dallasopendata.com/dataset/Code-Violations/x9pz-kdq9
- Official / third-party: official
- Source category: code violation
- Interface type: Socrata API / dataset
- Acquisition method: API call, dry-run first
- Adapter family: socrata_adapter
- Expected fields: case/service number, street address, violation/case type, status, opened date, closed date, location, district
- Amount/timing fields: opened date, closed date, case status; amounts are usually not present
- Evidence fields: dataset URL, API resource ID, row ID, case number, address, violation type, status, captured_at
- Freshness/update frequency: dataset-managed
- Stale-after rule: 30 days unless status remains active/open and row timestamp is fresh
- Verification path: open Dallas OpenData row and confirm address/status/type
- Extraction difficulty: low-medium
- Risk/limitations: existing registry references `n7km-yvgf` while DFW planning references `x9pz-kdq9`; reconcile resource ID before parser promotion
- Recommended priority: Tier 1, priority 4

### tx_dallas_dcad_property_search

- Source name: Dallas Central Appraisal District Property Search
- Source URL: https://www.dallascad.org/SearchAddr.aspx
- Official / third-party: official
- Source category: appraisal / property records
- Interface type: searchable portal
- Acquisition method: browser-assisted capture / manual verification
- Adapter family: searchable_portal_adapter
- Expected fields: account number, situs address, owner, mailing address, legal description, appraisal year, market value, land value, improvement value, exemptions, property characteristics when visible
- Amount/timing fields: appraisal year, market value; not mortgage balance and not distress amount
- Evidence fields: DCAD URL, account number, property detail URL, parcel/account, captured_at
- Freshness/update frequency: annual appraisal cycle with periodic updates
- Stale-after rule: 90 days for owner/account verification; annual for valuation context
- Verification path: search by address/account, open property detail, confirm owner, account, legal description, and situs address
- Extraction difficulty: medium
- Risk/limitations: search may require operator interaction; assessed value is not ARV and must not be treated as comp evidence alone
- Recommended priority: Tier 1, priority 5

### tx_dallas_official_public_records

- Source name: Dallas County Clerk Official Public Records / Public Search
- Source URL: https://dallas.tx.publicsearch.us/
- Official / third-party: official portal
- Source category: property records / foreclosure support
- Interface type: searchable portal
- Acquisition method: browser-assisted capture / manual review
- Adapter family: court_docket_adapter, searchable_portal_adapter
- Expected fields: document type, recording date, instrument number, parties, legal description, foreclosure notice type, deed/lien references
- Amount/timing fields: recording date, sale date if in foreclosure notice; amount may not be structured
- Evidence fields: public search URL, document/instrument number, recording date, document image/PDF reference
- Freshness/update frequency: daily/recording-driven
- Stale-after rule: 14 days for foreclosure notices, 30 days for lien/deed support
- Verification path: use public search dropdown for foreclosure or UCC/deeds, confirm instrument and document image
- Extraction difficulty: high
- Risk/limitations: portal/session behavior may limit automation; Texas non-disclosure reduces sale price availability
- Recommended priority: Tier 1, priority 6

### tx_dallas_building_permits_socrata

- Source name: Dallas OpenData Building Permits
- Source URL: https://www.dallasopendata.com/Services/Building-Permits/e7gq-4sah
- Official / third-party: official
- Source category: permits / inspections
- Interface type: Socrata dataset
- Acquisition method: API call, dry-run first
- Adapter family: socrata_adapter
- Expected fields: permit number, permit type, issued date, contractor, value, area, work description, land use, street address, ZIP
- Amount/timing fields: issued date, permit value
- Evidence fields: dataset URL, row ID, permit number, address, permit type, captured_at
- Freshness/update frequency: listed as daily, but data-last-updated must be checked
- Stale-after rule: 60 days unless row metadata proves newer
- Verification path: open dataset/API row and confirm permit number/address/work description
- Extraction difficulty: low
- Risk/limitations: permits are enrichment only; old or closed permits do not prove seller motivation
- Recommended priority: Tier 2, priority 9

### tx_dallas_311_service_requests

- Source name: Dallas 311 Service Requests / Service Request Status
- Source URL: https://dallas.gov/services/311/Pages/about-us.aspx
- Official / third-party: official
- Source category: nuisance / vacancy-adjacent
- Interface type: public service request portal / possible open-data dataset
- Acquisition method: manual review or Socrata/API only if a current dataset is verified
- Adapter family: socrata_adapter, manual_review_adapter
- Expected fields: service request number, request type, address/location, created date, closed date, status, department
- Amount/timing fields: created date, closed date; no amount expected
- Evidence fields: request/status URL, request number, request type, address, captured_at
- Freshness/update frequency: operational, likely daily if dataset is exposed
- Stale-after rule: 14 days for open requests, 30 days for closed nuisance support
- Verification path: open request/status source and confirm property-level address and request type
- Extraction difficulty: medium
- Risk/limitations: service requests can be citizen-reported and noisy; support signal only unless tied to property-level code or nuisance action
- Recommended priority: Tier 2, priority 10

### tx_dallas_vacant_building_code_compliance

- Source name: City of Dallas Vacant Building Program
- Source URL: https://dallas.gov/departments/codecompliance/Pages/VacantBuilding.aspx
- Official / third-party: official
- Source category: vacant / unsafe / nuisance
- Interface type: informational page / manual verification
- Acquisition method: manual review
- Adapter family: manual_review_adapter
- Expected fields: registration requirements, inspection fee, contact path; no public property list confirmed
- Amount/timing fields: registration fee and inspection fee context only
- Evidence fields: source URL, manual notes, operator verification date
- Freshness/update frequency: page-managed
- Stale-after rule: 90 days for procedure verification
- Verification path: use as source-truth support when a property has a vacant-building indicator from another source
- Extraction difficulty: manual
- Risk/limitations: no confirmed property-level public list; do not ingest from this page alone
- Recommended priority: Tier 2, priority 11

### tx_dallas_fire_rescue_active_incidents

- Source name: Dallas Fire-Rescue Active Incidents and Prevention Pages
- Source URL: https://dallas.gov/departments/fire-rescue/Pages/active-incidents.aspx
- Official / third-party: official
- Source category: fire damage / unsafe structure
- Interface type: active incident page
- Acquisition method: browser-assisted capture only if operator-triggered; manual review preferred
- Adapter family: browser_assisted_capture_adapter, manual_review_adapter
- Expected fields: incident type, location block/address if visible, date/time, status
- Amount/timing fields: incident time/date
- Evidence fields: source URL, incident snapshot, captured_at
- Freshness/update frequency: live/active
- Stale-after rule: same day unless linked to durable fire/code record
- Verification path: confirm active incident, then seek durable code, permit, or inspection evidence before lead creation
- Extraction difficulty: high
- Risk/limitations: active incidents are volatile and may omit exact property; do not use as standalone acquisition lead
- Recommended priority: Tier 2, priority 12

### tx_dallas_probate_courts

- Source name: Dallas County Probate Courts / Courts Portal
- Source URL: https://www.dallascounty.org/government/courts/probate/
- Official / third-party: official
- Source category: probate / estate
- Interface type: court docket / portal
- Acquisition method: browser-assisted capture / manual review
- Adapter family: court_docket_adapter
- Expected fields: case number, estate/decedent name, filing date, court, party names, case status
- Amount/timing fields: filing date, hearing date; no property amount expected
- Evidence fields: courts portal URL, case number, case type, filing date, captured_at
- Freshness/update frequency: court filing driven
- Stale-after rule: 30 days unless case status remains active
- Verification path: open Courts Portal case, confirm probate case details, then join to DCAD/OPR property evidence
- Extraction difficulty: high
- Risk/limitations: probate records rarely contain property address directly; must not become actionable property lead without a property join
- Recommended priority: Tier 2, priority 13

### tx_dallas_official_legal_notices

- Source name: Dallas County Official and Legal Notices
- Source URL: https://www.dallascounty.org/government/county-clerk/administration/official-and-legal-notices.php
- Official / third-party: official
- Source category: public notice
- Interface type: HTML notice list
- Acquisition method: browser-assisted capture / manual review
- Adapter family: public_notice_adapter
- Expected fields: notice title, post date, expiration/end date, document URL when present
- Amount/timing fields: post date, end date
- Evidence fields: notice URL, notice title, posted date, document URL, captured_at
- Freshness/update frequency: daily/business-day postings
- Stale-after rule: 14 days unless notice end date is later
- Verification path: open notice item and preserve title/date/document reference
- Extraction difficulty: medium
- Risk/limitations: broad notice page; most rows are not acquisition leads
- Recommended priority: Tier 2, priority 14

### tx_dallas_unincorporated_permits

- Source name: Dallas County Unincorporated Area Development Permits
- Source URL: https://www.dallascounty.org/departments/duas/development-permit.php
- Official / third-party: official
- Source category: permits / inspections
- Interface type: informational/manual
- Acquisition method: manual review
- Adapter family: manual_review_adapter
- Expected fields: permit requirements and contact path; no public property list confirmed
- Amount/timing fields: permit dates only if operator has case evidence
- Evidence fields: source URL, permit file/reference if manually obtained
- Freshness/update frequency: procedure page-managed
- Stale-after rule: 90 days for procedure verification
- Verification path: use for unincorporated area property verification when another source provides parcel/address
- Extraction difficulty: manual
- Risk/limitations: Dallas County has limited unincorporated jurisdiction; not a lead source by itself
- Recommended priority: Tier 2, priority 15

### tx_dallas_linebarger_tax_sales

- Source name: Linebarger Dallas Tax Sale List
- Source URL: https://taxsales.lgbs.com/
- Official / third-party: third-party support linked from Dallas County Public Works
- Source category: tax sale support
- Interface type: searchable portal
- Acquisition method: browser-assisted capture / manual review
- Adapter family: browser_assisted_capture_adapter
- Expected fields: property address, cause number, minimum bid/amount, sale date, taxing entities, document links when visible
- Amount/timing fields: sale date, minimum bid, judgment/tax amount
- Evidence fields: third-party URL, source row/detail URL, row snapshot, captured_at
- Freshness/update frequency: monthly sale cycle
- Stale-after rule: 14 days or after sale date
- Verification path: compare against Dallas County official tax sale, courts portal, and DCAD before lead creation
- Extraction difficulty: medium-high
- Risk/limitations: third-party is not authoritative unless county-linked and verified against official records
- Recommended priority: Tier 3, priority 16

### tx_dallas_public_notice_third_party

- Source name: Texas Public Notices / Daily Commercial Record Support
- Source URL: https://www.texaspublicnotices.com/
- Official / third-party: third-party
- Source category: public notice support
- Interface type: searchable notice site
- Acquisition method: manual review
- Adapter family: manual_review_adapter
- Expected fields: notice title, publication date, legal notice text, property/legal description when present
- Amount/timing fields: publication date, sale date when present
- Evidence fields: notice URL, publication, captured_at, matched official county record
- Freshness/update frequency: publication-driven
- Stale-after rule: 14 days unless matched official source has later sale date
- Verification path: use only to discover candidates, then verify against county clerk/public records
- Extraction difficulty: manual
- Risk/limitations: may be paywalled or incomplete; third-party notice is secondary evidence
- Recommended priority: Tier 3, priority 17

### tx_dallas_utility_shutoff_public_indicators

- Source name: Public Utility Shutoff / Vacancy-Adjacent Indicators
- Source URL: https://dallas.gov/services/311/Pages/about-us.aspx
- Official / third-party: official where available
- Source category: utility / vacancy-adjacent
- Interface type: manual review
- Acquisition method: manual review only
- Adapter family: manual_review_adapter
- Expected fields: no public property-level utility shutoff list confirmed; use 311/open vacant structure/nuisance support instead
- Amount/timing fields: none
- Evidence fields: manual source note, supporting service request or code case reference
- Freshness/update frequency: unknown
- Stale-after rule: immediate manual verification required
- Verification path: do not create utility-shutoff leads unless a lawful public property-level record is identified and classified
- Extraction difficulty: manual
- Risk/limitations: privacy and availability risk; avoid treating utility status as public acquisition evidence without a specific lawful source
- Recommended priority: Tier 3, priority 18

### tx_dallas_zillow_comp_support

- Source name: Zillow Dallas Property and Sold Search Support
- Source URL: https://www.zillow.com/homes/
- Official / third-party: third-party
- Source category: comp / valuation support
- Interface type: browser page
- Acquisition method: browser-assisted capture, operator-triggered
- Adapter family: browser_assisted_capture_adapter
- Expected fields: address/title, price, beds, baths, sqft, sold/list status, URL, visible snippet
- Amount/timing fields: list/sold price, sold/list date, DOM if visible
- Evidence fields: visible URL, source page, captured_at, operator acceptance state
- Freshness/update frequency: operator capture time
- Stale-after rule: 7 days for active listings, 30 days for sold comp notes unless reverified
- Verification path: operator opens address/sold search, captures visible results, accepts 3-5 comps manually
- Extraction difficulty: medium-high
- Risk/limitations: CAPTCHA/verification possible; no bypass, no background loops, no final ARV without operator-reviewed comps
- Recommended priority: Tier 3, priority 19

### tx_dallas_redfin_comp_support

- Source name: Redfin Dallas Sold and Listing Support
- Source URL: https://www.redfin.com/
- Official / third-party: third-party
- Source category: comp / valuation support
- Interface type: browser page
- Acquisition method: browser-assisted capture, operator-triggered
- Adapter family: browser_assisted_capture_adapter
- Expected fields: address/title, price, beds, baths, sqft, sold/list status, DOM/listing history if visible, URL
- Amount/timing fields: sold/list price, sold/list date, DOM if visible
- Evidence fields: visible URL, source page, captured_at, operator acceptance state
- Freshness/update frequency: operator capture time
- Stale-after rule: 7 days for active listings, 30 days for sold comp notes unless reverified
- Verification path: operator opens address/sold search, accepts comps manually
- Extraction difficulty: medium-high
- Risk/limitations: third-party, may block automation, active listings must be labeled market support not sold comps
- Recommended priority: Tier 3, priority 20

### tx_dallas_realtor_comp_support

- Source name: Realtor.com Dallas Listing Support
- Source URL: https://www.realtor.com/
- Official / third-party: third-party
- Source category: comp / valuation support
- Interface type: browser page
- Acquisition method: browser-assisted capture, operator-triggered
- Adapter family: browser_assisted_capture_adapter
- Expected fields: address/title, price, beds, baths, sqft, listing status, URL, visible snippet
- Amount/timing fields: price, list/sold date if visible
- Evidence fields: visible URL, source page, captured_at, operator acceptance state
- Freshness/update frequency: operator capture time
- Stale-after rule: 7 days for active listings, 30 days for sold comp notes unless reverified
- Verification path: operator opens search and manually verifies candidates before use
- Extraction difficulty: medium-high
- Risk/limitations: third-party, active listings are not sold comps, no final ARV without enough evidence
- Recommended priority: Tier 3, priority 21

### tx_dallas_google_maps_condition_support

- Source name: Google Maps / Street View Condition Support
- Source URL: https://www.google.com/maps
- Official / third-party: third-party
- Source category: condition / location support
- Interface type: browser page
- Acquisition method: manual review
- Adapter family: manual_review_adapter
- Expected fields: address match, visible exterior condition notes, access, neighborhood context
- Amount/timing fields: imagery date if visible
- Evidence fields: map URL, operator notes, captured_at
- Freshness/update frequency: imagery/service-managed
- Stale-after rule: 90 days or sooner if condition is critical
- Verification path: operator opens address in Maps/Street View and records visible condition notes
- Extraction difficulty: manual
- Risk/limitations: imagery may be stale; do not infer occupancy or damage beyond visible evidence
- Recommended priority: Tier 3, priority 22

## Dallas Comp Intelligence Plan

### Goal

Dallas valuation should be evidence-first and operator-controlled. The system should produce ARV and MAO guidance only after the operator has accepted enough property-level evidence.

### Sold comp workflow

1. Start from a verified Dallas lead with a real property address and medium/high source confidence.
2. Open targeted Zillow, Redfin, and Realtor searches using full address, city, state, and ZIP where available.
3. Prefer sold results within the same neighborhood/city/ZIP and similar property type.
4. Import visible candidates as unverified only.
5. Operator approves the best 3-5 comps after checking sold/list status, sqft, beds/baths, condition, distance, and date.
6. Active listings are labeled market support, not sold comps.

### ARV guidance

- No ARV should be shown when there are fewer than 3 accepted comps.
- With 3 or more accepted sold comps, show a preliminary ARV range from comp price-per-square-foot and comparable sale prices.
- If only active/listing comps exist, show "Needs verified sold comps before ARV."
- DCAD market value can provide tax/appraisal context only. It is not ARV.

### MAO guidance

- MAO guidance requires:
  - accepted ARV range,
  - repair estimate,
  - assignment/wholesale spread target,
  - operator-confirmed source verification.
- Conservative, moderate, and aggressive scenarios can be shown, but only from entered evidence.
- No exact first offer or walkaway should be finalized from third-party estimate widgets alone.

### DOM and listing history

- DOM, price reductions, active/list status, sold date, and listing history should be captured only when visible to the operator.
- DOM/listing history can improve confidence but does not replace sold comp verification.

### Source signal matrix

| Source | Signal | Use |
| --- | --- | --- |
| Zillow | visible sold/listing comps, price, beds/baths/sqft, listing history when visible | browser-assisted candidate capture |
| Redfin | sold/listing comps, DOM/history when visible | browser-assisted candidate capture |
| Realtor | listing/market support, status and property facts when visible | browser-assisted candidate capture |
| DCAD | owner/account verification, assessed value, legal description, property characteristics | source truth and property verification |
| Google Maps | condition and location context | manual visual review |
| Dallas County OPR/Public Search | deeds, foreclosure notices, document history | official evidence and verification |
| DCAD GIS / parcel maps | parcel match, boundary, neighborhood/account context | property matching |

### Requires paid/API later

- MLS sold comps or licensed sold comparable data.
- ATTOM, Estated, BatchData, PropStream, or similar valuation/property APIs.
- Bulk DCAD appraisal roll/GIS joins if operationally justified and compliant.
- Official sale-price data may remain limited because Texas is a non-disclosure state.

### Browser-assisted now

- Use the existing local browser comp-agent pattern only after the operator opens a page and completes any human verification.
- One lead first; future sessions can support up to five selected leads.
- No auto-navigation, no hidden scraping, no CAPTCHA bypass, no infinite scrolling, no background loops.

## First Implementation Recommendations

1. Build Dallas Sheriff Tax Sales preview adapter hardening first: official source, high acquisition value, strong timing signal, strict evidence preservation, no ingestion until preview review passes.
2. Reconcile and validate Dallas OpenData Code Violations dataset IDs and schema, then build a dry-run Socrata parser limited to active/high-signal property cases.
3. Build DCAD property verification as a support adapter so every Dallas candidate can confirm address, owner/account, parcel, and appraisal context before becoming actionable.

## Key Risks

- Dallas sheriff/tax-sale and public search portals may require session handling or human verification; only browser-assisted/manual workflows are acceptable.
- Dallas foreclosure PDFs vary by city/month and may contain legal descriptions without clean situs addresses.
- Code, 311, permit, fire, and nuisance signals are noisy and must not be treated as actionable distress without property-level verification.
- Probate records need a property join through DCAD or OPR before becoming acquisition leads.
- Third-party comp portals can block automation and must remain operator-controlled.
- Texas non-disclosure limits official sale-price availability; paid comp data may be needed later for production-grade valuation.
