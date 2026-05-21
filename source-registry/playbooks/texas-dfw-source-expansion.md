# Texas DFW Source Expansion Plan v1

Status: planning only
Registry mode: candidate/inactive
Last reviewed: 2026-05-21

This playbook maps Dallas-Fort Worth acquisition sources before ingestion. Do not wire these into active ingestion until each source has a source playbook, parser adapter, evidence contract, repair workflow, and manual verification path.

## Operating Rules

- Do not run ingestion from this plan.
- Do not add scraping loops.
- Treat every source as `candidate` and `enabled: false`.
- Prefer official county/city/appraisal/court sources.
- Use third-party sale portals only when the county explicitly points to them.
- Keep portal-only sources as `manual_review` or `browser-assisted capture` until a deterministic parser is proven.
- Every captured lead must preserve source URL, file/PDF/row reference, capture timestamp, and verification path.

## Recommended First Implementation Order

1. Dallas County sheriff sale/tax foreclosure + Dallas County resale pages.
   - Strong official county page, clear online auction link, high acquisition relevance.
2. Tarrant County foreclosure notices through official record search + Fort Worth code violations ArcGIS.
   - Tarrant foreclosure source is official but portal-based; Fort Worth code data has a reusable ArcGIS path.
3. Denton County foreclosure/tax sale pages + property tax records.
   - Official county guidance exists; workflow is portal/manual-first.

## Adapter Strategy

| Interface | Adapter | Notes |
| --- | --- | --- |
| RealAuction/RealForeclose sale portals | `searchable_portal_adapter` | Operator-reviewed first. Avoid automated bidding/login flows. |
| PublicSearch/Kofile official records | `courthouse_portal_adapter` | Capture notice metadata and document/PDF references. |
| County public notice pages | `html_table_adapter` or `manual_review_adapter` | Many notices expire monthly; stale quickly. |
| PDF sale lists | `pdf_list_adapter` | Preserve file name, page, row, case number, amount, and sale date. |
| Socrata open data | `socrata_adapter` | Use dataset row IDs and update metadata. |
| ArcGIS feature services | `arcgis_adapter` | Use feature object ID, geometry/address fields, update date. |
| CAD/appraisal district search | `searchable_portal_adapter` | Verification/enrichment layer, not primary distress source. |
| Court dockets/probate | `courthouse_portal_adapter` | Manual review until case schemas are confirmed. |

## Primary Counties

### Dallas County, TX

| Category | Candidate Source | URL | Official | Interface | Acquisition | Expected Fields | Freshness | Parser | Verification | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tax delinquent / tax sale / sheriff sale | Dallas County Tax Office Sheriff Sales and Tax Foreclosure Resales | https://www.dallascounty.org/departments/tax/sheriff-sales.php | official county | HTML page + RealAuction portal | manual review, browser-assisted capture | address, parcel/account, amount, sale date, auction URL, source ref | monthly; stale after 14 days | searchable_portal_adapter | Open county page, then linked Dallas RealAuction portal | Portal may require session/account; do not automate login/bidding |
| tax foreclosure resale | Dallas County Public Works Property Division Tax Foreclosure Resales | https://www.dallascounty.org/departments/pubworks/property-division.php | official county | HTML/PDF/list pages | manual review, direct download if list exposed | address, legal description, minimum bid/amount, sale/resale status, file ref | monthly; stale after 30 days | html_table_adapter or pdf_list_adapter | Verify against Public Works page and sale brochure/list | Resale list format may change |
| foreclosure / trustee sale / auction | Dallas County Sheriff Writ Enforcement | https://www.dallascounty.org/departments/sheriff/writ-enforcement-section/ | official county | HTML guidance + sale process | manual review | sale date, address/legal description, cause/writ info if linked | first Tuesday cycle; stale after 14 days | manual_review_adapter | Confirm sale notice or auction record | Not always a clean list source |
| code violations / nuisance / permits | City of Dallas Code Violations open data | https://www.dallasopendata.com/dataset/Code-Violations/x9pz-kdq9 | official city/open data | Socrata | API | address/location, case type, status, opened/closed dates, row ID | use dataset metadata; stale after 30 days | socrata_adapter | Open Dallas Open Data record by row ID | Dataset freshness/schema must be rechecked before active ingestion |
| probate / estate / court docket | Dallas County Probate Courts and court record search | https://www.dallascounty.org/government/courts/probate/ | official county | court docket/search portal | manual review | decedent/name, case number, filing date, court, status | weekly check; stale after 30 days | courthouse_portal_adapter | Search Dallas County court records and verify probate case | Docket does not equal property lead until matched to real property |
| public notices | Dallas County official/legal notices | https://www.dallascounty.org/ | official county | public notice site/link hub | manual review | notice title, date, document link, jurisdiction | weekly; stale after 14 days | manual_review_adapter | Use county notice page and linked document | Broad notices; low signal without filtering |
| property records / appraisal | Dallas Central Appraisal District | https://www.dallascad.org/ | official appraisal district | searchable portal/GIS | verification only | account, owner, situs address, parcel, assessed value, exemptions | verify per lead; stale after 90 days | searchable_portal_adapter | Confirm owner/address/account in DCAD | Verification layer, not distress source |
| GIS/open data | Dallas Open Data | https://www.dallasopendata.com/ | official city/open data | Socrata | API | dataset-specific fields | dataset metadata; stale after 30 days | socrata_adapter | Confirm dataset metadata and row ID | Dataset quality varies |

### Tarrant County, TX

| Category | Candidate Source | URL | Official | Interface | Acquisition | Expected Fields | Freshness | Parser | Verification | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tax delinquent / tax sale / sheriff sale | Tarrant County Constable Precinct 3 Delinquent Tax Sales | https://www.tarrantcountytx.gov/en/constables/constable-3/delinquent-tax-sales.html | official county | HTML guidance/PDF/list if linked | manual review | address/legal description, cause, amount, sale date, constable ref | monthly; stale after 14 days | manual_review_adapter or pdf_list_adapter | Verify posted sale notice and tax statement requirement | Tax sale documents may be distributed outside a stable list |
| foreclosure / trustee sale / auction | Tarrant County Foreclosures | https://www.tarrantcountytx.gov/en/county-clerk/real-estate-records/foreclosures.html | official county | official records portal | portal search/browser-assisted capture | notice document, address/legal description, trustee, sale date, doc ref | sale notices expire monthly; stale after 14 days | courthouse_portal_adapter | Search Tarrant official records for Notice of Substitute Trustee Sale | County says notices are not indexed/listed in a compiled printout |
| code violations / nuisance / permits | Fort Worth Code Violations Table | https://www.arcgis.com/home/item.html?id=48e06b6f1f474f49a1af2579de3e1386 | official city/ArcGIS item | ArcGIS feature service | API | address/location, violation/case, status, dates, object ID | weekly per item notes; stale after 21 days | arcgis_adapter | Open ArcGIS item and feature record | City-only, not all Tarrant County |
| probate / estate / court docket | Tarrant County Probate Courts | https://www.tarrantcountytx.gov/en/county-clerk/civil-courts/probate-courts.html | official county | court/probate portal | manual review | case number, decedent, filing date, court, status | weekly; stale after 30 days | courthouse_portal_adapter | Verify in probate public browse/court portal | Requires property match before lead use |
| public notices | Tarrant official records and county notices | https://tarrant.tx.publicsearch.us/ | official records portal | searchable portal/OCR | browser-assisted capture | document type, recording date, parties, image/PDF ref | weekly; stale after 21 days | courthouse_portal_adapter | Search official records for notice types | OCR/index searches may miss documents |
| property records / appraisal | Tarrant Appraisal District | https://www.tad.org/ | official appraisal district | searchable portal | verification only | account, owner, situs, value, exemptions | verify per lead; stale after 90 days | searchable_portal_adapter | Confirm address/owner/account in TAD | Verification layer only |
| GIS/open data | Fort Worth My Data / GIS | https://www.fortworthtexas.gov/residents/my-data | official city | ArcGIS/open data | API/manual review | dataset-specific fields | dataset metadata; stale after 30 days | arcgis_adapter | Confirm dataset metadata and source owner | City-only coverage |

### Collin County, TX

| Category | Candidate Source | URL | Official | Interface | Acquisition | Expected Fields | Freshness | Parser | Verification | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tax delinquent / tax sale / sheriff sale | Collin County Sales and Auctions | https://www.collincountytx.gov/government/sales-and-auctions | official county | HTML guidance + linked notices | manual review | address/legal description, sale type, sale date, constable/sheriff ref | monthly; stale after 14 days | manual_review_adapter | Follow county sale links and verify notice | Some notices are newspaper/courthouse-posted |
| tax sale / struck-off | Collin County Tax Assessor Properties For Sale | https://www.collincountytx.gov/Tax-Assessor/Pages/Properties-For-Sale.aspx | official county | HTML/list | manual review/direct download if stable | address, property ID, amount/min bid, sale status | monthly; stale after 30 days | html_table_adapter | Verify with Tax Assessor page | Page availability/format may vary |
| foreclosure / trustee sale / auction | Collin County Foreclosure Notices | https://apps2.collincountytx.gov/ForeclosureNotices/ | official county | searchable notice app/PDF | browser-assisted capture | notice PDF, address/legal description, trustee, sale date, filed date | monthly; stale after 14 days | courthouse_portal_adapter/pdf_list_adapter | Open notice detail and PDF | Search app may need browser capture |
| code violations / nuisance / permits | Municipal code portals inside Collin County | candidate TBD | mixed city official | portal/manual | manual review | address, violation, status, date, municipality | monthly; stale after 30 days | manual_review_adapter | Start with Plano/McKinney/Frisco city portals | County-wide code source not confirmed |
| probate / estate / court docket | Collin County Case Information / Judicial Search | https://www.collincountytx.gov/services/case-information | official county | court docket portal | manual review | case number, party, filing date, case type, court | weekly; stale after 30 days | courthouse_portal_adapter | Verify probate case in Judicial Online Search | Must match decedent/estate to property |
| public notices | Collin sales/public notices links | https://www.collincountytx.gov/government/sales-and-auctions | official county | HTML/manual | manual review | notice title, sale month, document link | weekly; stale after 14 days | manual_review_adapter | Verify notice source and date | Low signal without category filters |
| property records / appraisal | Collin Central Appraisal District | https://www.collincad.org/ | official appraisal district | searchable portal | verification only | account, owner, situs, parcel, value | verify per lead; stale after 90 days | searchable_portal_adapter | Confirm property/owner in CCAD | Verification layer only |
| GIS/open data | Collin GIS/open data candidates | candidate TBD | official if found | GIS/manual | manual review | dataset-specific fields | metadata-based | manual_review_adapter | Confirm official GIS data source before use | No strong county distress GIS source confirmed |

### Denton County, TX

| Category | Candidate Source | URL | Official | Interface | Acquisition | Expected Fields | Freshness | Parser | Verification | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tax delinquent / tax sale / sheriff sale | Denton County Delinquent Tax Sales | https://www.dentoncounty.gov/867/Delinquent-Tax-Sales | official county | HTML guidance | manual review | address/legal description, account, amount, sale date | monthly; stale after 14 days | manual_review_adapter | Verify sheriff/tax sale details | May not expose clean list |
| foreclosure / trustee sale / auction | Denton County Foreclosure Information | https://www.dentoncounty.gov/293/Foreclosure-Information | official county | real property records portal | browser-assisted capture | notice, legal description, owner/trustee, sale date, recorded doc ref | monthly; stale after 14 days | courthouse_portal_adapter | Search Denton real property records for trustee sale notice | Requires legal description/name search |
| code violations / nuisance / permits | Denton County GIS Hub / municipal code portals | https://www.dentoncounty.gov/1147/Geographic-Information-Systems-GIS | official county GIS | ArcGIS Hub/manual | API/manual review | address/location, layer-specific case/status fields | metadata-based; stale after 30 days | arcgis_adapter/manual_review_adapter | Confirm layer owner and update metadata | County GIS may not include code violations |
| probate / estate / court docket | Denton judicial records | https://www.dentoncounty.gov/ | official county | court docket portal | manual review | case number, party, filing date, court, case type | weekly; stale after 30 days | courthouse_portal_adapter | Verify in county judicial records | Portal schema must be mapped |
| public notices | Denton County Public Notices | https://apps.dentoncounty.gov/PublicNotices/Default.aspx | official county | HTML/public notice app | manual review | notice title, date, posting body/link | weekly; stale after 14 days | html_table_adapter/manual_review_adapter | Confirm notice category/date | County page notes meeting notices are not foreclosure postings |
| property records / appraisal | Denton property tax records / Denton CAD | https://taxweb.dentoncounty.gov/ | official county tax | searchable portal | verification only | account, owner, situs, tax info | verify per lead; stale after 90 days | searchable_portal_adapter | Confirm account/address/tax status | Verification layer only |
| GIS/open data | Denton ArcGIS Hub | https://www.dentoncounty.gov/1147/Geographic-Information-Systems-GIS | official county GIS | ArcGIS Hub | API/manual review | layer-specific fields | metadata-based | arcgis_adapter | Confirm download/API layer | Distress relevance depends on layer |

## Secondary Counties

### Rockwall County, TX

| Category | Candidate Source | URL | Official | Interface | Acquisition | Expected Fields | Freshness | Parser | Verification | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| foreclosure / trustee sale / auction | Rockwall County Foreclosure Notices | https://rockwallcountytexas.com/792/Foreclosure-Notices | official county | monthly notice pages/PDF | direct download/manual review | notice PDF, address/legal description, trustee, sale date | monthly; stale after 14 days | html_table_adapter/pdf_list_adapter | Open monthly notice and confirm property | Notices may be month links and removed/archived |
| tax delinquent / tax sale / sheriff sale | Rockwall sheriff/tax sale notices | https://www.rockwallcountytexas.com/253/Public-Notices | official county | public notices/manual | manual review | sale notice, address/legal description, amount if included | monthly; stale after 14 days | manual_review_adapter | Verify notice type and sale authority | Tax list source not confirmed |
| code violations / nuisance / permits | City/municipal code portals | candidate TBD | mixed city official | manual | manual review | address, violation, status, date | monthly; stale after 30 days | manual_review_adapter | Confirm city source before use | No county-wide code data found |
| probate / estate / court docket | Rockwall posted notices / probate citations | https://rockwallcountytexas.com/1262/Posted-Notices | official county | posted notices | manual review | citation name, case/ref if present, posting date | weekly; stale after 30 days | manual_review_adapter | Verify probate citation and property relation | Probate citation is not property evidence by itself |
| public notices | Rockwall Public Notices | https://www.rockwallcountytexas.com/253/Public-Notices | official county | HTML/manual | manual review | notice title/date/link | weekly; stale after 14 days | html_table_adapter | Confirm active notice page | Broad notice categories |
| property records / appraisal | Rockwall CAD | https://www.rockwallcad.com/ | official appraisal district | searchable portal | verification only | account, owner, situs, parcel, value | verify per lead; stale after 90 days | searchable_portal_adapter | Confirm owner/address/account | Verification layer only |
| GIS/open data | Rockwall GIS candidates | candidate TBD | official if found | GIS/manual | manual review | layer-specific fields | metadata-based | manual_review_adapter | Confirm official data source | No strong distress GIS source confirmed |

### Kaufman County, TX

| Category | Candidate Source | URL | Official | Interface | Acquisition | Expected Fields | Freshness | Parser | Verification | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tax delinquent / tax sale / sheriff sale | Kaufman County Tax Sales/Auctions | https://www.kaufmancoconstablepct2.net/532/Tax-SalesAuctions | official county/constable site | RealForeclose portal | browser-assisted capture | address/legal description, taxes due, penalties/costs, sale date | monthly; stale after 14 days | searchable_portal_adapter | Open linked Kaufman RealAuction portal | Portal access may require account/session |
| foreclosure / trustee sale / auction | Kaufman official records/public notices | candidate TBD | official if confirmed | public records portal | manual review | notice, address/legal description, trustee, sale date | monthly; stale after 14 days | courthouse_portal_adapter | Confirm county clerk records source | Official foreclosure notice page not confirmed |
| code violations / nuisance / permits | City/municipal code portals | candidate TBD | mixed city official | manual | manual review | address, violation, case status | monthly; stale after 30 days | manual_review_adapter | Confirm municipal source | No county-wide code data found |
| probate / estate / court docket | Kaufman court records | candidate TBD | official if confirmed | court docket | manual review | case number, party, filing date, case type | weekly; stale after 30 days | courthouse_portal_adapter | Confirm official portal | Source needs validation |
| public notices | Kaufman county public notices | candidate TBD | official if confirmed | public notice/manual | manual review | notice title/date/document | weekly; stale after 14 days | manual_review_adapter | Confirm official notice page | Source needs validation |
| property records / appraisal | Kaufman Central Appraisal District | https://www.kaufman-cad.org/ | official appraisal district | searchable portal | verification only | account, owner, situs, value | verify per lead; stale after 90 days | searchable_portal_adapter | Confirm account/address/owner | Verification layer only |
| GIS/open data | Kaufman GIS candidates | candidate TBD | official if found | GIS/manual | manual review | layer-specific fields | metadata-based | manual_review_adapter | Confirm official layer | No strong distress GIS source confirmed |

### Ellis County, TX

| Category | Candidate Source | URL | Official | Interface | Acquisition | Expected Fields | Freshness | Parser | Verification | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tax delinquent / tax sale / sheriff sale | Ellis County Tax Office Tax Sales | https://ellistaxoffice.com/tax-sales-2/ | official tax office | RealAuction portal | browser-assisted capture | address/legal description, amount/min bid, sale date, portal ref | monthly; stale after 14 days | searchable_portal_adapter | Open linked Ellis RealAuction portal | Portal may require session |
| foreclosure / trustee sale / auction | Ellis County Public Notices | https://www.co.ellis.tx.us/960/Public-Notices | official county | public notice pages/PDF | manual review/direct download | notice PDF, address/legal description, trustee, sale date | notices deleted end of sale month; stale after 7 days | html_table_adapter/pdf_list_adapter | Open current notice and preserve PDF | Very short retention window |
| code violations / nuisance / permits | City/municipal code portals | candidate TBD | mixed city official | manual | manual review | address, violation, status, municipality | monthly; stale after 30 days | manual_review_adapter | Confirm city source | No county-wide code data found |
| probate / estate / court docket | Ellis court records | candidate TBD | official if confirmed | court docket | manual review | case number, party, filing date, case type | weekly; stale after 30 days | courthouse_portal_adapter | Confirm official court portal | Source needs validation |
| public notices | Ellis County Public Notices | https://www.co.ellis.tx.us/960/Public-Notices | official county | HTML/public notice | manual review | notice title/date/link | weekly; stale after 7 days | html_table_adapter | Verify current listing | Foreclosure notices expire quickly |
| property records / appraisal | Ellis Appraisal District | https://www.elliscad.com/ | official appraisal district | searchable portal | verification only | account, owner, situs, value | verify per lead; stale after 90 days | searchable_portal_adapter | Confirm address/owner/account | Verification layer only |
| GIS/open data | Ellis GIS candidates | candidate TBD | official if found | GIS/manual | manual review | layer-specific fields | metadata-based | manual_review_adapter | Confirm official data source | No strong distress GIS source confirmed |

### Johnson County, TX

| Category | Candidate Source | URL | Official | Interface | Acquisition | Expected Fields | Freshness | Parser | Verification | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tax delinquent / tax sale / sheriff sale | Johnson County Constable Tax Sale references | https://www.johnsoncountytx.org/government/county-clerk/land-records-vitals/foreclosure-sales | official county | guidance/public records | manual review | sale notice, address/legal description, amount, sale date | monthly; stale after 14 days | manual_review_adapter/pdf_list_adapter | Confirm constable/tax sale notice | Clerk page says tax sale posting is outside clerk role |
| foreclosure / trustee sale / auction | Johnson County Foreclosure Sales | https://www.johnsoncountytx.org/government/county-clerk/land-records-vitals/foreclosure-sales | official county | public records portal | browser-assisted capture | notice, trustee, sale date, legal description, doc ref | monthly; stale after 14 days | courthouse_portal_adapter | Search Johnson public records portal | Requires portal search |
| code violations / nuisance / permits | City/municipal code portals | candidate TBD | mixed city official | manual | manual review | address, violation, status | monthly; stale after 30 days | manual_review_adapter | Confirm city source | No county-wide code data found |
| probate / estate / court docket | Johnson probate/court records | candidate TBD | official if confirmed | court docket | manual review | case number, party, filing date, case type | weekly; stale after 30 days | courthouse_portal_adapter | Confirm official court portal | Source needs validation |
| public notices | Johnson county notices/records | https://www.johnsoncountytx.org/ | official county | manual/portal | manual review | notice title/date/document | weekly; stale after 14 days | manual_review_adapter | Confirm county notice source | Broad county website |
| property records / appraisal | Johnson County Central Appraisal District | https://www.johnsoncad.com/ | official appraisal district | searchable portal | verification only | account, owner, situs, value | verify per lead; stale after 90 days | searchable_portal_adapter | Confirm account/address/owner | Verification layer only |
| GIS/open data | Johnson GIS candidates | candidate TBD | official if found | GIS/manual | manual review | layer-specific fields | metadata-based | manual_review_adapter | Confirm official GIS source | No strong distress GIS source confirmed |

### Parker County, TX

| Category | Candidate Source | URL | Official | Interface | Acquisition | Expected Fields | Freshness | Parser | Verification | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tax delinquent / tax sale / sheriff sale | Parker County tax sale PDF notices | https://www.parkercountytx.gov/371/Foreclosures | official county | document center/PDF | direct download/manual review | case number, account, legal description, adjudged value, sale date, PDF/page | monthly; stale after 14 days | pdf_list_adapter | Verify current DocumentCenter notice and sale date | Page may expose sparse links; search needed |
| foreclosure / trustee sale / auction | Parker County Foreclosures | https://www.parkercountytx.gov/371/Foreclosures | official county | HTML/PDF/manual | manual review | notice, address/legal description, trustee, sale date | monthly; stale after 14 days | pdf_list_adapter/manual_review_adapter | Verify current foreclosure notice PDF | Page content is limited; document URLs vary |
| code violations / nuisance / permits | City/municipal code portals | candidate TBD | mixed city official | manual | manual review | address, violation, status | monthly; stale after 30 days | manual_review_adapter | Confirm city source | No county-wide code data found |
| probate / estate / court docket | Parker court records | candidate TBD | official if confirmed | court docket | manual review | case number, party, filing date, case type | weekly; stale after 30 days | courthouse_portal_adapter | Confirm official court portal | Source needs validation |
| public notices | Parker County notices/document center | https://www.parkercountytx.gov/ | official county | manual/PDF | manual review | notice title/date/document | weekly; stale after 14 days | manual_review_adapter | Confirm current notice path | Source needs validation |
| property records / appraisal | Parker County Appraisal District | https://www.parkercad.org/ | official appraisal district | searchable portal | verification only | account, owner, situs, value | verify per lead; stale after 90 days | searchable_portal_adapter | Confirm account/address/owner | Verification layer only |
| GIS/open data | Parker GIS candidates | candidate TBD | official if found | GIS/manual | manual review | layer-specific fields | metadata-based | manual_review_adapter | Confirm official GIS source | No strong distress GIS source confirmed |

## Candidate Source Contract

Every source candidate should be converted to a registry entry only after this minimum evidence contract is known:

- `source_id`
- `source_name`
- `state`
- `county`
- `jurisdiction`
- `source_category`
- `interface_type`
- `acquisition_method`
- `parser_adapter`
- `source_url`
- `enabled: false` until parser verification passes
- `source_status: candidate`
- `freshness_rule`
- `stale_after_days`
- `duplicate_rules`
- `required_fields`
- `evidence_fields_expected`
- `verification_path`
- `repair_strategy`

## Strongest Immediate Sources

- Dallas County Tax Office Sheriff Sales and Tax Foreclosure Resales.
- Tarrant County Foreclosures / Official Records Search.
- Collin County Foreclosure Notices app.
- Denton County Foreclosure Information + real property records.
- Fort Worth Code Violations ArcGIS.
- Dallas Open Data Code Violations.
- Ellis County Tax Office Tax Sales and public notices.

## Sources Needing Manual Review First

- Probate/court dockets in all counties.
- County public notices that mix non-real-estate notices with foreclosure/sale notices.
- Municipal code portals in Collin, Rockwall, Kaufman, Ellis, Johnson, and Parker counties.
- Tax sale portals that require registration/session handling.
- Parker County DocumentCenter tax sale PDFs, because URLs vary by month.

## Repair Rules for DFW Expansion

Route rows to Source Repair Queue when:

- address is missing or only legal description exists
- amount owed/minimum bid is missing for tax-sale sources
- county/state is missing
- source URL or PDF/file reference is missing
- court/probate case has no property match
- notice is stale past the sale month
- portal row cannot be tied to a current official notice
- parser extracts header/footer/advertising text as a lead

## First Three Builds

1. `tx_dallas_sheriff_tax_sales_candidate`
   - Build manual/browser-assisted capture first.
   - Store auction portal URL and county source page.
   - Do not automate account login or bidding.

2. `tx_tarrant_foreclosure_notices_candidate`
   - Build courthouse portal search helper and PDF evidence capture.
   - Store document type, recorded date, PDF/image link, sale date, and notice party names.

3. `tx_fort_worth_code_violations_arcgis_candidate`
   - Build ArcGIS adapter proof with object ID, address/location, violation type, status, and update timestamp.
   - Treat as city-only Tarrant coverage.

