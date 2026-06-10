# Source Catalog Contract

The source catalog is the authority for public-source classification. It is not an ingestion trigger by itself.

## Current Source Files

- `source-registry/registry.json`: canonical source registry.
- `source-registry/README.md`: registry flow and repair rules.
- `sources.json`: older URL inventory.
- `docs/source-connector-architecture.md`: canonical connector architecture guidance.
- `data/dallas-source-candidates.json`: Dallas preview/source candidate store.

## Current Classified Registry Sources

- Wayne County MI Tax Foreclosure XLSX: `https://www.waynecountymi.gov/Government/Elected-Officials/Treasurer`
- Cook County IL Tax Liens: `https://datacatalog.cookcountyil.gov/resource/tx2p-k2g9.json`
- Dallas TX Code Cases: `https://www.dallasopendata.com/resource/n7km-yvgf.json`
- Dallas County TX Sheriff Tax Sales: `https://www.dallascounty.org/departments/tax/sheriff-sales.php`
- Glendale AZ Code Violations: `https://services1.arcgis.com/9fVTQQSiODPjLUTa/arcgis/rest/services/GlendaleOne_Code_Compliance_Cases/FeatureServer`
- Maricopa County Superior Court Docket Calendar: `https://www.superiorcourt.maricopa.gov/docket/calendar/`
- Pulaski County AR Auction Notices: `https://pulaskiclerkar.gov/news-events/auction-notices/`

## Rules

- New sources default to candidate, disabled, dry-run-first.
- Source records must preserve source URL, source category, adapter/parser, evidence fields, freshness rule, duplicate rule, verification path, and repair strategy.
- A broad portal/list page is not property proof.
- A PDF/list source can be property proof only when file/page/row or equivalent exact reference is preserved.
- Login, paywall, CAPTCHA, bot challenge, and rate-limited pages are manual-review blockers.
- Foreclosure.com is not an ingestion source.

