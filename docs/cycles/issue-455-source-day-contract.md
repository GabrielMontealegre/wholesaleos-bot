# 455 Active Source-Day Contract Inventory

Architect handoff: https://github.com/GabrielMontealegre/wholesaleos-bot/issues/500

Source/diagnostic only. No runtime, source resolver, stored data, backend gate,
provider, production read or business action changed. Earlier blocked runtime
and tests remain on their independent branches; this branch carries docs only.

## Browser Reader and Reachability

dashboard/wos-public-deals.js localDateIso uses browser-local getFullYear/month/
day. saleDateInfo reads canonical sale_date_iso, accepts only a shape regex but
not a real-calendar round trip, compares it to that local day, and computes days
using Date.UTC. It does not parse the raw source prose or resolve ambiguous dates.
saleDateBadge labels passed/upcoming; upcomingSaleRow, topUrgentAddresses,
urgentContextLabel and sortTopDealsRows also consume the same classification.
Thus replacing the day helper would change ranking/eligibility, not just text.

rowCard consumes saleDateBadge. Upcoming and urgent readers feed public-deals
panels; panelsForPage is used by renderQueue. mountForCurrentPage supports classic
dashboard and findme_scout and removes the panel on other pages. Existing full
dashboard mount-order test explicitly visits these destinations. This establishes
a real route/caller path, not proof that any private record appears there today.
No new browser run or retry of that previously failing gate was performed.

dailyMachinePanel is a separate reader: its actionable-today count compares
first_seen_at sliced to UTC with new Date().toISOString().slice(0,10). Do not
bundle that metric definition with sale-day semantics or change its writer.

## Writers and Backend Read Projection

modules/research/deal-board-queue-service.js deriveSourceDates traces allowed sale
origins and current raw source fields, applies normalize-source-date and the
registered sale-date resolver, supersedes stale derived values, and nulls derived-
only, non-sale or unresolved mismatches. Initial row conversion uses sale origin
plus parseSaleDateIso. Explicit official-notice confirmation can assign confirmed
sale_date_iso. No stored ISO is independently promoted to source proof here.

repairStoredSnapshotRows clones and repairs snapshot output; repairSaleDateUrgency
rederives source dates, then compares sale_date_iso to server-local currentDateIso
unless an explicit todayIso is injected. It adds SALE_DATE_PASSED_VERIFY_STATUS
and a verify-source next action. Other lifecycle/queue projections consume these
rows. Browser urgency helpers also inspect canonical row_state and risk flags.
Server timezone in production was not inspected or assumed. Do not remove flags
or change callable/readiness authority to make a display label agree.

## Bounded Synthetic Diagnostic

The external trace-455-source-day-zones.cjs runs the actual public-deals module
with inert boot/timers/network and a pinned2026-11-03T19:18Z Date whose calendar
methods emulate UTC-7 or Tokyo. Existing upcomingSaleRow test hook receives the
same synthetic canonical Nov3 sale DTO. UTC-7 returns upcoming with0 days; Tokyo
returns no upcoming row. No input mutation, network or business writes.

A deliberately malformed Nov31 DTO also receives an upcoming result. This is
a browser boundary-guard observation, NOT evidence that the validated backend
currently emits that DTO. No source truth inferred from it. Both observations
are in 455-source-day-zone-diagnostic.json, not acceptance tests asserting bugs.
This is an isolated VM diagnostic, not browser/layout/production proof.

## Architect Question

Bound the distinction between owner-calendar display and source/legal-calendar
passed-sale authority. Option1: inject an explicit owner UTC-7 display day and
validate real literal dates, while rendering eligibility from canonical state
and preserving all source/risk gates. Option2: define a typed source-jurisdiction
calendar contract in backend projection before any passed-sale policy change.
Recommendation: split display-day consistency from backend source/legal-date
policy; preserve raw evidence and literal source days, do not invent a midnight,
remove flags, infer legal sale completion or make a blanket timezone replacement.

BLOCKED for implementation pending a bounded contract decision. No full/CI/PR/
push/merge/deploy or release; original failed gates and independent blockers stay.
