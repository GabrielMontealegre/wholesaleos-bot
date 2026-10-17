# Buyers: Trace Before Implementation

Status: trace only. C is not built or released. G completed its hosted gate,
merge, exact deployment and live1366/400/412 checks on2026-10-17.
This file belongs to the subsequent C PR; no buyer/outreach write is authorized
as a verification action.

## Acceptance

- Published phone/email under the name, then areas and criteria chips; missing
  email is an explicit task. No inferred or unmasked contact data.
- Source-reported buyer-type chip/filter, with the seven types requested in the
  latest #366 comments. Unstated type stays unknown. Institutional/acquisitions
  records retain the purchase-proof caution; approval alone is not proof they close.
- Compact Buy box / Matching deals / Messages sections, with Email this buyer
  and Send matching deals at the top. The match badge opens its actual deals.
- One editable, previewed teaser email for selected matching deals, sent only by
  the operator's explicit action. No street address, source/holder identity or
  seller information in the blind teaser. Existing preliminary-value labels,
  matching/approval and JV restrictions remain in force.
- Log an accepted send once per buyer and selected deal. An SMTP acceptance is
  not proof of delivery, a reply, a call, seller contact or a JV-stage transition.
- Idempotent import and honest import freshness; do not pretend local assistant
  export counts are already imported into the production store.

## Existing Writers And Readers

- `modules/buyers/assistant-finds.js`: ITEM_FIELDS, validateItems and buyBox
  admit reported fields. ingest/update deduplicate and preserve history;
  listFinds reads assistant_find and projects contact/criteria/approval/ref plus
  fitSummary and deal-fit-view. Trace the full merge before adding buyer_type.
  Current duplicate ingest updates only last_seen_at and possible-duplicate
  metadata; it does not refresh source facts or buy boxes. duplicateIndex uses
  platform UID then contact identity, not a reference-first update. This is an
  observed code path, not proof of the live feed-count gap's cause. Preserve
  approvals/history and operator edits; never silently let a signed agent's new
  criteria replace reviewed values on an approved buyer.
- `modules/buyers/buyer-find-import.js`: shared preview/commit and mixed agent
  import. Preserve ownership, expired-preview checks, caps and approval exclusions.
- `modules/buyers/assistant-find-routes.js`: signed agent POST /api/assistant/finds,
  admin preview/commit and PATCH, plus admin GET /buyers-found. No GET/startup
  backfill or feed ingestion during release verification.
- `modules/buyers/deal-fit-view.js`: builds match/near-miss counts from actual
  reviewed-deals.evaluate results. A match requires the recorded comp/value,
  buyer maximum, price and active status. Do not bypass those checks to make a
  badge positive. Match summaries are currently capped to ten displayed rows.
- `modules/buyers/buyer-fit.js`, `modules/deals/reviewed-deals.js`: canonical
  buyer approval, geography, criteria and conservative price-rule evaluation.
  Reuse them; do not introduce a second matching predicate.
- `dashboard/wos-buyers-found.js`: compact cards currently omit contact values;
  detailedCard shows published contacts, criteria and match lists in one long
  view. Delegated open/filter/import/edit handlers own the current UI state.
  Add compact sections without silently losing drafts or changing approval.
- `modules/email/template-approvals.js`: existing per-kind first-twenty policy
  counts only unique, digest-bound accepted SMTP receipts tied to explicit
  operator reviews. Reuse its policy and provenance; no fabricated receipts.
- `modules/email/mailbox-reader.js`: existing IMAP/App Password and Google reader
  with injected clients and no content logging. It has no draft/send writer.
- `modules/deals/jv-workflow.js`: blind teaser whitelist and private-field guard;
  fullPackage has stricter signed-document and buyer-interest requirements.
- `server.js`: /api/gmail/send and /reply are still serverSendDisabled. Existing
  browser compose helpers call that disabled route. Email-reader's Send is also
  disabled. A working C action requires the guarded D-046 email slice, rather
  than a button that reports success through this disabled path.
- `dashboard/wos-email-reader.js`, index.html's active openEmailCompose and
  sendEmailFromCompose: trace readers/writers before connecting card drafts.
- `modules/records/record-activity.js`: canonical attributed timelines. Keep
  retries idempotent and distinguish draft, accepted send and operator reports.

## Evidence And Boundaries

The assistant buyers.json and deals.json files are absent from this checkout.
The #366 comments report a lagging feed, but those reported counts are not a
current measurement here. Production verification remains GET/UI read-only.
Do not import a feed, sync email, send, approve a buyer, confirm evidence or
mutate business records as a release test.

Read-only live baseline on2026-10-17 before the G release:59 cards,59 total,
14 new today,0 messaged this week; all59 visible match badges say0 deals match
(not unmeasured). No buyer_type filter or Email this buyer action. One existing
buyer detail contains a published-contact block and Buy box section, but no
Email this buyer or Send matching deals action. Opened/dismissed that detail and
restored the59-card list; no identity/contact strings recorded and no writes.
This measures the current UI, not the reason for zero matches or a feed total.

Tests must use synthetic stores and injected IMAP/SMTP clients, cover ownership,
CSRF/session boundaries, stale/changed previews, duplicates, malformed recipient
or headers, batch caps, private-data rejection, missing criteria, expired deals,
unchanged matching/value gates and zero send without explicit reviewed action.
Inspect state-specific disclosure/interest requirements before enabling any
property email; unresolved legal language goes through the architect gate.

Full hosted suite, then real read-only 1366/400/412 proof are required. C and B
need separate verified-live reports for Gabriel's #341 sign-off.
