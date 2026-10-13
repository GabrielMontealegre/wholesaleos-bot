# P0 Today workspace - ordered slice 2

The home page starts with one Today action center rather than the accumulated
Deal Finder / reviewed inventory / reminders stack. Leads, Today's Deals, JV,
buyers and email keep their existing standalone screens and write guards.
The source evidence desk remains below Today, and explicit email preview/save
controls remain in a closed Conversation tools disclosure. Nothing is sent,
approved, confirmed, collected or synced merely by opening Today.

## Writer / reader trace

- Conversations: assistant report imports and saved exact mailbox replies write
  through `records/conversations` and `mailbox-conversation-sync`. Activity
  imports write through `record-activity`. The shared conversation projection
  remains authoritative for waiting/due status. Its new internal `project`
  returns the entire projection; the public `list` retains its 50/100 limits.
  Existing inbox/brief callers are unchanged. Today reads the uncapped view.
- Buyer approvals: assistant-finds ingest/update write `assistant_find.approval`;
  Today reads pending, non-rejected finds. Opening calls `openBuyerFind`.
- Deal approvals, deadlines and spread: reviewed-deals validate/ingest/update
  write these fields and the reviewed comp evidence. Today calls the same
  `evaluate` used by the deal card. It does not read claimed ARV as value.
  `openReviewedDeal` retains the actual comp-review and workflow controls.
- Last-day activity: `record-activity` owns the append-only ledger. Today reads
  validated nonfuture instants within the rolling last 24 hours and labels
  reported incoming/outgoing activity as reports, not delivery proof. Raw mail
  bodies and activity summaries are not copied into this rollup.
- Releases: the small committed `verified-ui-releases.json` records the actual
  successful deployments for #340/#342/#343 already verified in the run log.
  Each points to its exact GitHub PR; reads make no GitHub request. This is a
  recorded subset, not a live GitHub/release synchronization service.
- Route: admin-only GET `/api/dashboard/today-workspace`, one strict store read,
  no-store response; failures are 503 rather than an invented empty dashboard.
  Conversation routes register it; no auth or server ingestion logic changes.
- Mount: the last-loaded `wos-today-workspace` replaces only `renderDashboard`.
  Public evidence mounts after it. Hydration, rerender, timers and navigation
  cannot prepend the retired home inventory stack or duplicate Today.

## Explicit limits

- Black Diamond / Gold grade contract is absent; architect question #344 remains
  open. Do not label existing GOOD/POSSIBLE verdicts as those grades. Independent
  queue/KPI/history work proceeds. Best reviewed deals is a conservative fallback,
  not completion of the rated-deal acceptance criterion.
- Best list: up to five approved, evidence-reviewed, active deals with an existing
  calculated positive spread and a known current deadline. Derived ordering is
  spread divided by days-to-deadline plus one; no new value or readiness gate.
  Unsigned JV addresses stay withheld: this summary uses reference/coarse location.
- No records-request or routine-results feed exists in the current store contract.
  They are explicitly not connected, not counted as zero completed jobs. Those
  feature builds remain paused under D-056, not smuggled into the UI release.
- P0 #341 stays OPEN; Gabriel's final sign-off is still required. This release
  does not claim all five slices or all slice-2 source feeds are complete.

## Behavioral proof

New pure tests cover more than 100 conversations, unchanged public cap, duplicate
activity, invalid/future/stale/closed/unreviewed/claimed values, wrong-origin
releases, 24-hour boundary, no clock/network/write side effects, unchanged input,
admin guard, private error suppression and escaped human-time markup.

Full-index Playwright proof clicks four filters, refresh, every synthetic action
(conversation, buyer approval, deal approval, two deadlines), best-deal opener,
activity and dialog close. It checks actual cards, failure removal of stale UI,
mount timers and 44px controls/no overflow at 1366x768,1920x1080,400x915,412x915.
The existing shell proof still clicks all 32 nav destinations, bell, account,
settings and a locked lead. All data is synthetic; requests/writes are trapped.

Existing test changes are intentional D-056 UI expectations only:
`dashboard-deal-mount-order` expects Today then the source desk, no duplicate
home inventory; standalone inventory/Deal Finder and safety assertions remain.
`verify-marketplace-ui` opens retained Conversation tools before checking the
same preview/link/save/draft safety assertions, and waits for Today on home.
`owner-brief-card-link` waits for the new home instead of a removed inventory
card on a malformed reference; exact valid links and no-open assertion remain.
`verify-conversation-cards` opens retained Conversation tools before the same
overdue/today/order/role/provenance/geometry assertions; no assertion changed.
`dashboard-public-deal-queue:864,921` expects cache-buster 56 instead of 55 because
the source-panel mount anchor changed. No source/provenance/gate assertion changes.
`verify-reviewed-deal-clock` opens standalone Today's Deals before its unchanged
clock/card/back assertions. `verify-record-activity-ui` does the same before its
unchanged reference/history/search/privacy assertions, and checks the intentional
Today/source-desk home order on return. Its fixture registers the actual Today GET.

Test timings, screenshots and release/live observations are recorded in the
PR and BACKLOG run log. Known startup saved-lead 502 remains tracked in #209;
no claim that this UI work repairs storage or that a logged historical error is
a fresh frontend failure.
