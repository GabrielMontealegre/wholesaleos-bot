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
