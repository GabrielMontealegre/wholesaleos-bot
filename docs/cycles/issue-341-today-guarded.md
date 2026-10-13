# Guarded Today Rollout

Base: ac570ebd703ebdb722c4e343ba905355d7bbac37, verified scoped Tabler release.
Prior tested Today files are restored from the retained #345 branch, not from
an unreviewed checkout. Production activation remains false in the pinned
wos-feature-flags.js. An absent/non-boolean flag leaves the existing renderer
untouched and makes zero Today DOM/network calls. The ON preview is only an
explicit synthetic fixture override, not a production browser preference.

Per #347, verify the exact deployed head's /dashboard200 and served assets
before a separate activation commit. No Railway variable/service/billing edit.
Release metadata now lives with immutable module code, not mutable data/.
Prior Dockerfile/static paths did not change. Pasted startup logs do not prove
the failed deployment's cause. This is a concrete packaging-risk correction,
not a claim that missing-file failure was established from provider logs.

## Trace

Conversation reports are written by conversations.upsert and mailbox/interaction
writers; the existing classifier now exposes an uncapped internal project.
Public list still caps50/100 exactly. Today replies/urgency come from that same
projection; no second contact-state classifier. Pending approvals use the same
current buyer/deal meanings as approval-workspace. Deadline and value/matches
come from reviewed-deals.evaluate; no comp/price/readiness/offer gate changes.

The interim grade helper reads operator approval/review metadata, canonical
Verified/Preliminary ranges, canonical approved matches, canonical estimated
share and days_to_deadline. Five known criteria give Diamond; one missing Gold;
address/source with multiple gaps Silver; terminal/rejected Archive. Other
unsupported identity is Unrated. Raw claimed ARV/AVM cannot satisfy value.
It writes nothing and never clears a gate. Best list remains the conservative
reviewed/value-backed/positive-share/current-deadline subset of Diamond/Gold.
All record grades remain available in the private read model, including Gold
that is not safe to include in the best reviewed list. Rank uses the prior
known share/urgency formula, not a new offer calculator or invented forecast.

Last24h uses recorded activity/release timestamps; reported email is labeled
reported, not delivered. Release timestamps are existing verified deployment
records. No routine/request data invented. Best headings use source address or
coarse city/ZIP until existing JV full-package guards allow the address.

Frontend flag ON replaces only the home renderer, retains conversation tools,
links to Approvals and existing buyer/deal/activity openers. Source desk mounts
after Today; default OFF keeps the previous mount order. Reload failure clears
cached work; old-session responses cannot repaint after the existing sign-out
is called. Kit enhancement reads DOM/scheme only, no credential/data writes.

## Tests and Assertions

Restored tests retain125-row reconciliation, public cap, report privacy,
wrong-origin/future/missing/stale cases, no mutation and pure spies. Grade status
expectation changes from undefined to interim per #344; its real fixture room
is6625 and correctly Gold, not inflated to10000. New threshold/one-two-missing/
terminal/nonfinite/claimed-value negatives; OFF no DOM/network; logout race.
Real local ON proof includes every KPI,record opener,Approvals link,GET refresh,
activity,modal,mount timer,503/cache clear,1366/1920/400/412 normal clicks.

Existing main assertions changed only dashboard-public-deal-queue.test.js864
and921: current script55 to56 for the intentional UI mount/cache change.
All source/value/contact assertions unchanged. Fixture helper adds only an
explicit ON scenario and real approval read routes; non-GET blocked as before.
Full suite600s/file and exact protected diff required before release.

## Current State

Full suite SUMMARY passed=181 failed=0 skipped=0 total=181,600s/file.
Today UI32.06s,unit0.64s,grade/flag0.12s,shell41.93s,mount15.67s.
All durations in docs/test-results/issue-341-today-guarded.txt. Final overview
screenshots are fresh normal loads after two paint frames; existing flow
assertions unchanged,focused proof rerun. Screenshot-only capture assertions
check visible shell; no product code or source assertion changed after suite.
PR #353 merged as b31b8ff68962bdddfb74573ac4c356803ee68b12. Exact Railway
deployment7049150037 succeeded in56s. Health/dashboard200, served flag false;
authenticated100 lead rows and normal drawer open/close,0new console errors.
Today correctly absent while OFF. See issue-341-today-activation.md for the
subsequent separately tested activation; no original deployment-cause claim.
Flag OFF is not a claim that the new Today UI is live. Subsequent activation
requires exact-head dashboard/health/asset/read-only checks. Other P0 slices
and Gabriel sign-off remain. Non-P0 tasks stay paused.
