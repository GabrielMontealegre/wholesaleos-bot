Item: #366 C - buyer workspace and explicit single-email teasers

Published phone/email, areas, criteria chips and source-reported buyer types now
sit under the name. Buyer details use Buy box / Matching deals / Messages sections.
The match badge opens the actual existing match projection. Canonical blind
teasers for selected shareable deals are previewed as ONE message, then saved
and sent only by separate, reviewed operator actions. No generic/bulk send route
is enabled. The old Email module's selector collided with the new checkbox;
the real dashboard test caught it and buyer controls now have a distinct namespace.

Writer/reader trace: buyer_type/source - assistant validator/ingest and admin
update -> stored assistant_find -> listFinds -> card/filter; operator overrides
survive repeat imports and never change classification or approval. Reference
dedupe rejects identity conflicts. buyer_find_last_import_at - actual ingest
only -> listFinds -> honest last-import display, unknown for old stores. Signed
kind:buyer/kind:deal feed inputs reuse existing validators/pending writers.
deal-fit-view still calls reviewed-deals.evaluate; teaser_ready calls the
unchanged jv-workflow.teaser. Full trace in docs/cycles/issue-366-c-trace.md.

Email trace: admin preview derives recipient/body/version from stored records;
draft appends buyer_email_drafts and per-record activity; Send binds the same
operator/version with a five-minute expiry, reevaluates gates, persists sending
before SMTP and records explicit review. Actual acceptance creates the existing
template-policy receipt and buyer/deal activities, not contact status or a JV
transition. Duplicate accepted draft ids do not send twice. Uncertain attempts
remain non-retryable by id. Existing declared nodemailer/Gmail settings only;
TLS required, no attachments/HTML/server listing fetch, debug/logging off.

Tests added: buyer-workspace.test.js covers typed provenance/overrides, duplicate
references/import preservation, real positive and expired/forged/missing/private
teaser paths, purity, preview/draft ownership/version/expiry/review, receipt
policy, duplicate and uncertain send, no implicit SMTP and transport safety.
buyer-workspace-ui.test.js exercises actual dashboard1366/400/412 using synthetic
GET fixtures and fake local POST replies: contacts/type filter, match sections,
two-deal one-message preview, review checkbox, draft then explicit Send.
api-session-gate adds unauthenticated/agent-token/non-admin401/403 for all new
actions. Prior assertions are unchanged. Six impacted existing suites pass.

Existing assertions changed: tests/clean-buyer-cards.test.js:23 formerly required
email/phone absence on compact cards; #366C explicitly requires their presence.
The two contact checks now assert presence; subject/ref/admin-control absence,
JV-address privacy and every matching/provenance assertion remain unchanged.
scripts/verify-clean-buyer-cards.js:11-14 now clicks Matching deals after opening
Buy box; scripts/verify-record-activity-ui.js:48 clicks Messages before Activity.
Those retain every old visibility/navigation/timeline/no-write assertion.
New browser proof caught the selector collision; no force clicks or weaker gates.

Decisions used: D-046, D-050, D-043, D-005, D-011, D-056; ASSUMED entry logged.

Risks / follow-ups: old legacy generic and Email reply sending remain disabled;
this enables only the buyer workspace's narrow explicit-send path. Drafts are
local WholesaleOS records, not Gmail drafts. SMTP acceptance is not delivery;
unknown/crashed attempts require checking Sent, never an automatic retry.
The existing ten-row match projection cap remains. Assistant export files are
absent locally; no production feed import was authorized as verification, so
the reported59-versus81 feed gap is NOT claimed resolved by a live sync.
No new dependency, credentials, variables, readiness/comp/approval gates or
business-data migration. County ranking stays paused.

First complete hosted run39076265482:196 passed/3 failed/0 skipped,199 total,
11m57s job; new buyer UI4.27s, unit0.25s, acquisition273.00s. Failures were
the explicitly replaced compact-contact absence expectation and two old
long-scroll proof paths. Focused corrected proofs pass: unit0.54s, card
navigation10.29s, timeline18.11s. Initial report is retained, not waived.
Earlier runs39075900603/39076006582 were cancelled on newer revisions, not green.
Self-review also narrowed asynchronous history refresh to its own email panel:
it cannot erase a selected deal or collapse the separate Activity timeline.
Explicit review is preserved across reads, reset after draft save, and must be
ticked again before Send. Delayed-read browser and timeline proofs pass.
Full final hosted suite: pending; merge only when every file is green,600s/file.
Verification after deploy: pending exact deployment + read-only1366/400/412
click-through. No preview POST, draft, send, import, approval or other production
write will be used as proof. Synthetic SMTP clients prove send behavior locally.

Screenshots (synthetic records, no private contacts):
![Buyer list](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-c-buyer-workspace/docs/screens/2026-10-17-366-c/synthetic-list-1366.png)
![Android buyer](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-c-buyer-workspace/docs/screens/2026-10-17-366-c/synthetic-buyer-412.png)

Carries the already-released G proof checkpoint, avoiding a docs-only deploy.
Does not close all of #366 or presume Gabriel's #341 sign-off.
