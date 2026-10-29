# 455.8B2 - Workflow Card Metadata

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
