# Mailbox unread stripe

Owner request, 2026-10-31: remove the vertical blue line through the mailbox
list and continue building. This is independent of blocked PR483/issue485.

## Trace and scope

- Provider read/unread metadata is projected by `email-model.js` and
  `mail-layout-model.js`; those producers and consumers are unchanged.
- `email-screen.js` adds `ws-mail-row--unread` only to projected unread rows.
- `design-system.css` painted a 3px inset blue shadow on each such button.
  Adjacent unread rows therefore appeared as one continuous vertical stripe.
- Remove only that shadow. Keep bold unread senders, normal read senders,
  hover/selected backgrounds, and the shared keyboard focus outline.
- Increment the stylesheet cache version from15 to16. No API, provider,
  storage, authentication, category, label, or writer changes.

## Validation

The added synthetic regression first failed with the actual computed inset
blue shadow, then passed after removal. Fixtures explicitly include unread,
read, and unknown read states. Existing assertions remain unchanged.
The focus assertion uses real Tab/Shift+Tab navigation, not programmatic focus
after a mouse click. The initial focus-scaffolding failure is not a product bug.
Focused Email UI test passes at1366/400/412 widths, including existing reader,
draft preservation, error, session clearing, and zero-write checks.

All six synthetic before/after images inspected; no horizontal overflow.
Before FCP76/36/60ms; after60/64/44ms at1366/400/412. Staged PNGs matched
the inspected generated files byte-for-byte. The private owner image is not
copied to the repository.

First baseline Lighthouse13.5: desktop99performance/100accessibility; phone
96/100 with a bf-cache audit error. First candidate desktop87/100 failed the
required performance90 gate, with actual Primary12rows/10unread/zero stripes
observed during the unchanged required Accessibility gatherer. Phone candidate
was not reached. Both failed audit records are retained; no success/causality
claim or threshold suppression. Early audit bootstrap dependencies/source-freeze
checks and a stalled helper are harness history, not product gate passes.

Draft PR486, first CI41244445374/job124664839185 SUCCESS289/0/0 at exact
head1c77f6fcb8f1f6432b84ebd76d0a38f524eb86fa,600seconds/file.
21:37:20Z->21:50:30Z is13m10 job wall time; test-duration sum741.20s is not
wall time. All289 timing rows retained. No rerun, cancellation, or skip.
This does not erase the failed local/audit gates. Full local289-file suite ended
naturally284passed/5failed/0skipped,600seconds/file. All289 local timings are
retained; duration sum2946.53s is not wall time. Failed files:

- dashboard-deal-mount-order.test.js: mount-order readiness timeout.
- lead-geography-ui.test.js: selected options[] versus expected FL.
- pipeline-buyer-context-ui.test.js: data-today-pipeline click timeout.
- pipeline-workspace-ui.test.js: data-today-pipeline visibility timeout.
- remembered-device-ui.test.js: runtime-errors harness failure; synthetic
  credentials remained withheld.

Causes remain unknown; no failed assertion was changed or waived. No unchanged
full-suite/audit retry. The runner chose
installed Node24.20.0; focused and visual tests used bundled Node22.22.0.
Only native CSS/index/test differ from main; classic dashboard source unchanged.
Not merged or deployed. Do not rerun unchanged gates to replace failures.
Docs-only checkpoint branch item/412-mail-unread-stripe-checkpoint preserves
the complete578 CI/local timing rows and failed audit records without changing
the tested PR head1c77f6f or creating a new PR/main/CI/deployment for proof.
Test-generated exports/cycle-34-synthetic-proof/cycle-34-synthetic-proof.json
is left unstaged and untouched; it is not part of the mailbox fix.
The rollback484 remains verified; PR483 remains blocked, cause unknown.
No real message opening, private content probes, screenshots, or writes.

## Bounded mount diagnostic, 2026-10-31

Fresh origin/main and operating documents checked; issue485 remains open with
no comments. PR486 remains the only open mailbox-stripe candidate. No prior
release or production verification was repeated.

One instrumented run of dashboard-deal-mount-order.test.js used explicit bundled
Node22.22.0, pinned Playwright and the local hermetic preload. The test source,
assertions and 30-second wait deadline were unchanged. This was a diagnostic,
not a replacement full-suite gate. It failed naturally, exit1, after40.191s.
At wait entry and timeout, document.readyState was complete and #content existed,
but Today, public desk and Pipeline entry were absent. No pageerror event or
HTTP status>=400 event was observed by this instrument; the existing fixture
blocked an external stylesheet request. Neither that request nor Node version
is established as the cause. Reproduction on Node22 rules out a failure exclusive
to Node24 for this mount diagnostic, not an environment/product cause generally.

The source trace shows Today registration gated by todayActionCenter and the
public desk gated by current page. Current instrumentation did not capture
those two states, so neither predicate is established as the cause. Do not
change either guard or unrelated classic runtime to force the mailbox PR green.
The retained Lighthouse candidate report contains scores and structural scope
but no metric breakdown/trace; its87 remains a failed gate, cause unknown.
All five original local failures and both failed audits remain authoritative.
No full-suite or Lighthouse rerun, assertion change, repair, merge or deploy.

The synthetic diagnostic JSON and exact instrument source are retained beside
the prior evidence. Next bounded investigation should observe current-page and
feature-registration lifecycle at the existing failing wait, not retry scores
or enlarge timeouts. The two unrelated generated exports remain unstaged.

### Follow-up lifecycle observation

One further synthetic-only instrumented diagnostic added the previously missing
current-page and registration booleans; assertions and deadlines stayed intact.
Node22.22.0 again reached the same mount wait and failed naturally. At entry,
APP.page was leads, unlocked was true, todayActionCenter was true, both Today
and public-desk modules were registered, and the Today renderer was installed.
This is a wrong-destination observation, not evidence of missing registration.
The source public-desk mount intentionally excludes leads; the failing test
expects Dashboard mounts without asserting the destination first. The writer
or navigation lifecycle that selected leads is not yet identified. Do not
force Dashboard in the test, loosen mount gates, or attribute this to the CSS
change. Capture the selecting navigation call/stack in a future bounded
diagnostic before choosing any repair. No additional score/full-suite/CI run,
product repair, merge, deploy, or production access occurred.

### Page-writer instrument result

A separate bounded diagnostic instrument observed window.APP installation and
subsequent page assignments, forwarding the original values without selecting
a destination. Its source is retained to disclose that it replaces the page
data property with an accessor and adds asynchronous binding observations.
Those changes can affect timing; this is not an uninstrumented gate result.
The unchanged synthetic test completed all1366/400/412 assertions, exit0 in
18.467s. The initial destination remained Dashboard; captured assignment stacks
were the test's later explicit navigate calls. The unexpected initial Leads
transition did not reproduce, so its writer is STILL UNKNOWN. Do not call this
a fix, a flake finding, a passing replacement for the original full suite, or
permission to merge. No assertions/deadlines were weakened and no product
source changed. All original failures remain retained; Lighthouse87 is still
failed. No further unchanged mount diagnostic should be run to seek green.
Next work is static navigation/hydration writer analysis using these retained
stacks and source, or separately designed deterministic lifecycle instrumentation.

### Static startup-timer hazard

Source analysis found two existing classic startup fallbacks at index.html
lines27115-27137 and27433-27447. The first calls renderLeads at800/2000ms when
#content is empty; the second calls it at1000ms when content has fewer than50
characters. Neither first checks APP.unlocked or preserves the selected page.
The active renderLeads implementation at26189 assigns APP.page='leads'. Its
returned markup is discarded by those fallback callers. This supplies a concrete
possible writer for the earlier wrong-destination observation, not proof it ran
in either failed browser diagnostic.

A bounded VM diagnostic executed the source-extracted timer IIFEs unchanged
with synthetic empty/short/populated DOM states. A disclosed renderer stub
models the existing page assignment; it does not execute the actual UI. All
six cases/12 behavioral assertions matched: both fallbacks selected Leads from
locked Dashboard with empty content; only the1000ms fallback did so with a
short loading placeholder; populated content preserved Dashboard. No network,
browser, credentials or production data were used. Exact instrument and result
are retained. This proves the isolated source hazard, not the five local test
causes, Lighthouse cause, or a product repair. No mount/score/full-suite/CI retry.

Do not bundle a classic startup rewrite into the CSS-only PR. Next diagnostic
design can deterministically delay synthetic session hydration across these
existing timer boundaries and observe their invocation without changing the
APP.page descriptor. All original failed release gates remain held.
