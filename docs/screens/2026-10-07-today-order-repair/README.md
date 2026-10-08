# Today/JV ordered repair: live read-only proof

[PR #295](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/295), application
merge `a10cd5dc19dbc9dfe189f09d41be4275a5e23356`. Railway exact-commit status
success; health 200; served public bundle v55, help v2, Today v1.

The signed-in home DOM reported its first two children as `wos-todays-deals`,
then `wos-public-deals` after hydration, after navigation/return, after the real
mount timer, and on one fresh stable reload. Each panel appears once. Deal Finder
still has its public desk first and no Today section. Source summary hydrated
(301 selected-market rows), 12,039 saved records loaded, 100 lead rows rendered,
and a lead card opened/closed read-only.

Actual reviewed-deal inventory: 0 submitted, 0 vetted today, 0 eligible JV. No
fake records were added to demonstrate cards or reach the ten/day target. Complete
card/source/comp/buyer/stage behavior was proved with explicitly synthetic local
fixtures, not production imports. The live Glossary has 37 terms. Keyboard and
tap help opened/closed. Empty buyer/deal import forms rendered without Preview or
Import being submitted. Buyers found showed 26 stored items; this observation is
not an audit or a claim that all 26 are approved/verified.

## Screens

| View | Desktop 1366 | Phone 400 | Android-width 412 |
|---|---|---|---|
| Home order | [Desktop](dashboard-1366.png) | [Phone](dashboard-400.png) | [Android](dashboard-412.png) |
| Today | [Desktop](today-1366.png) | [Phone](today-400.png) | [Android](today-412.png) |
| JV | [Desktop](jv-1366.png) | [Phone](jv-400.png) | [Android](jv-412.png) |
| Glossary | [Desktop](glossary-1366.png) | [Phone](glossary-400.png) | [Android](glossary-412.png) |
| Empty import form | [Desktop](import-1366.png) | [Phone](import-400.png) | [Android](import-412.png) |

Home captures stop after the source-desk heading, before any private property or
owner details. Import captures stop at the empty form, before buyer records. No
owner, phone, email or mailing details were published. New panel/form bounds fit
400/412 and there is no page-level horizontal scroll. The existing off-screen
header buttons, small tap targets and broader legacy phone issues are NOT claimed
fixed; #294 tracks them. Broader/context-specific tooltip coverage remains #285.

## Tests and incident

Final suite: 128 passed, 0 failed, 0 skipped; 600s per-file limit. Mount proof
14.72s; county-notice acquisition test 10.36s. Both stale script-version test
expectations changed from v54 to v55, preserving their intent. No safety assertion
was weakened; comp/readiness/security modules were unchanged. Delayed-glossary
card proof also passed, including Android width. Diff check clean.

The rollout console recorded one saved-record HTTP 502 at
`2026-10-08T00:28:36.049Z`. It recovered. One fresh load subsequently hydrated with
no new console errors. The exact query/response body was not retained and is not
invented here. [#209](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/209)
was reopened per A-003. This is not a claim the entire rollout console was clean.

No production import, approval, status record, contact, evidence confirmation,
capture, acquisition, refresh, batch or buyer deletion was performed. Existing
scheduled server jobs were not started or changed. #292 is resolved; #283 remains
open for its architect-added reference-number/activity slice, followed by #285.
