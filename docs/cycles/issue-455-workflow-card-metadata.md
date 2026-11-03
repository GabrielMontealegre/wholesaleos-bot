# 455.8B2 - Workflow Card Metadata

## Current-Main Rebase Under D-065c

2026-11-02: rebase the two owned item commits47170f6 and412ed2e onto verified
main84da984 by scoped cherry-pick transplants. This preserves original local
item/455-workflow-card-metadata at412ed2e and the failed remote47170f6 evidence,
without stashing or staging unrelated dirty exports. Exclude obsolete parent
30138e0's PR476 proof replay. Only BACKLOG/DECISIONS conflicted; retain both
current decisions and explicitly historical item notes. Four display removals
and their four cache versions are unchanged from the owned implementation;
newer native/assistant/Email/clock2/auth/build-guard assets remain current.

The existing four-screen synthetic functional test passes at1366/400/412.
Its initial Conversation image remained belowfold and is NOT positive visual
proof. Strengthen the test with a heading-in-viewport assertion; capture only
the three Conversation views separately, preserving the other nine positive
images without repeated audits. All12 selected images were inspected; runtime
files are identical across these captures. No existing assertion weakened.

D065b accepted the previously recorded baseline comparison as existing debt;
add its single follow-up item at the backlog bottom. D065c specifically permits
one first CI on this rebased head: green releases underD065b, failure defers
with summary/no third attempt. Do not claim a new performance measurement or
rerun Lighthouse/unchanged-screen audits. The historical278-test/old proof plan
below is superseded by current-head full CI plus section7 maximum proof.
Screens: `docs/screens/2026-11-02-pr477-rebase`; full/release gates pending.

Bounded continuation after4758A and4768B1. Approvals, conversation cards,
Pipeline and notification Work queue omit their standalone reference metadata.
Buyer-match and legacy card faces remain later8B work;whole455.8 notcomplete.
No generic string censorship: source person/message/alert text is still escaped
and retained when it contains reference-like strings. Full records and canonical
identity/provenance are unchanged. No backend/auth/provider/clock/value rewrite.

## Writer/Reader Trace

- modules/records/record-activity.js owns ensureReference/assignMissing/
  assignMissingVerified/importInteraction/matchReference/search/history. No
  writer/schema/sequence/migration changes. assistant-finds/reviewed-deals keep
  reference projection and full-record/email subjects.
- approval-workspace.js pendingRecords/build projects exact canonical ids,
  record_ref/version;decide validates kind/id/version/source/comps/review and
  records explicit actor decision. wos-approvals.js card header alone loses ref
  paragraph;data-approval-id/kind,version ownership,Open/review/decision/Skip,
  disabled unchecked review and current-session/error handlers unchanged.
- conversations.js validates stored refs, resolves unique linked_deals (duplicate
  and cross-kind collisions do not link). wos-conversation-cards.js render only
  removes row.refs prefix from statusparagraph. refs/linked_deals/id remain
  intact; exact source-backed thread link OR fixed record_ref link, role and
  date authority, source notes/draft/text/escaping unchanged.
- pipeline-reports.js writers keep reports/ref/evidence;pipeline-workspace.js
  build resolves target.ref to exact unique canonical target/id. wos-pipeline-
  workspace.js markup removes only header metadata small. data-pipe-key/open/
  buyer/review commands retain exact ownership;current-actor/sequence/abort/
  401/503/paging/group/error/value/funds/sharing guards unchanged.
- notification-workspace.js project validates alert IDs and copies current
  Today actions (today-workspace.js canonical ref projection). markup removes
  only workqueue n.ref span. Stored alert title/message/time,unique counts,
  actual read IDs and explicit mark-read handlers unchanged. OpenToday still
  fixed GET navigation;no automatic acknowledgement.
- Classic index versions only: conversationCards3/approvals4/pipeline4/bell2.
  Nativeapp14/CSS15/classicToday6/Deals18/Public57/Email15/layout3/nav3/
  sharedlogin1/auth3/keySettings2/components6/assistantmodel2/sheet3/reply1/
  todaymodel1/emailmodel2 remain. No native Deals,fixture filtering or date fix.

## Tests And Release Gates

New workflow-card-metadata-ui.test.js uses actual full dashboard renderers at
1366/400/412 for all four views. Checks metadata absence, exactapproval ID/
pipelinekey/conversationrecord link,disabled unchecked review/workqueuemarkread,
OpenToday read-only transition,source text containing codes preserved/escaped,
malformed/absent linked record cannot invent link,immutability/no writes/
external/pageerrors/overflow. Synthetic inputs in tests/helpers only.

Ninefocused files PASS: newmetadata UI;existingApprovalUI+unit,ConversationUI+
unit,PipelineUI+unit,NotificationUI+unit. Existing assertions changed:NONE.
Existing synthetic explicit approval/markread tests remain unchanged;they are
not production writes. New metadata test makes zero state-changing requests.
Full278PR+MAIN/currenthead+selfreview/exactautomaticdeploy/approved435 public15
and signedSTRUCTURALONLY checks remain required. UIaudit beforeafter actual
fullindex fourviews/FCP<2s/performanceANDaccess90+/true3size currentlypending.

## Assumption And Risk

AGENTS2/3 orderedconsumer-boundary continuation;fourshortmetadata-only removals
share canonical workflow identity readers. Spacing may shift,so3sizevisualproof
required. No data migration/deletion;rollback restores display-only code.
Buyer detailedrecord refs/timelines/subjects remain valid identity,while nested
buyer-match card faces and legacy list metadata need separate trace/slice.
Owner5%5-hourreservepolicy/no earlyweeklyconservation;warnTOPbacklogwhen<10%left.

## Audit Harness History

Initialfourviewaudit stopped before a complete report;onlybeforeApprovals and
Pipeline images exist. Errorcause was not serialized,so NOTcalledflaky,
environment or productdefect. Initialconversationstate screenshots place the
changedcard belowfold;not validpositivevisualproof for thatcard. Retained under
audit-initial-incomplete plus originalstates. Oneboundedconversationdesktop
initialization diagnostic PASS331.6ms/noerrors,not a wholeaudit success and not
proof of the original cause. Harnessnow requires actualview readiness and
scrolls changedconversation into viewport/assertsgeometry beforecapture;no
productchange orFCP/performance/accessibilitythresholdchange. Strengthenedfull
audit running;no failed/incomplete/diagnostic results reused as gate.

Firstharnessfixfullaudit also stopped BEFOREbaselineconversation: retained
diagnostic shows nodes1/toolsOpenfalse/authenticated/dashboard/no pageerrors.
Syntheticinitializer stored a startedboolean while Todayhydration replaced
the expandedsection with a new foldedDOMsection. Secondharnesscorrection uses
currentsection.open/currentrow identity,keeps observing replacement andscrolls
only a new visible row. No productchange/failed-headtestretry/gateweakening.
Secondcorrectedcompleteauditrequired;allinitial/incompletehistoryretained.

## Blocked Candidate / 478

SecondcorrectedCOMPLETEaudit reachedallfourviews. AfterApprovals/Pipelineeach
100/100performance98/98access;Conversations76/76performance98/98access,
Notifications88/90performance100/100access. AllFCP<2s/nooverflow/runtimeerrors.
This is a FAILEDUIgate,notrelease. BaselineConversation79/76/Bell89/99also
below90;no waiver/flaky/environment/wordingcause claim. Oneboundedmetric
diagnostic on SAMEsource identifies CLS0.4994atdetails.today-tools for both
conversationversions;candidateLCP649ms/baseline4745ms. BellCLS0.2295at
section#wos-public-deals bothversions,candidateLCP551ms/baseline579ms.
ParentTodaylayoutstabilization affects two consumers;needs-architect478 asks
for one bounded repair/acceptance prompt without weakening90+gates. PR477
remainsDRAFT/UNMERGED/UNDEPLOYED/BLOCKEDonly478;production476unchanged.

Actualfull40892998131/job123514499202 REAL277/1/0(all278),600s/file,17m09job,
sum964.65sNOTwall;all278rowsretained. Scannerflagged syntheticfixedworkflow
key at tests/helpers/workflow-card-metadata-fixture.js:7. FIRSTlocalcorrection
adds existing same-line tests-onlysynthetic-secret-fixture annotation;no
literal/assertion/scannerpolicychange. ActualofflinegatePASSlocallyafterfix.
Runtimeidentical47170f6. No newfull dispatch while478boundarypending;local
correction/proof retained deliberately,not falselyreported remote/fullgreen.
Initialpublicissuecreation auto-reviewdenied;aftercheckingdirectownerAGENTS10
authorization,one same-actionreviewretry permitted478. No alternativechannel
or denialbypass/no ownerbusinessoutreach/privatecontent posted.
Independentbuyer-match/legacycardmetadata can continuefromverifiedcurrentmain.
