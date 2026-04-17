# WholesaleOS — Mistakes Log

## 2026-04-16 "undefined" in Leads + email content failure (v10 fix)

**Leads showed "undefined" everywhere.**
Root cause: renderLeads and renderLeadDetail access l.owner_name which does not exist
in the lead schema. JS renders undefined as the string "undefined".
Fix: Patch wraps renderLeads+renderLeadDetail to backfill l.owner_name from l.ownership
or l.seller_type before render. Also backfills l.city from address string.
Rule: Never access a field not confirmed in the live API schema.
Always add || "" fallback for every displayed string field.

**v9 Guard 1 was too aggressive — filtered valid leads.**
Root cause: Guard 1 in v9 mutated APP.filtered to remove leads with address.length < 5.
All real leads have valid addresses, but the guard ran before leads loaded, emptying the list.
Fix: Replaced with safe field-backfill pattern. No leads are filtered.
Rule: Never mutate APP.filtered as a safety guard. Use fallback values, not removal.

**Email content showed "Couldn't load email".**
Root cause: loadGmailEmails stored messages in a local variable, never on window or APP.
The v8 click handler tried APP.messages[idx] which was always undefined.
No actual fetch to /api/gmail/message/:id was ever triggered.
Fix: Replaced with loadGmailEmails override that renders list with data-msg-id attributes
and fires fetch("/api/gmail/message/"+msgId) on click, passing result to openEmailContent.
Rule: Email list items must store their ID in data-msg-id. Click must fetch content by ID.
Never rely on APP.messages — store fetched list in window._gmailMessages.

---

## 2026-04-16 Missing safety guards — render, comps, state, fetch dedup, email

**renderLeads — no data completeness check.**
Root cause: Leads missing address rendered into the table, causing blank rows and broken links.
Fix: Wrapped renderLeads to filter APP.filtered before render. Leads without a 5-char address
are rejected and logged to console.error.
Rule: Never render a lead row without validating address exists.

**renderLeadDetail — called without a selected lead.**
Root cause: renderLeadDetail() could be triggered before APP.selectedLead was set, causing
blank or stale comps panels.
Fix: Wrapped renderLeadDetail to bail with console.error if APP.selectedLead is null.
Rule: renderLeadDetail must never run without a valid APP.selectedLead.

**Selected lead lost on page refresh.**
Root cause: APP.selectedLead was only in memory — refresh cleared it.
Fix: selectLead() now writes ID to localStorage. On boot (1.2s delay for leads to load),
restores selection if the lead still exists in APP.leads.
Rule: Selected lead ID must be persisted to localStorage on every select call.

**cachedFetch — no in-flight dedup.**
Root cause: Same URL called twice before first resolved fired two separate fetches.
Fix: Added _inflight map. Same cacheKey returns existing promise until resolved.
Rule: cachedFetch must return an in-flight promise for duplicate keys.

**openEmailContent — no content completeness check.**
Root cause: Could render with a msg object that had no body/subject, writing blank HTML.
Fix: Wrapped openEmailContent to reject msgs with no usable content field.
Rule: Never render email content without at least one of: body, html, text, snippet, subject.

---

## 2026-04-16 UI data access — lead click, comps, email content all broken

**Symptom 1 — Lead click did nothing.**
Root cause: openLeadDetailFixed(id) was called in 7 places across patch_v4.js but never defined anywhere.
Fix: Defined window.openLeadDetailFixed as a guarded alias to openLeadModal(id).
Rule: Never call a function in a patch without defining it in the same patch file.

**Symptom 2 — Comps/deal math did not render after selecting a lead.**
Root cause: selectLead(id) set APP.selectedLead then called generic render() which does not
trigger renderLeadDetail(). The detail panel stayed blank.
Fix: Overrode selectLead() in patch to additionally call openLeadModal(id) after the original.
Rule: Selecting a lead must always trigger renderLeadDetail(). Never rely on render() alone.

**Symptom 3 — Email list showed but clicking an email did nothing.**
Root cause: loadEmail() built message row divs with no onclick handlers. email-body element
received a skeleton placeholder but was never updated with actual content.
Fix: Overrode loadEmail() in patch to attach click listeners after DOM render (300ms).
Added openEmailContent(msg) which writes subject/from/date/body to #email-body innerHTML.
Rule: Every rendered list item must have an onclick. Never render a list without wiring clicks.

---

## 2026-04-16 Runtime token waste — same leads reprocessed on every scan call

**Symptom:** AI calls to analyzeProperty() fired on every /api/automation/scan, /api/search/leads,
and /api/states/populate even when lead data had not changed.

**Root cause:** No processed-lead cache existed. No lead-count snapshot checked before the market
loop. All 3 analyzeProperty() call sites ran unconditionally. 9 top-level console.log statements
emitted on every request cycle.

**Fix:** Added modules/runtime-cache.js (TTL 10 min, auto-prune 15 min). Scan handler now checks
lead-count snapshot key — skips entirely if unchanged. All 3 analyzeProperty() calls wrapped with
enrich: cache guard. 9 top-level verbose logs silenced.

**Rule:** Never call analyzeProperty() without first checking _rc.has('enrich:' + lead.id).
Never run the scan market loop without first checking the lead-count snapshot key.
Never add top-level console.log — use console.error for real errors only.

---

## 2026-04-16 Lead URL field validation added

**Problem:** sourceUrl, photoUrl, zillowUrl, redfinUrl, streetViewUrl could contain
placeholder strings, empty values, or malformed URLs and were saved without checks.

**Fix:** isValidUrl() added to lead-validator.js. If a URL field is present it must
start with http:// or https:// and be at least 10 chars. Placeholder values rejected.
URL fields are optional — blank/missing is allowed.

**Rule:** Never save a lead URL field that does not pass isValidUrl().
Affected fields: sourceUrl, photoUrl, zillowUrl, redfinUrl, streetViewUrl.

---

## 2026-04-16 Lead data accuracy — validation layer added

**Problem:** No validation existed before addLead(). Bad addresses, placeholder values,
mismatched city/state/ZIP, and invalid phone numbers could be saved to db.json.
Duplicate addresses were caught by a Set but only within a single import batch.

**Fix:** Added modules/lead-validator.js, called before every db.addLead() in /api/leads/import.
Checks: (1) address must start with a digit and not be a placeholder, (2) state must be a valid
2-letter US abbreviation, (3) city must not be empty/placeholder, (4) ZIP prefix must match state
(e.g. TX lead cannot have a ZIP starting with 9), (5) phone must be 10 or 11 digits if present.
Rejected leads are returned in the API response as rejectedLeads[] for logging.

**Rule:** Every lead must pass validateLead() before addLead() is called.
Never call addLead() directly without running the validator first.
Rejected leads must never be silently dropped — always include them in the import response.

---

Bugs that have occurred, their root causes, and confirmed fixes.
Add new entries at the top. Never delete old entries.

---

## 2026-04-16

### Global math reused across all leads instead of per-lead calculations
**Symptom:** Spread, equity %, and assignment fee showed the same value on every lead.
**Root cause:** Deal calculations were run once on a sample lead and the result stored in a shared variable, then referenced by all lead cards.
**Fix:** `calcDealMath(l)` is now called per-lead inline. Never store deal math results globally.
**Rule:** Each lead gets its own calculation call. No shared math state.

### Negative spread leads shown as valid
**Symptom:** Leads with negative spread appeared in the "best deals" sections and were eligible for bulk send.
**Root cause:** Validation only checked `spread > 0` at send time, not at display time.
**Fix:** `isValidDeal(l)` returns false if `spread < 0` or `arv <= 0`. "Valid Deals Only" toggle hides them. Bulk send modal only shows leads where `calcDealMath(l).isQualified === true`.
**Rule:** Never display or send a deal with negative spread. Validate before rendering, not only before sending.

### Flickering lead counts (7,397 → 13,000)
**Symptom:** Nav badge jumped between two numbers each render cycle.
**Root cause:** Multiple code paths wrote to `nav-lead-count`: some used `APP.leads.length` (includes courthouse leads), our patch used new-leads-only count. Each re-render oscillated between the two.
**Fix:** Single `updateLeadsBadge()` function counts only regular leads (`_source_module !== 'courthouse-addon'`). `textContent` setter intercepted to cap inflated values.
**Rule:** Only one function may write to `nav-lead-count`. Never set it inline in render functions.

### Pipeline movement not persisting
**Symptom:** Moving a lead to "Contacted" in Pipeline reverted on next page load.
**Root cause:** Status was only updated in `APP.leads` in memory. No server write occurred.
**Fix:** `updateLeadStatus()` does PATCH to `/api/leads/:id`, falls back to PUT. Optimistic update in `APP.leads` and `APP.filtered`.
**Rule:** Any status change must write to the server immediately. Memory-only updates are not acceptable.

### Non-clickable lead tiles in Pipeline
**Symptom:** Clicking a pipeline card navigated to the Leads tab and lost the selected lead.
**Root cause:** `onclick="navigate('leads');selectLead(id)"` switched the tab first, then tried to select a lead that wasn't visible.
**Fix:** `renderPipeline` overridden to call `openLeadDetailFixed(id)` directly — opens modal without leaving Pipeline.
**Rule:** Pipeline cards must open the lead modal in-place. Never navigate away from the current tab to show a lead detail.

### Outreach buttons that do nothing
**Symptom:** SMS, Email, Call buttons on leads were visible but produced no effect when clicked.
**Root cause:** Buttons called `openSMSCompose()` and `openEmailCompose()` which were not defined in the patch scope. Functions existed in the original app but were in a different scope after patch loading.
**Fix:** `openSMSCompose()`, `openEmailCompose()`, `initiateCall()`, and `sendContactAction()` defined explicitly in the patch. Each calls the correct server endpoint.
**Rule:** Every button with an `onclick` must have its handler defined in the same patch file or verified to exist in the original app's global scope.

### Broken property links (Zillow, Redfin, Maps)
**Symptom:** Links opened search pages instead of the specific property.
**Root cause:** Links were built using only `l.address` (street only), which Zillow/Redfin couldn't resolve. City, state, and ZIP were omitted.
**Fix:** `fullAddress(l)` builds the complete address (`123 Main St, Dallas, TX 75201`) and encodes it into every external link.
**Rule:** All property links must use `fullAddress(l)`, never raw `l.address`.

### Courthouse leads caused double-counting
**Symptom:** Badge showed 13,000+ instead of 7,397. Courthouse leads inflated all count displays.
**Root cause:** `mergeCourthouseIntoApp()` was called on every render cycle, appending courthouse leads to `APP.leads` repeatedly without deduplication.
**Fix:** Merge called once on load. All count functions filter by `_source_module !== 'courthouse-addon'` for regular lead totals.
**Rule:** `mergeCourthouseIntoApp()` is called once. Never inside a render function.

---

## Earlier (pre-log)

### Mixed-state leads
**Symptom:** A lead showed status "Contacted" in the table but "New Lead" in the modal.
**Root cause:** `APP.leads` and `APP.filtered` were separate arrays. Status update wrote to one but not both.
**Fix:** `updateLeadStatus()` writes to both `APP.leads` and `APP.filtered` by reference, plus persists to server.

### Wrong city/state/ZIP combinations
**Symptom:** Leads showed "Dallas, CA 75201" or other mismatched city/state/ZIP.
**Root cause:** Lead objects were constructed from mixed data sources. City pulled from one API, state from another, ZIP from a third. No cross-validation.
**Fix:** `fullAddress(l)` only appends city/state/ZIP if not already present in the raw address string. Deduplication via substring check.
**Rule:** Never concatenate city/state/ZIP without checking if they are already in the address field.

### NaN values in calculations
**Symptom:** Spread showed "NaN", equity showed "NaN%", offer showed "$NaN".
**Root cause:** `arv`, `repairs`, or `offer` fields were undefined or null. Math on undefined returns NaN, which propagates.
**Fix:** All deal math uses `|| 0` fallbacks: `var arv = l.arv || 0`. NaN never enters the calculation chain.
**Rule:** Every numeric field must default to 0 before any arithmetic. Never do math on a field that might be undefined.

### Reused metadata between leads
**Symptom:** Multiple leads showed identical owner names, case numbers, or parcel IDs that clearly belonged to one property.
**Root cause:** Lead generation loop reused a single object reference instead of creating a new object per lead.
**Fix:** Each lead is created with `Object.assign({}, template, overrides)` or a fresh object literal. No shared references.
**Rule:** Lead objects must never share references. Always create new objects, never mutate a shared template.
