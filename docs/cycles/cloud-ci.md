# Cloud test gate

The Full test suite workflow runs on every pull request and every push to main.
It uses a GitHub-hosted Windows2022 runner, Node20 and the repository's existing
PowerShell test runner,600seconds per file. Playwright1.44.0 installs its own
Chromium explicitly; the permissive product postinstall is not used as evidence
that a browser installed. No production secrets or write-capable token.

Every test result/duration and explicit environment skip stays in a14-day
artifact. Failures stay failures; no summary is also a failure. No assertion,
product gate or dependency version changed. There is no lockfile, so this first
workflow honestly uses npm install without lifecycle scripts, not npm ci.
A reviewed lockfile is a reproducibility follow-up, not an implicit upgrade.

Cloud execution must pass on the actual PR head before merge. Main gets its own
post-merge run. CI does not automatically change Railway's deployment settings
or GitHub branch protection. No batch or production data verification is run.

First hosted run39016329965:191passed/2failed/0skipped of193. All product
assertions passed. One temp cleanup failed ENOTEMPTY after its15 checks;
bounded fs.rmSync retries cover the Windows filesystem race. Node-missing
fixture now reapplies its explicit environment inside child PowerShell because
startup may restore standard install paths. Existing assertions unchanged.
Initial report retained;next full hosted run is still required,not waived.

Second hosted run39016991114:192passed/1failed/0skipped of193. Node runtime
isolation passed. The remaining cleanup failure persisted because synchronous
removal retries block the event loop while destroyed streams still need close
callbacks. The async test now awaits fs.promises.rm with the same bounded
retries and workspace guard. Assertions and product code remain unchanged.

Final run 39017755016 on 6a5a73d: SUMMARY passed=193 failed=0 skipped=0 total=193.
Every duration is retained in cloud-ci-final.txt. Merged as b2a1f6f in PR #371.
Deployment 7137172001 succeeded at 2026-10-17T08:42:30Z; health 200.
Authenticated live checks at 1366x768 and 412x915 loaded 100 lead rows, opened
and closed the real lead drawer, and reported zero console errors. Safe Today
screenshots are under docs/screens/2026-10-17-cloud-ci/. No production writes.
The subsequent Sentry merge superseded the first main run by concurrency policy;
the newest main run, not the cancelled older run, is the post-merge gate.
