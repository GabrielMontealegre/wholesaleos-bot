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
