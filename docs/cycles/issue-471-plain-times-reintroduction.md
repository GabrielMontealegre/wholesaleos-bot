# One Plain-Date Reintroduction

Authority: #487 D-065 and #471 answer6551370094. First current-main attempt
from verified ebace1c986b3702a84bfd245e37552df76c5851c; no unchanged469 merge.
Owned469/470 and486/488 proof branches remain intact. Whole455.4 is not done.

## Writer And Reader Trace

No writer changes. Import/adapters/storage/export/canonical records/actors and
source clocks remain unchanged. Only shared wos-card-clock.formatTime reads
explicit recorded timestamp plus injected now and returns a display label.
Recent rolling age<=7 days: weekday/time; older: month/day, plus different year.
Strict UTC-Z/calendar/future rejection, formatDate, provenance and deadline
identity/UTC-7 stage/day arithmetic remain unchanged. No date inference.

Readers: workspace/app and email-screen; wos-email-reader; wos-todays-deals;
wos-buyers-found; wos-approvals; wos-conversation-cards; wos-calendar-workspace;
wos-notification-workspace; wos-pipeline-workspace and pipeline-report-review;
wos-today-workspace; reviewed clock render. Existing reader clock suppliers and
escaping remain intact. Classic/native HTML consume clock cache2; all current
488 validator/model/Desk/sheet/style and486 mailbox caches remain unchanged.
Nonshared assistant/Settings/legacy timestamp readers are a later455.4B slice.

## Tests And Existing Assertions

plain-card-times.test FIRST fails current same-calendar-week behavior for a
four-day-old timestamp, then passes rolling7days/exact boundary+1ms/UTC-7/
different year/missing/type/calendar/ambiguous/offset/future/purity negatives.
Actual synthetic native Email list/open body and Today activity pass1366/400/
412, exact source text retained, no external requests/writes or fixture mutation.
Changed assertions intentionally follow owner455.4A: reviewed-deal-clock old
same-year/different-year labels lose time; conversation unit and rendered
four-day-old label becomes Thu12:27PM, and an older-date assertion is added.
Rendered conversation fixture clock is pinned to its own existing now, not a
production clock change. All urgency/source/identity/escaping/immutability/
privacy/deadline assertions stay. Reviewed-deal actual render/detail/back test
passes at three widths; screenshot destination alone becomes injectable.
Nine new synthetic screens inspected in docs/screens/2026-11-01-plain-times.

## Bounded Geometry Diagnostic

Dedicated unsigned verifier visits only native and classic shared login at
1366/400/412, writes case/requested viewport/actual viewport/rect BEFORE the
unchanged height>=44 and in-viewport assertion. No PIN/cookie/auth transfer.
Desktop baseline native/classic both x483,y275.34375,width400,height44,200.
Initial browser launch was unavailable: expected pinned Chromium1117 was absent.
Restored exact1117 browser cache only (first CDN400, installer fallback success).
The subsequent baseline recorded both desktop cases, then stopped because the
harness required zero aborted external GET attempts. Source loading attempted
an external GET that remained blocked. Align that harness-only condition with
the existing verifier's zero-nonGET rule; externalGET still aborts. No geometry
assertion/threshold was changed and no baseline rerun was done afterward.
The missing-browser/harness results do not explain any historical failed gate.
Candidate/live acceptance is still pending. If it fails, defer; no third attempt.

No Lighthouse/15-case unchanged audit, real message/file/credential/record read,
production business write or manual Railway action. First exact-head CI and
main/deploy/public acceptance pending. Not a release or whole455 completion.
