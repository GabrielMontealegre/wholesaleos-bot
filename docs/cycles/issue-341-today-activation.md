# Today activation - D-056

## Proven staging prerequisite

PR #353 main b31b8ff68962bdddfb74573ac4c356803ee68b12 deployed successfully
as 7049150037, 20:20:49 to 20:21:45 UTC (56 seconds). Exact deployment success,
health200, dashboard200 and served false flag were checked before activation.
Authenticated read-only clicks opened/closed a source lead;100 hydrated rows,
33 navigation entries, no new console errors. Today was correctly absent.
This does not establish the cause of the original #345 deployment failure.

## Trace and bounded change

The immutable wos-feature-flags.js writer enables the already-staged home
renderer; wos-today-workspace.js reads only strict boolean true. The flag and
Today CSS cache keys are bumped. Backend projection, grades, canonical values,
auth, record writers and source routing are unchanged from #353.

Local normal-click testing exposed an integration defect: Tabler's scoped
`:host, :scope { height:100% }` constrained the Today section to its parent's
height. Long last24h content overflowed the root and intercepted the following
Conversation tools disclosure. The first grid-layout correction did not fix
it and was removed. The second correction is an ID-scoped height:auto override
on Today only. No forced clicks, clipped activity or weakened assertion.

The regression proof checks root containment plus elementFromPoint at the
disclosure center, then performs a normal click. It passed all ten legacy
screens at360/393/400/412/1366/1920 with no writes/external requests/errors.
One diagnostic run then timed out during a different click; the cleaned
normal-click run passed. Diagnostic logging was removed, not retained as tests.

## Existing assertion adaptations

- verify-marketplace-ui: home now waits for Today action items, not a legacy
  deal-card stack; opens the retained conversation disclosure and asserts
  Today first. Existing email/privacy/consent checks remain.
- verify-conversation-cards: explicitly opens Conversation tools on home.
- verify-record-activity-ui: registers the actual pure Today read route on its
  synthetic store; deal-ref assertions navigate to Today's Deals; home roots
  are Today then the source desk. The fixture remains read-only.
- verify-reviewed-deal-clock: navigates to Today's Deals before the unchanged
  clock assertions.
- dashboard-deal-mount-order: home has one Today root before the source desk;
  Deal Finder retains its separate evidence panel.
- owner-brief-card-link: malformed ref retains Today and opens no deal.
- today-rollout-flag: compiled flag true only after the verified staging
  prerequisite; missing/false/string/number flags still cause zero DOM/network
  work. Freeze and logout-race assertions remain unchanged.

## Release gate

Final full suite600s/file: SUMMARY passed=181 failed=0 skipped=0 total=181.
All durations: docs/test-results/issue-341-today-activation-final.txt.
Today UI28.15s; mount14.82s; phone shell21.90s; canonical unit0.34s;
unchanged capture fixtures374.83s/492.51s; county notice13.17s.
Previous partial activation log was interrupted after a known focused failure,
not counted as a suite result. No production write or prohibited action.
After green: self-review, draft PR, ready, merge commit, exact deploy success,
health/dashboard200 and normal authenticated Today/Approvals/lead clicks.
Parent #341 and non-P0 pause remain until all slices and Gabriel sign-off.
