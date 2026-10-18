# Email lists messages but one message read failed

Observed read-only during PR#386 verification on2026-10-18: Inbox loaded28
message rows, but opening one ended at the existing generic UI error
"Email unavailable. Check the connection in Settings." Buyer draft/Leads
reads continued working. No contact identity, subject, message ID, body,
credential or source screenshot is reproduced here.

Voice changes touched no email server/reader code and attach no controls
until an editable message body is rendered; this read failed before that.
The incident is recorded, not assumed to be a voice regression or a bad
password. Do not rotate secrets or send a test email to diagnose it.

Trace already gathered: modules/email/mailbox-reader.js:49-75 uses bounded
read-only IMAP UID/UIDVALIDITY fetch, a2MB message/8MB thread limit and parse;
registerMailboxReads returns safe email_* codes with a generic human error.
dashboard/wos-email-reader.js request currently loses that code and shows
only the generic message. A size limit, stale UID, mailbox connection or
another failure cannot be distinguished from the current UI observation.

Next bounded diagnostic: reproduce with hermetic injected IMAP/parser clients
and existing route tests; preserve read-only locks, no Seen-flag write, byte
caps, auth and error redaction. Show recognized safe failure reasons where
available, never provider raw errors or credentials. A single ordinary
read-only UI observation may confirm the reason after release; no repeated
mailbox crawl, connection-test action, send, import, link save, credential,
provider/settings change or business-data write is authorized by this note.
Do not infer a root cause from one failed message read.
