# 455.8B1 - Today Card Metadata

Bounded continuation after released475/8A. Native and classic Today action and
activity rows no longer print standalone reference metadata. Classic best-deal
cards also omit their separate reference line and use Property details needed
when no heading/location exists. No generic string filtering: supplied source
names, labels and text remain escaped and unchanged even when they contain codes.
Remaining buyer/match/approval/conversation/pipeline/notification/legacy faces
are subsequent8B slices, not falsely claimed done. Whole455.8 remains incomplete.

## Trace

- Writers: modules/records/record-activity.js ensureReference/assignMissing/
  assignMissingVerified retain canonical record_ref and sequences; ingestInteraction
  validates exact references and records history. matchReference preserves match
  identity. modules/buyers/assistant-finds.js and modules/deals/reviewed-deals.js
  project existing references/email subjects; no writers change.
- modules/records/conversations.js projects recorded refs/person/status/evidence.
  modules/agents/today-workspace.js buildTodayWorkspace derives actions.ref from
  canonical record activity or conversation.refs, best_deals.ref, last_24h.ref,
  stable keys/targets, truthful labels/times/value gates. today-pending.js keeps
  exact references for saved drafts and conversations. GET route remains signed
  admin/no-store; all projection/auth/clock/value/storage code unchanged.
- Native dashboard/workspace/app.js actionRow/activityRow removed only display
  nodes. bestDeal still uses nav.recordHref(item.ref), openRecord still uses
  conversation.refs/item.ref and fixed navigation validator. Index-based action
  ownership/current generation/401 disposal remain unchanged.
- Classic dashboard/wos-today-workspace.js markup rows/best/recent removed only
  display metadata. data-today-action keys, data-today-deal exact IDs and
  data-today-record keys route through original handlers. Full record, linked
  conversation, timelines/search/history, API envelopes and canonical values
  are untouched. Missing best heading uses a truthful generic fallback, not ref.
- Entry caches native app14/classicToday6 only. CSS15/Email15/Deals18/Public57/
  sharedlogin1/auth3/nav3/keySettings2/components6/assistantmodel2/sheet3/layout3/
  reply1/todaymodel1/emailmodel2 retained. No native Deals/backend rewrite.

## Tests And Gates

New tests/today-card-metadata-ui.test.js covers native+classic1366/400/412,
all three reference families absent from metadata while original data is intact,
exact record links for buyer/deal/match, recorded release link, classic full
record identity/Open/Back, missing-heading fallback, source text containing a
code preserved, escaping/no image execution, malformed link rejection,
zero writes/external calls/page errors, no mutation and no overflow.

Seven focused files PASS: new metadata UI, workspace Today action center,
classic Today UI, Today projection negatives/purity, Today navigation,
workspace exactrecord/Back/nonadmin/locked navigation, mobile navigation.
Existing assertions changed: NONE. No tests deleted or gates lowered.
Full277, serialized two-screen before/after FCP<2s and performance/access90+,
self-review/currenthead+main, exactautomaticdeployment and approved435 readonly
proof are required before this slice is called released. No production private
captures/text/values/credentials/business writes permitted.

## Assumptions And Risk

AGENTS section2 permits ordered bounded sub-PRs. Today is one consumer boundary;
remaining faces are kept separate to avoid coupling unrelated readers/writers.
Removing display nodes can shift spacing, hence true3size visual and layout
checks. No migration or data deletion; rollback restores display-only source.
Owner5%5-hour reserve policy applies; weeklywarning only when remaining<10%.

## Candidate And Release Gates

Frozen987 source auditPASS baseline7a7:NativeFCP49.3/32.7/39ms,classic82.3/
133.5/76.7ms true1366/400/412;LH13.5performance99/96native94/100classic,
access100/100native98/98classic,nullruntime/emptyaudit/nooverflow. Actual
populatedTodayroute asserted. All12audit+6stateimages inspected,SYNTHETICnotlive.
PR40885969508/job123489636449277/0/0,13m26job,sum752.98sNOTwall,600s/file,
all277rows retained. No failedPRfull/audit/retries/changedexistingassertions.
Actualmergef6d7f522 complete tree42f41945 identical987. ExactautomaticRailway
23b82e52 Active/successful/Detailsselected/sourceverified. Public15 original
geometry/security/currentassets andmergedfocused7PASS. SignedSTRUCTURALONLY
native67actions/no ref-smallnodes/classic67actions/Deals19->1->Back->19.
MAIN40888440891/job123498351048 SUCCESS277/0/0,600s/file,16m56job,
sum946.70sNOTwall,all554PR+MAINrowsretained. ReleaseVERIFIED. No fullfailures/
reruns/cancellations/changedassertions. Remaining8Bconsumerfaces stillrequired.
