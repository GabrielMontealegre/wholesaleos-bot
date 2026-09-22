# Cycle 37 - Single Property Dossier and Listing Egress Boundary

Cycle 37 finishes the property-side dossier for **3808 Kings Dr, Ennis, TX 75119** while keeping seller contact work locked. It also makes Railway fail closed for server-side Zillow, Redfin, Realtor.com, Trulia, and Google Maps requests. Gabriel's clickable research links remain available because they open in his browser and are not server requests.

## What Gabriel sees

- Official source: Ellis County Foreclosure Notices.
- Official sale/event date: `2026-10-06`.
- The source document remains linked from the card.
- Subject facts appear one field at a time and count only after Gabriel confirms that exact field.
- Each sold comp shows address, sold price, sold date, distance, similarity basis, screenshot, and its strict-grid result.
- Three confirmed, grid-passing comps move the property side from `NEEDS_COMPS` to `PROPERTY_READY`.
- Contact remains `LOCKED` with zero routes. `Ready to offer` is never `YES`.
- `Room to offer` remains `Unknown` until both a supported value reference and explicitly typed debt evidence exist.

## Honest money labels

| Source fact | Dashboard label |
| --- | --- |
| Original loan or deed of trust | Original loan amount at origination (NOT the current payoff) |
| Judgment | Judgment amount |
| Published opening amount | Published minimum bid |
| Property tax | Property tax due |
| Recorded lien | Recorded lien amount |
| Amount with no established type | Unlabelled amount from source — type unknown |

The dashboard does not call an origination amount an amount owed, current balance, payoff, or current debt.

## Adapter posture

`listing_egress` is fail-closed. Missing or unrecognized values are treated as `required`.

| Source adapter | Default Dallas queue | listing_egress | Listing hosts reachable by its module | Transport |
| --- | ---: | --- | --- | --- |
| tx_dallas_county_clerk_foreclosure_notices | yes | none | none | none |
| tx_dallas_fsbo_contact_first | yes | optional_degrades | Zillow, Redfin, Realtor.com | fetch |
| tx_dallas_craigslist_owner_posts | yes | none | none | fetch |
| tx_dallas_listing_radar | no | required | Zillow, Redfin, Realtor.com | fetch / Playwright |
| tx_hunt_county_foreclosure_notices | yes | none | none | fetch |
| tx_navarro_county_foreclosure_notices | yes | none | none | fetch |
| tx_rains_county_foreclosure_notices | yes | none | none | fetch |
| tx_hill_county_foreclosure_notices | yes | none | none | fetch |
| tx_van_zandt_county_foreclosure_notices | yes | none | none | fetch |
| tx_bell_county_foreclosure_notices | yes | none | none | fetch |
| tx_tarrant_county_foreclosure_notices | yes | none | none | fetch |
| tx_collin_county_foreclosure_notices | yes | none | none | fetch |
| tx_ellis_county_foreclosure_notices | yes | none | none | fetch |
| tx_kaufman_county_foreclosure_notices | yes | none | none | fetch |
| tx_parker_county_foreclosure_notices | yes | none | none | fetch |
| tx_rockwall_county_foreclosure_notices | yes | none | none | fetch |
| tx_fort_bend_county_foreclosure_notices | no | none | none | fetch |
| tx_bexar_county_foreclosure_notices | no | none | none | fetch |
| tx_johnson_county_foreclosure_notices | yes | none | none | fetch |
| tx_denton_county_foreclosure_notices | yes | none | none | fetch |
| mi_wayne_detroit_land_bank_listings | no | none | none | fetch |
| ca_san_diego_tax_default_power_to_sell | no | none | none | fetch |
| ca_los_angeles_tax_default_auction_book | no | none | none | fetch |

`tx_dallas_listing_radar` is skipped before the adapter runs and reports `LISTING_EGRESS_DISABLED`. `tx_dallas_fsbo_contact_first` still performs search/snippet discovery, but listing-host page checks return `listing_egress_disabled`; a permitted host that redirects to a listing host returns `listing_egress_disabled_redirect`. Snippet-only rows remain unverified and cannot become call-ready.

## Gated legacy routes

With the default configuration, each route returns HTTP 503 with `LEGACY_LISTING_FETCH_DISABLED`.

| Method and route |
| --- |
| `GET /api/leads/:id/comps` |
| `POST /api/leads/reanalyze` |
| `POST /api/leads/:id/analyze` |
| `GET /api/property/intel/:leadId` |
| `POST /api/scraper/deals` |
| `POST /api/leads/:id/enrich` |
| `POST /api/courthouse/scrape` |
| `POST /api/datasources/run-all` |
| `POST /api/datasources/:source` |

`GET /api/debug/comp-test` was removed and returns 404.

## Dallas measurement

The hermetic Dallas fixture discovered three listing-host rows both before and after the boundary. Listing-host `contact_verified` changed from 3 to 0; `CALL_READY` changed from 3 to 0; `OUTREACH_READY` remained 0. Listing radar remains outside the default queue and reports `LISTING_EGRESS_DISABLED` when explicitly requested. The live stored dashboard previously showed 254 Dallas rows, 253 locked, and 0 call-ready; no production batch was run in this cycle to rewrite those rows.

## Re-enable only for controlled rollback

Set `WOS_ENABLE_LEGACY_LISTING_FETCH=true` to reopen the guarded legacy transports. This is not the normal production posture. The local helper remains the intended route for operator-initiated listing research.

## Proof artifacts

- `exports/cycle-37-egress-inventory.json`: registry-wide source and transport inventory.
- `exports/cycle-37-egress-proof.json`: E1-E16 results and Dallas fixture delta.
- `exports/cycle-37-local-proof.json`: no-network 3808 dossier transition.
