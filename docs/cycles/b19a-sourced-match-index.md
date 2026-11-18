# B-19a Pure Sourced-Report Match Index

Base44569d6. B23 code and B24a OFF core are released; source promotion/provider
activation and B07/B21 live imports remain blocked. Issue530 has no answer at
the last metadata check. This independent B19 slice does not use source rows,
paid data, private production content, storage writes or outreach.

## Trace And Trust

Existing assistant-finds.validateItems/ingest/update writers own reported buyer
criteria and source/capture/approval history. Existing reviewed-deals.validate,
ingest/update own sourced deal facts, comp reviews and exclusions. Canonical
store users own operator identities; record-activity owns existing references.
The new sourced-match-index.build reads those saved JSON collections only;
revalidates original input fields through the existing validators; keeps central
buyer eligibility and buyer-fit; delegates comp/value/flood/numeric checks to
reviewed-deals.evaluate. No existing reader/writer or public API is redirected.

The caller must supply trusted backend JSON, not untrusted HTTP JSON. This pure
module does not authenticate a user, receipt or self-asserted approval. Missing
canonical collections fail closed, not as a known empty dataset. Duplicate IDs
or references, unknown approval actors, future/conflicting approval history,
inherited approval, pending/unknown classifications, source/name mismatch,
missing type/geography and stale capture do not create a candidate. Test/synthetic
buyer exclusion remains central; no fixture bypass flag is added.

Criteria retain source_kind:assistant_report, source URL, capture, source text
and exact buyer reference. That is an operator-approved report, not a verified
purchase or proof that every claimed fact is independently true. Capture time
is labeled capture, never a post date. A conservative fixed90-day report-capture
window applies; reapproval does not refresh source evidence. No purchase-history
window is invented: deed_purchases and signups coverage say not_integrated until
their actual canonical evidence adapters are connected in later B19 slices.

## Matching And Value

Every known deal is compared with every eligible saved buyer. Houses and land
use existing type normalization and known state/area/ZIP checks. The full recorded
price range is strict: mismatches or a required unknown asking price do not match;
an auction starting bid is never substituted for asking. Existing numeric/ARV/
flood restrictions remain delegated to the existing evaluator. Existing negotiable
above-ceiling candidate behavior elsewhere is not changed.

Per-deal buyers sort by explicit criterion count, then capture, then stable ID;
per-buyer deals sort by stable ID. This is deterministic ordering, not a fabricated
fitness percentage. No raw score is exposed. All results are retained without a
silent top-N cap. Every criterion carries report provenance; matches keep pending
checks and never grant contact, introduction, offer, JV or Send permission.

Value labels come only from current strict reviewed comps using a known review
actor/date and retained operator comp exclusions. Three eligible comps -> Verified
value; two -> Preliminary value; one/no comps -> Value not verified. Claimed ARV,
raw tier flags, assessed/list/auction values and unknown land estimates do not
create a value. No new ARV/MAO amount or readiness flag is emitted.

## Verification And Remaining Work

New synthetic sourced-match-index test covers paired house/land results in both
directions, criterion provenance, invalid/missing/inherited/forged/stale/future/
conflicting evidence, test buyers, duplicate IDs, area/type/price mismatches,
bid-not-asking, malformed clock/store, forged value/review, 3/2/1 strict comp tiers,
immutability/determinism and no clock/network/filesystem write. A50-deal/50-buyer
batch retains all1250 expected pairs. Existing reviewed-deals, buyer-strategy-profile
and match-profit focused tests PASS. No existing assertion changed.

Hosted exact-head full suite, automatic deployment and bounded public/static +
counts401 checks remain required. This slice adds no UI or runtime callsite;
actual existing-store wiring needs its own auth/private-body boundary tests.
Later slices must connect canonical deed/sign-up evidence with real provenance
and stated purchase-recency windows, then replace the old client score and build
both matching views. B19 remains TODO, not code/operational DONE.
