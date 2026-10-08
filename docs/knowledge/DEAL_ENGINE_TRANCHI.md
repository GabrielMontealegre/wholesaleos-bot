# Deal engine: what Tranchi AI does, and how WholesaleOS does it bigger and safer

Sources: an Instagram reel Gabriel transcribed (2026-10-08), Tranchi AI press coverage (globalbankingandfinance.com, PR Newswire, Apr 2026) and tranchi.ai. Summary in our own words. Tranchi's figures are its own estimates.

## 1. What Tranchi says it does

- **"Agents" (software jobs) scan public sources every day:**
  - county tax offices and **tax-deed auction** lists;
  - **foreclosure filings** and auction sites;
  - **probate court** records;
  - ownership registries;
  - off-market listings.
- **Ranks by spread:** the auction or asking price versus nearby sold comps. Their headline example: tax-deed auction openings of **$3k–$10k** next to comps of **$70k–$150k**, "5,000+ properties, $1B+ in opportunities".
- **Underwriting** (comps, crime data, pricing), then **drafted offers and negotiation messages**. The reel claims the AI "calls the seller, negotiates, contracts and assigns". Their own press release says **users approve every offer and message before it's sent**.
- **Company:** Wyoming, founded by three mortgage professionals. No pricing published.
- **Their own cautions:** tax-deed properties can carry title problems, liens, redemption rights, occupants and repair costs, so every property needs its own valuation and legal review.

## 2. The parts the reel skips (why "autopilot" is risky)

- **AI voice calls to sellers:** since the FCC's February 2024 ruling, an AI-generated voice is an "artificial voice" under the TCPA. Calling a cell phone needs the owner's **prior express written consent**, and fines are per call. Several states add their own telemarketing rules. **We don't do AI cold calls.** The assistant drafts and Gabriel sends (D-007, D-033).
- **Tax-deed auctions aren't wholesale deals by themselves.** You must pay cash at the auction. Some states give the old owner a **redemption** period (Texas: 180 days, or 2 years for a homestead or ag land). Title insurers often need a quiet-title action first. You can't assign a property you don't own yet. The wholesale play is **before** the auction: contract with the owner who is behind on taxes, or work on surplus funds with an attorney.
- **Florida:** an unlicensed person may sell only their own contract interest (ch. 475; D-043). **Texas:** the §1101.0045 disclosure applies. **Florida owners in foreclosure:** the foreclosure-rescue rule (501.1377) applies.

## 3. WholesaleOS deal engine: same idea, more sources, plus buyers and compliance

| Source | Who reads it | Status |
|---|---|---|
| Pre-foreclosure trustee-sale notices | Server (county profiles, 1 request/s) | Dallas built; add Harris, Tarrant, Bexar, Mecklenburg (special proceedings), Hillsborough/Orange (lis pendens) |
| Tax-sale / tax-deed auction lists, and **delinquent-tax owners before the sale** | Server | Texas sheriff tax-sale profile exists; add the FL county tax-deed calendars (server-side; Gabriel's foreign IP is blocked), GA, NC |
| Probate filings (estate + property match via appraisal records) | Server, only where public with no CAPTCHA/login | New |
| Code violations, vacant registries | Server | Dallas pattern exists; generalize |
| Facebook JV / wholesaler posts, owner-direct posts | Assistant in Gabriel's Chrome, every 2 h | Running |
| Craigslist / Zillow FSBO, Xome, Auction.com, HUD | Assistant in Gabriel's Chrome | Running (rotation) |

**Ranking (one rule for every source):**
- spread = the matched approved buyer's max (their own buy-box rule, e.g. 75% of ARV minus repairs) − the price (asking, or opening bid + back taxes + estimated title/quiet-title cost);
- ARV only from real comps (D-005);
- risks shown as labels: redemption, occupied, title, flood, "ARV claimed by poster".

**Execution (what we do better):**
- A **real buyer database** with buy boxes and refs. Tranchi doesn't show buyers; we match every deal to named, approved buyers in any state.
- **The JV network:** wholesalers and dispo people (e.g. a holder who also does dispo) become partners, not just sources.
- Every message (holder, seller, buyer) is **drafted with context**: all the poster's current deals, whether they do dispo/JV, whether they said "end buyers only". Gabriel sends.
- **Activity log**, a daily brief, a Section 8 lens, contract and JV generators, and title companies that close remotely for a foreign seller.

## 4. Group intelligence (which Facebook groups to scan)

Each 2-hour run records, per group:
- posts read, posts with a price and city, fresh posts (≤ 3 days), GOOD/POSSIBLE deals, "no JV" posts, and joined yes/no.

Every Monday the groups are ranked:
- **A** (scan every run): ≥ 2 fresh priced posts per run on average;
- **B** (daily);
- **C** (weekly);
- **drop**: nothing fresh in 2 weeks.

New groups come from the morning buyer task (3 metros a day). Gabriel joins the A/B candidates it lists.
