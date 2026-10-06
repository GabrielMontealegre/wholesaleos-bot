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
- Body: `{ "items": [ ... ] }`. Up to 25 items, 8 KiB each, 128 KiB total.
  Up to 12 requests per token per hour; a 429 gives `Retry-After`.
- Response: `{ "results": [{ "id": "...", "result": "created" }] }`.
  A repeated Facebook UID returns `duplicate` and updates only last-seen time.
  Operator status, history and edited drafts stay unchanged. No contact fields
  are returned. This endpoint cannot read finds or update their workflow status.
- Reads and status/draft edits use the signed, admin-only dashboard session, not
  the agent token. Existing pairing permissions elsewhere are unchanged.

Each item supplies:

```text
name             real name visible on the source (max 120)
platform         facebook
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
```

Only HTTPS `facebook.com` / `www.facebook.com` profile and group-search URLs of
these shapes are accepted. Missing source URLs, another group, redirects, added
verification fields, and unsupported request fields are rejected. All items are
validated before any write. Malformed input returns only a generic error code.

New finds remain `Unverified` and are isolated from existing buyer matching.
Per-channel provenance says `public want posted; not contacted`; it is not a
claim of general marketing consent. Counts use UTC calendar days and Monday-based
weeks. No buyers are invented or seeded by this feature.

Local proof: `node scripts/verify-buyers-found-ui.js` uses an in-memory synthetic
store and blocks all external requests. Screenshots under
`docs/screens/buyers-found-local/` are synthetic, not production evidence.
