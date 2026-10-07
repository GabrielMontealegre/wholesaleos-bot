# The plan (plain English)

**Goal:** WholesaleOS finds deals and buyers by itself, checks them with real numbers, and shows Gabriel one card per deal where he can decide and act. Gabriel decides and closes; the software does the searching and checking.

Progress is reported in every update (golden path, issue #264). Status on 2026-10-07: **about 35%**.

## Phase 1: first deal (this week)
- Tampa JV: a wholesaler's 2/1 at $155k, real ARV about $250k, matched to an approved Tampa buyer with a 75%-of-ARV rule. Gabriel's estimated share is about $3–8k.
- Steps: the holder's documents → owner-of-record check → JV agreement (Gabriel co-holds the contract interest, title pays at closing) → buyer earnest money to title → close.
- The title company (CLOSED Title, attorney-owned, online closing) reviews the JV and handles foreign-seller tax withholding (FIRPTA).

## Phase 2: everything visible in one place (Codex, now)
1. #269 usability floor: tappable links, rows and counts; junk hidden; plain English.
2. #283 **Today's Deals** (first screen) and the **JV tab** with rules (D-042, D-043); act from the card.
3. #285 **(?) help** on every term, plus a glossary.
4. #275 **Deal Check** on every lead: status, comps, strategy fit (wholesale / subject-to / seller finance / novation / land / rental), rating, offer, Section 8 rent.

## Phase 3: the software finds deals itself
- **Server (automatic, public government data):** county foreclosure auctions and court filings (#277, Tampa first), statewide tax rolls and sales files (B-21), sale-price comps in disclosure states, buyers from cash purchases in deed records (B-09), HUD Section 8 rents.
- **In the user's browser** (Facebook, Xome, Auction.com, Redfin block servers or forbid scraping): the WholesaleOS Chrome panel (B-18) saves what the user sees, and the local helper (B-11) captures comps. Until then, the assistant's morning run does this and imports through the dashboard.
- **Paid data** (ATTOM, PropStream and similar) only after deals close (D-012).

## Phase 4: own deals, bigger money
- Owners in pre-foreclosure, from county data, contacted under Florida's foreclosure-rescue rules (Fla. Stat. 501.1377).
- Creative finance (subject-to, seller financing), land, Section 8 rentals.
- CRM timeline and tap-to-send (B-10), deal summary and buyer first look (B-17), match engine (B-19).

## Phase 5: scale
- The 76 target metros from the demand index (docs/knowledge/FACEBOOK_BUYERS.md §7), state by state, starting with states that publish sale prices.

## What runs where (honest)

| Job | Where | Why |
|---|---|---|
| County notices, auctions, sales, tax rolls | Server | Public government data (A-001) |
| Facebook groups, Xome, Auction.com, Redfin | User's browser | Logins, bot blocks, site terms (A-019) |
| Messages, posts, sending | Gabriel | D-026, D-033: the assistant drafts, Gabriel sends |
| Paid comps and skip tracing | Later | D-004, D-012 |
