# JV stage data foundation

This is the data foundation for the next JV workspace, not a finished workspace
or email sender. Nothing sends a message, signs an agreement, or moves a real
deal simply because a page opens. Issue #307 remains open.

## Recorded stages

Found -> Holder interested -> Buyer teaser -> Buyer interested -> JV signed ->
Full package -> Earnest money at title -> Assigned -> Closed. Dead is a terminal
alternative and requires a reason. Every change is an explicit admin report with
the actual action time, source URL, evidence text, recording time and operator.
History is append-only. Old statuses/history remain unchanged and are returned
separately; availability is not silently converted into agreement to a JV.

Holder terms reuse the audited update-by-reference path. Contract price,
holder fee and earnest money join the existing split, closing date and title
company. These are reported terms, never inferred payoff or debt. The holder
interest event records the reported terms alongside its source/evidence.

## Sharing safeguards

The blind teaser uses a fixed whitelist: reference, state/ZIP, numeric property
facts, asking price, reviewed value band/tier and comp count, closing date.
It has no holder details, street address, source link, free-text notes or comp
addresses. Condition currently shows not recorded; no condition is invented.
Both projections require a currently matched approved buyer. A teaser is
`sent: false`; viewing it does not report a send.

The full-package projection additionally requires that same interested buyer,
a raw unambiguous signing date, contract/agreement URLs, and explicit signed
contract-copy, owner/signature/assignment and JV protections checks. The 24-month
protection and title-only fee/disbursement requirements are recorded operator
checks, not a legal opinion. A bare signed timestamp or stage label cannot unlock
this projection. A change to recorded holder terms invalidates the signature's
terms fingerprint without deleting the signing history. Re-review/amendment UI
is a later workspace control; do not pretend a changed agreement is current.

Current approval, reviewed value, matched buyer and expiration are recomputed;
the unchanged comp grid is authoritative. Package preview does not send anything.
Expired deals cannot be advanced as active opportunities. Explicit dead/closing
reports may record their real history; a close still needs the signing evidence.

## API contract

- Existing admin GET `/api/dashboard/todays-deals` returns `jv_workflow` for JV
  records, with stage labels, append-only events, legacy status and evidence gates.
- Admin POST `/api/dashboard/todays-deals/:id/jv-stage` accepts the bounded
  explicit report, never client provenance or arbitrary stage jumps.
- Admin GET `/api/dashboard/todays-deals/:id/buyer-teaser?buyer_id=...` is read-only.
- Admin GET `/api/dashboard/todays-deals/:id/full-package?buyer_id=...` is read-only
  and refuses missing/changed signature evidence or a different buyer.

The existing legacy status route is preserved for compatibility. It cannot
produce the new full-package projection. The old `introduction_allowed` label
is not the new package authorization and must not be used by the upcoming Send
slice as a replacement for this service's checks.

## Delivery gates

Positive and negative tests exercise all nine stages, real route guards,
missing/ambiguous/future dates, wrong origins, skipped/stale steps, private-data
exclusion, changed terms, mismatched buyers, immutable failures, closed/dead
suppression and JSON round-trip persistence. Pure functions use an injected
clock; no network or writes. Existing assertions remain unchanged.

No UI changes in this foundation. The next #307 slice supplies workspace actions
and correction controls; #325 supplies the approved dark design. Email
templates/approvals and triage follow before #325; Send belongs to #288.
No live action report, evidence confirmation, batch, source access or message
send is part of release verification.
