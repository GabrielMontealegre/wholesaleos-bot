# Pipeline Buyer Context

Typed Pipeline rows now show the linked buyer's name, unconfirmed funds
status, and **Buyer criteria ceiling**. A ceiling is derived from the
existing approved buyer matcher and current reviewed-deal comps/repairs.
It is never an agreed buyer price, offer, proof of funds or net fee.

The criteria source opens in the operator's browser. Its time is labeled
**Criteria read**, the derivation time, not an invented original posting
date. Missing, unsafe, future, pending, stale, unmatched or unsigned-JV
criteria stay unknown. A higher ceiling from another buyer is not borrowed.

## Trace

Existing buyer writers store criteria/source/capture fields in
assistant-finds and explicit operator updates. Existing reviewed-deal
writers store source-backed property/comps/repair facts. No writer changed.
`pipeline-workspace` joins only the validated report's exact refs and ids,
then reuses `reviewed-deals.evaluate(record,[linkedBuyer],now)`. Per-pair
evaluation is cached within the visible page, after uncapped totals are
computed; Today summary does not calculate every report's ceiling. It adds a sourced derived
read DTO, not a new report amount or calculation rule.

`wos-pipeline-workspace` displays the name/criteria/source beside existing
reported prices. `pipeline-money` still receives only report amounts;
the ceiling does not fill its buyer_price or missing-cost inputs. No
stored report digest, review receipt, source provenance, matcher, gate,
Calendar date, readiness or business status changes.

## Proof

Pure tests check exact canonical numeric equality and source, missing
money staying unknown, wrong buyer isolation, pending/wrong-origin/future/
missing/stale/hidden criteria, synthetic-buyer exclusion and spied zero
network/clock/writes. Actual-dashboard1366/400/412 fixtures check the name,
ceiling/price/funds distinctions, source link, unknown pending value,
existing buyer opening, escaping,44px/no overflow and zero writes/external
calls. Existing assertions and core evaluator remain unchanged.

Full suite and exact-deploy read-only checks remain required before release.
No private real input read or production report submission is authorized.
