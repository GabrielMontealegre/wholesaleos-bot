# Reviewed message templates and first20 policy - #307

The Email page now has Message templates. Load reviewed templates, choose
Holder JV reply, Buyer buy box, Buyer teaser or Follow-up, write the subject/text,
review it and Save reviewed template. No preset seller/buyer/deal claims exist.
Kinds have separate text and append-only histories. Nothing is sent by this action.

The counter means approved sends recorded with real accepted transport proof,
not every email ever sent from Gmail. Editing or approving a template does not
increment it. Until20 qualifying sends for a kind, the policy requires the full
message review. After20, explicit sending is still mandatory; automatic sending
is never allowed. Failed/future/unapproved/wrong-origin receipts do not count.
Duplicate Message-IDs count once; contradictory kinds/digests count toward neither.
Malformed receipt collections are unavailable,never guessed as zero.

## Trace

- Explicit UI save -> existing admin registrar's new email-templates POST ->
  pure save -> email_template_history + privacy-safe canonical approval activity
  -> existing strict/current JSON store write -> GET -> Email library.
- Current revision fingerprints protect stale saves. Actor/time are server-owned.
  Identical text is a quiet duplicate; changed words append rather than overwrite.
- db.readDBStrict/writeDB retain root collections; existing imports/upserts spread
  the full store. Leads/buyers/deals/conversations and their state are unchanged.
- Policy reads separate email_draft_approvals/email_delivery_receipts, not activity
  reports or template approvals. No route writes those proof collections here.
- Existing conversation registrar mounts both admin routes; server/auth unchanged.
- Email reader wrapper adds a separate library section; no mailbox request/send
  on template load, no automatic load or inference of text. Only explicit Load
  reads the template GET; only explicit checked Save writes the template POST.

## Boundary for #288

This is a reusable template and approval-policy foundation,not a completed Send
workflow. #288 must generate/review the exact outgoing message, apply current
buyer/JV privacy guards independently of the template, then on an explicit owner
click persist real transport proof matching its reviewed digest. Neither a saved
template nor reaching20 permits an unsigned street address or automatic send.
No recipient is invented,selected or contacted here. SMTP acceptance is a send
receipt,not proof that the recipient read it or that it reached their inbox.

## Tests

New pure tests cover reviewed text/revisions, stale/forged/header/future/wrong-
origin failures, kind/digest conflicts, real proof threshold, duplicate quiet,
JSON persistence, privacy and pure clock/network/write spies. Real local routes
and UI cover401/400/409/413, unchecked no-write, explicit save/reload/kind
isolation/escaped words, zero sends/external requests and1366/400/412 bounds,
44px controls and no overflow. Existing assertions stay unchanged. Synthetic
screenshots are labeled separately; full timings/live results in BACKLOG.
