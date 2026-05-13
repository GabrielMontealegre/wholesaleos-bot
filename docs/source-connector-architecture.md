# WholesaleOS Source Connector Architecture

_Proposed future architecture based on the current audit. Additive only._

## 1. Current Source Architecture Summary

WholesaleOS currently uses a mixed source layer made up of several patterns:

- `modules/sources/` contains free public-data connectors such as Socrata, ArcGIS, and one-off city modules.
- `courthouse-addon/` contains courthouse-specific parsing, PDF extraction, Playwright portal scraping, and a separate courthouse storage path.
- `server.js` routes trigger source collection directly in a few places instead of going through one canonical registry.
- `db.js` normalizes lead records at write time and now computes `lead_intelligence` at read time without mutating stored leads.

The system already has useful primitives:

- Source URLs can be stored on leads.
- Owner fields, distress fields, and enrichment notes already exist.
- Courthouse PDF and portal sources already emit structured lead-like records.
- Lead reads can safely attach computed intelligence without rewriting historical records.

## 2. Known Problems and Risks

- Source registration is fragmented.
- ArcGIS exists in multiple implementations with slightly different field mappings.
- Courthouse exists as both a routes layer and a separate addon storage model.
- `mastersheet.csv` is an inventory, not a schema contract.
- Source payloads are inconsistent across connectors.
- `source_details` is sometimes a string and sometimes an object.
- Some courthouse and portal sources are low-confidence until PDFs or portals are parsed.
- Paid enrichment is too close to ingestion if it is not explicitly gated.

## 3. Recommended Folder Structure

Recommended future structure:

```text
modules/
  sources/
    registry/
      manifest.json
    connectors/
      socrata/
      arcgis/
      portal/
      pdf/
      html/
      csv/
      json/
    transforms/
      address.js
      owner.js
      evidence.js
      dates.js
      distress.js
    evidence/
      urls.js
      snippets.js
      confidence.js
courthouse-addon/
  scraper.js
  pdf-extractor.js
  file-parser.js
  lead-formatter.js
  courthouse-runner.js
```

Guidance:

- `registry/manifest.json` should define source IDs, type, market, county, URL, parser kind, and priority tier.
- `connectors/` should only fetch and normalize.
- `transforms/` should hold shared normalization logic.
- `evidence/` should hold helpers for URLs, snippets, and confidence.
- `courthouse-addon/` can remain the courthouse execution surface, but it should emit the same canonical output schema as the other connectors.

## 4. Canonical Source Output Schema

Every connector should emit the same core shape, even if some values are null.

```js
{
  source_id,
  source_kind,          // socrata | arcgis | portal | pdf | html | csv | json
  provider,
  market,
  state,
  county,
  source_type,
  source_url,
  source_record_url,
  source_pdf_url,
  source_query_url,
  record_key,
  normalized_address,
  raw_address,
  city,
  zip,
  owner_name,
  owner_type,
  parcel,
  apn,
  case_number,
  auction_date,
  opening_bid,
  tax_due,
  years_delinquent,
  foreclosure_stage,
  probate_status,
  lien_amount,
  distress_types,
  distress_score,
  source_confidence,
  evidence,
  raw_payload
}
```

Rules:

- `raw_payload` keeps the original source record for traceability.
- Normalized fields are top-level.
- Evidence is explicit, not implied.
- Existing lead fields should be preserved, not renamed.

## 5. PDF Ingestion Architecture

PDF-heavy counties should be treated as a first-class source kind.

Recommended flow:

1. Discover the source in the registry.
2. Download and cache the raw PDF using source URL and content hash.
3. Run text extraction first with `pdf-parse`.
4. If the PDF is image-only or thin on text, route to OCR asynchronously.
5. Parse into the canonical source output schema.
6. Emit leads only after normalization and dedupe.
7. Attach the PDF URL and parse confidence to evidence.

Practical guidance:

- Keep OCR out of the synchronous request path.
- Never block lead creation on perfect PDF extraction.
- Low-confidence PDFs should still produce a normalized record with `source_confidence: low` and enough evidence to revisit later.

## 6. How Source Evidence Connects to `lead_intelligence` v1

The source layer should not generate prose intelligence.

Instead:

- Connectors emit structured evidence.
- `db.computeLeadIntelligence(lead)` folds that evidence into the canonical read-time object.
- `lead_intelligence` should remain deterministic and read-only.

Recommended evidence inputs:

- `source_url`
- `source_record_url`
- `source_pdf_url`
- `source_query_url`
- `source_confidence`
- `auction_date`
- `opening_bid`
- `tax_due`
- `years_delinquent`
- `foreclosure_stage`
- `probate_status`
- `lien_amount`
- `parcel` / `apn`
- `owner_name`
- `owner_type`
- `distress_types`
- `good_deal_reasons`

`lead_intelligence` should then derive:

- `summary`
- `distress_cause`
- `urgency_level`
- `urgency_reason`
- `timeline`
- `evidence`
- `owner_context`
- `recommended_next_action`
- `confidence`

## 7. Free-Signal Ranking Before Paid Enrichment

Free sources should rank leads before any paid enrichment runs.

Use these free signals first:

- `distress_score`
- `distress_types`
- `auction_date`
- `years_delinquent`
- `foreclosure_stage`
- `probate_status`
- `lien_amount`
- `owner_name`
- `owner_type`
- `source_confidence`
- evidence completeness
- duplicate count

Recommended gating:

- Tier 1 and Tier 2 sources feed the main ranking queue.
- Tier 3 sources add strong evidence when downloadable files are available.
- Tier 4 and Tier 5 sources should only be used when the lead already looks promising or the county is strategically important.

Paid enrichment should happen later:

- PropStream for high-priority comps and equity validation only.
- DataBatch for skip tracing only after a lead proves it deserves the spend.

## 8. Migration Strategy

The migration must stay additive only.

Rules:

- Normalize outputs first.
- Do not rewrite historical leads just to fit the new architecture.
- Do not merge the courthouse DB blindly into the main DB.
- Do not rename existing fields.
- Do not require every source to be upgraded at once.

Recommended path:

1. Define the canonical schema.
2. Add adapter functions for each source family.
3. Map existing connectors into the schema one by one.
4. Preserve raw payloads and source URLs.
5. Compute intelligence at read time.
6. Add tests for one source per tier before scaling wider.

## 9. Source Priority Tiers

Tier 1: Socrata/API

- Best for cheap, structured public data.
- Good for city code violations, tax delinquency, and repeatable public records.

Tier 2: ArcGIS/API

- Similar value to Socrata.
- Often strong for violation and enforcement datasets.

Tier 3: PDF/CSV Downloadable Lists

- Strong courthouse and assessor output.
- Good when data is published as files or exports.

Tier 4: Playwright Portals

- Useful for county portals that require interaction but no login.
- Higher maintenance and more fragile than API sources.

Tier 5: Login/CAPTCHA/Manual-Heavy Systems

- Highest cost and highest breakage risk.
- Use only when the county is strategically important and the lead quality justifies the effort.

## 10. Next Implementation Phase Recommendation

Best next phase:

- Build a source registry and canonical adapter layer.
- Add one shared normalization path for Socrata, ArcGIS, PDF, and courthouse portal outputs.
- Keep the first rollout additive and low-risk.
- Add fixture-based tests for representative sources from each tier.
- Surface source evidence into `lead_intelligence` v1 without changing existing lead storage.

The first practical deliverable should be a registry manifest plus a single adapter contract, not a full rewrite.

## 11. High-Risk Items to Avoid

- Do not put PropStream or DataBatch into the primary ingest path.
- Do not make OCR synchronous.
- Do not collapse all current source modules in one pass.
- Do not depend on `mastersheet.csv` as the long-term schema contract.
- Do not rewrite or reimport all historical leads.
- Do not merge courthouse storage blindly with main app storage.
- Do not add AI-generated summaries before the structured evidence layer is stable.
- Do not build county-specific logic directly into `server.js` when a connector or adapter can own it.

