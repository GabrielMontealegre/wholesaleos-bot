# 412 / D-063B: Native report-label receipts

2026-10-30 LOCAL CANDIDATE, not released. Current production remains verified
PR397/c972d440. This bounded consumer follows the already-released453 provider
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

Native mail-layout-model cache tag3 becomes4; all other asset tags stay current.
Owned PR397 docs-only proof35ced9a was deliberately fast-forwarded from actual
origin/main before this bounded branch. No unrelated source was bundled.

## Tests And Evidence

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
release verification remain pending until recorded below.
