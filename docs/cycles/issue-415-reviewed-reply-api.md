Item: #415 / D-061, ordered phase1 -- reviewed existing-thread reply API, OFF

## Change And Scope

Add the source-anchored transport boundary independently of the composer.
Native Email still shows unavailable Send/Open in Gmail. The subsequent
phase2 will bind preview/review/explicit Send on that existing screen; do not
claim it works now. No live message, preview/save or business write is tested.

Three new signed-admin routes under /api/dashboard/email/thread-replies:
GET /status (read-only flags/cap), POST /preview, POST /send. Legacy generic
send/reply routes remain410 and existing buyer/package/JV/legal/template
flows are unchanged. No new dependency, auth change or provider setting.

Both POSTs require a same-origin Origin, application/json and custom
X-WOS-Reply-Request:1 header; cross-site Fetch Metadata is rejected. Existing
signed-admin middleware and a current DB admin check after asynchronous
mailbox reads apply; x-user-id or an agent-scoped cookie never authorizes it.
All responses are no-store. No CORS relaxation or client credential is added.

The API is OFF unless WOS_EMAIL_REPLY_ENABLED=true; an explicit
WOS_EMAIL_REPLY_DISABLED=true also blocks it. No variable is changed here.
Existing Gmail SMTP configuration only; TLS verification, bounded timeouts,
plain text, exact source In-Reply-To/References, no URL/file access, HTML or
attachments. No automatic or background sender, no retry after uncertainty.

## Writer/Reader Trace

- mailbox-reader.js writes exact structured From/To/CC from the IMAP envelope
  and parsed OAuth metadata/raw MIME. Both paths retain read-only locks,
  bounded message counts/bytes, UID validity and source identity. No address
  is recovered by splitting display names or inferred from text.
- thread-view.js annotates the existing exact source graph. Additive records
  links include only uniquely resolved canonical buyer/deal refs across all
  four collections; existing role and deal projection behavior is unchanged.
- thread-reply-policy.js is pure: injected clock, source_kind/date/RFC and
  configured-mailbox participation, one exact thread, no ambiguous linkage.
  It derives participants/source defaults, accepts removals and explicitly
  declared operator-typed additions, rejects header/recipient injection,
  and hashes exact source/context/content/operator into the reviewed version.
- reviewed-thread-replies.js re-reads source messages on explicit preview
  and send. It uses the latest DB after awaits, not a stale snapshot. Preview
  expires after5m; edits require a different preview. A persisted sending
  state precedes SMTP. Double clicks, restarts, timeouts/partial acceptance
  and failed result persistence never auto-retry. Same-version new previews
  cannot bypass an uncertain/accepted attempt. All persisted attempts count
  against30/hour. A preset accepted status without its exact SMTP receipt
  cannot claim success.
- New thread_reply_previews/receipts are additive private DB arrays. Exact
  buyer/deal timelines receive SMTP-accepted receipt metadata (message/thread,
  recipients, time), not bodies or a claim of delivery/funds/verified identity.
  Unlinked mail has its own receipt, never a fabricated deal/buyer. Link changes
  during SMTP fail safely to unknown. No existing row is mutated/deleted.
- db.js readDBStrict/writeDB preserves the full JSON object and atomically
  writes temporary-file then rename, without logging contents. New arrays
  survive that path; no schema initializer or saved-lead writer is changed.
- server.js registers only these routes with requireAdmin. Existing global
  signed-session coverage and all disabled generic endpoints stay intact.

## Tests / Assertions / Decisions

New reviewed-thread-replies.test.js: actual signed-session/scope fixtures;
CSRF/missing/forged/unknown/future/wrong-origin/header injection; declared
operator additions; exact versions/text; stale source/store/link/preview;
concurrent clicks; uncertain/partial/restart and post-SMTP DB failure;
kill switch; persisted cap; current-role changes; receipt-backed duplicate
responses; linked receipt privacy; safe MIME/SMTP options; purity spies.
Global fetch and http/https get/request throw; asserts zero network calls.
New mailbox-participants.test.js checks both IMAP/OAuth paths including
quoted display names and CC, with no network. Unchanged mailbox-reader,
inbox-thread-read and persistent-mailbox-conversations focused files pass.
Existing assertions changed: none. Full final240-file suite600s/file required.

Decisions: architect415/D-061; bounded split/default-OFF/same-origin CSRF
assumption logged in DECISIONS. Risks: JSON DB remains single-process as
existing architecture; multi-instance sending needs transactional storage,
not a claim that an in-memory lock solves it. No new storage rewrite here.
Native UI is deliberately still read-only; overall415/412 remain open.

## Verification After Deploy

Wait exact deployment + health200; signed-admin GET status must report
enabled=false, automatic_send_allowed=false and30 cap. Visit native Email
1366/400/412 and classic lead drawer with a clean console; no POST, preview,
send or variable change. Preserve private-data-free screenshots. Full UI
before/after performance/accessibility proof is the already released native
screen; this API slice adds no stylesheet/script or changed visual surface.
