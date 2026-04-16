# WholesaleOS — Mistakes Log

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
