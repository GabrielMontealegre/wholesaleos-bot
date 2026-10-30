# 412 / D-063B: Opened Message Labels

2026-10-30 LOCAL CANDIDATE, not released. Production remains verified
PR482/main19a44085. Approved439/D-063 phase B includes source-backed labels;
the detailed412 contract asks for message label chips. This slice presents
per-message names only after an ordinary explicit message open. No REST name
mapping, thread-wide label claim, role inference, total, search expansion,
mailbox mutation or design approval is introduced.

## Trace

- Existing mailbox-reader metadata/header reads request IMAP labels only when
  X-GM-EXT-1 is genuinely advertised. provider-labels bounds names to100/200chars
  and emits imap_gmail_labels/message/names. REST IDs stay opaque and unavailable.
- Existing thread-view and signed-admin GET transport preserve the receipt.
  No extra request, provider lookup, storage, API or writer is added.
- Existing mail-layout-model validates exact own-data receipt shape. New
  openedLabels requires metadata/body identity and equal complete receipts,
  including every loaded duplicate copy; unknown, conflicting and stale data
  stays unavailable. Returned names are detached copies; category/role rules
  are unchanged.
- Email bodyMarkup renders escaped names using existing neutral badges in a
  collapsed Message labels section below the message. Opening it makes no read.
  Existing earlier-message keyboard command excludes this separate disclosure.
  No CSS, shared component, parent layout or backend changes. Cache tags only
  mail-layout-model4->5 and Email16->17; all other current guards remain.

## Evidence

New pure test FIRST failed because the opened-label projection did not exist;
implementation now passes exact provider receipt/identity/copy agreement,
empty/unknown/opaque/wrong-origin/scope/stale/conflicting/sparse/accessor and
mutation/purity negatives. This was a missing-feature assertion, not a claim
of an existing runtime regression.

New synthetic UI test passes1366x768/400x915/412x915/1038x503/1366x600:
collapsed reading height>=180, literal malicious/200-character names, no
overflow, no buyer-role inference, no unopened label display/body read,
disclosure keyboard independence, draft roundtrip, opaque body withheld and
unchanged request count/no writes/external/errors. First test incorrectly
counted the static disclosure chevron image as source markup; scoped the check
to the label paragraph. Next draft test attempted reader disclosure while the
existing composer hides the reader; corrected the journey to Close reply,
toggle labels, reopen Reply and assert draft preserved. No runtime boundary
was relaxed for these test-scaffolding corrections. Earlier images remain
external, not final proof. Final15 synthetic UI images inspected via contact.

Existing mail-layout-model, mail-layout-provider-labels, mailbox-provider-labels,
mailbox-attachments and five-size workspace-mailbox-chrome pass unchanged.
Exact-source870f4e0 before/after audit PASS: FCP66.8/55.5/73.6ms at true
1366/400/412; Lighthouse13.5 performance99/96/accessibility100/100, null runtime
error/empty audit errors/no overflow. Actual opened body1/expanded label
section1/badges3/reading height645/740/740 observed DURING the required official
Accessibility gatherer, delegating its implementation unchanged. No app/layout/
storage/category/threshold suppression. Actualmain19a baseline recorded
298.8/150.2/56.7ms,98/96 performance,100 accessibility; not substituted for the
candidate or rerun. All six audit images and15 final UI views inspected.
Audit filenames retain the earlier helper's reports basename; the measured
scope is the opened Primary message/labels, not the Reports category.
Proof: docs/screens/2026-10-30-opened-message-labels-candidate.
Full PR/main gates, review and automatic live verification remain pending.
No private production reads/captures/values used.

External strict public --opened-message-labels guard parses the actual native
entry and requires one executable model5/Email17 script plus exact normalized
asset bytes. Existing report/Ask/Profile/currentasset/security/44px guards
remain; new versions apply only with the new flag. Offline exact/EOL positives
and nine stale/disabled/duplicate/source negatives pass without network.

PR482 docs-only release proof41fe6f1 deliberately preserved as this branch's
parent, directly above actual main19a. Tested482 source branch untouched.
No477/Claude-owned or paused source/comps work bundled. Whole412/design/native
Deals/mailbox writers/backlog not complete;455 remains6/9(67%).
