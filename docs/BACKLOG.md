# Backlog

Work top to bottom per `AGENTS.md` §2. One item = one PR (split into ordered sub-PRs if large).
Status values: TODO · IN PROGRESS · DONE (PR link) · BLOCKED (issue link).
Mark the status here as part of each item's PR.

## Run log

(Newest first. Date — items done — items blocked — assumptions.)

---

## B-01 · Release the source-date proof (PR #205) · DONE ([PR #205](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/205))

Verification (2026-10-01): merge `098fdd5`, deployment succeeded, `/health` 200,
authenticated Dallas dashboard loaded and a lead card opened. Date summary: parsed 28,
ambiguous 29, unparsed 0, absent 299; rows leaving quarantine 0. Dallas CALL_READY 0,
MAIL_READY 5. Resolver-rule counts and the other requested queue-state counts were not
exposed in the read-only dashboard summary.

Goal: merge and deploy PR #205 (numeric sale-date order proof, raw-evidence-wins, origin tags).

Acceptance
- PR head is `90a0d20` (or later commits only from this item); rebase cleanly on `origin/main`.
- Full suite 0 failed.
- PR body summarizes: resolver rules, order-independent staleness, raw evidence wins, origin tags,
  `www.elliscountytx.gov` host; expected CALL_READY change = 0 (no phone routes yet).
- Merge, deploy, read-only verification: `/health` 200; a lead card opens; if the existing
  read-only date-normalization summary is exposed, record parsed / ambiguous / unparsed / absent and
  counts by resolver rule; record row-state distribution (LOCKED, MAIL_READY, NEEDS_CONTACT_SEARCH,
  NEEDS_SKIP_TRACE, CALL_READY). If a figure isn't exposed read-only, write "not exposed".

Known non-blocking follow-ups (do them in B-04): superseded-audit edge (N-A),
`source-evidence-adapter.js:319-329` origin collapse (N-B).

---

## B-02 · Safety cleanup: no auto-send flag, no invented buyers · DONE ([PR #207](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/207), [PR #208](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/208))

Verification (2026-10-01): final merge `c03ee9f`, Railway deployment succeeded,
`/health` 200, and read-only `/api/outreach/tone-status` returned
`auto_send: false`. The authenticated dashboard loaded Dallas rows and the
Buyers view showed 0 active buy boxes and 0 templates. No outreach or saved-data
mutation was performed. PR #208 corrected a pre-existing generic-route shadow
found during read-only verification of PR #207.

Goal: remove two legacy behaviors that contradict the safety invariants.

Acceptance
- `modules/outreach.js` `getAutoSendEnabled()` (~:80) always returns false (or is removed with its
  API fields returning `auto_send: false`). Nothing can send automatically. Test it.
- `modules/buybox.js` `generateMarketBuyBoxes()` (~:96) can no longer present invented investors as
  real buyers anywhere in the UI or API: remove it from live paths, or make every output explicitly
  labeled "Template — not a real buyer" and excluded from any matching. Trace every caller first.
- Tests prove no endpoint returns generated buyers as real.

---

## B-03 · Saved-leads HTTP 502 · BLOCKED ([issue #209](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/209))

Read-only check (2026-10-01): the reported 502 did not reproduce. GETs for
50 and 1,000 saved leads returned 200; Texas and National views loaded and
Dallas showed its empty state. No root cause was established, so no speculative
saved-data change was made. Issue #209 requests the original incident evidence
or a decision to close this stale report.

Goal: find and fix the 502 seen on the saved-leads view.

Acceptance
- Reproduce read-only (logs, a GET), identify the root cause, fix it, add a regression test.
- If the cause is data size/timeouts, paginate or stream; do not drop or alter stored leads.
- Verification: the saved-leads view loads after deploy.

---

## B-04 · Generic state rules + county source profiles · IN PROGRESS

Ordered sub-PRs: N-A supersession audit ([PR #210](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/210))
records only stored date and resolution fields that differ from current raw-source
derivation. N-B preserves the chosen source-date key and quarantines filing or
record-creation dates; state/county registries remain for later sub-PRs.

Goal: every state and county works through the same pipeline. Dallas and Ellis become profiles, not
special cases (D-013).

Acceptance
- A **state rules table** (data + citation string per rule), starting with TX, NC, MI:
  - disclosure status (TX non-disclosure; NC, MI disclosure);
  - foreclosure type and legal sale-day rule (TX: first Tuesday of the month, or first Wednesday when
    that Tuesday is Jan 1 or Jul 4 — Tex. Prop. Code 51.002(a));
  - post-sale rules: TX mortgage trustee sale — no redemption; TX tax sale — redemption 2 years
    (residence homestead or agricultural) or 180 days (other), counted from the purchaser's deed
    recording (Tex. Tax Code 34.21); TX HOA — 180-day redemption may apply (Tex. Prop. Code 209.011);
    MI and NC entries may be marked `unverified` with the architect's notes (MI: redemption usually
    6 months after a sheriff's sale; NC: 10-day upset-bid period) until verified from official sources;
  - Secretary of State business-search URL per state.
- A **county source profile registry**: allowlisted hosts, source kinds (trustee-sale notices, tax
  sales, code cases, parcels, recorded sales), parser options. Register Dallas, Ellis and the existing
  `modules/sources/tx-county-foreclosure-source-profiles.js` counties through it.
- The sale-date resolver's legal-sale-day rule is keyed by **state rule + source kind
  (trustee-sale notice) + profile host allowlist**, not by hard-coded adapter ids. Keep the current
  `CHAPTER_51_TRUSTEE_SALE_ADAPTERS` export as a derived compatibility view.
- Existing county-named modules keep working (wrap or re-export); no new county names in new code.
  User-facing text shows the county as data ("Dallas County notice"), never as a hard-coded label.
- **Behavior-equivalence test**: the existing Dallas/Ellis fixtures produce identical rows before and
  after (lifecycle, dates, resolutions, row state).
- **N-A**: `sale_date_resolution_superseded` records a list of `{field, old_value}` for every stored
  value that actually differed (`sale_date_iso`, `source_event_date`, stored resolution date/rules).
  A stored value equal to the current derivation is never listed. Test: raw `10/06/2026` (registered
  trustee-sale source, labelled) + matching resolution + stale `sale_date_iso 2026-10-13` → only
  `{field: "sale_date_iso", old_value: "2026-10-13"}`.
- **N-B**: `modules/research/source-evidence-adapter.js` (~:319-329) records which key it picked for
  `event_date`; `filed_date` and `created_at` are tagged as non-sale origins so the resolver never
  treats them as sale dates.

---

## B-05 · "After the sale" lane · TODO

Goal: passed-date foreclosure/tax notices are kept and classified, never discarded (D-009).

Verified facts: the county foreclosure-notice adapters currently reject proven-past notices as
`stale_sale_date` (acquisition adapter ~:483/:496/:635; notice adapter stale count ~:506/:520);
stored rows become lifecycle `SALE_PASSED` with no next step; `official-notice-dossier.js` extracts
`mortgagee_or_beneficiary` and `mortgage_servicer`; the Ellis parcel refresh returns owner, deed date,
instrument and record source date.

Acceptance
- Proven-past notices (resolved past, or every valid reading past) go to a `post_sale_candidates`
  output with `sale_outcome: OUTCOME_UNKNOWN` — never into `candidates`. Existing `stale_sale_date`
  counts and the existing stale-notice test assertions stay unchanged.
- Pure outcome classifier using the state rules table:
  - `POSTPONED_REPOSTED` — a newer official notice for the same property;
  - `STILL_OWNER_LIKELY` — an official owner-of-record whose record date is AFTER the sale date still
    shows the same owner and no deed after the sale (elapsed time alone is never evidence);
  - `REVERTED_TO_LENDER` — post-sale grantee matches the notice's mortgagee/beneficiary/servicer or a
    lender/agency list (Fannie Mae, Freddie Mac, HUD, VA; names with BANK, MORTGAGE, SERVICING, LOAN,
    TRUST COMPANY) kept in one constant;
  - `SOLD_TO_THIRD_PARTY` — a deed on/after the sale date to someone who is neither the old owner nor a
    lender match;
  - `TAX_REDEMPTION_PERIOD` (window computed only when the purchaser-deed recording date and homestead
    status are known; otherwise "redemption may apply — window not computed"),
    `HOA_REDEMPTION_POSSIBLE`;
  - `OUTCOME_UNKNOWN` — everything else, including conflicting evidence (list the conflict).
  Each result: plain reason, evidence list, next step, deal paths, `can_contact_original_owner`
  (true only for POSTPONED_REPOSTED and STILL_OWNER_LIKELY, and only if every existing contact gate
  also passes).
- Free checks, no new network calls: compare Ellis rows with the stored parcel refresh records; other
  counties get links to the county appraisal search and county clerk records search (from the county
  profile) with the borrower name, address and instrument shown to copy.
- Card action "Record what happened": trustee's deed found (grantee, recording date, instrument #,
  price if stated, source URL) / sale postponed (new date + source) / owner says they still own it
  (seller_stated) / bankruptcy filed / unknown — timestamped with who.
- `SOLD_TO_THIRD_PARTY` creates or updates a buyer record (name, mailing address if known, property,
  purchase date, price if stated, source) for B-09. No outreach. Never an inferred buyer.
- "After the sale" tab grouped by outcome with counts; plain-English cards; glossary entries: trustee's
  deed, REO (bank-owned), postponed sale, right of redemption, excess proceeds (informational only:
  "Recovering surplus is regulated — get advice before offering this service.").
- REO card next step: "Watch for the listing" with links to HUD Home Store, Fannie Mae HomePath,
  Freddie Mac HomeSteps and the existing address links, plus "Banks usually don't allow assigning the
  contract — plan a double close."
- Tests: each outcome; same owner but record dated before the sale → OUTCOME_UNKNOWN; conflicting
  evidence → OUTCOME_UNKNOWN; tax window examples (deed recorded 2026-04-01: homestead → ends
  2028-04-01; non-homestead → ended 2026-09-28); zero network from the classifier.

---

## B-06 · Comp search links, find-the-owner links, possible numbers · TODO

Goal: every card has one-click comp searches and phone searches, and VAs can record possible numbers
(D-006). Pure URL building — the server never fetches these sites.

Acceptance
- **Comps to check** (built from the verified subject: ZIP, property type, beds, baths, living area;
  filters beds ±1, baths ≥ subject−1, living area ±20%, sold last 12 months):
  - Redfin: `https://www.redfin.com/zipcode/<zip>/filter/property-type=house,min-beds=..,max-beds=..,min-baths=..,min-sqft=<v>-sqft,max-sqft=<v>-sqft,include=sold-1yr`
    with sq ft snapped OUTWARD to Redfin's option values (one constant), plus a fallback
    `.../filter/property-type=house,include=sold-1yr`;
  - Realtor.com: `https://www.realtor.com/realestateandhomes-search/<zip>/type-single-family-home/beds-<min>-<max>/baths-<min>/sqft-<min>-<max>/show-recently-sold`;
  - Zillow: `https://www.zillow.com/homes/recently_sold/<zip>_rb/`.
  One plain caption per link ("Sold in the last 12 months · 2–4 beds · 1+ bath · 1,100–1,650 sq ft ·
  ZIP 75119"); missing facts → wider search, caption says so. Every URL format in one constant.
  `link_kind: comp_search`. Shown in every market.
- **Find the owner's phone** (person owners only): TruePeopleSearch name
  `https://www.truepeoplesearch.com/results?name=<First Last>&citystatezip=<City, ST>` and address
  `https://www.truepeoplesearch.com/resultaddress?streetaddress=<street>&citystatezip=<City, ST ZIP>`;
  FastPeopleSearch address `https://www.fastpeoplesearch.com/address/<street-dashed>_<city-st-zip-dashed>`;
  keep existing CyberBackgroundChecks links; also the mailing address when it differs. Owner parsing:
  "WITTE JACOB & ADRIANA" → "Jacob Witte"; unsure → address search only, never guess a name. Company
  owners → "Owner is a company — look up who runs it" with the state's Secretary of State link (state
  rules table). `link_kind: people_search`.
- **Possible numbers** on the card: add a number + where it came from (people-search page, skip trace,
  screenshot, seller call, other URL) → stored with source_kind, source_url, entered_by, entered_at;
  labeled "Possible number — not confirmed"; buttons Right person / Wrong person / Disconnected /
  Do not call (each timestamped with who). A sourced possible number makes the row CALL_READY with
  reason "Possible number from <source> — confirm on the call." Rejected numbers never count; only
  rejected numbers → back to NEEDS_CONTACT_SEARCH. Show "Do Not Call registry: not checked" until a
  check is recorded.
- The wrong-address link audit never counts `comp_search` or `people_search` links as mismatches.
- Layout: three collapsed sections ("Comps to check", "Find the owner's phone", "Possible numbers").
- Tests: exact URL strings for a fixture (3 bed / 2 bath / 1,374 sq ft / ZIP 75119); missing facts;
  no links without a verified subject address; name parsing cases; possible-number gate cases;
  zero server-side requests to those hosts (static check + spy).
- Post-deploy acceptance: Gabriel's first click on one Redfin, one Realtor.com and one TruePeopleSearch
  link from a real card. If a format is wrong, fix the constant in a follow-up PR.

---

## B-07 · Charlotte automatic comps (Mecklenburg County, NC) · TODO

Goal: the first market where comps work by themselves (D-002).

Verified facts: Mecklenburg "Tax Parcels with CAMA Data" reportedly carries bedrooms, fullbaths,
halfbaths, heatedarea, yearbuilt, price, dateofsale, cdebuildin, bldggrade (field names seen in a
third-party analysis of the county file; the county server itself was not reachable from the
architect's fetcher). `modules/research/disclosure-state-comp-resolution.js` is already a generic,
profile-driven public-sales comp engine — reuse it, do not write a new one. After B-04, NC reaches the
public lane through the state rules table.

Acceptance
- Discovery: find the official public Mecklenburg parcel+CAMA source (maps.mecknc.gov / gis.mecknc.gov
  Open Mapping); record URL, access type, confirmed field names, record count, last update. Public,
  token-free, no login, no Authorization header. Prefer a REST query service.
  STOP trigger if access needs a data-request form/USB or a bulk file needing a new dependency — then
  record Wake County's public extracts (`https://services.wake.gov/realdata_extracts/`, incl.
  `Qualified_Sales_Past_24Months.xlsx`) columns in the issue.
- One Mecklenburg profile (disclosure state) with the verified field map incl. living_area, bedrooms,
  bathrooms (full + 0.5 × half), sale price, sale date; subject facts with official_public_record
  provenance.
- Comps through the existing engine and the unchanged grid; exclude $0/nominal and multi-parcel sales;
  require a qualified sale if the county publishes a qualification code, otherwise label each comp
  "county did not mark this as an arm's-length sale". ≤1 request/second; stop on 401/403/429.
- 2 verified comps → preliminary ARV (labeled), 3 → verified ARV (D-005).
- First Charlotte leads: 10 single-family parcels, each in a different ZIP, owner mailing address ≠
  property address AND last recorded sale ≥15 years ago; run facts + comps; surface through the
  existing ingestion path labeled "Mecklenburg county records — equity list (no distress signal yet)".
  One bounded live run: ≤10 subjects, ≤60 county requests (this live run is authorized).
- Report in the PR: the 10 properties with comps (address, sale date, price, sq ft, beds/baths,
  distance) and value ranges.

---

## B-08 · One offer calculator, equity band, typical-rate clue · TODO

Goal: a single, honest source for offers (D-015), plus sorting signals (D-011, D-010).

Acceptance
- One module computes MAO = ARV × band% − repairs − fee, with the band table (70% under $120k ARV;
  course chart up to 80–83% above — one constant), repairs $20/sq ft light to $50/sq ft heavy until
  condition is known (labeled estimate), fee as an input. Outputs a range, labeled preliminary /
  verified / ballpark to match the ARV label. No ARV → no MAO.
- Trace every existing `arv * 0.7`-style computation (e.g. `modules/agents/comp-agent.js`,
  `modules/datasources.js`, `server.js`, `modules/research/comp-research-provider.js`,
  `modules/research/ai-deal-analyzer-jobs.js`, county comp intelligence agents) and route each through
  the calculator or remove it from live paths. No card shows an MAO that didn't come from real comps.
- MAO never appears in VA materials (D-014).
- **Equity band** (sort only): only where the actual loan is known (loan date + original amount from
  the notice/deed of trust); estimated balance by standard 30-year amortization at the typical rate for
  that year; value from verified/preliminary ARV, else the county appraised value **for sorting only**.
  Bands High ≥40% / Medium 20–40% / Low <20% / Unknown. Never a dollar figure on a card, never an
  offer input. Second loans may exist → band, not number. Priority ranking uses it to refine order.
- **Typical-rate clue**: annual average 30-year fixed rates from Freddie Mac PMMS (one constant with the
  source URL); card text "Loan from <month year>, when average rates were about <x>%. Ask the seller."
- Tests for each label path, missing-data paths, and that no legacy MAO reaches a card.

---

## B-09 · Buyers from public records · TODO

Goal: a real buyers list from county sales data, no invented buyers.

Acceptance
- In disclosure counties with sales data (Mecklenburg, Wayne), rank recent buyers: purchases in the
  last 12 months, at or below the area median value, built ≤2010, single-family; signals = number of
  purchases, recency, consistency, company/LLC or repeat buyer, mailing ≠ property. Exclude large
  institutions/iBuyers (one constant list). Per buyer: total purchases, most recent, favorite areas,
  average price — all from records with sources.
- Add third-party auction buyers from B-05.
- Buyers tab: ranked list, filter by area and price; "buyers within a mile of this deal" on a lead card.
- No contact actions in this item. No buyer without a sourced purchase record.

---

## B-10 · CRM timeline, lead clocks, tap-to-send texting · TODO

Goal: D-008 and D-007.

Acceptance
- Append-only activity log per lead: created/acquired, opened, closed, reopened, status changes, calls
  (outcome), texts, notes, possible-number actions — each with timestamp and actor (Gabriel or VA name).
  Never edited in place; corrections are new entries.
- Lead clocks on the card: acquired date, sale/event date, days until sale, stale date, last touch.
- Operator/VA identity: a simple actor selector or login so every entry has a name.
- Texting: Gabriel selects up to 20 leads with a contactable number; the app prepares personalized,
  human-sounding messages (templates; no AI sending) and shows tap-to-send links (`sms:` with the
  prefilled body) for the operator's phone; each tap is logged. No automated sending, no texting to
  numbers marked Do not call or Wrong person.
- Tests: log immutability, actor required, 20-cap, blocked numbers excluded.

---

## B-11 · Local helper: batch comp and phone capture in the operator's browser · TODO

Goal: "try it first" (D-006) without the server touching listing or people-search sites.

Acceptance
- Extend the local helper (`scripts/wos-local-helper.js`, `scripts/wos-local-comp-agent.js`; modes
  today: `sold_comps`, `subject_facts`) with a batch queue of up to 20 leads: for each lead it opens the
  B-06 comp-search link and reads the sold results the operator is looking at, then the people-search
  link and reads displayed numbers.
- Everything is a proposal: comps go through the strict grid; numbers become possible numbers with the
  page URL as source. The operator confirms with one click.
- Human pace; if a page shows a CAPTCHA or login, pause and let the operator handle it — never solve it.
- 2 confirmed comps → preliminary value; 3 → verified.
- Tests with saved HTML fixtures; no server-side fetch.

---

## B-12 · Detroit (Wayne County, MI) ballpark comps · TODO

Goal: D-003.

Verified facts: `modules/sources/public-parcel-api-profiles.js` has Detroit `Parcels_Current`
(total_floor_area, year_built, total_acreage, homestead_pre, taxpayer mailing, sale_price, sale_date)
and `assessor_property_sales_view` (sale price, date, term_of_sale, sale_verification, lat/long).
No bedrooms/bathrooms published.

Acceptance
- Ballpark comps match on living area ±20%, year, lot, distance, recency, property class; arm's-length
  only (term_of_sale / verification); labeled "Ballpark — bedrooms/baths not confirmed". Screenshot or
  call upgrades to verified when beds/baths are confirmed on both sides.
- Ballpark MAO via B-08, labeled ballpark.
- Verify the existing Detroit lead sources still work (Wayne tax foreclosure, blight violations, land
  bank); record status of each; fix or mark blocked.

---

## B-13 · Build cost: Chromium installed twice · TODO

Goal: the Docker build installs Chromium once.

Verified facts: `Dockerfile` runs `npx playwright install chromium --with-deps`; `package.json`
`postinstall` runs it again.

Acceptance
- Remove the duplicate without breaking local installs (e.g. skip postinstall in the container via an
  env flag). Deploy succeeds; the helper's Chromium path still resolves.

---

## B-14 · VA call script in the app · TODO

Goal: the script lives next to the card fields it fills (D-014: no MAO, spreads, buy boxes, title).

Script (render as a panel; each answer fills the matching card field):
- Opener: "Hi, is this [first name]? This is [VA]. I'm calling about the house on [street]. Is that
  still yours?… We buy houses in [city] as-is. Would you consider an offer if the numbers made sense?"
- 1 "Is anyone living there right now — you, family, or a tenant?" → occupancy
- 2 "What's got you thinking about selling?" → motivation
- 3 "If we made this work, when would you want to be done — weeks or months?" → timeline
- 4 "How's the house holding up? Roof, AC, plumbing, kitchen, anything big?" → condition
- 5 "I have it as [beds] bed, [baths] bath, about [sq ft]. Is that right?" → facts check (seller_stated)
- 6 "Is there a mortgage on it?" → "Roughly what's left?" → "Monthly payment?" → "Do you remember the
  interest rate?" → "Are payments current, or a few behind?" → loan fields (seller_stated)
- 7 "Anything else on it — back taxes, a second loan?" → liens (seller_stated)
- 8 "What would you need to walk away with for this to be worth it?" → asking price
- 9 "What does life look like for you after the sale?" → need
- Close: "I'll run the numbers with my team and call you back [day]. Is this the best number? Is there
  an email I can send it to?" → callback date, email
- Objections: "How'd you get my number?" → "From public property records. If you'd rather not hear from
  us, I'll take you off right now." (→ Do not call) · "Just make me an offer." → "I will — two minutes
  so it's a real number, not a lowball." · "Not interested." → "No problem — mind if I check back in a
  few months?"
- Rules shown to the VA: never name a price; hand to Gabriel when they name a price, ask for an offer,
  have a sale date within 30 days, or say they owe more than it's worth; never state a value you don't
  believe; never claim a lender you don't have.

Acceptance: panel on the card; answers save with provenance `seller_stated`, actor and time (B-10 log).

---

## B-15 · Front-end pass · TODO

Goal: professional, uncluttered, plain-English UI (D-017).

Acceptance
- Card top: three lines (Priority, Best fit, Next step); collapsible sections below.
- Tabs: Leads, After the sale, Buyers (Title later).
- Mobile width works; no horizontal scroll; no internal field names visible.
- Map with color-coded deal quality is a separate follow-up item (add it to this backlog when done).
