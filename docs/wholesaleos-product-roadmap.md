# WholesaleOS Product Roadmap

Status: planning and implementation guide. This file does not enable ingestion, scraping, outbound messaging, or lead creation.

## 1. Dallas Source Agent

Purpose: make Dallas County the first evidence-first acquisition market.

Current v1 target:
- Run one selected Dallas source at a time.
- Return preview-only candidates.
- Preserve source truth, evidence references, parser adapter, confidence, and repair flags.
- Never auto-create leads.
- Route weak rows into repair/weak queues instead of actionable queues.

Supported source families:
- Dallas sheriff/tax sales.
- Dallas foreclosure and public notices.
- Dallas code enforcement, nuisance, and unsafe structure sources.
- Dallas property/appraisal/DCAD support sources.
- Dallas open-data and ArcGIS-style sources.
- PDF/list and HTML table sources.
- Manual-review fallback when a portal blocks automation or requires login/human verification.

Next promotion criteria:
- At least one official Dallas source returns real property-level rows without login or CAPTCHA bypass.
- Duplicate checks are verified.
- Source Truth and Lead Intelligence Briefs render correctly from preview candidates.
- Operator approval is required before any real lead is created.

## 2. Dallas Comp Intelligence Agent

Purpose: provide real valuation support for verified Dallas leads.

Allowed first build:
- Operator-triggered local/browser-assisted capture.
- Visible public listing data only.
- Draft comps marked unverified.
- Manual review before ARV/MAO use.

Not allowed:
- Fake comps.
- Autonomous Zillow/Redfin/Realtor scraping loops.
- CAPTCHA bypass.
- Auto-finalized ARV.

Readiness criteria:
- Verified source lead exists.
- Property address and parcel/source proof are present.
- Operator accepts 3 to 5 visible comp candidates.

## 3. Instant Property Deal Analyzer

Purpose: eventually let Gabriel paste a Dallas property address and receive an evidence-based acquisition brief.

Future inputs:
- Property address.
- Source Truth if available.
- Manual or captured comps.
- DOM/listing status evidence.
- Repair estimate entered by operator.
- Tax, lien, foreclosure, code, or probate evidence.

Future outputs:
- ARV range based only on evidence.
- MAO bands.
- PPSF summary.
- Wholesale angle.
- Flip/rental angle.
- Risk flags.
- Best next action.

Current status:
- Foundation only.
- No fake comps.
- No invented ARV.
- No paid API integration.
- No production lead mutation.

## 4. Acquisition Intelligence Ranking

Purpose: rank leads by evidence and operator value, not generic lead count.

Core scoring dimensions:
- Valid property address.
- Source proof.
- Amount or timing evidence.
- Parcel/APN or case/cause reference.
- Source confidence.
- Distress category.
- Freshness.
- Repair flags.
- Owner/contact readiness.
- Comp readiness.

Ranking rule:
- Actionable queues should prefer verified evidence and exclude weak parser output.
- Weak rows remain searchable and repairable but do not lead the operator workflow.

## 5. Outreach/Disposition Agent

Purpose: prepare, but not automatically send, seller and buyer workflow steps.

Allowed first build:
- Suggested call brief.
- Manual outreach checklist.
- Buyer/disposition notes.
- Draft message templates requiring operator approval.

Not allowed:
- Auto-calling.
- Auto-SMS.
- Auto-email.
- AI-invented owner facts.

## 6. Texas Expansion

Purpose: expand only after Dallas proves the source-preview-to-approved-lead pipeline.

Priority markets:
- Dallas County.
- Tarrant County.
- Collin County.
- Denton County.
- Adjacent DFW counties after adapter confidence improves.

Expansion rule:
- Every new source starts candidate/inactive.
- Dry-run first.
- Preview-only before ingestion.
- Evidence and repair behavior must be validated before activation.

## 7. California Expansion

Purpose: second large-state expansion after Texas source-family patterns stabilize.

Initial focus:
- Major county tax, foreclosure, code, probate, and public notice sources.
- Adapter-family reuse where possible.
- County-specific source playbooks where needed.

Expansion rule:
- No statewide assumptions without source classification.
- Every county/source gets source truth and verification path metadata first.

## 8. Nationwide Adapter Framework

Purpose: scale source processing by source family while preserving county-specific truth.

Adapter families:
- socrata_adapter.
- arcgis_adapter.
- csv_excel_adapter.
- pdf_list_adapter.
- html_table_adapter.
- searchable_portal_adapter.
- court_docket_adapter.
- public_notice_adapter.
- browser_assisted_capture_adapter.
- manual_review_adapter.

Promotion path:
1. Candidate source.
2. Playbook and registry classification.
3. Dry-run parser.
4. Preview candidates.
5. Operator review.
6. Duplicate-safe approved lead creation.
7. Monitored production source.

Safety default:
- Candidate.
- Inactive.
- Preview-only.
- No auto-ingestion.
