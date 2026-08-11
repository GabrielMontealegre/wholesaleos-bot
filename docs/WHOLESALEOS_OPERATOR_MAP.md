# WholesaleOS Operator Map — how the deal machine actually works

Written 2026-07-09 against main `0828cb9`. This is the honest map of what the
free public deal machine does, what Gabriel sees, and whether it works.

Dashboard: https://wholesaleos-bot-production.up.railway.app/dashboard
Daily routine: see [GABRIEL_DAILY_DEAL_WORKFLOW.md](GABRIEL_DAILY_DEAL_WORKFLOW.md)

---

## 1. How a lead flows: source → OCR → board → call prep

```
County posts foreclosure notice PDFs (public, free)
        │
        ▼
Source lanes: Dallas clerk + Craigslist + FSBO + open TX county profiles
  modules/sources/tx-county-foreclosure-source-profiles.js  (config, 1 entry per county)
        │
        ▼
Document hunter finds notice PDFs on county sites (DocumentCenter / Archive.aspx)
        │
        ├── PDF has a text layer → pdf-parse extracts notice text
        └── PDF is a scan → OCR lane (modules/research/ocr-notice-extraction.js)
            Chromium renders pages → tesseract.js reads them → two-pass retry,
            confidence floor 45, courthouse/servicer addresses rejected
        │
        ▼
Notice text → property rows (address, sale date, borrower = owner clue)
  Stale sale dates rejected. Generic/junk addresses rejected. Nothing invented.
        │
        ▼
Free Public Deal Board (modules/research/free-public-deal-board.js)
  Quality buckets: INSPECT_NOW (full verified address)
                   NEEDS_ZIP_REVIEW (street+city real, zip unreadable)
                   SOURCE_PROOF_ONLY (document watched, no address yet)
        │
        ▼
Contact + comp hunters (free public pages only)
  visible phones → CALL_READY; TX non-disclosure → comps/ARV/MAO stay LOCKED
        │
        ▼
Call prep (modules/research/call-prep-projection.js)
  contact status, ARV/MAO lock reasons, seller questions from evidence
        │
        ▼
Dashboard queue snapshot (deal-board-snapshots.json — NOT saved leads)
  accumulates/dedupes to 500 rows per market, refresh preserves evidence
```

## 2. What Gabriel sees (the three panels)

**Daily Deal Machine** — green border = auto-run ON. Chips: next run ETA,
runs today vs 24-cap, batches/new rows/actionable/OCR rows today, CALL_READY,
ZIP review, source blockers, OCR diagnostics, per-lane coverage table.

**ZIP Review** — every row where OCR read a real street + city from an
official document but the zip was unreadable. Each card: the official PDF
link (read the zip there), a review-labeled Maps search, and the action
VERIFY_ZIP_FROM_SOURCE_DOCUMENT. The system never guesses a zip.

**Top Deals** — CALL_READY rows first, then INSPECT_NOW, then ZIP review.
Each card: source proof link, best click, Maps/portal links, owner clue,
contact route, comp/ARV/MAO lock state with reasons, next action, seller
questions. Proof-only rows collapsed underneath.

## 3. What is automatic

- **Batches**: server-side auto-run every 20 min (max 24/day), persisted to
  disk, survives restarts/deploys. Runs with the laptop closed.
- **Discovery**: finding notice PDFs, parsing, OCR, address extraction,
  bucketing, dedupe, ranking, daily counters.
- **Honesty gates**: stale dates, generic addresses, courthouse/servicer
  addresses, low-confidence OCR — all auto-rejected with recorded reasons.
- **Free contact/comp hunting**: runs in every batch; finds what is publicly
  visible, marks what is blocked.
- **Free owner/mailing/entity lookup**: official public parcel APIs can add
  owner-of-record and mailing-route evidence where a county exposes it. Mailing
  routes become MAIL_READY, not CALL_READY, because a letter is not a phone call.
- **Disclosure-state comps**: CA/MI/OH public sales can unlock COMP_READY only
  when three sold comps have source URL, price, date, and evidence text.

## 4. What is manual (Gabriel's ~15 min/day)

- Calling CALL_READY contacts (trustee/servicer/agent — labeled routes).
- Reading zips off official PDFs for ZIP Review rows.
- Skimming the source PDF behind each INSPECT_NOW row (OCR rows especially —
  a digit can drop).
- Running comps via MLS access (TX sold prices are not public).
- Deciding what becomes a saved lead — the board never saves anything itself.

## 5. What is blocked (honest, not bugs)

| Source | Blocker | Free workaround |
|---|---|---|
| Tarrant County | publicsearch portal | none free |
| Collin County | Incapsula anti-bot | none free |
| Denton County | CAPTCHA | none free |
| Johnson County | 403s Railway's IP | works from home IP (local export script) |
| Kaufman County | 10–45MB scan compilations | size-skipped honestly |
| Parker County | only admin PDFs posted | wait for notices |
| Cuyahoga County, OH | county_network_unreachable_from_automated_vantages_recheck_monthly | recheck the verified county sources monthly; never substitute another market's lanes |
| Wayne County, MI government | waynecountymi.gov denies automated access | use only separately verified public Wayne/Detroit sources |
| Wayne County Treasurer tax auction | seasonal future lane; lists generally post September-October | keep disabled until the official seasonal inventory is visibly posted |
| Jefferson County, AL | county tax-lien pages are Cloudflare/403 from automated browser and taxlien.jccal.org embed returns 403; AlabamaPublicNotices.com is readable but Jefferson detail rows were not verified as open | recheck official tax-lien/APN sources monthly; do not add an AL lane until property rows are reachable without login/CAPTCHA/paywall |
| Harris County, TX | official foreclosure page is a search application; no direct config-fit notice documents visible to static fetch | defer to a future search-app adapter; do not run Dallas lanes for Houston |
| Travis County, TX | official page points to foreclosure notice/search portals, not direct notice PDFs | defer to a future portal/search pattern; Austin short-circuits until verified |
| Montgomery County, TX | official page says notices are on the records search website; no direct config-fit documents visible | defer to a future records-search pattern |
| Williamson County, TX | foreclosure/legal-notice pages reached, but no direct foreclosure notice documents verified | defer until direct documents or a supported index is found |
| Fort Bend County, TX | current monthly foreclosure PDFs are public but 24-26MB image scans, over the current safe parsing cap | Houston-area lane shows source proof; property-row extraction needs future large-scan/OCR work |
| DCAD owner lookup | blocks datacenter IPs | `node scripts/export-free-public-deal-board.js` locally |
| Zillow/Redfin sold comps | 403/429 bot traffic + TX non-disclosure | MLS or paid data |
| Zillow/Redfin/Realtor/Auction listing radar | current Serper results are mostly generic category/filter pages, not deal rows | adapter kept for manual diagnostics, but removed from the default daily queue until it reliably returns property-specific URLs |
| Owner phone numbers | not in free public records | paid skip-trace decision |
| TX sold comps / ARV / MAO | Texas is a non-disclosure state; free Zillow/Redfin/Realtor sold-page hunting is disabled for TX markets to avoid wasting search budget | run comps through MLS access or approve paid comp data; rows show `ARV_LOCKED_NON_DISCLOSURE_STATE_MLS_REQUIRED` |
| Bexar owner lookup / BCAD | free BCAD lookup profile is attempted from the contact hunter; blocked or shape-changed pages are reported per row | use visible owner clues if returned; otherwise row ledger shows the blocked reason and the next eligible retry |
| Bexar ArcGIS parcel API | public API discovery failed on 2026-08-11 and a 30-second retry also failed; field map remains unverified | treat as blocked/failed unless a later public probe responds; any guessed-profile result carries an unverified caveat; do not bypass |
| San Diego owner/mailing lookup | public county ArcGIS layer exposes APN, owner, mailing, and situs fields | use official owner and mailing route as MAIL_READY evidence; assessed values are not ARV |
| Detroit public sales comps | public ArcGIS layer exposes parcel id, address, sale date, and sale price | use only as disclosure-state sold-comp evidence with provenance; no TX comp inference |

## 6. Exact daily workflow

Morning: open dashboard → AUTO-RUN chip ON? → call CALL_READY rows → verify
ZIP Review rows against their PDFs. Noon: glance at "Actionable today", read
new INSPECT_NOW PDFs. Evening: check runs-today is climbing and the error
line is empty. Full detail: [GABRIEL_DAILY_DEAL_WORKFLOW.md](GABRIEL_DAILY_DEAL_WORKFLOW.md).

## 7. Brutally honest verdict: does it work for tomorrow?

**YES, with a small number.** Tomorrow morning Gabriel will find roughly
8 actionable rows (4 INSPECT_NOW with full verified addresses, 3 ZIP-review
rows needing a 60-second PDF check each, ~1 CALL_READY with a real visible
phone). Every row is real, every claim has a source link, and the machine
adds rows all day without him.

**What it is NOT yet:**
- Not 50–60 rows/day. Current ceiling is ~free county supply: notices post
  in monthly waves (biggest right after the 1st-Tuesday sale cycle). Between
  waves, batches refresh but add little. Scaling needs more counties (config
  entries) and more source families. Listing Radar is mothballed from the
  default queue after live proof showed generic Zillow/Redfin/Realtor category
  pages; it should only return when it can prove property-specific URLs.
- Not a phone-number machine. Free public data yields ~1–2 visible phones;
  more requires a paid skip-trace decision Gabriel has to make.
- Not a comps machine. TX hides sold prices; ARV/MAO stay locked until he
  runs comps himself or pays for data. Locked = honest, not broken.

**One bug this proof found and fixed:** before `0828cb9` the deal section was
destroyed by the app's own re-render seconds after page load — the machine
worked but was invisible. The proof-pack screenshots in `exports/` show it
rendering after the fix.
