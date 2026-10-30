# Native Report Labels: Synthetic Candidate Proof

Not a release. Production remains verified397/c972d440. Final audited runtime
is a4a175b on item/412-report-label-receipts. Later documentation-only commits
must keep its dashboard/runtime/tests identical; fresh full289 PR/main gates,
current-head self-review, exact automatic deployment and approved public/signed
structural checks are still required. Whole412/design approval and455 remain open.

## Final Exact-Source Result

`final-audit/proof.json`: true1366x768/400x915/412x915 native Email Reports.
Synthetic source uses the real provider-label helper to produce an IMAP
per-message name receipt. The actual Reports tab is selected, one source-backed
row is visible, selected tab fits, no page overflow/runtime errors/external or
non-GET requests. FCP160.6/116.8/131.8ms, below2s.

Official Lighthouse13.5 performance99/96 and accessibility100/100 at1366/412;
null runtime error and empty audit-error arrays. Measurement-phase scope is
captured by the required official Accessibility gatherer, delegated unchanged.
No storage reset/layout freeze/category or threshold suppression. Numerical
results are synthetic, not live timing or evidence of private report content.

All three final audit images and all15 five-viewport native UI list/report/
composer views were inspected. Native checks include original44px rail/full
composer/search/source/draft/context/no-writer assertions plus selected report
tab geometry, no invented person role and no extra metadata request.

## Retained History

`initial-audit` retains the actual c972 baseline and first cba26a3 candidate.
Baseline FCP81.1/56/54.7ms, performance99/96/accessibility98. Initial candidate
63.8/57.7/64.4ms,99/96/accessibility100 numerically passed, but visual review
found the selected phone Reports tab clipped in the existing tab strip. Not a
positive final visual gate. A new geometry assertion FIRST failed, then the
Email-only existing selection handler scrolls its selected tab into view.
Final a4a175b was freshly audited; baseline was retained, not rerun/substituted.

The new pure receipt test FIRST failed0!=1 against the genuine-shaped receipt,
then passed the scoped model correction. Existing report fixture scaffolding
now uses producer receipts; no existing safety assertion was weakened/deleted.
Opaque REST IDs, raw labels, names guessed from subjects/senders, malformed/
wrong-scope/inherited/accessor receipts, conflicting copies and mixed threads
do not establish Reports membership or role/count/sharing authority.

External strict public source/entry guard adds --report-labels for model4 and
Email16, retaining all prior security/44px/current-asset guards. Its synthetic
test includes EOL-only equivalence and six meaningful negatives. Initial guard
bootstrap attempts lacked the existing secondary dotenv path and then CLI args;
both failed before any network/production action and were repaired in the local
harness. No dependency/lock changes or production private captures/values used.
