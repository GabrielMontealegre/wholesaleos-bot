# Cycle 42: Same-Site Property Redirects

## What changed

The local helper now accepts either a search page with exactly one matching property card or a listing site that redirects the search URL directly to a property-detail page. It accepts the redirect only while it remains on the selected listing site's allowed host. The helper then checks that the visible full address exactly matches the source-established subject address before taking a screenshot. A mismatch, ambiguous card result, off-site redirect, HTTP 403/429, or detected access block stops the run without a proposal.

The direct-redirect route uses one navigation. The existing card route uses two. The resolution record includes requested and final URLs, whether the page redirected, and the page type on both ends. Zillow, Redfin, and Realtor use the same resolver rules. This is a local helper behavior only; the server does not fetch listing pages.

A visible Zillow Zestimate or similar site's own estimate is recorded as `public_estimate`, with its source URL, and labeled as an estimate clue rather than a sold comp. It cannot unlock ARV, count toward the three-sale minimum, or make a row offer-ready. Proposals remain unconfirmed until the operator confirms them.

## Verification

The hermetic Cycle 41 search-to-detail test was extended with Cycle 42 cases covering direct redirects, exact-address mismatch, card-path preservation, ambiguity/no-match, off-host and sold-page redirects, 403/429 and blocked text, no provider fallback, navigation limits, unconfirmed proposals, resolution-chain fields, and estimate-only valuation behavior. The existing sold-comp fixture remains covered for parity.

`scripts/cycle-42-local-proof.js` writes `exports/cycle-42-local-proof.json` from local synthetic fixtures only. It performs no network access and demonstrates both navigation shapes, exact-address verification, unconfirmed subject-fact proposals, unchanged ARV status, and `ready_to_offer: NO`.

## Operator use

No live capture is run as part of this release. After release, open a row that already has a complete source-supported address and select **Capture subject facts** with Zillow. If Zillow opens that exact property directly, the helper verifies the address on that page. If it opens an address search, the helper uses a single exact matching card. If the address does not match exactly, the listing redirects outside Zillow, access is blocked, or the page is ambiguous, it stops without saving a proposal. Estimates are context only; sold comps still require separate operator review and the existing strict checks.
