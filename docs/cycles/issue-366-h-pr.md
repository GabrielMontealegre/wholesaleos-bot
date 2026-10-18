Item: #366 H - compact JV primary filters and More filters

JV keeps the shared State/County/City cascade plus Stage and Search in the
primary area. Existing price/bedroom/kind/verdict/hidden controls move intact
under More filters, initially closed, with an active-filter count. The outer
phone Filters collapse and Today layout stay unchanged. Search preserves focus
across responses; new queries invalidate older responses. No deal fact changes.

Writer/reader trace: existing JV workflow evidence -> unchanged jv.view ->
reviewed-deals.list rows. New pure jv-list-filter reads current stage and permitted
card text only, before the100-row cap; counters reflect the filtered pool.
Unsigned subject addresses are not searchable. Existing admin GET bounds stage
to40/search to160 chars and supplies the canonical stage labels. Eligibility,
comp evaluation, signature gates and all writers are unchanged.
Existing geography component/storage/cascade and advanced filters/handlers are
moved, not rewritten. wos-jv-list-tools owns only transient stage/search/expansion
state, contributes query params only on JV, and clears it at signout.

Tests: new pure unit/spy and actual-dashboard1366/400/412 proof: exact stage,
literal search/case/missing/unknown, unsigned versus signed address privacy,
150-row before-cap count, unchanged Today, zero network/clock/writes, primary
controls, collapsed/active More, repaint persistence, typing focus, no-result
and restore. Existing filter-hygiene/shared-location/reviewed-deal proofs pass.
Existing assertions changed:none. Four driver clicks now select the direct
outer .td-filter-bar>summary instead of a descendant summary, because the
requested nested More filters adds a second summary. Files:
scripts/verify-filter-hygiene.js:47/49 and
scripts/verify-shared-location-filters.js:60/66. Every assertion is unchanged.

ASSUMED logged: secondary filters remain available/active, hidden is not reset,
and search never becomes a side channel for unsigned JV street addresses.
No new dependency, source, provider, paid call, credential or business write.
Self-review: read-list predicate only; no evaluator/writer/contract/auth change.
Full207-file hosted suite pending,600s/file; exact deploy and read-only live
1366/400/412 proof required before DONE. No production action as a test.

Carries E release proof without a docs-only deploy. I is BLOCKED#383 at the
unsafe legacy contract/profile boundary; no I product code was written.
C feed still BLOCKED#379; B ready for inspection, no#341 sign-off inferred.
Next independent J after H, then remaining owner order when unblocked.

![Desktop](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-h-jv-filters/docs/screens/2026-10-18-366-h/synthetic-jv-1366.png)
![Phone](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-h-jv-filters/docs/screens/2026-10-18-366-h/synthetic-jv-400.png)
![Android](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-h-jv-filters/docs/screens/2026-10-18-366-h/synthetic-jv-412.png)
