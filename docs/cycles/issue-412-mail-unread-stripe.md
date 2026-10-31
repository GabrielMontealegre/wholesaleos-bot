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
