# Pipeline -- 395, Slice 1: Pending Report Contract

This is the backend foundation, not the completed Pipeline screen. No real
private file, report, approval, message or offer is submitted as verification.
Continue with producer inputs, operator review and the shared Pipeline,
Today and Calendar views in ordered slices; do not close395 for this PR.

## Writer And Reader Trace

`buyer-find-import.validateAgentItems` and `prepareImport` accept the new
pipeline_item through pipeline-reports.validate. ingestMixed calls its
immutable upsert. Existing signed POST assistant/finds owns scope,50-item/
byte/rate caps, strict current DB read and one atomic commit. Its permission,
response, error redaction and incoming-reply notification behavior do not
change. Existing dashboard preview/commit also revalidate the same contract;
bulk buyer approval cannot approve a pipeline report.

Only pipeline_reports receives new append-only revision rows; the activity
ledger receives a fixed document_added imported-report receipt with refs,
never a message/reply/offer-sent event or private report text. Leads, buyers,
reviewed deals, conversations and their facts/gates are not modified.

conversation-routes registers the admin no-store GET pipeline-workspace.
The pure projection validates stored rows and exact live ref membership on
each read, retains the latest valid revision, excludes conflicting/forged/
unlinked reports with coverage counts, and keeps all original stored rows.
No source/mailbox/listing fetch or read-time write occurs. Unsigned JV
address, report free text and source links stay withheld by the existing
signed-evidence gate; a pending report cannot unlock them.

The legacy saved-lead Pipeline routes/renderers are untouched. This slice
does not add a parallel UI renderer or claim the existing Pipeline uses it.
No CLI file support is silently added; that is the next bounded producer
slice on top of396. Existing four input-file contracts remain unchanged.

## Contract

Required: kind pipeline_item; stable opaque report_id; record_ref to exactly
one known lead/deal; fixed waiting_on/reason_code; next_step; https source_url;
evidence_text; captured_at. A buyer_ref, if present, must identify exactly
one buyer. An optional conversation_id must already link those same refs.
No guessing by name, free text or nearest address.

Groups: proof_of_funds, seller_agent, buyer, gabriel, no_reply, closed.
Reasons are fixed per-group exported lists. Every accepted latest report
belongs to one group. Closed rows retain the explicit reported reason, but
do not mutate the underlying deal/conversation or erase earlier reports.

Proof-of-funds requests require buyer_ref and a past asked_at; they remain
unverified reports. Other open groups require a strict YYYY-MM-DD next_date.
No-reply reports require a past offer_sent_at and explicit followup_count0-2.
The injected operator time zone derives review dates at2 and5 calendar days
from that report. After the second reported follow-up, propose review of
closure at the5-day date; never automatically close or send. A caller's
conflicting next_date for this derived schedule is rejected, not ignored.
Missing/future/ambiguous dates are rejected with a fixed reason.

All accepted revisions are review_status pending, reported true/verified
false. Client-supplied approval/funds_verified/source_kind fields refuse.
Same revision duplicates quietly; same timestamp conflicts, older updates
and identity-changing revisions refuse. The report is workflow intelligence,
not source proof of property facts, funds, outreach or closing.

## Potential Money

Amounts are explicit low/high numeric ranges for contract price, buyer
price, total costs, last offer, seller price and walk-away. Each supplied
field inherits that report's source URL, evidence text and captured date;
it is labeled reported, never independently verified.

pipeline-money.calculate is pure with injected per-state/path policies.
Potential net fee = buyer price - contract price - total costs. Interval
bounds use low buyer/high contract/high costs, and conversely for the upper
bound. Losses remain negative; absent inputs remain null, not0. Costs may
be a reported total or an explicitly labeled injected range. No policy is
installed in production, no malformed assignment default is inferred, no
1-2% rate is quietly invented and no Gabriel deposit/DD amount is calculated.
Our net share is shown only if our_share is explicitly supplied. Price
range provenance and estimate basis travel with the result. Every result
says Potential, no confirmed buyer; this slice has no funds-verification
contract. It does not calculate ARV, MAO, an offer or a readiness gate.

## Tests And Remaining Work

New pipeline-reports unit: fixed group accounting; normalized roundtrip;
forged status/funds/origin, date and range negatives; missing/ambiguous/
wrong refs; stale/conflicting/identity-changing revisions; preserved closed
history; unsigned privacy;2/5-day review-only schedule; same importer preview/
commit with bulk approval still pending; missing/loss/split/estimate math.
Network/http/https, filesystem writes and the real clock are denied/count0.

New pipeline-report-routes uses synthetic loopback HTTP only. Existing
pairing/signature authority,401/write-only/50-item caps, atomic mixed failure,
duplicate history, pending output, response privacy, no incoming notification,
admin GET/no-store/x-user-id401/generic503 and zero read writes are verified.
One initial new-test variable declaration was corrected; no existing test
assertion changes. Full suite600s/file and the normal read-only release gate
are required. UI and producer acceptance remain pending subsequent slices.
