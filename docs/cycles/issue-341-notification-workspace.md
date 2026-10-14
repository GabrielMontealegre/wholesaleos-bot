# P0 notification workspace

## Trace

Existing stored-alert writers call db.addNotification(type,title,message,data):
buyer/deal ingestion, matches, warnings and system/job reports. db.js owns the
existing200-record retention and read flags. GET /api/notifications reads them;
POST /api/notifications/read calls unchanged markNotificationsRead(ids).
No notification writer, retention policy, backend gate or readiness rule changes.
The second actual writer is modules/comms.js's incoming-SMS path: it prepends
UUID alerts directly before the existing DB write. Both timestamp N IDs and
canonical UUID IDs are accepted and covered; no inference from a phone or body.

Legacy index functions loadNotifications/renderNotificationList/toggleNotifications/
readNotification/markAllRead and their polling/refresh callers are present in the
inline dashboard source. The final UI bundle replaces the global load/toggle/read
commands, retains the existing bell ID and keyboard shell, and replaces the old
panel contents. It creates no timer. Existing callers use the replacement loader.
The old notif-list content target is absent; new text is escaped, not interpolated
into inline onclick code. Last-script ordering is deliberate.

Stored alerts plus the existing pure Today read model feed separate views. Unread
counts derive from all returned alerts, not a caller summary. Malformed/duplicate
IDs fail closed rather than discard rows or ambiguously mark two alerts read.
Unknown/failed reads clear cached private data. Opening/refeshing/navigating never
posts. Explicit mark-read uses only known unread IDs; zero IDs never posts, because
the existing backend interprets empty IDs as all records. No contact, property,
approval, workflow completion or delivery fact is inferred by marking an alert read.
Due work remains in its own workflow; it cannot be dismissed as a notification.

Read-only openers lead to existing Activity or Today. No guessed record association
or untrusted URL is used. New-session responses and expired read-status writes
cannot repaint private content after the unchanged sign-out chain. Failed writes
show an honest error, not optimistic success. A200 response must also say ok:true.

## Kit and tests

The popup uses pinned scoped Tabler card/btn classes plus D-056 dark tokens.
Height:auto and position:fixed are explicit, preventing the prior kit-root-height
collision. Legacy dark-heading override is covered by computed foreground and
background assertions. Three views, normal controls, Escape/return focus, outside
close, refresh, explicit fixture-only read status and401 clearing are tested.
Four synthetic screenshots:1366x768,1920x1080,400wide,412x915.

Pure/unit negatives cover forged counts/IDs, ambiguous IDs, wrong origins, missing
arrays, escaping, no network/clock/writes, failed save, empty IDs, expired session
and cancelled response. Browser fixture allows only the explicit named fake
notification read POST; stored fixture unchanged, zero external requests/errors.
No existing assertion is changed. Final corrected full suite600s/file:
SUMMARY passed=183 failed=0 skipped=0 total=183. Bell UI10.41s,unit0.15s,
shell38.00s,phone22.62s,mount17.42s,county notice10.89s. All timings in
docs/test-results/issue-341-notifications-final.txt. Earlier pre-UUID report is
not the final release evidence; both actual writer formats are tested now.

## Boundary and release

This is a UI/read model integration over existing routes, not new acquisition,
background ingestion or notification delivery. Stored alerts are labeled recorded,
not independently verified. No new jobs, email, Telegram or outbound send is
triggered. Missing producers are not fabricated as successful notifications.
The remaining P0 instructions/filters/name-first/row hygiene stay in #341.
County importer/#351A stay paused until Gabriel sign-off;#351B requires approval.

Release only after full suite green/self-review: draft,ready,merge commit,exact
deploy success and bounded read-only bell views/record clicks. Never mark a real
alert read during verification; no production data mutation. Revert on failure.
