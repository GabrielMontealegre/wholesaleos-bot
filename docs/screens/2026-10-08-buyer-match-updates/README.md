# Buyer match / deal update proof (#304)

Local deal images are fictional, read-only test fixtures. They demonstrate
the actual detail card at 1366/400/412 widths, not acquired property evidence.
The matcher/update tests use a fictional BUY-0005 / WOS-FL-1012 reference pair;
only post-deploy read-only inspection can prove the actual production match.

Full suite: 134 passed, no failures or skips, 600s/file. Individual durations
are recorded in docs/test-results/issue-304.txt. Actual-document UI proves
unchecked approval and incomplete terms show an inline error without requests.
`live-buyer-reference-*` crops prove the actual BUY-0005 match on the opened
WOS-FL-1012 card at 1366/400/412. They exclude names, addresses and contacts.
Exact merge 8999b0f deployed successfully, health 200, Today v4 / buyer v6
served, 12,039 records hydrated and a saved lead card opened/closed; console
errors zero. All three live comps still reject as strict_grid_distance_not_applied.
Max/ARV stay unknown. One submitted / zero vetted today / zero eligible JV.
No production import, approval, terms save, evidence confirmation or outreach.
