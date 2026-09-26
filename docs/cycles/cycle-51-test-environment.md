# Cycle 51 - Reproducible browser and test environment

Playwright is pinned to the exact version already used by this project so its
expected Chromium build cannot drift away from the browser installed with the app.
The Docker image installs that matching browser in the same build and does not
need a separate container change.

The test runner reports `SKIPPED` separately from `PASSED`. A browser or process
integration test is skipped only when the current runner cannot launch the required
Chromium build or cannot spawn a child process. Its assertions are unchanged and
run normally when that capability is available. Restore the browser on a machine
that needs it with `npx playwright install chromium`, then rerun
`./scripts/run-tests.ps1`.

Run the suite from the repository root with:

```powershell
./scripts/run-tests.ps1
```

Node does not have to be on `PATH`. The runner resolves it the same way
`scripts/Start-WholesaleOS-Helper.cmd` does: `WOS_NODE` first if it is set, then `PATH`,
then Cursor's bundled runtime, then a standard Node install. It prints the runtime it
chose on the first line. If none is found it stops and lists every location it tried.

The default per-file timeout is 600 seconds. The final line reports passed,
failed, skipped, and total counts independently.
