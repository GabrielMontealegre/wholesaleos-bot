# 455 Active Legacy Date Reader Trace

The original diagnostic remains failed-behavior evidence, not an acceptance
test. A bounded local predicate fix now follows this trace; no release yet.
Earlier blocked device/template/JV runtime remains excluded on separate branches.

## Active Filter, Not Shadowed Fallback

dashboard/wos-features.js wosFilter delegates to window.applyLeadFilters when
present. Its browser-local row-filter fallback is not the active default path.
The canonical index.html applyLeadFilters reads lfAge and reloads leads. Final
loadLeadsFromAPI then calls applyLeadToolbarFilters, which filters the fetched
page through leadMatchesToolbarFilters -> leadMatchesAge. Thus that specific
index function is active; it is not one of the earlier shadowed renderers.

The toolbar labels age1 Today. leadMatchesAge instead checks elapsed<=24h,
without a nonnegative age guard. leadCreatedText prefers created over created_at,
accepts Date's loose parsing, and falls back to updated_at for absent creation.
buildLeadApiUrl does not send age; the predicate currently filters the fetched
page only. Global pagination/count corrections are separate scope, not silently
fixed by a display-time change.

## Writer Contracts

db.js addLead writes created as UTC date-only, allows a caller override through
the spread, then writes created_at from the provided value or current ISO time.
server.js deal-engine ingestion writes numeric createdAt and ISO created_at;
modules/sources/arcgis-sources.js similarly emits numeric createdAt plus its ISO
alias. modules/datasources.js has ISO created values. These are creation metadata,
not posted_at, source sale dates, captured evidence or provenance of an event.
updated_at is not creation evidence. Do not reinterpret a day-only historical
record as a confirmed exact instant, or change an ingestion writer to hide this.

## Synthetic Reproduction

455-active-lead-age-diagnostic.json executes the actual leadCreatedText and
leadMatchesAge declarations using the repository's existing VM-extraction test
pattern, with now fixed2026-11-03T19:18Z. Previous-owner-day06:59:59Z, next-day
future instant, update-only record and ambiguous11/03/2026 all currently match
Today. Same-owner-day and date-only controls are included; all six match today.
Source fixtures unchanged, no production/network/write actions. The diagnostic
reports observed booleans; it does not assert defective behavior as acceptance.

## Bounded Implementation

Use precise canonical creation metadata before the day-only alias. Today must
mean the owner UTC-7 calendar day, never rolling24h; future/invalid/ambiguous/
update-only data cannot establish creation. Preserve Any Time rows. Preserve
existing multi-day rolling-window intent unless separately authorized. Establish
an explicit conservative policy for legacy day-only metadata without inventing
an instant. Do not alter source-date resolvers, ingestion, sorting, paging,
stored records or shadowed browser-local fallback merely to fix this predicate.
Add negative cases and an actual current-path integration check before release.

Implemented precise own-field precedence created_at/createdAt/inserted_at/created,
strict real-calendar UTC-Z or positive integer epoch milliseconds; update-only,
inherited/falsy-invalid primary, future, day-only, offset and slash values cannot
prove an exact creation window. Missing precision remains visible under Any Time.
Today compares UTC-7 calendar days; other whole-day choices keep rolling windows.
No ingestion, stored-data, source-date, sorting, paging or fallback changes.
No existing assertion changed. Shared clock/cache assets unchanged.

New lead-age-calendar.test.js and lead-age-calendar-ui.test.js PASS. Actual
dashboard/API-loader integration at1366/400/412 in Tokyo selects1 of6 after
Today selection and restores6 for Any Time; source fixtures immutable, no writes/
external/error. Unit boundary/alias/unknown/forged cases include multi-day edges.
Review strengthened falsy/inherited primary handling and DOM result assertions;
changed checks also passed, no failed run or unchanged retry. Initial viewport
images retained externally before image refinement. Six final images inspected
under docs/screens/2026-11-07-lead-age-calendar. Phone toast overlap and legacy
table clipping are visible existing limitations, not repaired or waived here.
Full suite for first frozen307-file candidate pending; no hosted gate/release.

## Separate Unproven Legacy Panel

wos-leads-detail buildPanel reads created_at||createdAt||created. It is exposed
through wosShowLeadDetail (no repository caller found) and a selectLead wrapper
that fetches one lead and inserts only when legacy modal selectors exist.
Current openLeadModal uses modal-content and is wrapped by operational views;
do not assume that old panel is visible. Runtime reachability remains unproven,
so no edit to it is justified by this static inventory alone.
