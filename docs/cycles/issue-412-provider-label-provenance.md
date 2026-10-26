# D-063B: Provider Label Provenance Trace

2026-10-26. Backend prerequisite candidate, from main51a7caf after verified452.
No PR, full gate, deployment or completed native label feature claimed yet.
Count repair450 remains independently blocked pending its clock decision.

## Bounded Backend Prerequisite Implemented Locally

`provider_labels` is a new optional per-message receipt, deliberately distinct
from legacy `labels`. IMAP carries `{origin:'imap_gmail_labels',scope:'message',
names:[...]}` only when the connected client advertises X-GM-EXT-1 and the fetch
actually supplies a valid label Set. OAuth carries `{origin:'gmail_label_ids',
scope:'message',ids:[...]}` from existing metadata/raw results. An opaque ID is
never a custom name. Unknown/malformed/oversize inputs yield null; a genuinely
returned empty collection remains an empty receipt. At most100 strings of
200 characters each; controls/bidi/duplicate IDs/sparse/accessor arrays reject.

Installed ImapFlow2.3.0 types expose FetchQuery.labels:boolean and
FetchMessageObject.labels:Set<string>. Its actual fetch command emits
X-GM-LABELS only with X-GM-EXT-1; its parser decodes mailbox names into a Set.
The candidate adds labels:true to the EXISTING metadata/header fetch only.
No additional command, registry lookup, body batch, polling, retry, storage,
route, scope, auth, send, count or writer is added. Unsupported servers remain
unknown even if a forged fixture includes a Set. Existing read-only locks,
UIDVALIDITY and body/request limits remain unchanged.

New hermetic mailbox-provider-labels test covers the real mailbox adapter,
real MIME parser, annotation, list/body parity, capability, names-vs-IDs,
known-empty/unknown/malformed/oversize/sparse/accessor/duplicate/wrong-origin,
fresh copies, zero ambient clock/network and unchanged bounded read counts.
Seven existing mailbox/projection files also pass; original assertions unchanged.
The initial restricted-sandbox Node launch produced no test output and was
interrupted; the configured runtime then passed outside that process sandbox.
This is not a test failure, full-suite result or permission to skip a gate.

Native Reports still uses its old raw-label field. This prerequisite does NOT
change its category, claim a custom Gmail ID/name mapping, render labels, add
star authority or certify whole B. A later independently reviewed native
consumer must enforce source/identity/mixed-copy/group consistency using these
receipts and actual adapter fixtures. No native asset/cache changes here.

## Actual Writers And Readers

- `modules/email/mailbox-reader.js`: IMAP metadata requests envelope/flags/size,
  not Gmail label membership. `readState()` turns flags into read/unread with
  origin. A selected folder path is not proof of every label on the message.
- OAuth list already reads each bounded message's `labelIds` but uses them only
  for direction/read state. IDs are not custom label display names. Custom-folder
  lookup already calls `users.labels.list`; Inbox does not fetch that registry.
  OAuth explicit body reads also receive message label IDs, independently of MIME.
- `modules/email/thread-view.js`: `annotate()` spreads source message fields and
  adds exact recorded-conversation links. It currently neither creates nor
  validates a provider-label receipt. Recorded roles are a separate source.
- `dashboard/workspace/email-model.js`: validates list identity/time and groups
  message IDs. Recorded role provenance must not become a provider label.
- `dashboard/workspace/mail-layout-model.js`: Reports currently recognizes raw
  `labels` strings `WOS/Reports` or `WOS Action` on every message/copy. The actual
  mailbox adapter does not write this field. Tests synthesize those strings;
  they do not prove real adapter-to-annotation label availability.
- `dashboard/workspace/email-screen.js`: the Reports category and WOS Action
  folder control consume that loaded projection. These are display filters,
  not mailbox writers. Unsupported action buttons must remain disabled.
- `tests/mail-layout-model.test.js` and `tests/workspace-mailbox-chrome.test.js`
  supply raw-label positives. Preserve mixed-thread and conflicting-copy
  negatives when replacing their scaffolding with real source receipts.

No current live label failure is asserted. This trace identifies an uncompleted
B source boundary, not a reason to roll back healthy452 or bypass450.

## Official Contract Checked

- [Gmail label guide](https://developers.google.com/workspace/gmail/api/guides/labels)
- [Message resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages)
- [Gmail IMAP extensions](https://developers.google.com/workspace/gmail/imap/imap-extensions)

The Message resource's `labelIds` are per-message IDs. System and user labels
are different; custom names require a registry mapping. Thread-level membership
can be a union and does not prove that every member has the label. Do not use
thread union labels to certify the all-message Reports category. No scope,
credential, label creation/modification or settings change follows from reading
these contracts.

## Next Bounded Implementation Boundary

First deliver a read-only source receipt and strict projection, not star/label
write controls. Use actual provider membership plus an unambiguous ID/name
mapping; do not invent `WOS Action` from a subject, sender, role, selected UI
category, MIME body or unknown registry ID. Unknown stays absent. Physical
provider labels and any future WOS rule labels require distinct origins.

Before adding an IMAP label fetch, verify the installed ImapFlow2.3.0 extension
capability, fetch option and returned type using its actual contract. Existing
flags alone are insufficient custom-label evidence. Avoid a new labels.list
request per message or body read: any registry read must be bounded, cancellation
aware and separately tested, with no retry/fanout/background cache persistence.
If that transport cannot stay within one bounded explicit load, split adapter
support from UI consumption instead of implying parity between providers.

Bind receipts to exact message/provider identity. Reject malformed, sparse,
oversize, duplicate/conflicting mapping and wrong-origin values; never interpret
missing membership as a known empty set. Keep duplicate-copy and mixed-thread
checks fail closed. Category/search/folder/session invalidation must not retain
stale labels or repaint an active composer/review/uncertain send outcome.

Use actual adapter + annotate fixtures, not only hand-authored DTOs. Assert
unchanged request counts where no new registry read is needed; cover unsupported
providers, provider401/403/429, timeout/abort and missing mapping. Genuine app
session401 must still clear private view state; provider failure must not lock
the session or erase already loaded mail. No real production mailbox mutation
is an acceptable test. Keep all D-061 reply boundaries unchanged.

Any changed native asset must skip failed448's cached Email13/layout4 versions:
current restored Email12/layout3 would advance to at least Email14/layout5.
Full final-head600s/file, self-review, exact auto-deploy and approved435 mixed
proof remain required before calling this slice delivered. Parent412/design
approval and the native Deals gate remain open.
