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

## How the tabs work (Gabriel's design, 2026-10-07)

Separate tabs, **one engine**: every tab reads and writes the same records, so a change in one shows everywhere (D-037). Each item opens **one card with all the information and comps, and every action is on that card** (#283). Every term has a **(?)** (#285). Everything sorts and filters by **state, county and city** (#269).

| Tab | What it's for | What gets in |
|---|---|---|
| **Dashboard** (home) | Gabriel's day at a glance | Today's Deals on top, then counts that open their lists |
| **Today's Deals** | Gabriel's to-do: checked deals of every kind | Own leads, JV deals, auctions (Xome/Auction.com/HUD/HomePath), by-owner. Each has our comps, our ARV, the buyer's max, the spread, the deadline and a verdict (D-042) |
| **JV** | Other wholesalers' deals we can sell to our buyers | **Only when a deal passes the JV rules AND an approved buyer matches** (any state). It has an expiration date and a status pipeline (D-043) |
| **Leads** | Our own seller leads (county notices, auctions, court records) | Every lead gets a use (D-040), with the Deal Check on its card (#275) |
| **Buyers** | Every buyer: approved, pending, partners | From Facebook, Craigslist, public records (B-09), manual. Buy box, outreach status, "leads that fit" |
| **Title Companies** | Who will close for Gabriel's situation | `data/title-companies.json`: fit for Gabriel, contacts, answers when called (B-22) |
| **Outreach** | Everyone to contact today: sellers, deal holders, buyers | Batches of ≤ 20 that Gabriel approves; every contact logged on the timeline (D-007, D-008, D-029) |
| **Deals pipeline** | Each deal's stage from found to closed | The golden path (#264): found → checked → contract → buyer → closed |

Flow: the morning run and the server find items → they arrive **pending** in Today's Deals / Buyers → Gabriel approves → JV deals with a matched buyer appear in **JV** → outreach from the card → the deal moves through the pipeline → closed.

## Doing everything in the dashboard (not in the chat)

| You want to… | Where in the dashboard | Ready? |
|---|---|---|
| See and approve buyers | Buyers found (Import, Approve, Copy message, Open profile) | ✅ now |
| See checked deals and JVs with comps, buyer max, room, expiry | Today's Deals + JV tab | next (#283) |
| Understand any term | (?) tooltips + glossary | next (#285) |
| Comps and strategy on any lead | Deal Check on the card | soon (#275) |
| Email holders and buyers | Card → Draft email → Gmail draft → Send (your click) | soon (#288) |
| Make the JV agreement | JV card → Generate JV agreement | soon (#288) |
| See what the automatic searches did | Runs panel | soon (#288) |
| Pick a title company | Title Companies tab | later (B-22) |
| Software finds deals by itself | Server jobs (county auctions, sales data, deed-record buyers) + Chrome panel | later (#277, B-09, B-21, B-18) |
