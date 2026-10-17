Item: #366 F - bounded Gmail-style Email workspace

Fixed Inbox/Sent/role choices, separately scrolling message list and reading
body, source sender names kept to one line, subject/snippet/human time and
known-role colors. Unknown rows no longer repeat a Link to a person pill;
that small explicit action remains in the opened conversation. Secondary
physical folders/labels/notes remain in an accessible native chooser instead
of clipping the fixed column or adding an inner folder scrollbar.

Writer/reader trace: mailbox-reader metadata -> sender_name from structured
IMAP names or installed MIME parser on Google From headers -> thread-view
spread (unchanged role/link predicates) -> escaped UI sender label. Missing or
failed name parse remains empty, not a name guessed from an email local part
or a private linked-record name. No extra mailbox/server fetch. Browser folder,
role, thread and sequence state stay in wos-email-reader; CSS bounds only the
Email surface. Full trace: docs/cycles/issue-366-f-trace.md.

Tests added: inbox-load-layout.test.js uses injected mailbox clients and the
actual dashboard at1366x768/400x915/412x915: header-name provenance, missing name,
parser-failure privacy, no inferred role,30 messages, fixed reachable controls,
independent list scroll, long sender/subject fit, open/back, disabled Reply Send,
zero writes and no external requests. Existing mailbox-reader, thread read/view,
stale/auth-loss state, inbox workspace, persistent linking and conversation
email proofs pass.

Existing assertions changed: none. scripts/verify-inbox-workspace.js:37/39 now
selects notes/labels from the native chooser instead of the removed duplicate
folder buttons/details menu. All original grouping, role, privacy, no-write,
missing-label failure-clearing and disabled-send assertions remain.

Decisions used: D-056,AGENTS3/5; ASSUMED fixed folder/secondary chooser and
source-header-only display-name entry logged. No new dependency or credential.
Protected comp/readiness/matching/JV/auth/send files stay byte-identical to main.
No mail is marked read, linked, saved, sent or refreshed as a business action.

Risks / follow-ups: role filters apply to the real latest30 response, not a
pretend all-mail search. Sender headers are source text, not verified identity.
Generic Reply Send remains disabled; C's separately reviewed buyer-email route
is unchanged. C's68-buyers/zero-match feed gap remains with architect issue#379.

Full suite: pending exact-head hosted200-file run,600s per file. No merge until
green. Post-deploy verification: pending exact deploy and read-only1366/400/412
folder/thread clicks. No Test connection POST/link form/reply/send or business
write. Screenshot captures exclude private people/message content.

Synthetic proof:
![Desktop](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-f-email-layout/docs/screens/2026-10-17-366-f/synthetic-inbox-1366.png)
![Android](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-f-email-layout/docs/screens/2026-10-17-366-f/synthetic-inbox-412.png)

Carries the C post-release proof checkpoint to avoid a docs-only deploy.
Does not close all of #366 or infer Gabriel's #341 sign-off.
