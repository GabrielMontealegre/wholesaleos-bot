# Exit-strategy engine and buyer strategy fields (#402)

Built by the Claude cloud session (label `claude-building`; Codex does not touch it).
This slice adds a pure calculator and buyer profile fields. It adds no route and no
screen, does not deploy, and does not change any existing gate, value or match.

## What it does

`modules/deals/exit-strategies.js` `evaluate(facts, { today, buyers, assumptions })`
scores nine exits: fix and flip, buy and hold rental, BRRRR, wholetail, creative terms
(seller financing, subject-to, lease option), novation / list, land / builder, small
multifamily and wholesale / JV. Each exit has a verdict (Strong / Possible /
Needs data / No), a plain reason, labeled numbers (fact, derived or assumption, with
the facts they came from), missing facts, seller or buyer questions, matching buyers
and a one-line pitch. `cardLines()` gives "Best exit: ..." and "Also works: ...".

Ranking (#402): a real matching buyer first (target return met and a proof-of-funds
date within 90 days weighs most), then our fee at target, then speed, then data
certainty (verified > preliminary > ballpark, D-003), then verdict and fee. A matched
buyer's own price sets the fee they support (their % of ARV or cap rate, or at least our
target fee when their cash-on-cash passes at asking + fee); the wholesale/JV line uses
that fee, never the exit's generic maximum.

Safety rules enforced by the engine:

- Every fact needs `source_kind`, a source URL or evidence text, and a capture date
  that is not in the future and not past the fact's age limit. Anything else is
  rejected with a reason and never used. Rejected values are never echoed.
- ARV counts only from the comp grid with at least 2 comp records attached; each record
  needs an address, a sold or closed status, a sold price, a sold date within 6 months, an
  https source and an explicit recorded-sale basis, with no address twice, and the value must sit inside the sold-price
  range. The count comes from the records, never a claimed number: 3 = verified,
  2 = preliminary even if "verified" is claimed (D-005); ballpark (D-003) stays ballpark.
  List price, AVM, Zestimate, assessed or tax value, auction bid, the holder's claimed ARV
  and rent estimates are never ARV. Lot-sale values need the same records (2 years).
  ARV and lot-sale values also need the sourced, complete subject address (number, street,
  city or ZIP). Comps count as distinct properties, not spellings: every comp needs a
  number, street and city or ZIP, and two addresses are the same property unless a field
  both state proves otherwise (house number, street, suffix, directional, unit, ZIP, or city
  when either lacks a ZIP). "St", "Street" and "St." are one house; a missing unit or ZIP
  counts as possibly the same. A duplicate, or a comp that may be the subject, fails the set.
- Every buyer profile passed to `evaluate` is validated with the shared
  `buyer-strategy-profile.validate` against the injected `today` (same rules as import and
  operator edits). An invalid profile is listed in `invalid_buyers` with its reason and is
  never matched, ranked or given a fee.
- A buyer profile counts only with a valid source (a kind, non-blank evidence or an https
  URL, and a capture date not after today); the
  source travels on every match as `profile_source`. An unsourced profile stays listed as
  "confirm with the buyer" and never affects ranking. Cash-on-cash targets are measured
  with the loan for DSCR buyers and without one for cash buyers; hard money is unknown
  until that financing is modeled.
- Rent counts only from HUD Small Area FMR, rental comps, an agent, a lease or a rent
  roll. A rent figure is never a comp.
- A loan payoff counts only when the owner stated it or a payoff statement shows it.
  An original loan amount or an amortization estimate is never used or shown (D-011).
  A typical-rate clue is not the owner's rate (D-010).
- Assessed land and total values only produce a land-share signal, never a price.
- Land prices come only from a builder's own price or quote (A-018), at least 2 recorded
  lot sales, or new-construction sales for the 10-15-20 rule (D-032).
- Only buyers whose target return is met move an exit up the ranking; buyers matched on
  strategy alone stay listed with "confirm the return".
- No offer or MAO is produced (B-08 owns the single offer calculator).

`modules/deals/exit-strategy-facts.js` maps a reviewed deal into facts: ARV from the
reviewed comp grid (low end of the range) only when every counted comp is a recorded
sale. The "Texas list-price" tier, or any mix containing last list prices, gives no ARV
here (AGENTS 5: a list price is never ARV; A-023 stays a reviewed-deal grid label). Then
the repair estimate, the asking price or
starting bid, type, size and a unit count only for unambiguous types. It never reads
`claimed_arv` or `claimed_rehab`. `buyersFor()` returns profiles only for the buyers
`reviewed-deals.evaluate` already matched on approval, area and type.

## Writer/reader trace

`assistant_find.strategy_profile` and `assistant_find.strategy_profile_source` are new.
`git grep strategy_profile` before this change: no hits.

Writers:
- `assistant-finds.validateItems`: assistant drop-box items (`/api/assistant/finds`,
  the agent import preview/commit in `buyer-find-import.js`, and
  `scripts/submit-assistant-finds.js` through `validateAgentItems`). Validated by
  `buyer-strategy-profile.validate`; source is `assistant_report` with the post URL
  (or search URL), evidence text and capture time. The key is absent when not reported.
- `assistant-finds.ingest` new record (`newFind`) stores it unchanged.
- `assistant-finds.ingest` re-import of the same identity (platform UID or reference)
  replaces it only if the report is strictly newer and the stored profile is not
  operator-entered; the replaced profile goes into `history` (`kind: strategy_profile`). A newer
  report repeating the same profile only advances the source date, so a delayed older report
  can never win later.
  Contact-only duplicates (email/phone) never rewrite another record.
- `assistant-finds.update` (PATCH `/api/dashboard/buyers-found/:id`): operator input,
  source `operator_input`, history entry and a `status_change` activity event.
- Legacy writers cannot write a profile: `db.addBuyer` rejects `assistant_find`, the
  legacy buyer PUT in `server.js` returns 409 for it, and `db.addBuyersBulk` has no caller.

Readers:
- `assistant-finds.listFinds` (GET buyers found): returns the profile (spread of
  `assistant_find`) plus `strategy_profile_view`, a plain-English summary.
- `exit-strategy-facts.buyersFor` -> `exit-strategies.evaluate` matching.
- Not read by `buyer-fit`, `reviewed-deals.evaluate`, `deal-fit-view`, `match-profit`
  or `db.getBuyers`; existing matches and ceilings are unchanged.

Stages: lead, card, deal, queue, refresh and document recovery stages do not carry buyer
records. Buyers persist as a whole in the store, so the profile survives every write
(tested with a JSON round trip).

## Deferred

- The deal-card "Best exit / Also works" block. Reviewed deals carry no rent, taxes,
  insurance or loan facts yet, so most cards would only say "needs data"; the Deals
  screen rebuild (#416) is ordered and the P0 UI gate holds. The follow-up calls
  `fromReviewedDeal` + `buyersFor` + `evaluate` from the deals list and renders
  `cardLines` in `dashboard/wos-todays-deals.js`.
- Showing and editing the profile on the Buyers screen (`wos-buyers-found.js` is also
  changed by draft PR #413).
- Sourced rent, tax, insurance and owner loan facts on deals and leads.
- Once draft PR #426 (financing scenarios) merges, the DSCR payment can delegate to it.
