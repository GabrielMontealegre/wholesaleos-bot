# Recorded clocks on reviewed deal cards

Ordered #325 slice: Today's Deals/home/JV reviewed-deal summaries and open cards.
No saved-lead or preview date resolver is changed. Their clocks follow separately.

## What Gabriel sees

Added to WholesaleOS and the source platform; source capture time; calendar days
since added; closing/auction deadline; time left (red below seven days, or overdue);
last recorded action with its operator and time; current recorded stage with its
age when a transition exists; the existing next-step explanation. Missing is
Unknown. A saved draft explicitly says not sent. No clock button or automation.
Times use owner UTC-7: Mon 12:18 PM this calendar week, Oct 3, 12:18 PM when older.
A date-only deadline is a calendar date, never a made-up midnight appointment.

## Writer/reader trace

- reviewed-deals.validate checks import captured_at/posted_at as UTC instants,
  normalizes closing_date/auction_date with the existing source date normalizer.
- reviewed-deals.ingest sets first_seen_at and created_by once. Duplicate import
  returns the existing row; updates spread the original, preserving first seen.
- applyDealUpdate validates source-backed updates, writes field provenance and
  append-only history with at/operator_id. update appends approval/draft/status/
  recheck/availability events. No clock timestamp is written back.
- jv-workflow events/signature reviews are validated by view before their existing
  read projection reaches the UI. Invalid history cannot invent a current-stage
  start or a latest JV action. Old preset status is not a transition timestamp.
- reviewed-deals.evaluate supplies deadline/status/next_action. list projects the
  original row and validated workflow; reviewed-deal-routes supplies an admin GET.
- wos-todays-deals renders both card surfaces using a pure injected-now formatter.
  Captured/posted/deadline prose on this card also stops showing raw ISO strings.
  Contextual history says recorded, not that a real action necessarily occurred.
  Equal timestamps within append-only history use append order, not array sort luck.

No backend/transport/storage/auth/comp/source/scheduler/dependency change.
No existing test assertions changed. No source-event date is inferred from import.

## Proof

Pure negative tests: malformed/impossible/future/ambiguous/mismatched/derived-only
dates, absent time, preset stage, invalid/wrong-origin JV history, draft versus
actual sent action, same-time append order, unsafe markup. No network, hidden
clock or mutation. Full-index browser proof1366/400/412: list/open/back, text fits,
all clock fields, zero action controls, zero writes/external requests, frozen store.
First sandbox browser launch was denied; supported escalated hermetic proof passed,
without changing product browser resolution. Synthetic clock images are under
docs/screens/2026-10-12-reviewed-deal-clocks, not live record screenshots.

Full suite SUMMARY passed=164 failed=0 skipped=0 total=164,600s/file.
All durations: docs/test-results/issue-325-reviewed-deal-clocks.txt.
ClockUI4.15s,pure0.18s,hover7.85s,mobile16.09s,wider-areaUI16.77s,
county-notice15.46s. Release/live gate pending; no existing assertion changed.

## Release verification

PR #337 merged as86983241db2b547e9d9a0712344d0ffada27264f. Exact Railway
deployment7025556899 SUCCESS:22:42:04Z ->22:43:07Z (1m03s),health200.
Live serves clockv1/Todayv8;all8fields in summary/open card,no raw ISO instants,
no controls. First real card has2days since added and Unknown deadline/time left.
No date was invented to improve this. Clock/text fits1366/400/412.
100Leads hydrate; explicit Open Lead opens/closes;zero fresh console errors.
Phone-menu visibility and off-screen full-row native click required fresh state
inspection; the existing explicit Open Lead button worked. These were control
issues,not code changes or fictional product fixes. Viewport restored.
Privacy-safe live timestamp crop emitted inline; repository PNGs remain synthetic.
No production write,Send/contact/confirmation,capture,batch,helper action or
Railway setting change. #325 remains open for saved-lead/property clocks and
Gmail/buyer/JV layouts. #331 still blocks production triage moves.
