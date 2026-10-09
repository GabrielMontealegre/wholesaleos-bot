# Buyer matches and deal updates (#304)

A buyer can appear when their approved, sourced geography fits, before the deal
has reviewed value. That is not approval to introduce them, contact anyone or
make an offer. Missing ceilings and spreads remain missing. A 60-70% rule uses
60% of the low ARV bound, less recorded repairs. Other explicit ceilings also
apply; the lowest is used. Ordinary notes are visible checks, not blanket vetoes.
An explicit flood X requirement conflicts with explicit deal flood AE; unknown
flood information stays a check, not a fabricated match fact.

Admin import accepts kind `deal_update` with an existing unique `ref`, a source
URL, captured time and evidence text. Allowed facts: comps, latitude, longitude,
jv_split (fraction), closing_date, title_company, holder_contact and verdict_reason.
Omitted fields are preserved. Comp validation and the strict grid are unchanged.
Preview reports updates separately; commit rejects a changed record version.
Every actual update appends one activity with old/new fields and provenance.
Repeated identical updates do nothing. Changed comps clear approval/review;
coordinates, terms and other updates alone preserve review and are re-evaluated
through the unchanged grid. No status/signature/contact confirmation is inferred.

The card accepts a fee share as a percentage plus the holder's recorded note/URL.
Saving terms is explicit. It is not a signed agreement. Unchecked comp review
shows an inline error without sending an approval request.

Trace: reviewed-deals.validate/validateDealUpdate -> ingest -> reviewed_deals;
buyer-find-import preview/commit -> same admin import routes -> database write;
reviewed-deals.update terms -> same admin PATCH; history and record-activity
retain changes -> Activity/card timeline. evaluate/list -> Today/JV/matches,
synchronizeMatchReferences retains stable references on explicit existing writes.
GET never creates a reference or records an event. Card fields/search/history
read stored values, not a second matcher. No source acquisition is added.

Existing test changes: pending geographic candidates now appear while pending
deals remain ineligible for JV; import counts add zero updates to prior unchanged
new/duplicate/rejected/approval expectations. No safety assertion is removed.
New tests cover conservative ranges, note checks, actual conflicts, missing facts,
pending/unapproved/AI buyer guards, invalid references/fields/origins/dates,
concurrency, stale updates, idempotence, comp-review reset and pure evaluation.
Actual-document UI proves unchecked approval and incomplete terms make no write.
