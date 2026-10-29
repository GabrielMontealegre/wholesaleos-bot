# 455.6 Loading States

Candidate only until exact-head/full/main/automatic deployment/live gates pass.
Base87a6078, prior verified rollback470/468 tree. Owned rollback proof deliberately
carried as aa29ad4; no unrelated work reset. Dates4A blocked471; runtime test-label
identity5 blocked472. This slice does not censor source text or reintroduce469.

## Writer And Reader Trace

- Native Email `email-screen.js`: `load` owns metadataBusy/folderSequence and
  list error; `open` owns body busy/sequence and selected thread. `request` keeps
  existing current-ticket checks before/after JSON and terminal401/403 handling.
  `paint` reads those states into list skeleton/error Retry and body skeleton/
  explicit conversation Retry. No new transport, provider request or payload.
- Local body timer is2000ms, bound to sequence+selected key+busy+not disposed.
  It changes only the skeleton status label, without repainting/focus loss or
  provider retries. Open/load/destroy/selection-clear clear it; stale completions
  remain rejected by existing request tickets. No draft/body stored by timer.
- Native Today `app.js load` already owns generation, skeleton and guarded read.
  Failed reads now render an explicit Retry button invoking the same GET load;
  existing authenticated-user guard/session clearing and source schema unchanged.
- Classic Deals `wos-todays-deals.js`: load/requestVersion owns pending/error/data;
  initial no-data/no-error is pending, not an empty result. `paint` presents six
  non-record skeleton rows during reads, then sourced cards OR error+Retry.
  Existing delegated data-deal-reload invokes guarded load; Back/open/filter/
  signout invalidation stays unchanged. No new native Deals implementation.
- Existing shared components skeleton/button remain unchanged. Classic skeleton
  styles are scoped to td-loading-row, nonanimated and no new stylesheet. Existing
  provider/auth/storage/backend/canonical writers/clocks/value/readiness unchanged.
- Cache keys: native Email15 (skip failed448Email13 and deferred456Email14), app12;
  classic Deals17. CSS14/nav3/sharedlogin1/auth3/keySettings2/components6/assistant
  tags/model2/sheet3/layout3/reply1/todaymodel1/emailmodel2 unchanged. Deferred456
  must reconcile current tags rather than overwrite the consumer index.

## Tests And Negatives

New workspace-loading-states.test.js holds actual browser GETs at1366/400/412,
checks list/Today/Deals skeletons, error disclosure without provider body reflection,
explicit retry success, slow body/reopen/stale response cancellation, focus retention,
401/403 session ending and429 no automatic retry. All traffic synthetic/GET-only;
zero external requests/runtime errors/overflow. Optional screenshots synthetic only.
Existing mailbox five-size/composer/source/roles/no-write, shell, navigation/exact
record/Back/nonadmin/locked, Today actions and clock UI journeys retained unchanged.
No existing assertion changed. Full suite and serialized UI audit recorded separately.

## Release Safety

No actual PIN/key/device/private file/production import/upload/POST/provider write,
Copy/contact/check/draft/Preview/Send/settings action or credential transfer for proof.
No private screenshots/content-bearing private locator diagnostics: earlier468/470
privacy incidents remain disclosed. Approved public/same-source synthetic visuals and
global signed numeric DOM only. Own technical live gate failure means rollback FIRST
to verified87a6078 tree; no gate relaxation or unchanged failed-head retry.
