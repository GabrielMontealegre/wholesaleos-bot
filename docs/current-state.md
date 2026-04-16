# WholesaleOS — Current State

_Last updated: 2026-04-16 | Commit: baf6a89_

---

## Working Features

- **Lead import** — CSV/Excel/PDF import via `/api/leads/import`. ~13,777 real Propwire leads loaded for Dallas TX.
- **Lead table** — table view with ref IDs, full address, status, spread, contact buttons, buyer match count.
- **Lead modal** — `openLeadDetailFixed()` opens full detail with Zillow/Redfin/Rent/Maps deep links using `fullAddress()`.
- **Deal math** — `calcDealMath(l)` computes MAO70/65, spread, dynamic assignment fee, buyer profit, equity % per lead.
- **Buyer database** — 34 buyers loaded. Cards show phone, email, buy types, state, budget, matched deal count.
- **Bulk send to buyer** — multi-select deals modal, approval toggle, 500ms rate-limited queue send via `/api/buyers/:id/send-deals`.
- **Buyer interaction tracking** — deals sent count, last contact date loaded from `/api/buyers/:id/deals-sent`.
- **SMS tab** — Twilio integration, AI-personalized messages, bulk send queue.
- **Dialer tab** — AI call scripts per deal category, sentiment analysis, floating overlay.
- **Outreach Hub** — seller intro email via Gmail OAuth, AI-generated scripts.
- **All States tab** — 50-state grid with lead/buyer counts, Get Leads + Find Buyers per state.
- **Pipeline view** — Kanban by status. Clicking a card opens the lead modal (does not navigate away).
- **Quick filters** — CA, TX, OH, Courthouse pill + dynamic top-5 states above leads table.
- **Valid Deals Only toggle** — hides leads with zero ARV or negative spread.
- **Contact buttons** — SMS, Email, Call on every lead row and in the detail modal.
- **Courthouse tab** — `/api/courthouse/*` routes registered. Tab injected into nav. CH-XXXX ref IDs.
- **Courthouse leads in main table** — merged into `APP.leads` via `mergeCourthouseIntoApp()`.
- **Search** — `CH-XXXX` lookup + full-text search across address, owner, county, case number.
- **Lead badge** — shows regular lead count only (excludes courthouse). Stable, no flicker.
- **Pipeline status persistence** — PATCH to `/api/leads/:id` on status change, PUT fallback.
- **Google Drive** — OAuth upload on import (requires `GOOGLE_SERVICE_ACCOUNT_KEY`).
- **Daily auto-scan** — triggers `/api/scan` every 23h via `localStorage` timestamp check.
- **System memory** — `window._LESSONS` + `localStorage('wholesaleos_lessons')` logs known bugs/fixes.
- **Token cache** — `window._cache` with 10-min TTL wraps repeat API fetches.

---

## Broken Features

- **Gmail OAuth** — refresh token expired. Email send fails. Fix: regenerate at [OAuth Playground](https://developers.google.com/oauthplayground) → update `GMAIL_REFRESH_TOKEN` in Railway.
- **Buyer search API** — `/api/buyer-search` returns empty without `BING_SEARCH_KEY` or `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` in Railway env.
- **Courthouse scraper** — Playwright not installed on Railway. `/api/courthouse/run` queues but does not execute. Fix: add `npx playwright install chromium` to Railway postinstall.
- **Google Drive courthouse upload** — requires `GOOGLE_SERVICE_ACCOUNT_KEY` not yet set.

---

## Partial Features

- **Courthouse leads** — tab and routes exist, CH- ref IDs assigned. No real data until Playwright runs. Static import via `POST /api/courthouse/leads` works as workaround.
- **Buyer finder** — scrapes Google/Bing results for cash buyers. Works with API key. Dedup logic present. No contact enrichment yet.
- **Outreach Hub** — seller email exists. Bulk seller outreach not yet fully wired.
- **Rent comps** — field exists on lead object. Not auto-populated. Shown in deal modal if present.
- **ARV confidence scoring** — field exists in AI module. Not surfaced in UI yet.

---

## Pending Tasks

- Regenerate `GMAIL_REFRESH_TOKEN` (requires Gabriel)
- Add `BING_SEARCH_KEY` in Railway (free tier, 1k/month)
- Add `GOOGLE_SERVICE_ACCOUNT_KEY` in Railway for Drive upload
- Install Playwright on Railway (`npx playwright install chromium --with-deps` in postinstall)
- Wire buy box extract button in Buyers tab
- Add Buyers nav badge for new buyers today
- Pipeline opportunity value (potential fees from active leads in dashboard stat)
- Outreach Hub: unified buyer+seller outreach with varied per-buyer-type messaging

---

## Deployment Notes

- **Platform:** Railway, auto-deploys from GitHub `main` branch on push (~2 min build)
- **Live URL:** `https://wholesaleos-bot-production.up.railway.app/dashboard/`
- **GitHub repo:** `GabrielMontealegre/wholesaleos-bot` (private)
- **Admin PIN:** 1234
- **Patch file:** `dashboard/patch_v4.js` — loaded via `<script>` tag before `</body>`
- **Current patch:** v7 (commit `2f45c0f`)
- **Push method:** git HTTPS from container at `/tmp/wholesaleos-push/`
- **Token:** GitHub token in push remote URL — revoke and regenerate after each session
- **Railway blocked** from container. Verify deploys via Chrome MCP or GitHub commit check.
- **DB:** JSON flat file at `/app/data/db.json` on Railway persistent volume
- **AI:** Groq (Llama 3.3, free tier) primary. Claude fallback via `ANTHROPIC_API_KEY`.
