# Today's Deals and JV

The home dashboard begins with Today's Deals. Its separate tab reads the same
stored records as JV. Import buyers or deals from the existing admin Import form
(JSON file or paste). Preview shows counts without saving; Import explicitly saves.
Deal imports always stay pending, even when the buyer bulk-approval checkbox is on.

Open the complete card to see property facts, sources, submitted comps, our
computed value range, the holder's claims, buyer ceilings, estimated spread,
deadlines, published holder contact, drafts and history. Clickable links open in
your browser; the server does not fetch them. Copy message only copies a draft.
Nothing sends, signs, contacts or confirms itself.

Approval requires the operator to explicitly attest to reviewing all source and
comp evidence. Imported value ranges, tiers and verdicts are retained as claims,
not trusted evaluation. The existing strict comp grid is recomputed; at least two
different qualified sales within six months give Preliminary, three give Verified.
Texas last-list-price evidence is a separate preliminary-only tier, never a sold
price. No lead ARV or offer gate is changed by this independent deal-review view.

Buyer ceilings use only recorded price caps or a literal percentage such as `75%`
and the submitted repair estimate. The low supported value is used conservatively.
These are buyer budget ceilings, not MAO, offers, commitments or guaranteed profit.
No default JV split is invented; spread stays missing without a stated split.
Buyer location refers to what they buy, not where the buyer lives. Unknown constraints
(including construction, flood and exclusions that this slice cannot evaluate)
exclude a match rather than being silently passed.

JV includes only approved, freshly posted, currently rechecked deals with today's
holder availability confirmation, a supported value, repairs and a buyer ceiling.
Closing must be at least seven days away when stated. Asking must be at or below
the ceiling or within 10% for negotiation. Expiration is computed on reads; records
are not deleted or secretly rewritten. Show expired/rejected from Today's Deals to
review history. Confirmed availability does not authorize a buyer introduction:
contract and owner checks plus a signed JV are also required.

Recording a stage is a human assertion. Required contract/deposit checks are
explicit, with document URL, time and operator attribution retained in history.
The downloadable JV term sheet is a working draft, not a signed legal agreement;
title/counsel must review it. Florida/contract-interest cautions appear on cards.

The ten-deal daily target shows actual reviewed deals. This feature does not run an
acquisition job or manufacture inventory. A zero target count is reported honestly.
Help is available by hover, keyboard focus or tap. Glossary lists all shared terms.

## Intake schema

Use `items` at the top level. A deal has `kind: "deal"`, `deal_kind` (`jv`, `own`,
`auction`, `by_owner`), `platform`, `source_url`, full `address`, `city`, `state`,
`zip`, `captured_at` (ISO timestamp), and `comps` (at most eight). Optional fields
include county, beds/baths/sqft/year/lot/type/coordinates, asking or starting bid,
repair estimate, claimed ARV/repairs/range/tier, posted timestamp, named or ISO
closing/auction dates, published holder contact, draft and JV split (0-1).
Numeric ambiguous dates are refused. Imports are capped at 50 items, 8 KiB per item,
256 KiB per request and the existing bounded, operator-owned preview lifetime.

Each comp carries full `comp_address`, sold status/date, sold price (or Texas
last-list price and `price_basis: "texas_last_list_price"`), source URL/text and
all strict-grid facts. Missing facts remain unknown and fail the existing grid.
No client-supplied verified flag, approval, cached grid or actor is accepted.

## Golden path status for this PR

| Step | Result |
| --- | --- |
| Source acquisition | Existing only; no new run or sources |
| Property identity | Existing strict grid facts required; no saved-lead mutation |
| Owner / contact | Published holder context only; no contact run |
| Value | Reviewed intake, unchanged grid, explicit labeled tiers |
| Deal check / offer | Buyer ceiling only; #275 and offer calculator still pending |
| Buyer | Approved buyers with known location, criteria and budget only |
| Outreach | Draft/copy/open only; Gabriel sends |
| Contract / close | Explicit operator history; not automatically verified |
