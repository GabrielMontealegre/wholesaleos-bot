# Owner Telegram alerts (#307 slice D, draft)

Reads: operator-brief builds from activities and reviewed-deals.evaluate, not
legacy lead.arv/spread/phone counts. Its clock is injected; local days use
America/Mazatlan (UTC-7). Conversation-aware reminders remain Slice A work.

Writers/callers: owner-telegram reads existing environment credentials, sends
only to configured BOT_OWNER_ID, limits text to 3500 and attempts to 30/hour.
Admin notify POST cannot supply another recipient. Read-only status/brief GETs
never send. Daily-summary now requires admin and uses the same service.
Server/bot daily schedules use 07:00 America/Mazatlan and retain their existing
background-enable guard; no setting or process is enabled by this draft.
Only newly appended incoming reports trigger after the import database write.
Duplicate import produces no new alert; callback failure cannot roll back or
misreport an already successful import. No current production path is changed
until this draft merges. No live notification test is authorized for verification.

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
