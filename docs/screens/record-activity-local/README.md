# Synthetic full-page activity proof

The actual dashboard HTML and all local scripts were served with an in-memory
synthetic store. The fixture deliberately has a reviewed deal, an approved fixture
buyer, a criteria match, stage history and a reported interaction. This is NOT
production inventory. No user/session credential or real contact data was used.

`scripts/verify-record-activity-ui.js` proves at 1366/400/412: stable references
and subject text, shared card history, matching parent refs, Activity filters,
global reference search opening the right buyer, JSONL parsing, unchanged home
mount order, no page overflow/errors, and zero HTTP writes/external source calls.

| View | Desktop | Phone | Android width |
|---|---|---|---|
| Deal and match references/history | [1366](synthetic-deal-1366.png) | [400](synthetic-deal-400.png) | [412](synthetic-deal-412.png) |
| Activity | [1366](synthetic-activity-1366.png) | [400](synthetic-activity-400.png) | [412](synthetic-activity-412.png) |
| Buyer/history via shared search | [1366](synthetic-buyer-1366.png) | [400](synthetic-buyer-400.png) | [412](synthetic-buyer-412.png) |

The metadata assignment and JV-generation writes are tested in a separate local
route fixture, not clicked here or during production verification. New UI uses
theme-variable fallbacks; broader legacy Android issues remain #294.
