# Profile Release Checkpoint -- Not Released

2026-10-19. Draft PR394. Tested head:
`f5559cd9577570453a8438645b72c64c446a2a98`.
Base main: `aba84a38e157f6824ea66fdd2875ab4e78e0aca9`.

Final hosted run39327033588, job118315431364: success,11m57s,
600s per file,659.27s summed test durations.
`SUMMARY passed=218 failed=0 skipped=0 total=218`.
Profile UI5.47s, unit/route0.22s; Calendar8.84s; unchanged
county-notice acquisition249.09s. Full per-file report in
`docs/test-results/issue-383-final/full-suite.txt`.

Initial run39325431056 retained in issue-383-initial:217/1/0,
8m52s. Calendar driver's immediate count after Escape raced the
asynchronous native close/removal event. Added <=3s detached waits,
keeping every zero-node assertion and all X/Escape/flag-disabled checks.
No Calendar product change. Existing assertion outcomes changed: none.

Synthetic actual-dashboard screenshots1366/400/412 cover Profile and
template preview. They are not live proof. No private real records used.
Self-review: current base fetched; reader/writer trace in the feature note
and PR body; no dependency/auth/comp/signature/readiness/source gate change.
Protected module diff stat vs main empty; no tests/.tmp present;
git diff --check clean. No real profile or signature saved.

## Remaining Gate

Chrome inventory works, but claiming and reading even an already-attached
dashboard tab still times out on Emulation.setFocusEmulationEnabled,
before page control. Owner's reconnect reply was 'go'; it did not restore
control. No credentials/cookies/PIN were extracted and no alternative
control transport was used. No live pass or product regression inferred.

PR394 remains DRAFT. No ready/merge/deploy. Production health200 was read
at21:12:37Z; exact producer PR391 deploy remains the prior release. Its
live UI gate is still pending too. Finish that read-only proof before
another UI release, then merge394 only when gates remain green and verify
the exact deploy read-only. Never save a real profile/generate a contract
or send a message as a verification step.

## Next Approved Slice Trace

D-060/#390 permits the read-only#372 demo, not full#366 owner sign-off.
#393 explicitly follows that demo. Existing read models to reuse:
`today-workspace` (actions, best deals, last24h, coverage),
`calendar-workspace` (recorded/due events, conversation refs and coverage),
`reviewed-deals.list/evaluate` (canonical value/matches),
`jv-workflow.view` (actual recorded stages; do not invent a generic stage).
Use exact ids/refs, not a guessed person-name join. Keep unsigned JV
address/package restrictions; show feed incomplete. No new store, provider,
profile/contract fill, import, approval, evidence confirmation or send in
the demo. No new demo code was written during this run.

This checkpoint branch retains final evidence without altering the exact
tested PR head or causing another deployment. Unrelated old-worktree files
were neither staged nor reverted.
