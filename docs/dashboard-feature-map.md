# WholesaleOS Dashboard Feature Map
*Last updated: 2026-05-12 | Phase 3C*

## Critical Discovery
**The live dashboard is `dashboard/index.html` NOT `index.html`.**
Phases 1B.2 through 3A patched `root/index.html` — a file that is NOT served.
All those UI patches had zero production effect. They were re-applied to `dashboard/index.html` in Phase 3C.

---

## Live Production Features (dashboard/index.html)

### Lead List
- Lead table with address, county, category, status columns
- ▲ distress score badge in addr-sub row (Phase 3C recovery)
- Category badge coloring
- Status badge coloring
- Lead count with pagination

### Lead Detail Modal
- Address, city, state, county, zip
- Source attribution (📍 source name) — Phase 3C recovery
- Distress Score pill (color-coded red/gold/green) — Phase 3C recovery
- Distress type badges (sigs array, Phase 1B.3 pattern) — Phase 3C recovery
- Owner Info section (name, type badge, phone, email, parcel, source) — Phase 3C recovery
- Enrichment status badge + "▶ Enrich Owner" button — Phase 3C recovery
- Seller Contact section (pre-existing)
- Action buttons (pre-existing)

### Buyers Tab
- Buyer cards grid
- "+ Add Buyer" button → openAddBuyer() modal
- Modal fields: name, type, contact, phone, email, markets, min ARV, max price, rehab, min distress score (Phase 3C), notes
- saveBuyer() now POSTs to /api/buyers for persistence (Phase 3C)

### Enrichment
- startEnrichment(leadId) → POST /api/leads/:id/enrich-owner
- Status transitions: none → queued → in_progress → complete/failed
- Admin-only (x-user-id: admin header)

---

## Wrong-File Patches (root/index.html — NOT LIVE)
These changes exist in root/index.html but have no production effect:
- Phase 1B.2: modal CSS theme overrides (navy colors)
- Phase 2A: duplicate badge, owner info section (old version)
- Phase 3A: enrichment button (old version)
- Phase 3B: enhanced owner display

These have been re-implemented correctly in dashboard/index.html (Phase 3C).

---

## Deferred / Not Yet Built in Production
- Buyer matching display on leads (match count badge)
- Archive tab / archived leads view
- Nightly enrichment cron
- Follow-up tracking UI
- Contract generation workflow
- Distress history timeline view
- Nashville/Syracuse batch enrichment UI controls
- Telegram alert integration
- Mobile-responsive layout
- Bulk buyer import
