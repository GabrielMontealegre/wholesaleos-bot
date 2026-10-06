# Wholesaling playbook (knowledge base)

What we've learned from Gabriel's courses (Wholesailors Real Estate — Maximilian Dier; Wholesaling
Real Estate — Flip with Rick), public YouTube channels (FlipWithRick, MaximilianDier,
HoldMyHandWholesale, ZachGinnOfficial) and live calls. Written in our own words as working rules,
not copies of course material. Agents use it for scripts, offer math and product decisions; it's also
the seed of Gabriel's future "wholesaling Bible". Last updated 2026-10-05 by the architect.

Product rules live in `AGENTS.md` and `docs/DECISIONS.md`. Where this file and those differ, they win.

---

## 1. Offer math

**Course multiplier chart (Zach Ginn):** investor price = ARV × multiplier − repairs; your offer = that
− your fee.

| ARV | Multiplier |
|---|---|
| under $120k | about 70% |
| $120k–$200k | not stated in the course — do not invent one; flag it |
| $200k–$250k | 80–82% |
| $250k–$500k | 83% |
| $500k+ | 83% (chart tops out at 85%) |

His point: the old "70% rule" came from when houses averaged $120–130k; at today's prices a flat 70%
leaves too much on the table. Other formulas seen in the courses (reference only): the "90% rule"
(ARV × 0.90 − 2 × repairs), a behavioral shortcut (ARV − 2 × repairs), rentals (monthly rent × 100 −
repairs − fee), and DSCR = monthly rent ÷ total monthly payment (1.0 minimum, 1.25 good).

**Repairs before you've seen the house:** about $20/sq ft for light work, $50/sq ft for a full interior
gut (small houses run higher per foot). Buyers subtract about 10% of ARV for selling costs.

**Equity filter used in practice:** courses filter leads to roughly 30–40% estimated equity or more,
because a seller with little equity can't take a low cash offer (the bank won't go lower). Our product
shows equity only as a sorting band, never as a number (D-011).

**Q4 note (course):** buyers get more conservative toward year-end — lock deals up lower in Oct–Dec.

## 2. Seller calls

- Open simply: who you are, the property, "would you consider an offer if the numbers made sense?"
- Get the four basics (MCTP): Motivation, Condition, Timeframe, Price.
- Ask "why didn't you list it with a realtor?" — it surfaces the real motivation.
- Separate the seller's **position** (the number they say) from their **need** (why). "What does life
  look like for you after the sale?" often matters more than price — e.g. a free short leaseback for a
  family member solved a deal on a live call.
- Confirm facts with the seller: county records can be wrong (a live call found the county listing two
  baths for a one-bath house).
- Ask what they owe, the monthly payment, the **interest rate**, and whether payments are current. A
  low-rate loan points to subject-to.
- Make the intro automatic so you can listen; within ~30 seconds place the seller in a bucket:
  motivated, curious, testing, or needs time.
- Our honesty rule: never state a value you don't believe and never claim a lender you don't have.
  Several course scripts do both; we keep their structure, not those claims.

## 3. Realtor (on-market) offers

Structure taught for low offers on listed properties: (1) hook — you're ready to submit an offer and
have a couple of questions; (2) agree on the after-repair value; (3) agree on repairs; (4) walk through
the math (value − ~10% costs − repairs = break-even; subtract a modest profit); (5) present the offer.
Optional sweetener: unrepresented buyers can offer the buyer-side commission to the listing agent.
Some states now require a wholesale disclosure attached to assignments (Ohio, Missouri) — realtors may
push back when they learn you're assigning.

## 4. Land (infill lots)

- Good lot: a house on each side (buildable), paved road, not on a busy road, normal rectangular shape,
  near recent new construction. A cheap lot with no neighbors is usually cheap for a reason (flood zone,
  access, utilities) — skip it.
- Value it two ways: recent lot sales nearby, and builder math — new-home value (from new-construction
  sales) − build cost − ~10% resale cost − builder profit.
- Build cost: roughly $100/sq ft in DFW for basic new construction (courses quote $125–150 to agents);
  varies by market and quality.
- Lender rule of thumb from a live call: lot value up to ~20% of the finished new-home value.
- Course offers open around 50–60% of list price on stale land listings; members report counters on
  60% openers.
- There's also a "luxury land" level-2 course (Wholesailors) not yet extracted.

## 5. Finding leads

- **Government lists beat aggregators on timing:** pre-foreclosure filings (lis pendens in judicial
  states, notices of sale in non-judicial states like Texas), probate, code violations, tax
  delinquency. Software vendors pick these up weeks later.
- Typical clean-up: geographic boundary, single-family, exclude active listings, estimated equity
  30–40%+, optionally individuals only, owner-occupied for door-knocking.
- Skip-trace hygiene: keep only numbers with an owner match, drop tenants, **drop Do-Not-Call and known
  lawsuit filers**, mobile-only for texting, dedupe.
- Pay-per-lead marketplaces (e.g. PropertyLeads) sell sellers who raised their hand, with phones,
  roughly $29–$125+ per lead — fastest way to get practice calls.
- Courses' own markets of interest: DFW, Tarrant County, Monroe County NY (Rochester), Jacksonville,
  Orlando, Atlanta, Columbus OH/GA, Scottsdale.

## 6. Selling deals (dispo)

- Best buyers = people who bought similar houses nearby recently with cash, especially repeat buyers.
  Rank by number of purchases, recency and consistency; exclude big institutions and iBuyers; note
  each buyer's favorite areas and average price. Also look for buyers within a few blocks of the deal.
- Buyer call: hook ("off-market fix-and-flip in [area] — are you buying?"), qualify (how many a month;
  "are you the buyer or do you have a buyer for me?" catches middlemen), agree ARV with comps ready,
  walk the math, ask their profit target, price under their number.
- Max's MaxDispo offers nationwide joint-venture disposition (a later option, not a plan).

## 7. AI agents (Meta Muse live, 2026-10-01, and follow-ups)

- Workflow taught: find leads daily (Zillow keyword searches, auction.com foreclosure sales at least
  14 days out, government lists) → import into a wholesaling CRM → skip trace → filter (<30% equity
  out, absentee, dedupe) → comp → write the offer → text realtors/sellers → repeat every morning by
  8 AM → dispo by pulling recent cash flippers and sending a deal packet / posting on Facebook.
- Honest limits stated live: it's slow, gets stuck (take over and correct it), needs training ("brain"
  prompts), you should double-check its comps, it can't talk to agents on the phone, Zillow's
  press-and-hold check needs a human, AI comping burns credits (some members comp manually). Muse is
  US-only; the course suggests Claude-based setups outside the US. Ty says a faster, cheaper option than
  Muse is coming.
- Example output shown: ARV $256k, repairs $41,250, "investor pays ~$148k", "offer ~$128k".
- Our stance: these agents can drive WholesaleOS later through a safe connector. Our product keeps the
  rules (real comps, sourced phones, no automatic texting/calling; batches of up to 20, approved by
  Gabriel).

## 8. Compliance notes (not legal advice)

- Automated texting needs carrier registration (A2P 10DLC) and consent rules; AI voice calls count as
  "artificial voice" under federal rules. Calls and mail are the lower-risk channels.
- National Do-Not-Call registry: organizations can access up to five area codes free.
- Texas: foreclosure sales on the first Tuesday of the month; no redemption after a mortgage trustee
  sale; tax sales redeemable 2 years (homestead/agricultural) or 180 days (other); HOA foreclosures may
  have a 180-day redemption.
- Michigan: redemption usually about 6 months after a sheriff's sale. North Carolina: 10-day upset-bid
  period after a sale. (Verify per state before relying on it.)
- Surplus funds after an auction may belong to the former owner; recovering them is regulated.
- Title companies: before the first contract, confirm one will close an assignment for a non-resident
  individual with a US bank account and no LLC.

## 9. Where things live

- Skool: Wholesailors Real Estate (skool.com/wholesailors, ~3.9k members, $25/mo or $19/mo annual;
  courses incl. Muse AI, Gov List Millionaire, Pre-Foreclosure Millionaire, Land L1/L2, Dispositions,
  Contracts) and Wholesaling Real Estate (skool.com/wholesaling, Flip with Rick, ~83k members).
- Annual-only extras seen: a stronger purchase & sale agreement (automatic option/inspection and closing
  extensions, access/photo clauses, seller-breach protection, earnest money after inspection, land and
  novation language).
- Not yet extracted: Gov List Millionaire (68 modules), Pre-Foreclosure Millionaire (64), Luxury Land L2,
  the Muse training-pack PDFs (downloads need Gabriel's OK).
