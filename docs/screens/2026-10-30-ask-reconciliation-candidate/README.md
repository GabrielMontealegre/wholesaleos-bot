# Ask Reconciliation Candidate (Synthetic Only)

Final audited runtime: `6ccb9f9338815203c1e33889820952521dd7afbf`.
Baseline: actual main `edbd25545ee5518d37aa50469a364b0ec78a9a92`.
This is NOT a release. Fresh full288 PR/main gates and exact automatic deployment
plus approved read-only verification remain pending.

## Qualified Audit

Pinned Playwright1.44/Chromium1117 and Lighthouse13.5.0. Actual native Today,
native Email and classic Today routes remain running, without a parent freeze.
The fixture clicks the existing Ask header command, then submits a synthetic
record reference through the actual form. The required official Accessibility
gatherer delegates unchanged and asserts actual expanded-context scope DURING
measurement. No category/storage/gate suppression.

| Surface | FCP at1366/400/412 (ms) | Performance1366/412 | Accessibility |
| --- | --- | --- | --- |
| Native Today | 157.7 /63.8 /71.4 | 98 /96 | 100 /100 |
| Native Email | 112.6 /72.0 /71.0 | 99 /96 | 100 /100 |
| Classic Today | 121.6 /78.7 /83.5 | 93 /100 | 100 /100 |

All actual view/context assertions, FCP<2s, no overflow, null runtime errors and
empty audit-error lists passed. Baseline measurements and nine header images
are retained from the initial audit; unchanged baseline was not rerun.
Baseline performance99/96,99/96,94/100; access100,98,98 respectively.

Fifteen final expanded-context images plus nine baseline headers were inspected.
One earlier dark-heading image is an explicit FAILED visual negative, not final
proof. The dialog is asserted outside the underlying app roots. Underlying roots
are hidden ONLY by screenshot-only style before disk, after measurements; that
style is not present during Lighthouse or application interactions. No real
Profile/mail/body/credential data or private live browser was used.
Nine supplementary action-footer views were also inspected. Their record action
is44px and inside each viewport after normal scrolling. `footer-views.json`
records only that visual supplement, not a performance rerun. Its docs-only
e8cddde source is runtime/tests/dependencies-identical to audited6ccb9f9.
The first footer invocation stopped before capture because the newly generated
proof directory was untracked; proof was committed, the unchanged runtime was
verified, and footer capture then passed. The clean-source guard was not waived.

## Retained History

- `failed-frame-and-baseline.json`: actual4a failure85/82 Today and Email,
  classic77/90; all access100. Original15 completely black after images were
  overmasked and are NOT positive visual proof; retained externally, not reused.
- `layout-probe.json`: structural-only diagnostic attributed native extraCLS to
  Ask frame growth. New geometry assertion genuinely failed before scoped repair.
- `superseded-heading-source.json`:5a numeric pass did not satisfy visual review;
  classic headings were unreadably dark. New actual-theme assertion failed,
  then scoped inheritance fixed it. One negative image retained here.
- `failed-classic-phone87.json`: changed b3 source genuinely failed classic phone
  performance87. Cause UNKNOWN; no flaky/environment claim or gate reuse.
- `cpu-probe.json`: ordinary-page diagnostic only, NOT Lighthouse/a gate. Shows
  global panel hygiene/glossary/startup samples; does not establish the87 cause.
- Existing private Settings owned-close convention was then applied to Ask;
  a new classic icon assertion FIRST failed because hygiene replaced the icon.
  Shared hygiene/parent implementation unchanged. Final6c audit passed.

Prior passing source is never substituted for a later failing source. No
production regression or rollback occurred: this candidate is unmerged.
