# Email Workspace Release Proof

PR#380, merge98487b80bb4eef394c89a6063488fcbaa588c34d.
Tested head256a028290a13a3a63a464a3821932a5c5b455ee.
Hosted39079186579: SUMMARY passed=200 failed=0 skipped=0 total=200.
Job9m39s,600s/file; acquisition204.45s,inbox-load-layout3.31s.
Every file timing:docs/test-results/issue-366-f-final/full-suite.txt.
Earlier revision runs were concurrency-cancelled, not failing suite results.
Protected-file diff empty; git diff --check clean; tests/.tmp absent.

Exact Railway7147388051: in_progress23:42:07Z,success23:42:52Z.
Post-success health200; served inbox CSS?v=2 and reader JS?v=4.
Live1366x768,400x915,412x915: folder controls and native chooser reachable,
no page horizontal overflow. Sent loaded30 actual messages; one conversation
opened and Back returned to the list. Title role filter returned no messages.
Source sender names remained source data; no private messages are in proof images.
100 lead rows hydrated and an address cell opened/closed the lead drawer.

Initial deploy-transition load recorded a lead HTTP502 and mailbox unavailable.
After reload and ordinary Sent navigation the mailbox showed Connected
(App Password). No later console errors observed; do not describe the entire
verification history as error-free. No Test connection or credential/settings
action was taken. The initial Inbox failure was not disguised as a successful
Inbox message load; real conversation verification was on Sent.

Known narrow phone polish: Attorneys wraps its final s at400/412. Controls
remain reachable and there is no overlap; a future scoped label/padding change
should pin full-word readability, not merely horizontal overflow.

No Send, draft save, link, mailbox mark-read, import, approval, capture, batch,
contact or evidence confirmation. No production business-data write.
Generic Reply remains disabled by unchanged logic and hermetic tests.
C feed reconciliation remains BLOCKED#379. Calendar B is next, not yet implemented.

![Desktop](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-b-calendar-hub/docs/screens/2026-10-17-366-f/live-empty-1366.png)
![Phone](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-b-calendar-hub/docs/screens/2026-10-17-366-f/live-empty-400.png)
![Android](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-b-calendar-hub/docs/screens/2026-10-17-366-f/live-empty-412.png)
