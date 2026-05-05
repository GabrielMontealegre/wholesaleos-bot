# WholesaleOS — Mistakes Log
# READ THIS AT THE START OF EVERY SESSION
# Last updated: 2026-05-05

---

## MISTAKE 1 — Injecting into dashboard/index.html (NEVER DO THIS AGAIN)
What: String injection into the 853KB HTML file corrupted it (3MB garbage file).
Result: Dashboard showed raw JS code, then became completely empty.
Fix: Restored from git commit 866834dd.
Rule: NEVER inject code into dashboard/index.html directly.
Rule: ALL new dashboard features go into dashboard/wos-features.js (separate file).
Rule: dashboard/index.html only gets ONE change ever: adding the script tag for wos-features.js.

---

## MISTAKE 2 — Syntax crash in server.js (Telegram cron)
What: Built string concat bug: (l.created||l.createdAt||'')+''.startsWith(today)
Actual code written: (l.created||l.createdAt||'')''.startsWith(today)
Result: Node.js syntax error on startup. Server 502 for hours.
Fix: Single targeted replace. Commit 73b7c0a5.
Rule: ALWAYS run the server.js safety checklist before every push:
  - app.listen(PORT exists
  - backtick count is even
  - no 'async async'
  - length > 150000
  - singleAdmin count === 1
  - no adjacent string literals: grep for )''  or '')
Rule: Test every string concat in a JS console before putting it in server.js.

---

## MISTAKE 3 — Duplicate injection blocks
What: window._injection variable reset between JS calls, caused 3x duplicate code blocks.
Result: runPullLeads defined 6 times, dashboard broken.
Fix: Strip all injection markers before re-injecting.
Rule: BUILD + INJECT + PUSH must happen in ONE single javascript_tool call.
Rule: Never store content in window._var across multiple tool calls.
Rule: Always verify single injection: (s.match(/functionName/g)||[]).length === 1

---

## MISTAKE 4 — sigs.forEach crash had TWO instances
What: Fixed position 83721 but missed position 414790.
Result: Lead click still crashed after 'fix'.
Fix: Search ALL occurrences: (s.match(/pattern/g)||[]).length before declaring fixed.
Rule: When fixing a crash pattern, ALWAYS check count === 0, not just 'fixed one'.
Rule: In a 853KB file, assume any pattern can appear multiple times.

---

## MISTAKE 5 — Browser cache serving old dashboard
What: After pushing new dashboard, browser served cached old version.
Result: Appeared to not work even though GitHub had correct file.
Fix: Ctrl+Shift+R hard reload. Verify with: fetch('/dashboard/index.html').then(r=>r.text())
Rule: Always verify Railway is serving new file via XHR before declaring done.
Rule: After dashboard push, always touch server.js to force rebuild.
Rule: Wait minimum 90 seconds after health 200 before testing static files.

---

## MISTAKE 6 — JS execution timeout on file manipulation
What: Manipulating 853KB+ files in browser JS caused CDP 45s timeout.
Result: Tab frozen, had to create new tab.
Fix: Read file once, store in window._var, do manipulation in SAME call.
Rule: Never do multi-step file manipulation across multiple javascript_tool calls.
Rule: If tab freezes: create new tab via tabs_create_mcp, navigate fresh.
Rule: Never use long polling loops (>10 iterations) in browser JS.

---

## MISTAKE 7 — Stale SHA = 409 conflict
What: Reused SHA from earlier in session after other pushes invalidated it.
Result: Push returned 409 conflict error.
Fix: Always ghGet() immediately before ghPut() in same call.
Rule: NEVER reuse a SHA across tool calls. Always fetch fresh SHA right before push.

---

## MISTAKE 8 — Zillow/Redfin scraping blocked server-side
What: Built comp agent that scraped Zillow/Redfin from Railway server.
Result: Both sites return 403/empty. Zero ARVs fetched. All leads show $0.
Fix: Requires paid API: Rentcast ($50/mo) or PropStream ($99/mo) or BatchData.
Rule: NEVER scrape Zillow, Redfin, or Trulia server-side. They block all bots.
Rule: For comps/ARV always use: Rentcast, ATTOM, BatchData, RealtyMole, or PropStream API.
Rule: Test any URL with curl before building a scraper around it.

---

## MISTAKE 9 — Pushing files >1MB via GitHub Contents API
What: Pushed 3MB file (corrupted dashboard) via Contents API.
Result: File silently became empty (0 bytes) on GitHub.
Fix: Restored from git history using ?ref=commitsha.
Rule: GitHub Contents API has ~1MB limit for file content.
Rule: dashboard/index.html must stay under 900KB at all times.
Rule: Check file size before every push: content.length < 900000
Rule: If file would exceed 900KB, put new code in a separate JS file instead.

---

## GOLDEN RULES — READ BEFORE EVERY SESSION
1. dashboard/index.html = READ ONLY. New features go in dashboard/wos-features.js
2. server.js safety checklist BEFORE every push (6 checks)
3. Read before edit. Fresh SHA immediately before push. One call per operation.
4. After push: poll health, verify static file via XHR, hard-reload test.
5. When fixing a bug: count ALL occurrences, fix ALL of them, verify count=0
6. No scraping Zillow/Redfin/Trulia. Use paid APIs for comps.
7. No string concat in server.js without testing in console first.
8. File size limit: server.js < 200KB, dashboard/index.html < 900KB
9. If tab freezes: new tab, navigate fresh, re-set credentials.
10. Log every mistake here IMMEDIATELY when it happens.

---

## CURRENT SYSTEM STATE (2026-05-05)
- Server: RUNNING (commit 73b7c0a5)
- Dashboard: WORKING — 8541 leads (commit 9b6a2a19 restored from 866834dd)
- Lead click: FIXED (both sigs.forEach patched)
- Filters/Bulk Delete: NOT YET in dashboard (will use wos-features.js method)
- ARV/Comps: All $0 — awaiting PropStream or Rentcast API key
- Skip trace: Agent built, 3AM cron wired — awaiting BatchData or PropStream key
- Email: SMTP fallback added (needs GMAIL_APP_PASSWORD in Railway)
- Telegram: 7AM daily summary cron wired
- Comp agent: 4AM daily cron wired
- Google Drive: Service account created, folder shared
- Sources: 73 total (16 original + 7 ArcGIS + 20 Socrata extra + 30 new states)


---

## MISTAKE 10 — Pipeline had no stage-move, just links back to leads
What: Pipeline card onclick did navigate(leads) + selectLead — took you away from pipeline.
Fix: Added wosMoveStage() + dropdown on each card. Added PUT /api/leads/:id/status route.
Rule: Never use navigate() inside pipeline cards. Always update status in-place.

## MISTAKE 11 — Score All Leads button only visible on Leads tab
What: Button injected by wos-features.js only when lead rows exist — not on Dashboard.
Fix: Add Score All button to server-side rendered header too (next sprint).
Rule: Global action buttons belong in the persistent header, not tab-specific toolbars.

## MISTAKE 12 — All States used populateState() which generated fake leads
What: populateState() was a legacy function that auto-generated 150 leads locally.
Fix: Replaced with wosRealPullState() which calls /api/leads/search-fresh-v2 (real data).
Rule: Never auto-generate leads. All leads must come from real public record sources.

## CURRENT WORKING STATE (2026-05-05 session 2)
- Dashboard: WORKING
- Pipeline: Stage mover added (dropdown per card)
- All States: Now pulls real leads via search-fresh-v2
- Hot Lead Scorer: Built (modules/agents/hot-lead-scorer.js)
- Hot Lead Alert: Built (modules/agents/hot-lead-alert.js)
- Outreach Hub UI: Built (dashboard/wos-outreach.js)
- Score All Leads: Button in Leads tab toolbar
- PUT /api/leads/:id/status: Added
