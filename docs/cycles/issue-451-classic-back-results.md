# Issue451: Classic Back to Results - Local Candidate Only

Current live/main remains verified rollback449 ca483e7. This branch starts from
that main and preserves proof-only ccdd997 as9a68e05. No PR,full-suite green,
merge,deployment or live fix is claimed. Count repair450 remains BLOCKED.

## Writer / Reader Trace

- openReviewedDeal writes filters.record_id/hidden,active,matchFocus and the
  requestVersion/loading guards,then calls existing navigate/render/load.
- load captures requestVersion and ignores obsolete success/failure/finally.
  Its loading guard prevents duplicate requests;API data feeds markup/card.
- The actual reviewed-deal-routes registrar maps record_id to recordId and
  hidden to includeHidden. reviewed-deals.list genuinely returns only that
  requested record;data therefore changes from the list to a one-record DTO.
- Prior Back cleared record_id/active and restored hidden,but did not invalidate
  the pending record read or clear loading. Rendering scheduled a list load
  which could be skipped by loading=true. The late single-record result could
  then become the result list. Match focus could also remain pending.
- Candidate Back uses the existing version-ticket pattern:increment ticket,
  reset loading/data/matchFocus,then preserve the original filter restoration
  and navigation. The old response is ignored and exactly one fresh list read
  starts immediately with the existing load/paint pattern,so a pending list
  says Loading instead of flashing a false empty state. No route/schema/record/
  writer/auth/CSP/shell change or new CSS.
- Classic asset version15->16 prevents keeping the old event handler. Native
  Email/assets/default-OFF transport,record links,location storage and backend
  acquisition/value logic are untouched.

## Reproduction / Fixture Fidelity

Completed-response Back and an initially delayed-response scenario passed on
unchanged product using createFixtureApp's legacy raw-query-spread route. Trace
found that fixture ignored record_id and hidden because list expects camelCase
recordId/includeHidden. It always returned the whole list,masking this race.
No assertion was weakened and no product fix was made on those false positives.

The helper now offers opt-in actualDealRoutes:true,registering the REAL production
route over the synthetic in-memory store. The existing fixture-wide non-GET405
guard remains ahead of those routes and writeDB throws. Default fixtures and
their assertions remain unchanged;the new regression selects the real registrar.

With that real route the delayed record response reproduced failure on untouched
ca483e7:classic-deal-back-ui.test.js timed out waiting for the original two-card
list after Back. Response bodies finish and two paint frames settle before the
assertion,so an early cached list cannot falsely pass. This reproduces a real
return-to-list failure,not necessarily every detail of the live observation.

One minimal product fix then passes1366x768/400x915/412x915:normal Back,Back before
record response completion,obsolete record refusal,price/hidden filter retention,
exactly one list read per Back and zero writes/external requests/console errors.
No unrelated navigate call masks the return. Synthetic store unchanged.

## Remaining Gates

Run focused existing pipeline/navigation regressions,then final-head full600s/
file suite,self-review,one PR/mergecommit only green,exact autoDeployment and
approved435 mixed read-only proof. Actual signed Open deal->Back must return
to the prior list before marking451 done. No real captures/batches/drafts/sends,
settings/credentials changes or native Deals rebuild. At this run's quota
reserve,keep local preparation and do not start a release without rollback room.

2026-10-26 local checkpoint:final three-size Back test passes (two fixtures
before/after,eight bounded list/record reads per size),existing pipeline UI and
actual Home/Deals/Email/exact-record/locked/nonadmin navigation tests pass. No
original assertions changed. Primary79%;preserve the remaining release/rollback
reserve. No full-suite rerun,PR,merge or deployment started for this candidate.
Live remains verified449;450 still has no architectural answer.

2026-10-26 release preparation after normal quota reset:bounded proof compares
the exact ca483e7 classic HTML/module with this candidate using the actual route
registrar and synthetic store. A deliberately delayed record response leaves
one card after Back on the baseline and correctly restores two on the candidate
at1366/400/412. Candidate FCP373.7/71.3/72.6ms;Lighthouse13.5.0 accessibility
98/98. Journey has zero writes/external requests/console errors. All metrics and
screenshots are SYNTHETIC,not live performance or private deal captures.
Proof:docs/screens/2026-10-26-classic-back. Same signed Chrome and Railway source
verification preflight are available;final-head full gate/live acceptance remain.

Pre-merge self-review strengthened the delayed-list case:hold both the obsolete
record and the returning list,require Loading deals throughout the old response,
then release the list and assert two results. Explicit load/paint after Back
uses the existing updateLocation pattern;the scheduled load sees loading=true
and cannot duplicate the GET. No assertion is removed or weakened.
