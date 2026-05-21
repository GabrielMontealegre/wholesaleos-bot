# National Source Adapter Framework v1

Status: planning/foundation

This framework lets WholesaleOS classify county and jurisdiction sources by source family before any ingestion runs. The goal is to reuse adapter contracts across counties while preserving source truth, evidence references, freshness, duplicate rules, and repair behavior.

Default rule: every new source starts as `source_status: candidate`, `enabled: false`, and dry-run-only until reviewed.

## Adapter Families

| Adapter family | Typical interface | Acquisition method | Use when |
| --- | --- | --- | --- |
| `socrata_adapter` | Socrata API | API call | City/county open data exposes a Socrata resource endpoint. |
| `arcgis_adapter` | ArcGIS FeatureServer/MapServer | API call | Public GIS layers expose feature attributes and object IDs. |
| `csv_excel_adapter` | CSV/XLS/XLSX | direct download | Source publishes downloadable tabular files. |
| `pdf_list_adapter` | PDF/document index | OCR/manual review fallback | Source publishes PDFs, scanned notices, or posted lists. |
| `html_table_adapter` | HTML table | direct fetch or bounded Playwright navigation | Page has stable headers and row layout. |
| `searchable_portal_adapter` | searchable portal | browser-assisted capture | Operator searches a portal and exports/copies visible rows. |
| `court_docket_adapter` | court docket | manual upload | Court/case systems contain parties, case numbers, and dates but may not prove property facts alone. |
| `public_notice_adapter` | public notice site | browser-assisted capture | Legal notices or newspaper notices need category filtering and manual verification. |
| `manual_review_adapter` | manual-only source | manual upload | Source needs classification or cannot be parsed safely yet. |
| `browser_assisted_capture_adapter` | JavaScript portal/app | browser-assisted capture | Operator captures visible data after manual verification; no loops or bypasses. |

`courthouse_portal_adapter` is retained as a legacy alias for `court_docket_adapter`.

## Adapter Contract

Every adapter family must define:

- expected interface type
- acquisition method
- required source fields
- optional source fields
- evidence preservation rules
- freshness/staleness rules
- duplicate strategy
- repair classifications
- validation rules
- safe failure behavior

These contracts live in `source-registry/adapter-framework.js`.

## How To Add A New County Source

1. Create a registry candidate with `enabled: false`.
2. Classify the source with `classifySourceCandidate()`.
3. Choose the adapter family that matches the real interface, not the desired automation.
4. Create a playbook describing source behavior, expected fields, evidence, freshness, duplicate rules, and repair workflow.
5. Build a dry-run parser or preview adapter.
6. Validate Source Truth and Lead Intelligence Brief output from preview candidates.
7. Promote only after dry-run review proves stable and evidence traceability is complete.

## Source Status Rules

| Status | Meaning |
| --- | --- |
| `candidate` | Source is mapped but not active. Dry-run first. |
| `classified` | Source has adapter/playbook/evidence contract, but ingestion remains disabled unless explicitly enabled. |
| `manual_review` | Source is useful but needs operator review before lead creation. |
| `active` | Source may be used by a controlled ingestion path. This requires explicit promotion. |

## Safe For Controlled Ingestion

A source is not ready for controlled ingestion until:

- registry validates
- adapter contract validates
- playbook exists
- dry-run candidates normalize
- Source Truth renders
- Lead Intelligence Brief renders
- duplicate keys are defined
- stale/fresh status is deterministic
- malformed candidates route to repair
- operator verification path is clear

## Texas Expansion Slot

Texas expansion starts from county-level candidates and should prioritize:

- tax sale / sheriff sale portals
- foreclosure notices
- code violations / nuisance datasets
- appraisal district property records
- probate / court dockets
- public notices

Default Texas source settings:

- `source_status: candidate`
- `enabled: false`
- dry-run preview required
- likely adapters: `searchable_portal_adapter`, `public_notice_adapter`, `court_docket_adapter`, `socrata_adapter`, `arcgis_adapter`, `browser_assisted_capture_adapter`

## California Expansion Slot

California expansion should start with major counties and legal notice / court / tax-sale sources. Many sources will be document or portal based.

Default California source settings:

- `source_status: candidate`
- `enabled: false`
- dry-run preview required
- likely adapters: `public_notice_adapter`, `court_docket_adapter`, `html_table_adapter`, `searchable_portal_adapter`, `csv_excel_adapter`, `browser_assisted_capture_adapter`

## Safety Rules

- Do not run ingestion from classification.
- Do not create scraping loops.
- Do not bypass CAPTCHA or login controls.
- Do not infer missing owner/contact/amount facts.
- Preserve source URLs, file names, row/page references, raw row text, and capture timestamps.
- Route weak or malformed candidates to repair instead of deleting them.
