# Owner Telegram alerts (#307 slice D)

Reads: operator-brief builds from activities and reviewed-deals.evaluate, not
legacy lead.arv/spread/phone counts. Its clock is injected; local days use
America/Mazatlan (UTC-7). Conversation-aware reminders remain Slice A work.

Writers/callers: owner-telegram reads existing environment credentials, sends
only to configured BOT_OWNER_ID, limits text to 3500 and attempts to 30/hour.
Admin notify POST cannot supply another recipient. Read-only status/brief GETs
never send. Daily-summary now requires admin and uses the same service.
Server/bot daily schedules use 07:00 America/Mazatlan and retain their existing
background-enable guard; no setting or process is enabled by this item.
Only newly appended incoming reports trigger after the import database write.
Duplicate import produces no new alert; callback failure cannot roll back or
misreport an already successful import. Core application released in PR #316;
read-only aliases released in PR #317. No live notification test is authorized for verification.

Logs/responses never expose the Telegram token, raw message, chat ID or upstream
errors. Legacy hot-alert failure reporting is sanitized; its scoring/behavior
otherwise remains unchanged. No caller confirmation of a contact or deal is
inferred from an imported report or notification receipt.

Mock tests cover missing config, fixed recipient, limit/cap, upstream
failure/redaction, explicit direction, admin access/no-send GETs, preview quiet,
post-persistence callback, duplicate quiet and failure isolation. Existing import
and send-disabled suites passed. Full suite: 141 passed, 0 failed, 0 skipped,
600s/file; durations in docs/test-results/issue-307-telegram.txt. Notification
links use exact record references and the existing signed admin search/open path;
malformed/ambiguous refs cannot open another card. Real-document proof covers
1366/400/412. Display caps never become false aggregate totals. Closed/declined
records are suppressed, future/tied interactions cannot invent a reply, and the
brief omits private identities. Live verification remains read-only, with no
delivery claim from merely configured variables.

Read-diagnostic follow-up: browser navigation to the notification-named GET
was blocked client-side before a response. The same handlers are also available
as /api/dashboard/operator-channel-status and /api/dashboard/operator-brief.
They keep identical requireAdmin/no-store/no-send behavior. Original routes and
mutation protection are retained. No browser filter or authentication is weakened.

Direct API navigation was also blocked on the neutral alias, so the cause is not
proven to be the original path wording. Settings now reads the existing authenticated
GET through the normal application path and displays configuration and schedule
status. Its refresh control sends no message; missing/invalid/error responses show
status unavailable rather than a fabricated connection. The unchanged schedule
guard is shown explicitly. Local actual-document tests cover six widths, refresh,
no writes and no external requests. Only status-panel crops are committed; full
Settings screens can contain private company information.

Conversation briefing integration: when explicit conversation reports exist,
the briefing uses conversations.list for open/waiting/incoming/due/unlinked
counts, sharing the dashboard's closed/older-reply/cadence semantics. Totals
are computed before display limits. Only canonical refs and allowlisted channel
names enter its incoming/follow-up summaries; names, messages, next-step text
and thread URLs are excluded. Unlinked conversations are counted, not given
invented refs. Until explicit reports exist, the legacy activity projection is
retained unchanged. calendar-day holds the same injected-clock UTC-7 formatter
to avoid a circular dependency; operator-brief still exports dayAt for callers.
No real send is used for verification; the schedule guard remains unchanged.

Settings has an explicit Preview briefing control using that existing admin GET.
It never requests a brief automatically or sends one. Text is escaped/wrapped;
failed/invalid/oversized responses show unavailable without echoing raw errors.
The control is also the supported read-only inspection path when direct API
page navigation is blocked by the browser client. No client filter is weakened.
