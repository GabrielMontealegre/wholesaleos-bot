# Codex Handoff — 2026-07-09 (main `5454996`)

Written by Fable 5 (outgoing CTO session) so Codex can continue with zero
back-and-forth. Read this top to bottom before touching anything. Companion
docs: [WHOLESALEOS_OPERATOR_MAP.md](WHOLESALEOS_OPERATOR_MAP.md) (system flow),
[FREE_SOURCE_TOOLING_AUDIT.md](FREE_SOURCE_TOOLING_AUDIT.md) (tool decisions),
[GABRIEL_DAILY_DEAL_WORKFLOW.md](GABRIEL_DAILY_DEAL_WORKFLOW.md) (operator view).

---

## 1. Current system state

- **main `5454996`**, tree clean, deployed on Railway (auto-deploys from main).
  Production: https://wholesaleos-bot-production.up.railway.app
- Dashboard → "Best Public Deals" section renders three panels (Daily Deal
  Machine / ZIP Review / Top Deals) from `dashboard/wos-public-deals.js`,
  backed by snapshot store `deal-board-snapshots.json` (a cache, NOT saved leads).
- **Auto-run is ON in production**: server-side scheduler, Dallas market,
  every 20 min, 24/day cap, persists to `deal-board-auto-run.json`, restores
  on boot. Batches run as background jobs (`deal-board-jobs.json`, POST run →
  job_id, GET `/job/:id`) because Railway's edge times out at ~180s.
- Queue: 67 rows, 10 actionable (7 INSPECT_NOW, 2 CALL_READY, 3 NEEDS_ZIP_REVIEW).
- Census ZIP resolver live: promoted all 3 OCR partials to full INSPECT_NOW
  addresses (75165 Waxahachie, 75119 Ennis, 75032 Rockwall).
- Visual proof: `exports/proof-2026-07-09/` (8 screenshots, git-ignored).
- Admin API auth: header `x-user-id: admin` (seeded admin user, db.js ~line 1868).
  Dashboard PIN unlock for Playwright proofs: `localStorage.wos_pin = '1234'`.
- Dev environment quirk: `node` is not on PATH on Gabriel's machine — use
  `C:\Users\criss\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe`.
  No `gh` CLI: release = merge branch to main locally, push branch + main.

## 2. What works (verified in production, not assumed)

- 11 source lanes: Dallas clerk PDFs + Craigslist + FSBO + 8 county profiles
  (all generated from `modules/sources/tx-county-foreclosure-source-profiles.js`;
  adding a county = one config entry).
- PDF text extraction (pdf-parse) and two-pass OCR for scanned notices
  (`modules/research/ocr-notice-extraction.js`: Chromium render → tesseract.js,
  confidence floor 45, courthouse/servicer addresses rejected).
- Quality buckets with honesty gates: INSPECT_NOW / NEEDS_ZIP_REVIEW /
  SOURCE_PROOF_ONLY / NEEDS_IDENTITY / REJECTED_GENERIC.
- US Census geocoder zip resolution (`modules/research/census-zip-resolution.js`):
  free federal API, echo-validation of street number + city (document-first) +
  state; provenance flags `ZIP_FROM_US_CENSUS_GEOCODER` / `ZIP_SUGGESTED_BY_US_CENSUS_GEOCODER`.
- Free contact/comp hunters, call-prep projection (seller questions, lock states).
- Dashboard section survives the app's `#content.innerHTML` rewrites
  (MutationObserver + cached snapshot re-mount — see Decision log #4).

## 3. What is still broken / weak

1. **Superseded ZIP-review cards linger** — after census promotion, the old
   `proof|`-keyed NEEDS_ZIP_REVIEW rows sit beside their promoted `addr|`-keyed
   twins. They no longer refresh (their fresh deal now dedupes to the addr key),
   so they never show the census suggestion either. Cosmetic but wastes
   operator time. Small fix, queued AFTER the task in §6.
2. **CALL_READY ceiling (~2)** — free public data rarely shows owner phones.
   Unlockable only by a paid skip-trace decision that belongs to Gabriel.
3. **Comps/ARV/MAO locked** — TX is a non-disclosure state; Zillow/Redfin sold
   pages 403 bots. Locked = honest. Do not fake.
4. **Blocked counties** — Tarrant (portal), Collin (Incapsula), Denton
   (captcha), Johnson (403s Railway IP; works from residential IP via
   `scripts/export-free-public-deal-board.js`), Kaufman (45MB scans), Parker
   (no notices posted). These are source-side facts, not bugs.
5. **Volume is county-supply-bound** — notices post in monthly waves around
   the 1st-Tuesday foreclosure cycle. Between waves, batches refresh but add
   little. Auto-run exists precisely to catch the next wave.

## 4. Decision log (why things are the way they are)

1. **Snapshot cache, never saved leads** — the deal board must be consequence-free
   to run all day; ingestion into the lead pipeline is a human decision.
2. **Background jobs for batches** — Railway kills edge requests at ~180s; an
   11-lane batch with OCR takes ~2.5 min. Job pattern removed the timeout class
   of failures entirely.
3. **Server-side auto-run (not browser timer)** — Gabriel closes the laptop;
   the machine must not depend on an open tab. Disk-persisted so deploys don't
   silently turn it off.
4. **MutationObserver re-mount for the dashboard section** — the legacy app
   rewrites `#content.innerHTML` on every render (index.html ~line 765) and
   destroyed the injected section seconds after boot. Rejected alternatives:
   moving the section outside `#content` (breaks the app's flex layout) or
   patching the app's render (20k-line file, high regression risk).
5. **NEEDS_ZIP_REVIEW as a first-class bucket** — OCR often reads street+city
   but not zip. Faking a zip is forbidden; hiding the row wastes a real lead.
   The bucket + review links give the operator a 60-second verification path.
6. **US Census geocoder over Zillow Radar for the last source sprint** —
   Zillow/Redfin 403 automated page opens, so radar rows would be link-only;
   census resolution converted existing real rows into callable full addresses
   (INSPECT_NOW 4→7 same day). Federal TIGER data with echo-validation is
   verification, not fabrication.
7. **Reusable county profiles as config** — scaling to "every US county"
   cannot mean one adapter per county. One profile entry generates the lane,
   catalog, and coverage row.
8. **Preview-service whitelist gotcha (cost us a prod deploy)** — 
  `free-public-deal-board-preview-service.js` explicitly whitelists input
  fields. Any new board flag MUST be added there or it silently no-ops in
  production while working in unit tests.

## 5. Architecture boundaries Codex must preserve

- **Snapshot stores only**: `deal-board-snapshots.json`, `deal-board-jobs.json`,
  `deal-board-auto-run.json`. NEVER write to saved leads (`db.json` leads),
  Analyzer, Dossiers, or Pipeline from board code. Board results carry
  `preview_only: true`, `not_a_saved_lead: true` — keep them.
- **Honesty invariants**: no fake address/date/owner/contact/comps/ARV/MAO/zip.
  Missing data = explicit flag + next action, never a guess. OCR rows keep
  `OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED`. `maps_url` stays null without a
  verified zip (only `maps_search_url_review_needed`).
- **Free-first**: no paid APIs. Serper within existing caps. Playwright on
  public open pages only. No login/CAPTCHA/paywall/WAF bypass, no stealth or
  fingerprint tooling.
- **No legacy agents**: `comp-agent` / `skip-trace-agent` must never load
  (tests enforce this via Module._load traps).
- **Admin-gated routes**: every board route uses `requireAdmin`.
- **Injectable deps for tests**: every network-touching step takes an
  `*_impl` option (see `census_zip_resolver_impl`, `free_contact_hunter_impl`).
  Tests stay hermetic — no live network in tests, ever.
- **Dashboard addon pattern**: the section is self-contained in
  `dashboard/wos-public-deals.js`, injected via one script tag, must survive
  `#content` wipes, and cache-busts via the `?v=N` query in index.html.

## 6. Exact next highest-ROI task (ONE task only)

**Build the Serper Listing Radar lane** — a 12th queue lane that finds
property-specific distressed listings via Serper search (already-integrated
provider, within caps) and adds them as honest rows with source coverage.

Spec:
- New module `modules/sources/listing-radar-acquisition-adapter.js` (follow the
  shape of `dallas-fsbo-contact-acquisition-adapter.js`).
- Queries: Dallas/DFW + terms `as-is`, `fixer`, `needs TLC`, `cash only`,
  `foreclosure`, `auction`, `price cut`, `by owner` — capped total queries per
  batch (respect existing Serper cap plumbing in `search-provider-worker.js`).
- Accept ONLY property-specific URL patterns:
  Zillow `/homedetails/`, Redfin `/home/`, Realtor
  `/realestateandhomes-detail/`, auction/realauction detail pages.
  Reject search/category/login/paywall URLs.
- Try opening accepted pages with the existing Playwright runtime; extract
  ONLY visibly rendered facts (price, beds/baths, listing status, agent name
  if shown). If blocked (403/429/captcha wall), keep the row as link-only with
  status `BLOCKED_PUBLIC_SOURCE` and the blocked reason in `blocked_sources`.
- Address handling: a listing URL slug often contains the full address
  (e.g. `/homedetails/123-Main-St-Dallas-TX-75208/`); parse it from the slug,
  mark provenance `ADDRESS_FROM_LISTING_URL_SLUG`, and do NOT invent anything
  the slug/page doesn't show.
- Wire as a lane: add to `DEFAULT_QUEUE_SOURCE_IDS` in
  `deal-board-queue-service.js` and the source catalog so coverage reports
  `source lane / rows found / blocked reasons / next action` like every other lane.
- Bucketing: rows with slug-complete address + property-specific URL flow
  through existing `qualityForDeal` (INSPECT_NOW requires status evidence —
  listing status text counts); link-only blocked rows land in
  SOURCE_PROOF_ONLY with the blocked flag. No new buckets.

## 7. Exact files likely touched

| File | Change |
|---|---|
| `modules/sources/listing-radar-acquisition-adapter.js` | NEW — the lane |
| `modules/sources/source-catalog.js` | register the lane |
| `modules/research/deal-board-queue-service.js` | add lane id to `DEFAULT_QUEUE_SOURCE_IDS` |
| `modules/research/free-public-deal-board.js` | only if URL-pattern acceptance needs a helper; prefer reusing `sourceEvidenceAdapter.classifySourceUrl` |
| `modules/research/free-public-deal-board-preview-service.js` | ONLY if a new flag is added — remember the whitelist (Decision log #8) |
| `tests/listing-radar-acquisition-adapter.test.js` | NEW |
| `tests/dashboard-public-deal-queue.test.js` | lane count / coverage assertions if they pin the lane list |
| `dashboard/wos-public-deals.js` + `dashboard/index.html` | only if a UI hint is added; bump `?v=N` on any change |

## 8. Acceptance criteria

1. A production batch (background job) reports the new lane in
   `batch.source_coverage` with an honest status (`available`,
   `no_candidates`, or blocked reason). Zero fake fields.
2. At least the URL-slug addresses appear as rows with
   `ADDRESS_FROM_LISTING_URL_SLUG` provenance; blocked pages appear as
   link-only rows flagged `BLOCKED_PUBLIC_SOURCE` — never dropped silently.
3. Serper usage stays within existing caps (assert the per-batch query cap in
   tests).
4. Queue counts and the three dashboard panels render the new rows without
   layout or bucket regressions.
5. All existing tests still pass; `git diff --check` clean.
6. Verified in prod after deploy by reading `/api/dashboard/free-public-deal-board/latest`
   (header `x-user-id: admin`) — not just locally.

## 9. Tests required

- `tests/listing-radar-acquisition-adapter.test.js`: URL acceptance matrix
  (accept homedetails/home/detail patterns; reject search/category/login/paywall),
  slug→address parsing incl. malformed slugs, blocked-page path produces
  BLOCKED_PUBLIC_SOURCE (mock fetch/Playwright impls — hermetic), Serper query
  cap respected, no fake fields on any output row.
- Extend `tests/free-public-deal-board.test.js`: radar rows bucket correctly;
  a slug-address row with listing-status text reaches INSPECT_NOW; a blocked
  link-only row stays SOURCE_PROOF_ONLY.
- Re-run and keep green: `dashboard-public-deal-queue`, `census-zip-resolution`,
  `server-free-public-deal-board-preview`, `screenshot-comp-evidence`,
  `tx-county-foreclosure-adapter`, `export-free-public-deal-board`.
- Date-rot warning: some fixtures compute sale dates relative to "today" on
  purpose — if an unrelated test fails, check the calendar before blaming code.

## 10. Risks and rollback

- **Risk: Zillow/Redfin block everything** → expected; the lane still yields
  slug addresses + honest blocked rows. Do not add stealth tooling to "fix" it.
- **Risk: Serper cap burn** → hard-cap queries per batch in the adapter, not
  just in config; assert in tests.
- **Risk: junk generic URLs flood the queue** → the acceptance regexes are the
  gate; REJECTED_GENERIC handles leaks; watch `rejected_generic_count`.
- **Rollback**: every release is a merge commit on main; revert the single
  merge commit and push — Railway redeploys previous behavior. The lane is
  also disable-able by removing its id from `DEFAULT_QUEUE_SOURCE_IDS`
  (one-line change). Snapshot store is additive-only; no migration to undo.
- **Deploy verification pattern**: after push, poll a changed static asset or
  run one batch and read `/latest`; auto-run state survives deploys (disk).

## 11. What Codex must NOT build

- No paid APIs (skip trace, comps, MLS, proxies) — that is Gabriel's decision.
- No anti-bot/stealth/captcha/login/paywall bypass of any kind (no crawlee
  fingerprinting, no residential proxy rotation, no cookie replay).
- No writes to saved leads/Analyzer/Dossier/Pipeline from board code.
- No legacy `comp-agent`/`skip-trace-agent` imports.
- No new quality buckets, no fake/estimated ARV/MAO/comps/zips.
- No giant deps (libpostal, crawlee); the audit doc already rejected them.
- No rewrite of the 20k-line dashboard app; addon pattern only.
- Do not touch Railway settings manually; deploys happen via push to main.

## 12. Final Codex build prompt (copy-paste)

> You are continuing WholesaleOS at main `5454996`. Read
> `docs/CODEX_HANDOFF_2026-07-09.md` fully first — it defines boundaries,
> the decision log, and the one task. Build ONLY the Serper Listing Radar
> lane per §6–§9 of that doc: a new acquisition adapter
> `modules/sources/listing-radar-acquisition-adapter.js` that uses the
> existing Serper provider (within caps) to find property-specific
> Zillow `/homedetails/`, Redfin `/home/`, Realtor
> `/realestateandhomes-detail/`, and auction detail URLs for distressed-term
> searches in Dallas/DFW; parse addresses only from URL slugs or visibly
> rendered page content with provenance flags; mark blocked pages
> `BLOCKED_PUBLIC_SOURCE` honestly; wire it as a queue lane with source
> coverage; add hermetic tests (injectable fetch/Playwright/Serper impls,
> no live network); keep every existing test green and `git diff --check`
> clean. Honor all boundaries in §5 and the prohibitions in §11 — no fake
> data, no paid APIs, no bypasses, no lead-store writes. Release = feature
> branch → merge to main → push both; verify in production via
> `GET /api/dashboard/free-public-deal-board/latest` with header
> `x-user-id: admin` after a background batch. When done, update
> `docs/WHOLESALEOS_OPERATOR_MAP.md` coverage table and report: main SHA,
> files changed, tests run, prod row counts before/after, and the lane's
> coverage line from the latest batch.
