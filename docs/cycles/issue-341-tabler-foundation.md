# P0 Scoped UI Kit Foundation

Tabler UI core1.6.1 is pinned from its official npm distribution, whose SHA512
integrity was checked before extracting only CSS/JS assets. Its exact release
MIT license is in the vendor directory and THIRD_PARTY_NOTICES. No dependency
install, install script, optional plugin, CDN runtime or framework rewrite.

The CSSOM build script parses the distribution with the installed browser,
maps root tokens to the scoped component root, and emits native @scope(.wos-kit).
Distribution and generated hashes are in manifest.json. Outside the marked
sidebar/topbar/Approvals boundaries no kit rules apply. Existing auth/legacy
styles and route handlers remain. The distribution JavaScript is vendored for
later dropdown integration, but is not executed by this foundation.

The adapter marks existing nav links, approval cards, buttons and form controls
with actual kit component classes and mirrors only the existing light/dark
preference. Its MutationObserver listens for rendering/theme changes; it does
not fetch, store records, read credentials or trigger any action. The shared
fixed-left shell and mobile drawer remain their existing implementation.

Initial local proof exposed a phone collision from a navbar display override,
and a legacy white card background. Those were corrected before release: no
navbar layout override, explicit existing dark-card token, normal clicks still
required. No force-click or weakened assertion masks a regression.

Architect #349 now accepts buyer and deal queues including changed-comp
re-reviews. The existing deal-update writer resets review and makes those
pending again. Empty email/request sections are removed; a small factual
not-connected coverage line replaces them. Their producer work stays deferred
to #288/#335, no new approval engine or future work represented as a count.

Changed existing assertions: scripts/verify-approval-workspace.js's two empty
category clicks become a two-category count, a missing-empty-section assertion
and coverage-line assertion, explicitly authorized by #349. Review checkbox,
stale409, approve/reject, record retention, privacy and comp gates unchanged.
Added actual component class/background checks. Required1366/1920/400/412
synthetic screenshots regenerated with normal controls, no real approvals.

## Writer / Reader Trace

Existing dashboard rendering writes existing card nodes; wos-ui-kit adds only
component classes/theme attributes, scoped CSS reads them. Existing shell owns
navigation/drawer/theme; approval-workspace owns full pending counts; existing
assistant-finds and reviewed-deals own actual decisions and histories. All
backend, auth, match/comp/value/contact evaluators remain byte-identical to main.

## Today deployment evidence

The previous failed Today head changed no Dockerfile, build script or server
static route. Dockerfile COPY . . includes the new bundle. Its registration
did introduce a startup require of data/verified-ui-releases.json; that is a
concrete startup dependency in mutable storage, not a proven provider failure.
The pasted starting-container logs show successful startup, not a stack trace
or exact failed-head asset check. Their08:59 display has no timezone or
deployment id attached. If it is owner UTC-7, it matches the later15:59UTC
Approvals deployment, not the14:13UTC failed Today deployment. That association
is unverified. Do not state a missing-file cause as proven from those logs.

Per #347, restore Today with release metadata packaged outside mutable data
and a default-off UI flag; verify exact deployed /dashboard200 before enabling.
Per #344, interim grades use canonical stored evaluation only: reviewed/value/
approved-buyer/room10000/deadline3days criteria; missing facts never invent value.
That work follows this kit foundation. It is not live in this release.

## Release Status

Final suite: SUMMARY passed=177 failed=0 skipped=0 total=177,600s/file.
Approval UI15.36s,unit0.42s,pinned-kit test0.12s. Complete individual durations
are in docs/test-results/issue-341-tabler-foundation.txt. git diff --check clean.
Final formatting removes only CSSOM trailing whitespace; generated hashes and
focused integrity/browser proof rechecked afterward. New vendor-only -text
attribute preserves pinned bytes across Windows/Linux; no existing file is
normalized or reformatted.
Release/exact-head live verification pending.
PR350 color correction is already live on047eb08ecf572d8b06cb8f1394dea279e0dba6ad:
Railway7047625637 SUCCESS19:10:22UTC,63s. Current28pending=13buyers+15deals;
CSS2,actualgreen/red,reviewed0. This new foundation remains local until green.
