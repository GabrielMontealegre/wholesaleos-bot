# Source Registry Foundation

The Source Registry classifies each acquisition source before ingestion. It is intentionally separate from ingestion runners so sources can be reviewed, verified, repaired, and enabled safely.

Core rule: a source should not create leads until it has a registry entry, a playbook, required evidence fields, freshness rules, duplicate rules, and a repair strategy.

## Registry Flow

1. Classify URL/source.
2. Assign adapter category.
3. Define required lead fields and expected evidence fields.
4. Define freshness and stale-after rules.
5. Define duplicate rules.
6. Define operator verification path.
7. Define repair strategy.
8. Run dry validation before enabling ingestion.

## Adapter Categories

- `socrata_adapter`
- `arcgis_adapter`
- `csv_excel_adapter`
- `pdf_list_adapter`
- `html_table_adapter`
- `courthouse_portal_adapter`
- `searchable_portal_adapter`
- `manual_review_adapter`

## Repair Types

- `parser_failed`
- `missing_address`
- `missing_amount`
- `missing_source_url`
- `placeholder_row`
- `malformed_pdf_extraction`
- `weak_evidence`

## Lead Source Truth Layer

Lead source truth should answer:

- where the lead came from
- what source category it belongs to
- what adapter/parser created or should create it
- what evidence supports the lead
- how fresh the evidence is
- how to verify it manually
- whether a repair queue item is needed

The registry does not run ingestion. It is classification and traceability infrastructure.
