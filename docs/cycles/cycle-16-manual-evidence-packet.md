---
cycle: 16
status: build
scope: all live markets
feature: manual evidence packet
base: 9d00916
---

# Cycle 16 - Manual Evidence Packet

## Purpose

Give Gabriel a small, deterministic sample of current public-source leads and the exact research links needed to verify the subject property, sold comps, county record, sale status, and possible contact routes. This is a human-assisted bridge while free automated sources remain incomplete.

## Safety Contract

- Screenshots are operator-supplied evidence, never official county evidence.
- OCR creates unconfirmed proposals only. A proposal affects no state, comp count, ARV, or contact readiness until the operator confirms it.
- Confirmed screenshot fields retain source name, source URL, capture time, screenshot identifier, and `operator_supplied_screenshot` provenance.
- Screenshot values never overwrite official source values. Conflicts remain side by side for review.
- Sold comps pass the existing 12-month window, 24-month cutoff, $5,000 floor, similarity, subject-exclusion, and parcel-only safeguards.
- Three accepted sold comps unlock only a preliminary screenshot-based ARV range. It remains distinct from county/API comp evidence.
- Zestimate, list price, minimum bid, redemption amount, assessed value, and tax value remain clue-only values and never become ARV.
- A contact route becomes callable only when it is explicitly classified as a possible owner contact and the operator confirms it is the owner or seller route.
- The packet store is separate from saved leads and the database. It remains `preview_only`, `should_ingest:false`, and `not_a_saved_lead:true`.
- Uploaded image bytes are cached locally and are ephemeral on Railway. Extracted, confirmed evidence and provenance persist in `data/manual-evidence-packets.json`.
- The server provides links but never fetches Zillow, Redfin, Realtor.com, Google Maps, or CyberBackgroundChecks.

## Sample Mode

The packet selects the same rows until the stored snapshot changes:

- Dallas: 3
- San Antonio: 2
- Los Angeles: 2
- San Diego: 2
- Detroit: up to 2, or an honest empty state
- Houston: up to 2, or an honest empty state

Rows sort by lifecycle freshness, upcoming sale urgency, work state, and queue key. A market with no eligible row stays empty; it never borrows a row from another market.

## Operator Workflow

1. Open Deal Finder and select a market.
2. Open a prepared Manual Evidence Packet lead.
3. Open the supplied research link in a new tab.
4. Capture a screenshot containing the visible evidence and keep the exact page URL.
5. Upload the screenshot to the matching slot.
6. Review every OCR-proposed field. Correct it to match the screenshot, then confirm it.
7. Repeat until the packet shows three accepted sold comps or an honestly blocked reason.

## Boundaries

No new market, source lane, paid provider, scraping bypass, database write, saved lead, or automatic contact decision is part of this cycle.
