# Email read proof (#288)

Local images use labeled fictional mail. Live images crop only connection status;
no account address, subject, sender, recipient, message body or credential appears.
Email and Settings passed 1366/400/412 widths with a 44px Test target.

Merge 5354556: exact Railway success, health 200, reader v1, real App Password
connection and Test success. Inbox and Sent each displayed 30 metadata rows;
these are capped page counts, not mailbox totals or counts of seller replies.
No message body was opened. Unauthorized and identity-only requests returned 401.
Startup saved-leads 502 recovered on a fresh load: 12,039 records hydrated,
100 lead rows and a card opened/closed, zero fresh-load console errors.
Full suite 135 passed, no failures/skips; durations in issue-288-email-read.txt.
No sending, deletion, labels, draft write, Activity sync, batch or confirmation.
