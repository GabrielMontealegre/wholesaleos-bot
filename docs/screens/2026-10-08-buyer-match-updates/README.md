# Buyer match / deal update proof (#304)

Local deal images are fictional, read-only test fixtures. They demonstrate
the actual detail card at 1366/400/412 widths, not acquired property evidence.
The matcher/update tests use a fictional BUY-0005 / WOS-FL-1012 reference pair;
only post-deploy read-only inspection can prove the actual production match.

Full suite: 134 passed, no failures or skips, 600s/file. Individual durations
are recorded in docs/test-results/issue-304.txt. Actual-document UI proves
unchecked approval and incomplete terms show an inline error without requests.
Privacy-safe live crops and the actual match result are added after deployment.
