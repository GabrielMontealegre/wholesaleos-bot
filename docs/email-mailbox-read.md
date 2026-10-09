# Email connection and mailbox reading (#288, read-only slice)

Email and Settings show a checked connection status, never a configured-only
claim. Test connection authenticates and lists mailbox metadata without writing.
When GMAIL_USER and GMAIL_APP_PASSWORD are configured, that connection is preferred
over Google login. Otherwise the existing Google login remains available.
No credential or upstream error text is returned or logged.

Inbox includes replies; Sent, Drafts and Starred read their real Gmail folders.
Special-use folder metadata supports localized Gmail names. Optional WOS labels
are read only when present; a missing label is not created or silently mapped to
Inbox. Message IDs include mailbox UID validity; stale IDs cannot open a different
message. Read-only locks and BODY.PEEK do not mark messages read. Up to 50 metadata
rows and a 2MB message limit bound work; only plain text is shown, never executable
email HTML, remote images or attachments.

Scope: no SMTP send, draft APPEND, deletion, labels, background poll, activity
sync or database write is added. Existing disabled send/reply routes remain
disabled. These wider #288 requirements remain independent later slices.

Trace: environment -> mailbox-reader provider/auth -> authenticated admin
GET test/inbox/messages/message -> email-reader Email and Settings views.
No stored lead/buyer/deal field is written. The old OAuth-only read handlers
are replaced, not retained as a second reader. Legacy OAuth trash code is untouched
and is not exposed by the new read-only view. The shared signed API gate plus
requireAdmin protects every new read. Cache-Control is no-store.

Maintained clients are pinned: imapflow 2.3.0 and mailparser 3.9.37, both requiring
Node 20+. The app minimum follows that dependency requirement. Install scripts
were disabled in an isolated local test runtime; no paid service or variable
change is required. Prior dependencies, Playwright pin and postinstall unchanged.

Tests use injected mock clients and synthetic mail only, including authentication,
localized Sent, reply text, secret-safe failures, wrong/stale IDs, size bounds and
admin access. Actual-document UI tests prove mail HTML remains text, connection
status updates and phone control sizes. Live verification reads counts/status
only and never publishes subjects, bodies, senders, recipients or credentials.
