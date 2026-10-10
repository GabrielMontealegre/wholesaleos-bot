# Backlog

Work top to bottom per `AGENTS.md` §2. One item = one PR (split into ordered sub-PRs if large).
Status values: TODO · IN PROGRESS · DONE (PR link) · BLOCKED (issue link).
Mark the status here as part of each item's PR.

## Run log

(Newest first. Date — items done — items blocked — assumptions.)

2026-10-10 -- #321 resolved by architect independent authenticated Chrome
read-only check: dashboard/Today load and deal-card opening verified; Leads
hydration not re-checked this import-only release. No writes/sends. #320 release
verification accepted; no product rollback required. #307 briefing integration
IN PROGRESS: explicit conversation records use the shared pure read model,
uncapped totals/capped lists, redacted refs/channel-only summaries and unlinked
counts; legacy activity fallback preserved until reports exist. No new clock,
network, write, send or schedule enablement. Settings Preview briefing uses
the existing admin GET only; escaped text, failed-response redaction and
duplicate-read guard proven. Final suite146 passed,0 failed,0 skipped,600s/file;
timings docs/test-results/issue-307-brief-preview-release.txt. An initial
unchanged comp-capture test returned local_capture_error instead of unknown-page;
it passed isolated and in subsequent full runs without assertion/code changes.
Cause not established. Release/live gates pending; #307 is still not DONE.
Order stays #307; government NC/Charlotte, Florida, then TX (#301/#315);
B-21 FL sales (NC requires its own source); B-09 deed-backed buyers; #299;
#288; #313. Gmail linkage/email approvals, JV stages and triage remain #307.

2026-10-10 -- #307 paired conversation/interaction import implemented and
merged in [PR #320](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/320),
application main286926b. Final suite144 passed,0 failed,0 skipped,600s/file;
timings docs/test-results/issue-307-agent-reports.txt. Existing assertions,
pairing scope/auth/caps, comp/readiness gates and UI unchanged. Atomic mixed
failure, duplicate quiet, after-write hook/failure isolation and privacy proven.
Exact Railway deploy success; public health200/dashboard200; unauthenticated
conversation GET401. Authenticated live hydration/card verification BLOCKED by
browser-control CDP deadlines, not a demonstrated product failure:
[needs-architect #321](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/321).
Do not claim the live gate passed or the full #307 DONE. No production import,
message, batch, contact, confirmation, variable or billing operation.
Next: recover read-only verification; finish independent #307 Gmail/approval,
JV stages and triage work. Then Gabriel's order: #301 government NC/Charlotte,
Florida counties, Texas clerks (terms first); B-21 Florida DOR strict-grid
sales; B-09 deed-backed cash buyers; #299; #288; #313. No overall readiness
percentage re-measured. No new architecture assumption or dependency.

2026-10-10 -- #307 paired-report slice IN PROGRESS: existing write-only
assistant dropbox now shares conversation/interaction validation and atomic
merge with admin import. Same pairing scope,12/hour,50 items,body caps; result
IDs/statuses only. Reply hook after persistence, duplicate quiet, failure isolated.
Focused negative route proof passed; final suite144 passed,0 failed,0 skipped,
600s/file. Durations: docs/test-results/issue-307-agent-reports.txt.
Release/live gates pending in PR #320; #307 is not fully DONE.
No live import, message, batch or evidence confirmation. #307 remains open.
Gabriel's updated order: finish #307; #301 government foreclosure records
(NC court/Charlotte, Florida counties, then Texas clerks), each terms checked;
B-21 Florida Department of Revenue files and strict-grid sales; B-09 real cash
buyers with deed proof; #299 daily brief; #288 dashboard send/packages/JV;
#313 photos. Source price records never bypass the strict grid or self-exclusion.

2026-10-10 -- #307 D status + A1 conversation/reminder slices released in
[PR #318](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/318) and
[PR #319](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/319).
Application main 46b639a; exact Railway success, health200. Actual home:
"12 waiting or due; showing 13 of 13 open conversations." Reminders precede
Today and the public desk; three deal cards hydrated. Leads show 12,039 saved,
100 loaded; card opened/closed read-only. Desktop1366 and phones400/412:
no overflow/off-screen conversation controls; no fresh-load console errors.
Final suite143 passed,0 failed,0 skipped (600s/file); conversations0.20s,
admin-route0.58s, mount16.62s, mobile14.49s, record-UI16.17s, county-notice10.71s.
Durations: docs/test-results/issue-307-conversations-final.txt. D suite141 green.
Live status-only D crops committed; A1 synthetic desktop/phone crops committed
and explicitly fictional. A1 live count-header screenshot API returned
"Unable to capture screenshot" twice despite valid bounds: live pixel-artifact
gap is recorded, not presented as a product error or fictional live proof.
Telegram configured; delivery untested; scheduled briefing OFF under existing
background guard. No setting enabled. #307 remains IN PROGRESS: A2 (Gmail
thread linkage, paired dropbox kind, per-kind email approval/templates and
brief integration), B stages and C dry-run/reversible triage remain. No new
deal/value/contact evidence, send, import, batch, confirmation, source access,
variable or billing operation. No overall completion percentage re-measured.
Next: finish #307; then #301 government-first, Florida/North Carolina first
per Gabriel/#315; then #299, #313. ASSUMED A1/A2 split/cadence in DECISIONS.md.

2026-10-10 -- #307D verified live: PR #318, merge 0fc00a3; exact Railway
success and health200. Settings reports "Telegram configured - delivery not
tested" and "Scheduled daily briefing is disabled by the existing background
setting." No ingestion setting enabled. Live status crops at1366/400/412;
phone overflow0, refresh >=44px. Signed deal link WOS-FL-1012 opened; Leads
displayed 12,039 saved/100 loaded and a lead card opened read-only. Initial
lead502 recovered; warm load had no new console errors. All141 tests passed,
no skips/failures. No message/import/batch/contact/confirmation operation.
#307 A1 IN PROGRESS: reported conversation records, append-only import/upsert,
pure activity projection, Day0/2/5/weekly reminders and home panel before Today.
Final suite 143 passed, 0 failed, 0 skipped, 600s/file; full durations:
docs/test-results/issue-307-conversations-final.txt. Original first-position
assertions updated only as D-050 explicitly requires; privacy/no-write checks
retained. Release/live gates pending; do not claim all A or #307 DONE.
Next remains #307 A2/B/C, #301 government-first (Florida/North Carolina first,
#315), #299, #313. No overall golden-path percentage re-measured.

2026-10-10 -- #307D Settings status follow-up: normal authenticated dashboard
GET presents configuration and the unchanged schedule guard, with a read-only
refresh control. Direct navigation was blocked on both diagnostic paths; no
cause based solely on path wording is asserted. Local actual-document proof:
six widths, no writes/external requests/errors, >=44px controls. Separate
negative proof: import quiet, escaped status text, failed response redacted and
truthful, GET only. Status-only fictional crops:
docs/screens/2026-10-10-owner-status/. Final-state suite: 141 passed, 0 failed,
0 skipped, 600s/file; timings in docs/test-results/issue-307-settings-status.txt.
Live release gates pending; #307 remains IN PROGRESS, A/B/C not delivered.
Order: finish #307, #301 government-first per #315, #299, #313.
No messages, imports, batches, confirmations, variables or billing changes.

2026-10-10 -- #307D application PR #316 merged as e862582; exact deployment
and health200 confirmed. Diagnostic navigation under /api/notify was blocked
client-side, so the diagnostic verification gate is not claimed passed yet.
Same admin/no-store/no-send handlers gain explicit dashboard read aliases;
no client filter or credential is changed. Full alias regression run in progress,
docs/test-results/issue-307-read-alias.txt. No live send/import/batch/outreach.
Government-first #301 scope from #315 is retained; private publisher stays disabled.

2026-10-10 -- #307D release gates GREEN in PR #316, live verification pending.
Full suite 141 passed, 0 failed, 0 skipped, 600s/file; exact durations:
docs/test-results/issue-307-telegram.txt. Owner-only sender/admin route, quiet
read-only diagnostics, reply-import failure isolation/idempotence, UTC-7 schedule
under unchanged enable guard, real reviewed value/counts, closed-record suppression,
privacy and tested card deep links at 1366/400/412. No live send or import.
No comp/contact/date/auth safety rule or dependency changed. #315 architect
answer received: #301 is re-scoped government-first and back in the queue;
Brock & Scott remains disabled. Publisher terms/access verdicts must be recorded.
Current order: finish #307, #301 government slice1, #299, #313.

2026-10-10 -- #310 already DONE. #301 first-publisher permission hold #315
still OPEN with no architect answer; no source access/ingestion repeated.
#307 sliceD advanced in draft PR #316: fixed-owner sender, capped admin notify
route, read-only status/brief routes, daily-summary replacement, 7AM UTC-7
schedule under unchanged background guard, and after-commit incoming-report hook.
Import preview/duplicates stay quiet; notification failure cannot fail a committed
import. Logs contain only sent/failed + validated ref; upstream errors sanitized.
Focused briefing/sender/import/existing-import/send-disabled tests PASS;
server/bot syntax checks PASS. Full suite, remaining briefing edge cases/direct
card link and self-review/deploy gates STILL PENDING: DO NOT MERGE this draft.
No live Telegram test, import, batch, outreach, credential/variable/billing change.
Next: finish #307D release gates, then #307 A/B/C, #299, #313. No percentage
re-measured. No new production release this run.

2026-10-10 -- #310 remains DONE/closed, no new findings. Current main refreshed
to 1cbc687. #301 slice1 first publisher BLOCKED on commercial-use permission:
[needs-architect #315](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/315).
First-party list exposes the expected fields, but Terms of Use restricts copying
and redistribution to personal noncommercial use without written approval.
This is not an explicit robots-ban finding or a claim that all NC data is blocked.
No list rows captured/ingested, pagination, county enrichment, source enablement,
production batch or outreach. No new deals claimed. Independent #307 sliceD
is IN PROGRESS: pure briefing builder implemented, focused test passes; no
network/clock/write side effects. It ignores legacy raw ARV/spread fields and
future interactions, uses injected UTC-7 local days, and omits private identities.
Transport/schedule integration, broader negative tests and
full-suite/release gates remain pending. Order: #301 permission hold -> #307 ->
#299 -> #313. No overall completion percentage re-measured.

2026-10-10 -- #310 DONE in [PR #314](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/314),
merge `a1897de`. Exact Railway deployment succeeded; health 200; Today v5.
Live WOS-FL-1012: three exclusion controls, zero wider comps, value Not established;
all three comps still reject strict_grid_distance_not_applied. Coordinates must
come from the assistant's sourced update, not this verification. No real import,
approval, exclusion or confirmation. New controls fit 1366/400/412, >=44px;
12,039 saved records, 100 lead rows, card opened/closed. Startup lead502 recovered.
Local fictional wider cards show Preliminary; live crops contain input label only.
Full suite 137/137, no failures/skips; county-notice18.13s, wider-unit0.24s,
wider-UI11.92s. D-051 keeps one
mile as default; a thin reviewed pool can admit up to 2.5 miles with all other
rules intact and a Preliminary ceiling. Fingerprinted admin exclusions require
a reason, survive updates and append history/Activity; no submitted sale erased.
Full suite: 137 passed, 0 failed, 0 skipped; 600s/file; exact durations in
docs/test-results/issue-310.txt. Config-object expectation gains only D-051's
two constants; normalized fingerprint repinned, safety assertions retained.
No source, batch, import, confirmation, contact, variable or billing operation.
Read-only live verification passed. ASSUMED scope/trace:
docs/reviewed-wider-area-comps.md and DECISIONS.md.
Gabriel's current order is #310 -> #307 (D, A, B, C slices) -> #299.
No overall first-deal completion percentage was re-measured. #307 is next;
#299 is not started in this run. No blocked item or new architect decision needed.

2026-10-08 -- #288 mailbox-read slice DONE in
[PR #311](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/311), merge
`5354556`. Exact Railway deploy succeeded; health 200; Email reader v1 served.
ACTUAL Email/Settings: Connected (App Password); Test connection succeeded;
30 Inbox and 30 Sent rows displayed (page counts, not mailbox totals or a
claim of 30 seller replies). No contents/identities copied into reports.
Desktop/400/412: no page overflow, Test target 44px high, no error message.
One startup saved-leads HTTP502 recovered on a fresh load; 12,039 records,
100 lead rows and card opening confirmed; zero fresh-load console errors.
Unauthenticated and identity-only email test requests returned 401.
Privacy-safe status crops: docs/screens/2026-10-08-email-read/.
App Password preference,
real Inbox/replies and Sent, localized folders, admin-only Test connection,
honest status and text-only MIME display implemented. Two pinned maintained
mail clients; Node minimum 20+. No send/draft/write/label/activity job enabled.
Final full suite: 135 passed, 0 failed, 0 skipped; 600s per-file limit;
county-notice acquisition 10.23s, mailbox tests 3.93s, full UI 14.27s.
Two self-review fixes: missing-label status and constructor slot cleanup.
No existing safety assertion changed. Final results in
docs/test-results/issue-288-email-read.txt; read-only live verification passed.
No live mail accessed during building; verification read metadata only.
No credential exposed, variable/billing change,
batch, capture, outreach, evidence confirmation or database mutation.
Assumption and trace: docs/email-mailbox-read.md, DECISIONS.md. Next after this
slice: #299 Daily Brief/Log in Gabriel's order; wider #288 send/draft work remains.

2026-10-08 -- #304 requested matcher + update-by-reference group DONE in
[PR #306](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/306), merge
`8999b0f`. Exact Railway deployment succeeded; health 200; Today v4 and buyer
v6 served. ACTUAL WOS-FL-1012 detail visibly matches BUY-0005 at 1366/400/412;
rehab/structural notes are checks, max price remains unknown. All three comps
still reject as strict_grid_distance_not_applied; no ARV was invented.
Actual counts: 1 submitted, 0 vetted today, 0 eligible JV. 12,039 records
hydrated, 100 lead rows and a lead card opened/closed. Console errors: zero.
Privacy-safe live buyer-reference crops contain no buyer name/contact/address.
Full suite: 134 passed, 0 failed, 0 skipped; 600s per file; exact durations in
docs/test-results/issue-304.txt (county-notice acquisition 15.81s; marketplace
UI 14.01s; new matcher/update test 0.24s). Conservative percentage ranges;
notes become checks, explicit flood conflicts still exclude; geographic
candidates do not approve a deal or invent a ceiling. Explicit deal_update
supports eight whitelisted fields with provenance, old/new audit, preview
concurrency protection and comp-change review reset. Card JV share is explicit;
unchecked comp review/incomplete terms show inline errors with zero requests.
Comp grid, date/contact/auth gates, dependencies and source routing unchanged.
No production data writes, import, approval, terms save, outreach or confirmation.
Broader #304 tab audit is not claimed complete. Next: #288 email fallback, then
#299 Daily Brief/Log; then #285, #275, #277, #262, #264, #303, #301.
Overall first-deal readiness is not re-scored; PLAN's approximate 35% baseline
is not a measured completion percentage. BUY-0005 matching is real progress,
not a completed valuation or closed deal. #288 is the next active item.

2026-10-08 -- #294 IN PROGRESS: marketplace/mobile core slice DONE in
[PR #305](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/305), merge
`85d9a15`. Exact Railway commit deployment succeeded; health 200; marketplace
v1 and Today v3 served. Read-only live checks: 12,039 records hydrated,
100 lead rows, a lead card opened and closed. Ten screens checked at 1366/400/412;
phone control bounds and 44px hit targets passed; no current-release console errors.
Three desktop Leads actions remain in the existing horizontal scroll wrapper,
accessible by scrolling (not claimed as zero offscreen controls). Broader table
scroll guidance remains in #294. Production header-only before/after screenshots
exclude personal data; full local images are labeled fictional test data.
Actual Today counts: one submitted (WOS-FL-1012), zero vetted today, zero eligible JV.
Full suite: 133 passed, 0 failed, 0 skipped; 600s per-file ceiling,
durations in docs/test-results/issue-294.txt. County-notice acquisition 11.97s;
actual marketplace UI proof 11.21s. Ten screens checked at 360/393/400/412/1366/1920;
real hit-area bounds, forms, search, card navigation and no-write assertions.
Default light palette follows the latest architect comment, superseding Night desk.
Backend, auth, dependencies and stored records unchanged. No production operation.
No production data written; do not treat local fictional screenshots as live inventory.
Remaining #294 slices: iPhone/WebKit, optional dark toggle, holder-photo intake;
buyer legitimacy grading belongs to #262 and is not invented here.
Next authorized order: #304, #288, #299, #285, #275, #277, #262, #264, #303, #301.

2026-10-08 -- #297 DONE ([PR #302](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/302)),
application merge `9e511ca`. Final suite: 132 passed, 0 failed, 0 skipped;
per-file durations in docs/test-results/issue-297.txt (actual UI 18.67s,
county-notice acquisition 17.34s). A prior new UI assertion checked collapsed
text; opening its details fixed the fixture. git diff --check clean; no secret
pattern hits. Current-main integration added architect documentation only.
Exact Railway deployment succeeded; health 200 after one rollout 502;
record bundle v2 served, 12,039 leads hydrated, 100 rows and a lead card opened,
zero release console errors. Exactly ONE authorized reference operation ran:
private byte-for-byte backup 67,308,046 bytes, then 4 buyers assigned / 0 deals /
0 matches / 0 legacy leads touched. Missing refs before/after: buyers 4 -> 0,
deals 0 -> 0, matches 0 -> 0, legacy leads 12,039 -> 12,039. All 57 state/territory/
unknown namespaces reserved, minimum 1030. Activity total 56 -> 60, only four
reference-assigned additions. Executable guard preserves facts, aliases,
approvals, eligibility, contact outcomes and prior history. Live count-only
reference receipts fit 1366/400/412, including 412 x 915 Android-oriented proof:
[screenshots](screens/2026-10-08-bounded-reference/README.md).
No acquisition/enrichment batch, source request, import, approval, outreach,
contact outcome, capture or evidence confirmation. No new deals or comps.
Assumptions: 500 cap; no matching/expiry synchronization; lazy single-record
lead action only. No blocked item. Overall first-deal readiness is not advanced
by assigning references; PLAN.md's approximate 35% baseline is not re-measured.
Next item/run per Gabriel: #294 (Night desk / Android), then #299, #288, #285,
#275 (Section 8 lens), #277, #262, #264.

2026-10-07 — #283 IN PROGRESS; references/activity foundation DONE in
[PR #296](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/296), application
merge `172c624`. Full suite: 131 passed, 0 failed, 0 skipped; timings in
`docs/test-results/issue-283-record-activity.txt` (actual UI 18.97s, county-notice
acquisition 13.17s). Exact Railway status success, health 200, record bundle v1,
buyer v5 and Today v2 served. Live read-only: Activity shows 39 retained historical
events; approval filter 26; city search 9 stored-record/buyer results; selected
buyer history opens. New views fit 1366/400/412; 12,039 saved records hydrate,
100 lead rows/card open, Today remains first; no current-release console errors.
[Evidence](screens/2026-10-07-record-activity/README.md). No assignment, import,
approval, draft generation, contact, confirmation, capture, batch or source run.
Existing canonical-reference application is BLOCKED pending bounded authorization
in [#297](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/297): 12,039
leads and 30 buyers missing, 0 reviewed deals. No hidden backfill. Large local
fixture assigns 12,039 uniquely; namespace exhaustion/conflict preserves input.
Assumptions/scope: `docs/record-activity.md`; broader legacy card/help wiring
remains independent. #283 stays open; this is traceability, not new vetted inventory.

2026-10-07 — #283 IN PROGRESS; ordered mounting repair DONE in
[PR #295](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/295), application
merge `a10cd5d`, resolving #292. Full suite: 128 passed, 0 failed, 0 skipped;
durations `docs/test-results/issue-283-repair.txt` (actual mount test 14.72s,
county-notice acquisition 10.36s). The actual dashboard test first reproduced the
original failure, then proved init/hydrate/render/timer/return at 1366/400/412.
Exact Railway status success; health 200; public bundle v55, help v2, Today v1.
Live Dashboard: Today's Deals first, source desk second after hydration and return;
Deal Finder ordering unchanged. Today/JV/Glossary/import forms rendered at all
three widths; help worked by keyboard/tap. Actual inventory: 0 submitted / 0 vetted
/ 0 eligible JV, not ten fabricated deals. Existing records hydrated (12,039),
100 lead rows and a card opened. One rollout HTTP 502 recovered; fresh load had no
new errors, and A-003 incident [#209](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/209)
was reopened honestly. [Live evidence](screens/2026-10-07-today-order-repair/README.md).
No import, approval, contact, confirmation, capture, batch or buyer deletion.
No source/readiness/comp/auth gate changes. Assumption: ordered slices; #283 stays
open for stable references + append-only activity next, then broad #285 coverage.
Known Android header/target problems stay in #294; this run does not claim them fixed.

2026-10-07 — #283 BLOCKED ([#292](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/292)).
[PR #291](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/291) passed
127/127 tests, no skips, and merged as `3a0d59e`. Railway succeeded and health was
200, but read-only live verification found the older source desk inserted before
Today's Deals. The required first-panel order failed, so the application merge is
being reverted per AGENTS section 7. Actual new inventory: 0 submitted, 0 vetted,
0 eligible JV; the ten/day goal is unmet. Component-only proof missed the existing
mount lifecycle. #285 remains open; no production data was written by this run. Assumption:
preserve the implementation on its branch; require an actual mount/re-render test
for the ordered repair. Rollback final suite: 124 passed, 0 failed, 0 skipped;
durations in `docs/test-results/issue-283-rollback.txt`. One incidental ambiguous
date fixture was stabilized across midnight without changing null expectations or
product parsing. Rollback [PR #293](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/293)
merged as `408e661`; exact-commit Railway status success, health 200, prior script
restored. Signed-in read-only verification: 12,039 records hydrated, 100 lead rows,
lead card opened/closed. No new console errors after rollback (one earlier deploy
502 recovered). [Evidence](screens/2026-10-07-today-order-failure/README.md).
No imports, approvals, contact, confirmations, batches or buyer deletion. One item
handled this run; #283/#285 remain open. Next independent user-ordered item: #275;
the #283 repair needs actual full-dashboard mount-order coverage, tracked in #292.

2026-10-06 — #269 IN PROGRESS: first ordered safety slice deployed in
[PR #282](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/282), merge
`adfd6d0`. PR #280 was reverted after live Pipeline contrast failed; the scoped
repair passed actual-theme contrast checks and production desktop/phone checks,
resolving #281. Full suite: 124 passed, 0 failed, 0 skipped; timing record:
`docs/test-results/issue-269-safety.txt`. Railway succeeded; `/health` 200;
`wos-operational-views.js?v=2` served. Pipeline, Outreach Hub, Matching and Review
rendered at 1366/400 with no current-release console errors. Observed: 12,039
saved records, 10,664 needing address proof, 0 working properties, 0 link conflicts.
Held-record counter opens 50 of 10,664 records without writes. No batch, contact,
evidence confirmation or production data mutation. Screenshots/report:
[operational safety](screens/2026-10-06-operational-safety/README.md).
Remaining #269: Dashboard/Deal Finder row and count navigation, broader link/filter
coverage, sourced property facts and plain labels, All States and Email load states.
#257 phone navigation works, but its keyboard/focus acceptance remains unverified;
leave it open. Assumptions: ordered slices, conservative source proof, bounded
pagination and test-only historical clocks. Next run continues #269, not #275.

2026-10-06 — #271 DONE ([PR #279](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/279)),
application merge `0202654`. The signed-admin buyer import accepts file/paste JSON,
previews redacted counts without writes, and saves only on explicit Import. Optional
bulk approval records the admin/time/reason for new end buyers; other categories and
existing decisions stay intact. Full suite: 123 passed, 0 failed, 0 skipped; final
focused purity checks also passed. Railway succeeded; `/health` 200; bundle `?v=3`.
Live Import form rendered at 1366/400 without overflow or console errors. Source
rows hydrated (296), 100 saved-lead rows rendered and a card opened. Production
find counts remained 0/0/0. No production preview/import, approval, outreach or batch.
[Screenshots/report](screens/2026-10-06-buyer-import/README.md). No blocked item;
assumptions in DECISIONS.md cover preview expiry and preserving duplicate approvals.
This run handled #271 only; next is #269 per item 12.

2026-10-06 — #260 DONE ([PR #274](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/274)),
application merge `77b90fa`. PR #268 was rolled back after a production theme failure;
the corrected tab passed local contrast checks and live desktop/phone inspection.
Full suite: 115 passed, 0 failed, 7 environment skips; real-server session checks also
passed outside the spawn restriction. Railway succeeded, `/health` 200, bundle `?v=2`,
anonymous buyer-find read 401. Production: 0 new today / 0 total / 0 messaged this week;
source rows hydrated (296 in the selected county profile), 100 national saved-lead rows
rendered and a lead card opened. No errors logged for the corrected release; no production
writes, buyer imports, approvals, outreach or batches. [Screenshots/report](screens/2026-10-06-buyers-found/README.md).
#273's rollback finding is resolved. Assumptions: 50-item update, bounded token rate,
UTC counts, conservative duplicate association and partial fit preview (DECISIONS.md).
This run handled #260 only. Current item 12 puts #271 and #269 before #262/#264.

---

> **Priority order right now (architect, 2026-10-06):** work the open `codex-task` issues in
> exactly this order, then the backlog items:
> 1. [#233](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/233) DONE ([PR #236](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/236)): signed session required across `/api`; anonymous lead reads denied in production; `/health` 200; signed-in dashboard still hydrated Dallas rows and opened a card.
> 2. [#234](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/234) DONE ([PR #237](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/237)): server voice-token and outbound-call routes return 410; Call controls open `tel:` links without logging a completed call. Full suite 117 passed, 0 failed, 0 skipped. Deployed `/health` 200; Dialer showed the phone link without a call. A transient saved-leads 502 appeared during reload; source rows subsequently hydrated.
> 3. [#229](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/229) DONE ([PR #238](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/238), [PR #239](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/239)): source-proof origins and read-only exclusion count deployed. `/health` 200 and signed-in dashboard hydrated. Dallas: 291 source rows, 0 visible after-sale, 2 excluded after proof review. San Antonio: 61/0/0; Detroit: 0/0/0; San Diego: 25/0/0; Los Angeles: 15/0/0; Houston: 0/0/0. Full suite: 112 passed, 0 failed, 7 environment skips. No batch.
> 4. [#224](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/224) DONE ([PR #240](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/240)): shared sale-origin allow-list; hearing and unlabeled event dates remain raw and cannot become a sale date. Full suite: 112 passed, 0 failed, 7 environment skips. Railway deploy succeeded; `/health` 200 and signed-in dashboard hydrated 291 Dallas source rows and opened a card. No batch.
> 5. [#225](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/225) DONE ([PR #241](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/241)): whitespace-neutral supersession comparison and regression test. Full suite 112 passed, 0 failed, 7 environment skips. Railway deploy succeeded; `/health` 200 and signed-in dashboard hydrated source rows and an expanded lead card. No batch.
> 6. [#230](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/230) DONE ([PR #242](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/242)): line-ending-neutral comp-grid fingerprint; architect verified the old hash was the CRLF form of the same unchanged rule file.
> 7. [#243](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/243) DONE ([PR #246](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/246)): architect verified network-free that notices with eight address wordings are kept (unknown wording kept as `unlabeled`), the loan date never becomes the sale date, and the real notice corpus produces 0 after-sale records.
> 8. [#250](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/250) DONE ([PR #254](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/254)):
>    36 redacted production screenshots and a six-market read-only count report. Per-market saved-lead
>    counts and seven-day source-success history were not exposed by the existing summaries and were
>    reported as not measured, not zero. No batch or production write.
> 9. [#255](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/255) DONE ([PR #258](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/258)):
>    the SMS loading screenshot was premature. The existing read completed to "No SMS conversations yet"
>    and "Twilio not configured"; the report and captures were corrected without changing send behavior.
> 10. Backlog items in this order (architect, 2026-10-06, second update): B-00a, B-00b, B-10 (contact
>    from the app), B-09 (buyer database), B-19 (match engine), B-20 (agent desk for Muse or Claude),
>    B-18 (WholesaleOS panel in Chrome), B-21 (free statewide data, Texas and Florida first), B-16
>    (land), B-06, B-07, B-08, B-17 (deal summary and first look), then the rest of B-05, B-11, B-12,
>    B-13, B-14, B-15, B-22 (title companies; small, can go earlier if convenient). Parts marked "waits on
>    Gabriel" are built switched off; everything else in the item ships normally.
>
> 11. [#260](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/260) DONE ([PR #274](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/274)): approval, structured buy boxes, duplicate correlation and initial lead fits deployed and verified read-only. PR #268 was reverted and replaced after the theme failure tracked in #273. Gabriel's priority: goes next,
>    ahead of the backlog order in 10.
> 12. **Golden path order (architect, 2026-10-06, third update; replaces the order in 10).**
>     **First, before anything else: delete the 4 test buyers ([#262](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/262) comment, D-047).**
>     First do #260 (Buyers tab, with approval and correlation; DONE in PR #274; #268 reverted), then
>     [#271](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/271) DONE ([PR #279](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/279)): signed-admin buyer import with no-write preview and explicit bulk approval, then
>     [#283](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/283) IN PROGRESS (mounting repair DONE in PR #295; next references/activity, then broad help coverage) (Today's Deals: vetted deals first on the dashboard + deal pipeline;
>     Gabriel's priority, right after the #269 slice in progress; includes the JV tab, D-043, and
>     [#285](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/285) help tooltips), then
>     [#288](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/288) (email drafts/send from the card, JV agreement generator, runs panel), then
>     [#269](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/269) (usability floor: junk leads, wrong links, fake
>     matches, clickable links/rows/counts, plain English; Gabriel can't use the app until this lands), then
>     [#275](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/275) (Deal Check panel on every lead + every lead gets a use + Texas
>     list-price comps), then
>     [#277](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/277) (first-deal lane: Tampa Bay, Florida: foreclosure auctions,
>     verified Florida comps, Deal Check, Tampa buyers), then
>     [#262](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/262) (buyer audit), then
>     [#264](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/264) (end-to-end golden path test).
>     After that: B-09 (public-record buyers, see 13) and B-22 (Title Companies tab, seeded from
>     data/title-companies.json), then turn the golden-path steps green in this order:
>     B-00a (finish PR #245), B-00b, B-06,
>     B-08, B-19, B-17, B-10, then B-20, B-18, B-21, B-16, B-07, the rest of B-05, B-11, B-12, B-13,
>     B-14. **B-15 (front-end pass) waits until golden-path steps 1–8 pass.** Every PR that touches
>     the path posts the step table.
> 13. **Tabs, one engine (D-037).** Leads, Buyers, Title Companies, Outreach and Deals (the machine view:
>     each deal's golden-path stage) are separate tabs on one shared engine. B-09 (buyers from public
>     records) moves up to right after #264 (before B-00b): it's how the SaaS finds buyers in every market without Facebook.
>
> #223 is DONE ([PR #232](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/232)). A new `codex-task` labeled
> BLOCKER goes ahead of everything that has no code pushed yet. End every run with a Run log
> entry above (AGENTS.md §2).

## B-00a · County-neutral names everywhere (D-019) · TODO

Goal: nothing is called "the Dallas adapter" anymore; county is data.

Verified facts: 16 modules have county names in their file names (`modules/sources/dallas-*.js`,
`modules/research/dallas-*-agent.js`); the generic registries from B-04 already exist.

Acceptance
- Rename county-named modules to generic names (e.g. `county-foreclosure-notice-adapter.js`,
  `county-foreclosure-acquisition-adapter.js`, `county-code-violations-adapter.js`) and leave a one-line
  re-export at each old path so nothing breaks. Update all internal `require`s to the new names.
- Source ids that are stored in data stay as they are (they are data keys); user-facing source names
  come from the county profile ("Dallas County Clerk foreclosure notice").
- No county name in any new or renamed module, function, variable, test file name, UI label, PR title or
  report wording, except as profile data.
- Tests: the full suite passes unchanged in meaning; a static check fails if a new file under `modules/`
  has a county name in its file name (allowlist only the compatibility re-exports).

## B-00b · "Ready to reach out" replaces "call ready" (D-018) · TODO

Goal: a lead with enough information to contact the owner is usable even without a phone number.

Verified facts: `CALL_READY` appears 46 times in 14 files (modules, server.js, dashboard); about 29
"call ready" strings in the dashboard. Today `lead-operations-state.js` `rowStateForDeal` requires a
non-quarantined lifecycle AND a proven phone route for CALL_READY; quarantined rows are LOCKED.

Acceptance
- New readiness model (`lead-operations-state.js`), per AGENTS.md §5 Contact:
  - `REACH_OUT_READY` when: verified property address + owner identity (official owner/taxpayer record,
    or the borrower/grantor named in an official notice) + not proven to belong to someone else
    (after-the-sale SOLD_TO_THIRD_PARTY / REVERTED_TO_LENDER) + not duplicate/unverifiable + not
    do-not-contact + owner is not a bank or government body.
  - `best_route`: call (proven or possible number) → text (mobile) → email → mail/visit (mailing address)
    → find_phone (people-search links). Phone presence is a badge and a sort boost, not a gate.
  - Unknown/ambiguous dates no longer lock outreach: show "Sale date not confirmed — ask on the call".
  - After-the-sale OUTCOME_UNKNOWN: reachable only as a status check, labeled "Sale date passed — confirm
    ownership first", with the script line "Is the house still yours?".
  - Not-ready states, each with a plain reason and next step: NEEDS_ADDRESS, NEEDS_OWNER,
    NOT_REACHABLE (bank/government/someone else now), DO_NOT_CONTACT, CLOSED.
- Rename everywhere: `CALL_READY` → `REACH_OUT_READY` (keep `CALL_READY` as a read-only compatibility
  alias for stored data and old exports); UI "Call ready" → "Ready to reach out"; counts "call-ready" →
  "ready to reach out". `MAIL_READY` / `OUTREACH_READY` / `NEEDS_CONTACT_SEARCH` / `NEEDS_SKIP_TRACE`
  fold into `REACH_OUT_READY` + `best_route` (keep aliases for stored data).
- B-06's possible numbers now set `best_route: call` instead of creating CALL_READY.
- Tests: no-phone lead with address + owner → REACH_OUT_READY with best_route mail or find_phone;
  ambiguous-date lead → REACH_OUT_READY with the caution; bank-owned / sold-to-someone-else / duplicate /
  do-not-contact → not ready with the right reason; old stored `CALL_READY` rows still render.
- Report in the PR: row-state distribution before/after for each market (read-only), so Gabriel sees how
  many leads became usable.

---

## B-01 · Release the source-date proof (PR #205) · DONE ([PR #205](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/205))

Verification (2026-10-01): merge `098fdd5`, deployment succeeded, `/health` 200,
authenticated Dallas dashboard loaded and a lead card opened. Date summary: parsed 28,
ambiguous 29, unparsed 0, absent 299; rows leaving quarantine 0. Dallas CALL_READY 0,
MAIL_READY 5. Resolver-rule counts and the other requested queue-state counts were not
exposed in the read-only dashboard summary.

Goal: merge and deploy PR #205 (numeric sale-date order proof, raw-evidence-wins, origin tags).

Acceptance
- PR head is `90a0d20` (or later commits only from this item); rebase cleanly on `origin/main`.
- Full suite 0 failed.
- PR body summarizes: resolver rules, order-independent staleness, raw evidence wins, origin tags,
  `www.elliscountytx.gov` host; expected CALL_READY change = 0 (no phone routes yet).
- Merge, deploy, read-only verification: `/health` 200; a lead card opens; if the existing
  read-only date-normalization summary is exposed, record parsed / ambiguous / unparsed / absent and
  counts by resolver rule; record row-state distribution (LOCKED, MAIL_READY, NEEDS_CONTACT_SEARCH,
  NEEDS_SKIP_TRACE, CALL_READY). If a figure isn't exposed read-only, write "not exposed".

Known non-blocking follow-ups (do them in B-04): superseded-audit edge (N-A),
`source-evidence-adapter.js:319-329` origin collapse (N-B).

---

## B-02 · Safety cleanup: no auto-send flag, no invented buyers · DONE ([PR #207](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/207), [PR #208](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/208))

Issue [#223](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/223) follow-up
([PR #232](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/232)):
legacy server SMS, Gmail and buyer-deal email send routes now
return a disabled response without reading or changing leads. The dormant follow-up
processor also leaves due emails pending for manual action instead of sending them.
Draft previews, inbound history and stored conversations remain. Visible
communications-hub and bulk-send controls no longer invite an unavailable send.

Verification (2026-10-01): final merge `c03ee9f`, Railway deployment succeeded,
`/health` 200, and read-only `/api/outreach/tone-status` returned
`auto_send: false`. The authenticated dashboard loaded Dallas rows and the
Buyers view showed 0 active buy boxes and 0 templates. No outreach or saved-data
mutation was performed. PR #208 corrected a pre-existing generic-route shadow
found during read-only verification of PR #207.

Goal: remove two legacy behaviors that contradict the safety invariants.

Acceptance
- `modules/outreach.js` `getAutoSendEnabled()` (~:80) always returns false (or is removed with its
  API fields returning `auto_send: false`). Nothing can send automatically. Test it.
- `modules/buybox.js` `generateMarketBuyBoxes()` (~:96) can no longer present invented investors as
  real buyers anywhere in the UI or API: remove it from live paths, or make every output explicitly
  labeled "Template — not a real buyer" and excluded from any matching. Trace every caller first.
- Tests prove no endpoint returns generated buyers as real.

---

## B-03 · Saved-leads HTTP 502 · DONE — closed as not reproducible (A-003, [issue #209](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/209))

Read-only check (2026-10-01): the reported 502 did not reproduce. GETs for
50 and 1,000 saved leads returned 200; Texas and National views loaded and
Dallas showed its empty state. No root cause was established, so no speculative
saved-data change was made. Issue #209 requests the original incident evidence
or a decision to close this stale report.

Goal: find and fix the 502 seen on the saved-leads view.

Acceptance
- Reproduce read-only (logs, a GET), identify the root cause, fix it, add a regression test.
- If the cause is data size/timeouts, paginate or stream; do not drop or alter stored leads.
- Verification: the saved-leads view loads after deploy.

---

## B-04 · Generic state rules + county source profiles · DONE

Ordered sub-PRs: N-A supersession audit ([PR #210](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/210))
records only stored date and resolution fields that differ from current raw-source
derivation. N-B ([PR #211](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/211))
preserves the chosen source-date key and quarantines filing or record-creation
dates; state/county registries remain for later sub-PRs.
N-C ([PR #212](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/212)) introduces the cited state-rules table and a generic county notice profile
registry; the sale-date resolver reads both and retains its adapter export as a
derived compatibility view. Other county source kinds and full behavior-equivalence
coverage remain for the next ordered sub-PR.
N-D ([PR #213](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/213)) registers existing tax-sale notices, code cases, parcels and recorded-sales
layers without enabling new routes. California tax-default profiles remain
notice-stage only; legacy county adapters remain intact. Generic routing and
full transport equivalence remain for the final B-04 sub-PR.
N-E ([PR #214](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/214)) routes regional trustee-sale catalog entries, adapter registration and queue
selection through the generic registry. Legacy parser implementations and the
existing market source lists are unchanged; other source families remain for a
later ordered sub-PR.
N-F ([PR #215](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/215)) routes the existing California tax-default and Michigan public land-bank
catalog, adapter and queue metadata through the same registry. Tax notices remain
notice-only; land-bank inventory remains listing-only. No new source runs.
N-G ([PR #216](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/216)) makes the primary notice profile authoritative for the legacy planning router,
adapter registration and queue seed. The existing parser and all source IDs stay
unchanged; Dallas/Ellis row transport equivalence remains tested.

Goal: every state and county works through the same pipeline. Dallas and Ellis become profiles, not
special cases (D-013).

Acceptance
- A **state rules table** (data + citation string per rule), starting with TX, NC, MI:
  - disclosure status (TX non-disclosure; NC, MI disclosure);
  - foreclosure type and legal sale-day rule (TX: first Tuesday of the month, or first Wednesday when
    that Tuesday is Jan 1 or Jul 4 — Tex. Prop. Code 51.002(a));
  - post-sale rules: TX mortgage trustee sale — no redemption; TX tax sale — redemption 2 years
    (residence homestead or agricultural) or 180 days (other), counted from the purchaser's deed
    recording (Tex. Tax Code 34.21); TX HOA — 180-day redemption may apply (Tex. Prop. Code 209.011);
    MI and NC entries may be marked `unverified` with the architect's notes (MI: redemption usually
    6 months after a sheriff's sale; NC: 10-day upset-bid period) until verified from official sources;
  - Secretary of State business-search URL per state.
- A **county source profile registry**: allowlisted hosts, source kinds (trustee-sale notices, tax
  sales, code cases, parcels, recorded sales), parser options. Register Dallas, Ellis and the existing
  `modules/sources/tx-county-foreclosure-source-profiles.js` counties through it.
- The sale-date resolver's legal-sale-day rule is keyed by **state rule + source kind
  (trustee-sale notice) + profile host allowlist**, not by hard-coded adapter ids. Keep the current
  `CHAPTER_51_TRUSTEE_SALE_ADAPTERS` export as a derived compatibility view.
- Existing county-named modules keep working (wrap or re-export); no new county names in new code.
  User-facing text shows the county as data ("Dallas County notice"), never as a hard-coded label.
- **Behavior-equivalence test**: the existing Dallas/Ellis fixtures produce identical rows before and
  after (lifecycle, dates, resolutions, row state).
- **N-A**: `sale_date_resolution_superseded` records a list of `{field, old_value}` for every stored
  value that actually differed (`sale_date_iso`, `source_event_date`, stored resolution date/rules).
  A stored value equal to the current derivation is never listed. Test: raw `10/06/2026` (registered
  trustee-sale source, labelled) + matching resolution + stale `sale_date_iso 2026-10-13` → only
  `{field: "sale_date_iso", old_value: "2026-10-13"}`.
- **N-B**: `modules/research/source-evidence-adapter.js` (~:319-329) records which key it picked for
  `event_date`; `filed_date` and `created_at` are tagged as non-sale origins so the resolver never
  treats them as sale dates.

---

## B-05 · "After the sale" lane · IN PROGRESS

Ordered sub-PR [B-05a](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/217): the existing primary notice adapter exposes proven-past,
official-host notices as preview-only `post_sale_candidates` with outcome unknown.
They remain excluded from active candidates; the stale count is unchanged. This
does not yet persist an after-sale lane or classify a completed sale. Other
county adapters, classification integration, operator action, buyer handoff and
dashboard view remain for later B-05 sub-PRs.

Ordered sub-PR [B-05b](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/218) adds a pure outcome classifier for a newer official notice,
later official ownership record, or recorded deed. It requires an exact parcel or
address match, dated source evidence on an allowlisted host, and leaves missing or
conflicting evidence as `OUTCOME_UNKNOWN`. A still-owner result additionally
requires a dated official search finding no later deed. It does not persist or display an
after-sale lane, compute redemption, or permit original-owner contact. Tax/HOA
redemption, other county adapters, operator action, buyer handoff and dashboard
view remain for later sub-PRs.

Ordered sub-PR [B-05c](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/219)
persists property-specific, proven-past notice records separately from active rows and
shows a bounded read-only dashboard page. The full history stays in the snapshot;
each response returns the newest 20 plus the total. [Issue #221](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/221)
required exact official proof, bounded payloads, canonical deduplication and neutral
outcome wording. Source-proof duplication, classification integration, other source
profiles, operator actions and buyer handoff remain separate work.

Ordered sub-PR [B-05d](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/228)
(issue #222) prevents a document already represented by a
property-specific after-sale candidate from also creating an address-less active
source-proof row. Mixed documents retain their active candidate rows; unrelated
document proof remains unchanged. Classification integration, other source profiles,
operator actions and buyer handoff remain separate work.

Goal: passed-date foreclosure/tax notices are kept and classified, never discarded (D-009).

Verified facts: the county foreclosure-notice adapters currently reject proven-past notices as
`stale_sale_date` (acquisition adapter ~:483/:496/:635; notice adapter stale count ~:506/:520);
stored rows become lifecycle `SALE_PASSED` with no next step; `official-notice-dossier.js` extracts
`mortgagee_or_beneficiary` and `mortgage_servicer`; the Ellis parcel refresh returns owner, deed date,
instrument and record source date.

Acceptance
- Proven-past notices (resolved past, or every valid reading past) go to a `post_sale_candidates`
  output with `sale_outcome: OUTCOME_UNKNOWN` — never into `candidates`. Existing `stale_sale_date`
  counts and the existing stale-notice test assertions stay unchanged.
- Pure outcome classifier using the state rules table:
  - `POSTPONED_REPOSTED` — a newer official notice for the same property;
  - `STILL_OWNER_LIKELY` — an official owner-of-record whose record date is AFTER the sale date still
    shows the same owner and no deed after the sale (elapsed time alone is never evidence);
  - `REVERTED_TO_LENDER` — post-sale grantee matches the notice's mortgagee/beneficiary/servicer or a
    lender/agency list (Fannie Mae, Freddie Mac, HUD, VA; names with BANK, MORTGAGE, SERVICING, LOAN,
    TRUST COMPANY) kept in one constant;
  - `SOLD_TO_THIRD_PARTY` — a deed on/after the sale date to someone who is neither the old owner nor a
    lender match;
  - `TAX_REDEMPTION_PERIOD` (window computed only when the purchaser-deed recording date and homestead
    status are known; otherwise "redemption may apply — window not computed"),
    `HOA_REDEMPTION_POSSIBLE`;
  - `OUTCOME_UNKNOWN` — everything else, including conflicting evidence (list the conflict).
  Each result: plain reason, evidence list, next step, deal paths, `can_contact_original_owner`
  (true only for POSTPONED_REPOSTED and STILL_OWNER_LIKELY, and only if every existing contact gate
  also passes).
- Free checks, no new network calls: compare Ellis rows with the stored parcel refresh records; other
  counties get links to the county appraisal search and county clerk records search (from the county
  profile) with the borrower name, address and instrument shown to copy.
- Card action "Record what happened": trustee's deed found (grantee, recording date, instrument #,
  price if stated, source URL) / sale postponed (new date + source) / owner says they still own it
  (seller_stated) / bankruptcy filed / unknown — timestamped with who.
- `SOLD_TO_THIRD_PARTY` creates or updates a buyer record (name, mailing address if known, property,
  purchase date, price if stated, source) for B-09. No outreach. Never an inferred buyer.
- "After the sale" tab grouped by outcome with counts; plain-English cards; glossary entries: trustee's
  deed, REO (bank-owned), postponed sale, right of redemption, excess proceeds (informational only:
  "Recovering surplus is regulated — get advice before offering this service.").
- REO card next step: "Watch for the listing" with links to HUD Home Store, Fannie Mae HomePath,
  Freddie Mac HomeSteps and the existing address links, plus "Banks usually don't allow assigning the
  contract — plan a double close."
- Tests: each outcome; same owner but record dated before the sale → OUTCOME_UNKNOWN; conflicting
  evidence → OUTCOME_UNKNOWN; tax window examples (deed recorded 2026-04-01: homestead → ends
  2028-04-01; non-homestead → ended 2026-09-28); zero network from the classifier.

---

## B-06 · Comp search links, find-the-owner links, possible numbers · TODO

Goal: every card has one-click comp searches and phone searches, and VAs can record possible numbers
(D-006). Pure URL building — the server never fetches these sites.

Acceptance
- **Comps to check** (built from the verified subject: ZIP, property type, beds, baths, living area;
  filters beds ±1, baths ≥ subject−1, living area ±20%, sold last 12 months):
  - Redfin: `https://www.redfin.com/zipcode/<zip>/filter/property-type=house,min-beds=..,max-beds=..,min-baths=..,min-sqft=<v>-sqft,max-sqft=<v>-sqft,include=sold-1yr`
    with sq ft snapped OUTWARD to Redfin's option values (one constant), plus a fallback
    `.../filter/property-type=house,include=sold-1yr`;
  - Realtor.com: `https://www.realtor.com/realestateandhomes-search/<zip>/type-single-family-home/beds-<min>-<max>/baths-<min>/sqft-<min>-<max>/show-recently-sold`;
  - Zillow: `https://www.zillow.com/homes/recently_sold/<zip>_rb/`.
  One plain caption per link ("Sold in the last 12 months · 2–4 beds · 1+ bath · 1,100–1,650 sq ft ·
  ZIP 75119"); missing facts → wider search, caption says so. Every URL format in one constant.
  `link_kind: comp_search`. Shown in every market.
- **Find the owner's phone** (person owners only): TruePeopleSearch name
  `https://www.truepeoplesearch.com/results?name=<First Last>&citystatezip=<City, ST>` and address
  `https://www.truepeoplesearch.com/resultaddress?streetaddress=<street>&citystatezip=<City, ST ZIP>`;
  FastPeopleSearch address `https://www.fastpeoplesearch.com/address/<street-dashed>_<city-st-zip-dashed>`;
  keep existing CyberBackgroundChecks links; also the mailing address when it differs. Owner parsing:
  "WITTE JACOB & ADRIANA" → "Jacob Witte"; unsure → address search only, never guess a name. Company
  owners → "Owner is a company — look up who runs it" with the state's Secretary of State link (state
  rules table). `link_kind: people_search`.
- **Possible numbers** on the card: add a number + where it came from (people-search page, skip trace,
  screenshot, seller call, other URL) → stored with source_kind, source_url, entered_by, entered_at;
  labeled "Possible number — not confirmed"; buttons Right person / Wrong person / Disconnected /
  Do not call (each timestamped with who). A sourced possible number makes the row CALL_READY with
  reason "Possible number from <source> — confirm on the call." Rejected numbers never count; only
  rejected numbers → back to NEEDS_CONTACT_SEARCH. Show "Do Not Call registry: not checked" until a
  check is recorded.
- The wrong-address link audit never counts `comp_search` or `people_search` links as mismatches.
- Layout: three collapsed sections ("Comps to check", "Find the owner's phone", "Possible numbers").
- Tests: exact URL strings for a fixture (3 bed / 2 bath / 1,374 sq ft / ZIP 75119); missing facts;
  no links without a verified subject address; name parsing cases; possible-number gate cases;
  zero server-side requests to those hosts (static check + spy).
- Post-deploy acceptance: Gabriel's first click on one Redfin, one Realtor.com and one TruePeopleSearch
  link from a real card. If a format is wrong, fix the constant in a follow-up PR.

---

## B-07 · Charlotte automatic comps (Mecklenburg County, NC) · TODO

Goal: the first market where comps work by themselves (D-002).

Verified facts: Mecklenburg "Tax Parcels with CAMA Data" reportedly carries bedrooms, fullbaths,
halfbaths, heatedarea, yearbuilt, price, dateofsale, cdebuildin, bldggrade (field names seen in a
third-party analysis of the county file; the county server itself was not reachable from the
architect's fetcher). `modules/research/disclosure-state-comp-resolution.js` is already a generic,
profile-driven public-sales comp engine — reuse it, do not write a new one. After B-04, NC reaches the
public lane through the state rules table.

Acceptance
- Discovery: find the official public Mecklenburg parcel+CAMA source (maps.mecknc.gov / gis.mecknc.gov
  Open Mapping); record URL, access type, confirmed field names, record count, last update. Public,
  token-free, no login, no Authorization header. Prefer a REST query service.
  STOP trigger if access needs a data-request form/USB or a bulk file needing a new dependency — then
  record Wake County's public extracts (`https://services.wake.gov/realdata_extracts/`, incl.
  `Qualified_Sales_Past_24Months.xlsx`) columns in the issue.
- One Mecklenburg profile (disclosure state) with the verified field map incl. living_area, bedrooms,
  bathrooms (full + 0.5 × half), sale price, sale date; subject facts with official_public_record
  provenance.
- Comps through the existing engine and the unchanged grid; exclude $0/nominal and multi-parcel sales;
  require a qualified sale if the county publishes a qualification code, otherwise label each comp
  "county did not mark this as an arm's-length sale". ≤1 request/second; stop on 401/403/429.
- 2 verified comps → preliminary ARV (labeled), 3 → verified ARV (D-005).
- First Charlotte leads: 10 single-family parcels, each in a different ZIP, owner mailing address ≠
  property address AND last recorded sale ≥15 years ago; run facts + comps; surface through the
  existing ingestion path labeled "Mecklenburg county records — equity list (no distress signal yet)".
  One bounded live run: ≤10 subjects, ≤60 county requests (this live run is authorized).
- Report in the PR: the 10 properties with comps (address, sale date, price, sq ft, beds/baths,
  distance) and value ranges.

---

## B-08 · One offer calculator, equity band, typical-rate clue · TODO

Goal: a single, honest source for offers (D-015), plus sorting signals (D-011, D-010).

Acceptance
- One module computes MAO = ARV × band% − repairs − fee, with the band table from playbook §1 (under
  $120k ≈70%; $120k–$200k 75% (D-031);
  $200k–$250k 80–82%; $250k–$500k 83%; $500k+ 83%, max 85% — one constant), repairs $20/sq ft light to $50/sq ft heavy until
  condition is known (labeled estimate), fee as an input. Outputs a range, labeled preliminary /
  verified / ballpark to match the ARV label. No ARV → no MAO.
- Trace every existing `arv * 0.7`-style computation (e.g. `modules/agents/comp-agent.js`,
  `modules/datasources.js`, `server.js`, `modules/research/comp-research-provider.js`,
  `modules/research/ai-deal-analyzer-jobs.js`, county comp intelligence agents) and route each through
  the calculator or remove it from live paths. No card shows an MAO that didn't come from real comps.
- MAO never appears in VA materials (D-014).
- **Equity band** (sort only): only where the actual loan is known (loan date + original amount from
  the notice/deed of trust); estimated balance by standard 30-year amortization at the typical rate for
  that year; value from verified/preliminary ARV, else the county appraised value **for sorting only**.
  Bands High ≥40% / Medium 20–40% / Low <20% / Unknown. Never a dollar figure on a card, never an
  offer input. Second loans may exist → band, not number. Priority ranking uses it to refine order.
- **Typical-rate clue**: annual average 30-year fixed rates from Freddie Mac PMMS (one constant with the
  source URL); card text "Loan from <month year>, when average rates were about <x>%. Ask the seller."
- Tests for each label path, missing-data paths, and that no legacy MAO reaches a card.

---

## B-09 · Buyers from public records · TODO

Goal: a real buyers list from county sales data, no invented buyers.

Acceptance
- In disclosure counties with sales data (Mecklenburg, Wayne), rank recent buyers: purchases in the
  last 12 months, at or below the area median value, built ≤2010, single-family; signals = number of
  purchases, recency, consistency, company/LLC or repeat buyer, mailing ≠ property. Exclude large
  institutions/iBuyers (one constant list). Per buyer: total purchases, most recent, favorite areas,
  average price — all from records with sources.
- Add third-party auction buyers from B-05.
- Buyers tab: ranked list, filter by area and price; "buyers within a mile of this deal" on a lead card.
- No contact actions in this item. No buyer without a source.
- Expanded 2026-10-06 (D-021). The buyer database is a core asset:
  - Non-disclosure states (Texas): buyers come from recorded deeds (grantee, recording date, instrument,
    parcel) with no price. Repeat grantees and companies rank first. Land buyers from B-16 join the same list.
  - Sign-up source: a public "Get deals first" form (name, email and/or phone, buy box: areas, price range,
    property types including land and acreage). Consent is recorded per channel (email, text, call) with
    the exact consent wording and a timestamp. Rate-limited, bot-protected, behind no login, and it never
    shows any other buyer's data.
  - Operator-added source: a buyer met in a Facebook group, on a call or at a meetup, entered by hand with a
    source note or link and consent "not opted in".
  - Each buyer record: buy box, consent per channel, first-look tier, deals offered, responses, last contact,
    and every source. Duplicates across sources merge into one buyer with all sources kept.
  - Still no sending in this item.

---

## B-16 · Land lane, Dallas–Fort Worth first · TODO

Goal: find vacant-land owners who may sell, in places where builders and developers are buying (D-020).

Acceptance
- Parcels: vacant and acreage parcels from county appraisal district public data (published bulk files or
  the public search), registered as county source profiles with allowlisted hosts, at most 1 request per
  second. Fields, each with provenance: parcel id, acreage, land-use code, owner, mailing address, deed date
  (years owned), exemptions, and tax status where the county tax office publishes delinquency.
- Seller signals, each sourced and used for sorting only: absentee or out-of-state owner, owned 10+ years,
  tax delinquent, estate or heirs in the owner name, no homestead exemption.
- Demand map ("where land is wanted"), each a sourced and dated signal: utility district (MUD) applications
  on tceq.texas.gov, building permits from official city open-data portals, recorded subdivision plats, and
  recorded acreage or lot deeds to builders and developers. Per area, show the signals with dates and links.
  No score without the listed evidence.
- Land buyers: grantees of recorded acreage or lot deeds in the last 24 months (builders, developers, land
  funds, repeat companies) go into the buyer database (B-09) with the deed as the source.
- Land is a wholesale deal (D-024): the same pipeline as houses. Plays (playbook §4, §4b, §4c):
  - infill lots for builders;
  - edge acreage near development signals;
  - teardowns: houses built before ~1960, under ~1,500 sq ft, on blocks with new construction (new
    year-built parcels or new-build permits nearby), valued as a lot;
  - luxury teardowns: older homes (built ≤1980, owned 7+ years, value ≥ $750k) in ZIPs with new $2M+
    builds. The $2M+ evidence must be sourced (sale prices where public, or new-build permit values,
    labeled as permits).
  Teardown signals come from free parcel data (year built, living area) and permits. A teardown stays a
  house lead too; it gets a "teardown candidate" tag, not a second record.
- The seven course checks on every land card, each sourced or marked "not checked": infill (house on each
  side), utilities, flat, cleared or wooded, paved road, flood zone (100-year = avoid, 500-year =
  tolerable), zoning (single-family only or more). Plus the §4b red flags: access, deed restrictions,
  back taxes, agricultural rollback tax, district taxes, easements, severed minerals, setbacks, wetlands.
- Best land list first: the county tax-delinquent list filtered to land (where the county publishes it).
- Red flags shown on every land card, each sourced or marked "not checked": flood zone (FEMA map),
  access, water and sewer, deed restrictions, back taxes, agricultural rollback tax, district taxes,
  easements, severed minerals.
- Value and offer per A-018: builder price first, then lot comps, then the 10-15-20 rule; the three offer
  types; teardown math. Shown only with sourced inputs and labeled "land estimate". No automatic
  land values in Texas (D-001): land comps come from the B-18 panel or disclosure states. Appraised
  values, regional averages and list prices are never comps.
- A "Land" view: parcels with their seller signals and the nearest demand signals, all with sources. No
  contact actions in this item.
- Counties (D-024, D-027): nationwide, state by state as B-21 adds statewide data. Within a state, rank
  the playbook §10 candidates with public data: Census county population
  estimates (Vintage 2025), TCEQ district filings, and permit and plat counts where published. Publish the
  ranking with sources in the PR. Then add counties in ranked order, starting with those that publish free
  appraisal data. Adding a county is a profile entry, never new county-named code (D-019).
- Tests: forged, stale, wrong-host and missing-source records rejected with a reason; pure scorers have no
  network, clock or writes (spied); no county name outside profile data.

---

## B-17 · Deal summary and buyer first look · TODO (sending parts wait on Gabriel)

Goal: when a deal is under contract, the app writes a summary without the address, offers it first to
matching buyers, then prepares group posts for the operator (D-021).

Acceptance
- Deal summary with no street address and no seller data: area (ZIP or neighborhood), beds, baths, sq ft,
  year and lot (land: acreage, zoning, road frontage, utilities), asking price, ARV with its comp list (each
  comp sourced; 2 comps labeled preliminary per D-005), repairs labeled as an estimate, operator-added photos
  only, the written equitable-interest disclosure for Texas deals (Occupations Code §1101.0045), and a link
  to the B-09 sign-up form. Built only from sourced facts; if ARV is missing it does not generate and says why.
- Share page: a read-only, expiring public link per summary, showing the summary only. The operator can turn
  it off. No address, no seller name, no internal fields.
- First look: rank buyers whose buy box matches, including people who publicly posted a matching want
  (D-022, with the post link). The operator picks up to 20. Email goes from the operator's
  own mail (prefilled draft). Text goes only to buyers with text consent and only after the Texas texting
  decision (A-017). Every offer is logged on the buyer and the deal.
- Group posts: a group directory (name, link, county or national, whether deal posts are allowed, the
  group's rules, last posted date). After the first-look window (operator setting, default 24 hours), the
  app prepares one post per allowed group, worded differently, and enforces a minimum gap between posts to the
  same group. The operator posts them, or the operator's own assistant (for example Meta Muse) posts with
  approval on each post. The app never posts and never stores social logins (A-016).
- Replies: the operator records who responded. A responder who gives consent becomes a buyer with that
  consent recorded.
- Tests: no address or seller data in any summary or share page (negative test with a full record); the
  Texas disclosure is present on every Texas summary; missing ARV blocks generation; consent gates on every
  channel; the 20-cap; the share link expires.

---

## B-19 · Match engine: every deal against every buyer, with reasons · TODO

Goal: WholesaleOS matches sellers' properties and land to the right buyers by itself (D-021, D-027). This
replaces the placeholder Deal Matching page, which uses a made-up score and no comps.

Acceptance
- Pure matcher (no network, clock or writes; spied). Input: deals (houses and land, each with sourced facts
  and value status) and buyers (B-09 sources: deed purchases, sign-ups, publicly posted wants).
- A buyer's buy box comes from evidence:
  - what they actually bought (area, type, size, price where public, how recently, how often);
  - what they said on the sign-up form;
  - what they posted they want.
  - Each criterion keeps its source.
- Output per deal: ranked buyers with plain reasons ("bought 3 houses within 1 mile in the last 12
  months"; "posted 'need lots in Kaufman County' on 2026-10-04"). No raw scores on screen; order only.
- Value gates: a match can rank without a value, but it shows "Value not verified" until the deal has a
  verified or preliminary ARV (D-005) or a land estimate (A-018). No invented numbers.
- Output per buyer: the deals that fit them. Both views on the Deal Matching page. The old client-side
  score is removed.
- Tests: forged buyer evidence ignored; stale purchases age out by a stated window; no match on mismatched
  type, area or price; land and houses both covered; identical results for identical inputs.

---

## B-20 · Agent desk: tasks for Muse or Claude, and a drop box for what they find · TODO

Goal: Gabriel's AI assistant (Claude in Chrome, D-026; Muse only if Gabriel later chooses it) does the social legwork in Gabriel's
accounts, and WholesaleOS stays the brain and the database. No outside API is needed: the assistant reads
a page and fills a form, which both can do.

Acceptance
- Assistant access: a separate "assistant" sign-in with its own limited permissions (reuse the existing
  agent/pairing token mechanism). It can read the agent desk and write to the drop box, nothing else.
  Gabriel can revoke it from Settings.
- Agent desk (read): today's task list:
  - deal summaries to post (B-17 share links, no addresses);
  - matched buyers to message, with a drafted message each (B-19);
  - groups to scan by county (group directory, B-17);
  - seller batches Gabriel approved (B-10).
  - Each task carries its rules: daily caps, the Texas disclosure line, "never share an address or
    Gabriel's personal details".
- Drop box (write only): the assistant posts what it found:
  - a buyer (name, profile or contact it published, what they want, where);
  - a public want;
  - a possible seller;
  - a reply to one of our posts.
  - Every item requires a source link and the capture time.
  - Rate-limited and size-limited. It never returns stored data.
  - Items land in the opportunity inbox (B-18) as "found by assistant, unverified" and go through the
    same sorter and matcher. An assistant's report never counts as a verified fact by itself.
- Task results: the assistant marks a task done, skipped or failed, with a note and link. Everything is
  logged on the lead or buyer timeline (B-10).
- Seller and realtor texts and calls: the desk only shows a batch after Gabriel approves it with one click
  (up to 20, D-029). Deal posts, buyer messages and public-want messages: the assistant drafts them, and
  each one is sent only after Gabriel approves it (D-022, D-026, A-016). The desk never marks a post or
  message as sent unless the assistant reports Gabriel's approval and a link to the sent item.
- Task types from the course's assistant workflow (playbook §7), as a morning routine ready by 8 AM local:
  - lead pulls the assistant runs in its own browser: listing-site keyword searches for distressed or stale
    listings, auction.com foreclosures at least 14 days out, and builder directories (to find land buyers
    and ask for their buy box);
  - comps it captures go in as proposals through the strict comp grid, never as verified by themselves;
  - realtor offers: a drafted message per stale listing, with the price from B-08 (houses, only with a real
    ARV) or A-018 (land, e.g. 50–60% of list on stale land listings), sent only in an approved batch.
  - The server itself never visits those sites (AGENTS §5 Network). The assistant does, in Gabriel's
    accounts.
- Tests: wrong or missing token refused; read endpoints refuse writes and the drop box refuses reads;
  missing source link rejected; caps enforced; no personal data in logs.

---

## B-21 · Free statewide data, Texas and Florida first · TODO

Goal: cover every county of a state at once from free official statewide files, starting with Texas and
Florida, where Gabriel has phone numbers (D-027).

Acceptance
- Texas: the TxGIO StratMap statewide land-parcel layer (free, from appraisal districts: owner, mailing
  address, land use, values; refreshed about yearly per county). It is registered as a statewide source
  profile with allowlisted hosts. Texas has no sale prices.
- Florida: the Department of Revenue statewide tax-roll files (owner, mailing address, land use, recent sale
  price and date), published yearly. Florida sales feed automatic comps through the strict grid and B-09
  buyers with prices.
  - Florida is a first automatic-comp market (D-030): Florida sales feed the strict comp grid like
    Charlotte, plus land comps and teardown lot values.
- Each record keeps its state file name, row reference and file date. Old values are superseded with
  an audit trail, never overwritten silently.
- Bulk files are downloaded at most once per release, at the source's own pace. Stop on 401, 403 or 429.
  Never scrape behind a login.
- Next states by free statewide data (New York, Wisconsin, Washington, North Carolina) are added the same
  way, one profile each. California county data may lack owner names; mark it.
- Tests: fixture slices of each file; wrong-host and stale-file rejection; row references preserved;
  no county or state names in generic code.

---

## B-18 · WholesaleOS panel in Chrome and the opportunity inbox · TODO

Goal: what Gabriel reads on Facebook, Zillow and Redfin can be saved into WholesaleOS with one click and
sorted into opportunities (D-025, A-019).

Acceptance
- A Chrome extension (Manifest V3, side panel) in `extension/`, installed by Gabriel as an unpacked
  extension. It signs in with the existing dashboard session and never sees or stores a password. It runs
  only on facebook.com, zillow.com and redfin.com and never on skool.com.
- Facebook: "Save post" on one post, and "Save visible posts" for what is on screen. Each saves the post
  text, poster name and profile link, group name and link, post link, posted time and the comments
  Gabriel has opened. Nothing is saved without a click. The panel never scrolls, opens, likes, comments,
  posts or messages.
- Zillow and Redfin: "Save this listing" and "Save these sold results". They feed comps as proposals
  through the strict comp grid (B-06, B-11).
- Opportunity inbox in WholesaleOS: every saved item with its source link and capture time, merged by post
  link, with a delete button.
- Sorter (pure module, fixed rules first): buyer wants a house; buyer wants land or lots; owner selling;
  wholesaler deal post; agent listing; lender or service; needs a look.
  - It extracts area (city, county, ZIP), property type, price range, acreage, beds, cash or financing
    and timeline. Each value keeps the exact words it came from.
  - The AI sorter is an optional switch, off by default (paid; Gabriel decides).
- Matches:
  - A buyer want that fits one of our deals or land leads → "possible buyer" (D-022).
  - An owner selling in our counties → "possible lead", still subject to normal address and owner
    verification.
  - Every want → the buyer database as "publicly posted want" with the post link (B-09).
- Privacy: poster names and links never appear in logs or aggregate reports.
- Tests:
  - Saved-HTML fixtures for Facebook, Zillow and Redfin.
  - The content scripts contain no automatic scroll, click, submit or message code.
  - skool.com is refused.
  - A forged or missing source link is rejected; duplicate posts merge.
  - The sorter is pure (spied: no network, clock or writes).

---

## B-22 · Title companies list · TODO

Goal: know which title companies will close our deals before the first contract (playbook §4c, §8).

Acceptance
- A Title tab: company, county or market, contact, and the four answers, each with date and who asked:
  investor friendly? works with wholesalers? closes assignments? does double closes? Plus closing for a
  non-resident individual with a US bank account and no LLC (playbook §8).
- Entries come from the operator or the assistant's drop box (B-20), with a source note. A company with
  "yes" to double closes is marked "investor friendly".
- On a deal card: the investor-friendly title companies for that county.
- Tests: missing answers stay "not asked"; no invented answers.
- Seed (2026-10-06): load `data/title-companies.json` (10 companies with phone, email, website, markets,
  claimed investor services, evidence type and source, plus names still to check). Claimed services
  show as "says on its website", not as Gabriel's verified answers. Status starts "not called".
- Show the file's `lessons` on the tab (national underwriters often avoid double closes; NC uses closing
  attorneys).

---

## B-10 · CRM timeline, lead clocks, tap-to-send texting · TODO

Goal: D-008 and D-007.

Acceptance
- Append-only activity log per lead: created/acquired, opened, closed, reopened, status changes, calls
  (outcome), texts, notes, possible-number actions — each with timestamp and actor (Gabriel or VA name).
  Never edited in place; corrections are new entries.
- Lead clocks on the card: acquired date, sale/event date, days until sale, stale date, last touch.
- Operator/VA identity: a simple actor selector or login so every entry has a name.
- Server-side sending stays off (A-012, issue #223): the old Twilio and bulk-email send routes are not
  re-enabled; tap-to-send replaces them.
- Texting: Gabriel selects up to 20 leads with a contactable number; the app prepares personalized,
  human-sounding messages (templates; no AI sending) and shows tap-to-send links (`sms:` with the
  prefilled body) for the operator's phone; each tap is logged. No automated sending, no texting to
  numbers marked Do not call or Wrong person.
- Texas texting is allowed (D-023, cleared by Gabriel's lawyer). Keep the switch so it can be turned off.
- Calls: the `tel:` link plus a one-tap outcome log (no answer, left voicemail, talked, wrong number,
  do not call). Email: a prefilled draft that opens in Gabriel's own email, logged when opened.
- People who publicly posted a matching want (D-022) can be in a batch, with the post link shown.
- Gabriel calls and texts from his own Texas and Florida numbers (D-028), so no paid sender is needed.
- Tests: log immutability, actor required, 20-cap, blocked numbers excluded, every send logged.

---

## B-11 · Local helper: batch comp and phone capture in the operator's browser · TODO

Goal: "try it first" (D-006) without the server touching listing or people-search sites.

Note (2026-10-06): Zillow and Redfin capture now arrives through the B-18 Chrome panel (A-019). This item
keeps the batch queue and the people-search part; reuse the B-18 panel wherever possible.

Acceptance
- Extend the local helper (`scripts/wos-local-helper.js`, `scripts/wos-local-comp-agent.js`; modes
  today: `sold_comps`, `subject_facts`) with a batch queue of up to 20 leads: for each lead it opens the
  B-06 comp-search link and reads the sold results the operator is looking at, then the people-search
  link and reads displayed numbers.
- Everything is a proposal: comps go through the strict grid; numbers become possible numbers with the
  page URL as source. The operator confirms with one click.
- Human pace; if a page shows a CAPTCHA or login, pause and let the operator handle it — never solve it.
- 2 confirmed comps → preliminary value; 3 → verified.
- Tests with saved HTML fixtures; no server-side fetch.

---

## B-12 · Detroit (Wayne County, MI) ballpark comps · TODO

Goal: D-003.

Verified facts: `modules/sources/public-parcel-api-profiles.js` has Detroit `Parcels_Current`
(total_floor_area, year_built, total_acreage, homestead_pre, taxpayer mailing, sale_price, sale_date)
and `assessor_property_sales_view` (sale price, date, term_of_sale, sale_verification, lat/long).
No bedrooms/bathrooms published.

Acceptance
- Ballpark comps match on living area ±20%, year, lot, distance, recency, property class; arm's-length
  only (term_of_sale / verification); labeled "Ballpark — bedrooms/baths not confirmed". Screenshot or
  call upgrades to verified when beds/baths are confirmed on both sides.
- Ballpark MAO via B-08, labeled ballpark.
- Verify the existing Detroit lead sources still work (Wayne tax foreclosure, blight violations, land
  bank); record status of each; fix or mark blocked.

---

## B-13 · Build cost: Chromium installed twice · TODO

Goal: the Docker build installs Chromium once.

Verified facts: `Dockerfile` runs `npx playwright install chromium --with-deps`; `package.json`
`postinstall` runs it again.

Acceptance
- Remove the duplicate without breaking local installs (e.g. skip postinstall in the container via an
  env flag). Deploy succeeds; the helper's Chromium path still resolves.

---

## B-14 · VA call script in the app · TODO

Goal: the script lives next to the card fields it fills (D-014: no MAO, spreads, buy boxes, title).

Script (render as a panel; each answer fills the matching card field):
- Opener: "Hi, is this [first name]? This is [VA]. I'm calling about the house on [street]. Is that
  still yours?… We buy houses in [city] as-is. Would you consider an offer if the numbers made sense?"
- 1 "Is anyone living there right now — you, family, or a tenant?" → occupancy
- 2 "What's got you thinking about selling?" → motivation
- 3 "If we made this work, when would you want to be done — weeks or months?" → timeline
- 4 "How's the house holding up? Roof, AC, plumbing, kitchen, anything big?" → condition
- 5 "I have it as [beds] bed, [baths] bath, about [sq ft]. Is that right?" → facts check (seller_stated)
- 6 "Is there a mortgage on it?" → "Roughly what's left?" → "Monthly payment?" → "Do you remember the
  interest rate?" → "Are payments current, or a few behind?" → loan fields (seller_stated)
- 7 "Anything else on it — back taxes, a second loan?" → liens (seller_stated)
- 8 "What would you need to walk away with for this to be worth it?" → asking price
- 9 "What does life look like for you after the sale?" → need
- Close: "I'll run the numbers with my team and call you back [day]. Is this the best number? Is there
  an email I can send it to?" → callback date, email
- Objections: "How'd you get my number?" → "From public property records. If you'd rather not hear from
  us, I'll take you off right now." (→ Do not call) · "Just make me an offer." → "I will — two minutes
  so it's a real number, not a lowball." · "Not interested." → "No problem — mind if I check back in a
  few months?"
- Rules shown to the VA: never name a price; hand to Gabriel when they name a price, ask for an offer,
  have a sale date within 30 days, or say they owe more than it's worth; never state a value you don't
  believe; never claim a lender you don't have.

Acceptance: panel on the card; answers save with provenance `seller_stated`, actor and time (B-10 log).

---

## B-15 · Front-end pass · TODO

Goal: professional, uncluttered, plain-English UI (D-017).

Acceptance
- Card top: three lines (Priority, Best fit, Next step); collapsible sections below.
- Tabs: Leads, After the sale, Buyers (Title later).
- Mobile width works; no horizontal scroll; no internal field names visible.
- Map with color-coded deal quality is a separate follow-up item (add it to this backlog when done).
- Found in the architect's screenshots of main on 2026-10-06 (local test copy):
  - Deal Desk shows internal labels (AUTO-RUN, CALL_READY, MAIL_READY, SALE_PASSED,
    DATE_UNKNOWN_REVERIFY). Use plain words.
  - Outline buttons are unreadable (dark text on dark): the "By Buyer" and "By Buy Box" tabs, and two
    top-bar buttons next to "+ Add Lead".
  - The header shows "Admin · undefined".
  - Outreach Hub says "Run scrape to find real buyers", which is legacy wording.
  - Deal Matching stays on "Loading matches..." (replaced by B-19).
