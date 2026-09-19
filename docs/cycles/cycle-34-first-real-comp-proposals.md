# Cycle 34 - First Real Comp Proposals

## Purpose

The local helper now tries Zillow, Redfin, and Realtor.com in that order for one source-supported property. It runs in the operator's visible local browser, one site at a time. The Railway service never visits a listing site.

The helper creates unconfirmed screenshot proposals only. A proposal does not count as a comp until the operator reviews and confirms it. Three confirmed comps must still pass the existing one-mile, similarity, recency, price, subject-exclusion, and provenance checks before `Can value` can become `YES`. `Ready to offer` never becomes `YES` automatically.

## Cycle 33.1 Diagnosis

The prior run log recorded one Zillow page, zero screenshots, zero proposals, no block, and only `no_qualifying_sold_cards_found`. The old code built the ordinary subject-search URL and collapsed every non-blocking failure into that single outcome. It did not retain the page type, sold-results container state, card count, render timing, or the field/discard branch. Therefore the prior failure cannot be attributed honestly to URL shape, selector drift, missing fields, a discard, or client-render timing from the retained evidence alone.

Cycle 34 fixes that observability gap. Every attempted source now records its page type and load state, card and field counts, candidate count, screenshots, proposals, and specific discard reasons. A future zero is actionable instead of ambiguous.

## Operator Workflow

1. Sign in to the WholesaleOS dashboard and start the paired local helper.
2. Open the Ellis row for `3808 Kings Dr, Ennis, TX 75119`.
3. Click `Capture sold comps for this row` once.
4. The helper tries Zillow, then Redfin, then Realtor.com. It stops after three proposals, four screenshots, two blocked sites, or the existing time/page limits.
5. Read the plain-English result shown for each source. A blocked or empty source is not retried or bypassed.
6. Review every proposed screenshot and confirm only fields visibly supported by the image. Nothing counts before confirmation.

## Safety

- Only Zillow, Redfin, and Realtor.com are allowed.
- There is no CAPTCHA, login, paywall, bot-wall, rate-limit, or WAF bypass.
- Sold address, sold price, and sold date must all be visible in the captured region.
- The subject property cannot be its own comp.
- Duplicate addresses across sources are uploaded once, preserving the first source's provenance.
- Page and screenshot limits apply to the complete three-source run, not separately to each site.
- No batch, enrichment, contact, phone, paid-provider, saved-lead, or database workflow is involved.

## Synthetic Proof

The hermetic proof uses sanitized local HTML fixtures and blocks every external browser and Node network request. It demonstrates an insufficient Zillow result, one Redfin proposal, two Realtor.com proposals, and a separate two-source HTTP 403 stop. The committed proof artifact contains aggregate diagnostics only and is marked synthetic, preview-only, not a saved lead, and not ingestible.
