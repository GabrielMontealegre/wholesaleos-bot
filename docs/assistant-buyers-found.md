# Buyers found

The assistant collects real public wants in Gabriel's own browser. WholesaleOS stores
the supplied source and draft; it does not visit Facebook, message anyone, or verify
that a public-post find is a real buyer. Open **Buyers found** to filter the results,
edit/copy a draft, open the profile, and record what Gabriel actually did.
Changing a status records history; it never sends a message or verifies a buyer.

## Assistant integration

- Endpoint: `POST /api/assistant/finds` on the dashboard's origin.
- Header: `Authorization: Bearer <agent token>` from the existing admin pairing flow.
  A newly paired token includes `assistant_finds:write`; older tokens without that
  scope cannot submit. Never put the token in a URL, file committed to Git, or log.
- Body: `{ "items": [ ... ] }`. Up to 50 items, 8 KiB each, 256 KiB total.
  Up to 12 requests per token per hour; a 429 gives `Retry-After`.
- Response: `{ "results": [{ "id": "...", "result": "created" }] }`.
  A repeated platform/UID returns `duplicate` and updates only last-seen time.
  Otherwise normalized email, then normalized phone, can associate a possible
  duplicate with the existing record, without creating a second buyer. Existing
  buyer data is retained and the association is shown for review.
  Operator status, history and edited drafts stay unchanged. No contact fields
  are returned. This endpoint cannot read finds or update their workflow status.
- Reads and status/draft edits use the signed, admin-only dashboard session, not
  the agent token. Existing pairing permissions elsewhere are unchanged.

Each item supplies:

```text
name             real name visible on the source (max 120)
platform         facebook, craigslist, or manual
group_name       visible group name (max 200)
group_id         numeric group id
profile_url      https://www.facebook.com/groups/<group_id>/user/<uid>/
source_url       https://www.facebook.com/groups/<group_id>/search/?q=<search>
what_they_buy    source-backed summary (max 500)
deal_type        house or land
states           optional array of two-letter state codes (max 20)
areas            optional array of metro/area names (max 20, 80 chars each)
email / phone    optional; only if published by that person
drafted_message  draft for Gabriel, never sent (max 600)
captured_at      ISO timestamp of capture, with timezone
classification   end_buyer, end_buyer_strict, end_buyer_stale, middleman_*,
                 caution_*, not_buyer_*, out_of_market, or unknown
post_age         optional source-stated age (max 100)
post_url         optional exact post URL
contact_published optional object with email and phone they published
buy_box          optional object, described below
```

For Facebook, only HTTPS `facebook.com` / `www.facebook.com` profile and group-search
URLs of these shapes are accepted; a post URL must point to posts/permalink in the
same group. Craigslist accepts HTTPS craigslist.org hosts. Manual finds require
a public HTTPS source; neither path causes a server visit. Missing source URLs, another group, redirects, added
verification fields, and unsupported request fields are rejected. All items are
validated before any write. Malformed input returns only a generic error code.

Every new find starts pending, even when the assistant says Gabriel previously
approved it. The assistant cannot set approval. The signed admin dashboard records
Approve or Reject with an optional reason, actor and time. Rejected finds are hidden
by default and remain accessible through the approval filter. Only approved end
buyers (or an approved buyer whose category is still unknown) enter matching;
partners, caution categories and non-buyers remain stored outside end-buyer matching.
Approval supplies an operator trust label, not verification of a comp or property fact.
Statuses record not contacted, messaged, emailed, commented, replied or not a fit,
with date, actor and channel. Logging outreach requires approval and sends nothing.

The optional buy_box object accepts state; areas[], zips[], types[]; price_min/max,
arv_min/max, pct_arv (text), all_in_max; beds_min, baths_min, sqft_min/max, year_min;
construction, flood, rehab_tolerance, exclusions[], funding, close_speed, capacity,
and wants_sent[]. Numeric fields must be numbers; omitted fields remain missing.
Property types: house, duplex, 2-4 units, townhome, condo, land, mobile home on land.
Every criterion is supplied as part of the captured source record, never inferred.

"Leads that fit this buy box" reads saved leads using known state, area, ZIP, type
and asking/list price. Known differences fail the fit; unknown values are shown
as unknown. At least one known criterion must agree. It is an initial fit count,
not the full B-19 match engine or proof of value. Other captured criteria remain
visible for review and are not yet evaluated. Pending/rejected buyers yield zero fits.

Per-channel provenance says `public want posted; not contacted`; it is not a
claim of general marketing consent. Counts use UTC calendar days and Monday-based
weeks. No buyers are invented or seeded by this feature.

Local proof: `node scripts/verify-buyers-found-ui.js` uses an in-memory synthetic
store and blocks all external requests. Screenshots under
`docs/screens/buyers-found-local/` are synthetic, not production evidence.
The proof loads the dashboard's actual dark theme and checks contrast for both
populated and empty states at desktop and phone widths.
