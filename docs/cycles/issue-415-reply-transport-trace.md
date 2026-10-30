# Exact-Thread Reply Transport (D-061)

Status2026-10-21: phase1 transport/API implemented locally after corrected
native Email PR421 was live-verified. Phase2 composer binding is not implemented.
Full-suite/review/release pending. No real message is authorized. Default OFF.

## Writers And Readers

- `modules/email/mailbox-reader.js` writes bounded connected-mailbox metadata
  and plain-text bodies, including source message IDs and direction. IMAP reads
  validate folder/UID validity and use read-only locks; OAuth parses the raw
  message. Both paths currently omit CC. Any participant addition must cover
  both paths, not reconstruct recipients from displayed names.
- `modules/email/thread-view.js` annotates exact RFC-message/thread graphs and
  recorded conversation role/deal links. Only one exact linked conversation
  is eligible for attribution. It does not currently expose the conversation
  ID or linked buyer IDs; ambiguous links must not receive guessed receipts.
- `modules/records/conversations.js` writes operator/imported conversation
  anchors, refs and ready_message. It is not evidence of a completed send.
- `modules/email/buyer-messages.js` owns buyer-package preparation, reviewed
  version checks, a persisted pre-SMTP attempt and uncertain-send handling.
  Reuse these safety patterns, not its buyer-specific route for arbitrary mail.
- `modules/email/template-approvals.js` owns template review/receipt policy;
  `modules/deals/jv-workflow.js` owns JV/package gates. Keep those flows intact.
- `modules/records/record-activity.js` appends timeline events. A new reply
  receipt needs exact message/thread/time/recipient metadata, never a body in
  an activity or diagnostic log, and never a synthetic email_sent success.
- `modules/security/dashboard-session.js` verifies signed dashboard cookies;
  `server.js` requireAdmin re-reads the current user/role. New routes must use
  that boundary, not x-user-id, agent pairing or an unsigned client identity.
- `dashboard/workspace/email-screen.js` owns local-only composer edits and
  selected canonical message IDs; `app.js` owns session clearing. Edits must
  invalidate review, and session loss must clear preview/private composer data.
- `server.js` legacy generic send/reply endpoints return410. Keep them disabled;
  register a separate bounded reviewed-reply API rather than reviving them.

## Bounded Contract For Implementation

1. Re-read the selected source messages before preview and before sending;
   require one exact connected-mailbox graph, valid source IDs/dates and RFC
   reply anchor. Do not infer a thread from subject or email similarity.
2. Parse original From/To/CC structurally. Default to recorded participants,
   exclude the operator's own configured mailbox, allow removals, and distinguish
   additions the operator explicitly types. Reject recipient/header injection.
3. Signed admin plus route-scoped CSRF protection, a complete preview tied to
   operator/thread/content/version, five-minute expiry, and edits invalidate it.
4. Persist sending before SMTP. Double clicks/restarts/uncertain outcomes cannot
   retry the same version. Report uncertainty honestly and direct the operator
   to Sent. Enforce the rate cap against persisted attempts, not just successes.
5. Use existing SMTP configuration; no new credential or provider. Default-safe
   enable/kill switch is read from env, never changed by implementation or live
   verification. No attachments, new-thread compose, packages or legal generator.
6. Exact linked deal/buyer timeline receipts carry message/thread/time/recipients;
   an unlinked reply has its own receipt, not a fabricated entity link. Distinguish
   SMTP acceptance from delivery. No bodies, headers or addresses in debug logs.
7. Hermetic tests: forged/session-scope/CSRF, wrong graph/origin/date, stale source
   and preview, participant injection, edit invalidation, concurrent double click,
   timeout/restart, persistence failure, rate cap, kill switch and safe receipts.
   UI1366/400/412 must prove preview/review/Send fit and zero automatic sends.

This is implementation planning, not proof that a send transport exists. Existing
buyer/JV/legal/template gates and unavailable Send behavior remain unchanged.
