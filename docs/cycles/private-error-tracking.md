# Optional private error tracking

OFF unless SENTRY_DSN is a valid HTTPS Sentry DSN. No SDK import/server error
transport or browser CDN/telemetry request when disabled. The dashboard reads
only admin-gated no-store configuration after login. SDK10.22.0 supports Node18+
and therefore the existing Node20 minimum; no runtime-engine change.

Names cannot safely be identified by a regex. Both sides instead rebuild events
from an explicit allowlist: error type, known code filename and numeric line/
column. Raw error text, function names, locals, user/contact/address fields,
requests/URLs/headers/cookies/bodies, tags, contexts, extras, breadcrumbs and
attachments are discarded. This deliberately loses message detail for privacy.
No session replay, tracing, logs, DOM or automatic default integrations.

Server covers uncaught exceptions/rejections, Express errors and generic HTTP5xx
signals. Existing fatal exit remains1; enabled flush is bounded to1500ms.
Browser covers explicit global errors/rejections after authenticated setup;
SDK load failure cannot block rendering. No source, contact or readiness changes.

No DSN/account/paid plan or Railway variable was added or changed. Tests use
synthetic sentinels, a fake SDK and the actual pinned SDK with an in-memory
transport. No real telemetry network is used by either privacy suite. Never
send a real property, contact, session secret or forced production test error.

PR #373 merged as 24b607b49b9668db2250f3d3f5be1d82a8411c56. Hosted run
39017862529 passed all 195 files with zero failures/skips; privacy 0.09s,
actual SDK envelope test 0.49s. Full durations are retained in
docs/test-results/private-error-tracking-final.txt.
Exact deployment 7137223068 succeeded at 2026-10-17T08:49:57Z, health 200.
The authenticated production config reports enabled=true and no error. This
means a DSN was already configured; do not describe production as disabled.
No configuration value was printed or included in proof.
After an old browser-tab connection became stale, a fresh tab loaded both local
scripts and no SDK while locked, as required. Gabriel unlocked the fresh tab.
Authenticated live 1366x768 and 412x915 checks passed: SDK present, 100 leads,
real lead drawer open/close, zero console errors, no phone page overflow.
Viewport restored; no deliberate error or telemetry probe, no business writes.
Inspected screenshots are in docs/screens/2026-10-17-private-error-tracking/.
Post-merge main run 39018663111 also passed 195/195 with zero failures/skips;
county-notice acquisition 253.83s, privacy 0.08s, actual SDK 0.54s.
