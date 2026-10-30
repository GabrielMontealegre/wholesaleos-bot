# 412 / D-063B: Native report-label receipts

2026-10-30 BOUNDED DONE, PR482 RELEASED/VERIFIED at actual main19a44085.
This bounded consumer follows the already-released453 provider
receipt prerequisite and the approved439 phased B scope. It does not complete
412, arbitrary provider-label display, REST custom-label mapping or owner design
approval. Native Deals and mailbox writers remain excluded.

## Trace

- Writer: `modules/email/mailbox-reader.js` requests already-available IMAP
  X-GM-EXT-1 labels on metadata/body reads; `provider-labels.js` emits an exact
  `imap_gmail_labels/message/names` receipt. Unsupported/malformed labels remain
  null. OAuth receipts contain opaque `gmail_label_ids/message/ids`, not names.
- Transport: existing admin GET routes annotate messages through thread-view;
  it preserves receipts without adding a request, writer or storage.
- Reader: native `mail-layout-model.js` classified WOS reports from a raw
  `row.labels` array that the current producer does not emit. It ignored the
  real receipt and could accept an unproven legacy array instead.
- Consumer: existing native Email WOS reports category and WOS Action shortcut
  project loaded threads only. No new controls, CSS, API or raw-label rendering.
- Existing linked-role and automated-listing precedence stays unchanged. A
  provider label never establishes identity, a person role, a total or authority
  to share/send. Search, drafts, source binding and canonical navigation remain.

## Smallest Correction

Accept only complete, own-data, exact-shape IMAP per-message name receipts.
Names must obey the existing provider limits; duplicate/malformed/sparse/accessor
arrays and unsupported origins/scopes are unavailable. Only exact WOS/Reports or
WOS Action matches classify reports. Every message in a thread must qualify;
duplicate copies must agree on the full unordered receipt. No raw-label fallback,
opaque REST translation, subject/sender guess or role inference.

Native mail-layout-model cache tag3 becomes4; Email15 becomes16 for the scoped
selected-tab visibility repair below. All other asset tags stay current.
Owned PR397 docs-only proof35ced9a was deliberately fast-forwarded from actual
origin/main before this bounded branch. No unrelated source was bundled.

## Tests And Evidence

Final a4a175b exact changed-source audit PASS: FCP160.6/116.8/131.8ms at true
1366/400/412, Lighthouse13.5 performance99/96/accessibility100/100, null runtime
error/empty audit errors/no overflow. Actual Reports1 and selectedTabFits true
during required Accessibility gathering, official implementation unchanged.
Three final audit images and15 final native UI views inspected. Full289 PR/main,
current-head review, automatic exact-source deploy and approved live gates PASS.
Candidate proof: docs/screens/2026-10-30-report-label-candidate.

New pure regression FIRST failed0!=1 for an actual-shaped provider receipt.
After the scoped fix it passes exact report positives and raw/forged/opaque REST/
wrong-scope/wrong-origin/malformed/accessor/conflicting-copy/mixed-thread negatives.
No source mutation, folder-total or older-page claim is introduced.

Existing test scaffolding changed intentionally, not assertions weakened:
`mail-layout-model.test.js` report/mixed/conflicting fixtures and
`workspace-mailbox-chrome.test.js` report fixture now carry the exact producer
receipt rather than raw labels. Existing category/role/source/search/geometry/
draft/no-write expectations remain; native report checks add role and request
invariants. Focused UI, exact-source audit, full PR/main gates and automatic live
release verification passed as recorded below.

First exactcba26a3 synthetic audit passed numerical gates: native Reports FCP
63.8/57.7/64.4ms at1366/400/412, Lighthouse99/96 performance,100 accessibility;
baseline81.1/56/54.7ms and99/96/98. Required official Accessibility gatherer
delegated unchanged and recorded actual Reports scope during measurement.
However visual inspection found the selected Reports tab partly outside the
phone tab-strip viewport, also present in baseline. This is not a fully accepted
visual result despite green scores. A new geometry assertion FIRST genuinely
failed at workspace-mailbox-chrome109. Scoped Email selection now scrolls the
selected existing tab into view after ordinary focus; no CSS/parent/shared
component or layout freeze. Exact changed-source audit remains required;
retain first numerical/visual history, do not reuse it as final proof.

## Verified Release

PR482 merged once at2026-10-30T11:50:47Z. Actual main
19a44085d67c494884f10632f01e559b794d2da2 complete tree
5b2d001e9bcfc459c26336c58541671f0a9d03bd is identical to tested PR
a4266835fb3b7ccb6734576a7d43debc124e9d66. Current-head self-review6521942748.

- PR41022052815/job123951387394 SUCCESS289/0/0;18m06 job wall,
  sum1031.54s NOTwall.
- Independent MAIN41051006631/job124046743592 SUCCESS289/0/0;
  11:50:52Z->12:09:39Z,18m47 job wall,sum1066.55s NOTwall.
- All578 per-file timing rows retained,600s/file; PR copied before MAIN helper
  overwrite. No rerun, cancel, skip or unchanged audit repetition.
- Automatic Railway417f40bc-c625-4726-b059-e6b421ae9e41 verified on selected
  Details: exact19a GitHub source anchor1,Active,successful. No manual deploy,
  retry, settings, variables or log actions.
- Public15 approved435 PASS at1366x768/400x915/412x915; all15 unsigned images
  inspected. Original44px-in-viewport/security guards and strict parsed entry
  model4/Email16 exact bytes plus all prior approved asset guards retained.
- Actual signed Chrome5 GLOBAL static structure only: Reports enabled/selected,
  44px/tab fully visible/panel1/content ready/no overflow; Primary selected and
  focus returned. Exact report contents remain synthetic-only. No private rows,
  body text, lengths, input values, JSON, AX, captures, message/provider actions,
  business writes or authentication transfer. Live console logs not collected;
  no zero-application-errors claim.

Initial public harness attempt mistakenly loaded the local hermetic preload,
which blocked the first external GET before the underlying network call or any
live assertion. Correct public proof used only the pinned browser preload and
unsigned contexts. Not a failed live gate. Initial signed header0 was
prehydration only, followed by verified static readiness; no private probe.
Railway building-state wait mismatch was not a product failure. No rollback needed.

Release proof: docs/screens/2026-10-30-pr482-release, including both full timing
reports, public report/images and bounded verification record. Docs-only proof
branch starts directly at actual main; tested source branch untouched, no new
main/CI/deploy for proof. Attachment cap100 failure already recorded; no retry
or unrelated attachment removal. Whole412/design approval/native Deals and
mailbox writers remain outside this completion;455 remains6/9(67%).
