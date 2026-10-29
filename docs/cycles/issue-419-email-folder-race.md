Item: #419 -- restore native read-only Email with correct folder request ownership

## Verified Release, 2026-10-20

PR421 head dce852f6c23fd3dae051d9833edfacc4b6d795ce, merge/main
373855d8f27b112301443e7900fcd2c04db7784f. Full39508946396:
SUMMARY passed=238 failed=0 skipped=0 total=238;600s/file,
11m51s test step,12m46s job. County-notice262.63s, new loading test5.03s,
Email model0.08s/UI3.91s. All timings stored under
docs/test-results/issue-419-email-fix. Rollback39508349634 passed235/235,
county-notice252.61s, timings under docs/test-results/issue-419-rollback.

Rollback420 merged506707f and deployment7212855384 succeeded22:44:20Z;
health20022:45:06Z, baseline Email/lead and1366/400/412 foundation passed.
Only then421 merged. Exact active Railway deployment
24fb22b2-659c-42f2-8852-4481d7090eb6 is successful and Details links source
373855d; the GitHub deployment mirror had not caught up at verification.
Health and fixed email-screen?v=2 both200 at22:49:38Z.

Live1366/400/412: select Alerts during initial metadata loading; immediately
aria-busy true/Loading email, then false/Latest30 messages in this folder,
not the former false zero. Safe screenshots intentionally show empty Alerts,
not private People messages: docs/screens/2026-10-20-email-fixed.
People and Sent each render29 conversations from30 source messages; real
body opens, empty local Reply fits on Android with360px reading space,
Send remains disabled, Close/Back work. Actual classic lead drawer opens
and closes;0 console errors. No typed text, send, Gmail handoff, capture,
batch, confirmation or business write. Provider settings/secrets unchanged.

The following sections preserve the pre-release contract/history. Its
rollback prerequisite and this item's live gate are now satisfied. D-061
is next, not implemented by this release. Parent412 is not closed.

Depends on rollback PR420 being merged and live-verified first. Do not deploy
over a failed gate or describe the original PR417 as successfully verified.

## Trace And Small Fix

The entire read-only Email migration from PR417 is restored from its exact
tested Git source after rollback. Original writer/reader trace, shared tokens,
synthetic before/after screenshots and safety tests remain. Relative to PR417's
runtime, the only changes are email-screen.js request ownership and index.html's
email-screen cache version2. No API/server/auth/SMTP/data/dependency changes.

load() now owns folderSequence/metadataBusy. open(), Back and category changes
still own body sequence. Selecting People/Alerts cancels body selection but
keeps the current folder read and its loading status; its original response
populates the selected category without another request. A folder switch
invalidates both; destroy invalidates both and clears all private state.
No timer, retry, background run, new network call or AI behavior was added.

## Tests And Review

New workspace-email-loading.test.js deliberately holds initial metadata until
the tab switch. It failed before the fix with false instead of true aria-busy,
matching live. After the fix15 hermetic cases pass across1366/400/412:
category selection preserves the response and exactly one list request;
older Inbox cannot overwrite newer Sent; legitimate empty,503 and401 are
honest; no body request, write, external call or page error occurs.
The complete existing workspace-email-ui test passes unchanged, including
local draft behavior, disabled Send and late-body/session clearing.

All existing assertions and fixtures from PR417 are restored unchanged.
Its original intentional shell assertion still tests native Email plus six
classic destinations. No safety assertion is removed or weakened. Full final
238-file hosted suite600s/file, diff check and self-review remain gates.

## Release And Verification

Merge only after rollback420 is healthy and this head is green. One automatic
deployment, wait exact SHA, health200, email-screen?v=2 and native Email live
at1366/400/412. Specifically click a category during a real initial load and
confirm the eventual correct metadata count, then read existing mail and open
the empty local composer without typing/sending. Verify classic lead card,
console and private-data-free screenshots. Never send, link/confirm evidence,
contact, capture, batch, change settings or write business data.

D-061 remains separately approved; this fix does not enable reply transport.
Parent412 stays open until its remaining ordered screens and sign-off.
