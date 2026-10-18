Item: #366 E - short review briefs and a reversible Skip on Approvals cards

Each pending card now has a three-part brief before the source details.
Buyers show areas, reported buy box and the honest source/purchase-proof limit.
Deals show canonical asking/value tier, buyer ceiling/count and split-adjusted
estimated share. Unknown stays unknown; claimed values are never a fallback.
Skip for now hides only that unchanged card in this session, with Show skipped;
it is not a rejection or saved decision. Approve still requires source review.

Writer/reader trace: assistant-finds.validateItems/ingest and explicit operator
updates already persist areas, buy_box, platform, source/post URL and capture
time. reviewed-deals.validate/update/evaluate already owns asking, accepted
comps/value tier, canonical matches/max_price and estimated_spread.low after
the JV split. approval-workspace.pendingRecords/build supplies the exact pending
set, current version hash and evaluation; decide and POST are unchanged.
wos-approvals.brief reads those existing DTO fields only. Client skipped Set
keys group/id/version, is not persisted and is cleared at signout; changed rows
reappear. Source data and counts remain untouched. No server/ingestion/auth/
value/matcher/JV/readiness/approval backend changed.

Tests added: approval-card-brief unit and actual-dashboard1366x768/400x915/
412x915 proof. Covers pending unknown value versus verified/preliminary/Texas
list-price labels, wider-area caution, no claimed-value/gross-spread fallback,
real zero/missing math, no invented purchase proof from approval/type,
escaping/wrong-origin links, session-only skip/show, stale version reopening,
mandatory source review, unchanged pending data, phone reachability/auth clearing
and zero writes/external requests. Existing approval-workspace unit and full
browser safety suite pass unchanged, including stale409, forged/missing/terminal
guards and explicit synthetic approvals/rejections retaining rows.

Existing assertions changed: none.
Decisions: D-056,D-005,D-011,AGENTS3/5; ASSUMED Skip is view-only, never reject,
and purchase proof absent from this schema is stated absent, not inferred.

Self-review: no new fields/writers/dependency/credentials; no consent is checked
automatically. Canonical record versions still gate the same POST. Hidden cards
remain counted pending; Show skipped restores them for a fresh explicit review.
Failed/auth-lost requests still clear private data. Unknown ranges cannot look
verified; list-price/wider-area labels remain visible and no offer is generated.

Full205-file hosted suite pending,600s/file. No merge until green. Exact deploy
and live read-only1366/400/412 proof follow; no approval/rejection/business write.
Skip/show are local display controls only. No source site is fetched by the server.

Carries B's release proof/timings to avoid a docs-only deploy. C feed still
BLOCKED#379; no complete#341 sign-off. Next I,then H,J per owner order.
Known unrelated generic hover tooltip and post-viewport-reset More behavior are
not claimed fixed by this card-only change.

![Desktop synthetic](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-e-approval-brief/docs/screens/2026-10-18-366-e/synthetic-approvals-1366.png)
![Phone synthetic](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-e-approval-brief/docs/screens/2026-10-18-366-e/synthetic-approvals-400.png)
![Android synthetic](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-e-approval-brief/docs/screens/2026-10-18-366-e/synthetic-approvals-412.png)
