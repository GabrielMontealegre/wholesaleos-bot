# Explicit Test-Data Boundaries (#472 / #487)

## Released And Verified

- PR490 tested head `849754f1fac40bb89cf78521a3128d4343ac736a`; merge/main
  `84da9841879baa7a80f2d8bf8bc57363b859807c`, entire tree identical.
- Fixed-head PR41568932641/job125697054329:301/0/0,13m18 job wall.
  Main41570456973/job125701864014:301/0/0,18m21 job wall.600s/file, natural
  completion; all602 successful timing rows plus original301 failed-head rows
  preserved under `proof-490`. Duration sums are not job wall time.
- Automatic Railway deployment `1f32a4b8-242c-4f57-ad28-9476dd96d13b` exact
  merge source statusSUCCESS. No manual Railway action.
- Public fixedGET7 checks pass: health200, exact classic/app/recordedAsk files,
  unsigned lead/buyer/snapshot401, snapshot denialno-store. No private JSON/body
  read or flagged production POST. The legitimate Ask runtime remains served.
- First public verifier stopped after health200 because local git-show source
  comparison exceeded its default1MB child buffer. A local-only identical read
  reproduced ENOBUFS for the1,897,880-byte public index. Preserve first report;
  enlarge only external source-comparison buffer to8MB, keep all assertions and
  runtime unchanged. Completed fixedGET proof then passes. No screen audit or
  15-case rerun; this does not explain any historical failure.
- Existing signed Chrome session, fresh temporary tab: GLOBAL shell/ready,
  noRetry, assistantpresent, enabled44x44refresh and nohorizontaloverflow pass.
  No private text/values/JSON/AX/capture/content locator, auth transfer or writes.
  Temporary tab closed; original user tabs untouched. No changed UI/screens.
- Scope complete: explicit test flags at import/display plus packaging guard.
  This does not prove absence of unmarked fixtures in private production data,
  infer provenance from names/text, or complete the whole487/455/backlog.

## D-065c Fixed-Head Gate Authorized

Architect #487 comment6594135767 (2026-11-02) clarifies one CI run per head,
not per PR. The committed `tests/.tmp` restoration may now be pushed and receive
one first run on the changed head. An unchanged retry is still prohibited.
Keep the original failure and301 timings. A different-test failure permits
one more fix commit/run; the same test failing twice goes to needs-architect.
Owner merge/automatic-deploy approval is already recorded. The historical
whole-PR cap interpretation below is superseded; no gate is waived or green yet.

## First Full CI Failed

PR490 source `b820b0550f010ecd6fb01d34a01aed9c27c5e85d`, run41382706484,
job125076759547: **300 passed / 1 failed / 0 skipped of301**,600s/file,
19m04 job wall. All301 timing rows retained; sums are not wall time.
`no-secrets-in-tracked-files.test.js:70` failed its unchanged required
`.dockerignore` entry assertion: this candidate replaced `tests/.tmp` with
`tests`. The broader exclusion does not satisfy that literal safety check.
There was no emitted secret-value finding; do not attribute this to Node,
environment or flakiness. All other300 tests passed, including both new tests.

Restore the explicit entry alongside the broad exclusion locally, retaining the
original test unchanged. A targeted configuration assertion passes after the
change, but the fix has no full-head CI. PR490 remains open/draft/unmerged,
not deployed. The one-PR-CI allowance is consumed; no automatic second run,
cancellation, skip, waiver or green claim. Preserve the remote failed source.
No main CI or production probe was started. This is a failure record, not a release.

## Scope And Trace

- Source: current main `3eff9420fa04711da66d48dda84a5a921043dc66`.
- Authority: #472 architect answer 6551370318 / D-065. Only own boolean
  `test_data`, `synthetic`, or `fixture` equal to `true` identifies test data.
  No name, filename, subject, source text, or string-value inference.
- Typed import writers: server lead import, buyer bulk import and manual-evidence
  proposal; assistant-find agent import and signed-admin preview/commit. Their
  existing session/role/agent authorization stays ahead of the new check.
- Raw assistant snapshot/key upload already decodes original bytes into an exact
  schema before append. Unknown flag fields are rejected there without changing
  receipt hashes, histories, append semantics, auth or parser order. Negative
  tests cover flagged nested snapshots and legitimate synthetic-sounding names.
- CSV, pasted text, binary uploads and source evidence are not searched for test
  words or parsed for hidden flags. A CSV string `true` is not boolean `true`.
- API readers: server-wide `res.json` boundary installed before private routes.
  Successful typed responses containing an explicit flag return one generic,
  no-store 503, not a filtered list with misleading totals. Stored rows remain
  intact. Existing error statuses, including 401/403/429, pass through unchanged.
  No browser fetch replacement, extra requests, retries or provider changes.
- Static readers: `/dashboard` and `/app` share the dashboard directory; the
  separate courthouse script remains its existing fixed file. A reviewed public
  asset inventory is checked at Docker build and before server startup. New or
  missing files and links fail closed; explicitly test-only headers and flagged
  JSON assets also fail. Tests are excluded from the image alongside exports.
  The recorded-data `wos-ask-demo.js` is deliberately approved, not censored.

## Proof And Limits

- Added detector, synthetic Express/router, raw snapshot and asset-inventory
  negatives. Tests cover true versus false/string/numeric flags, nested arrays,
  cycles/deep input, inherited/accessor fields, no detector I/O/clock/mutation,
  zero import writes, authorization ordering and unchanged terminal errors.
- Initial local test setup lacked Express on default resolution; the next
  diagnostic reached a sandbox EACCES localhost connection. Correct NODE_PATH
  and authorized localhost execution passed. These are not causes attributed to
  any prior historical failure. No old failed-head test was retried.
- Existing buyer-find import, snapshot routes and key-upload focused tests passed.
  Asset-inventory tests and final changed purity regression passed. Exact-head
  full CI remains pending at preparation time; no release or production-data claim.
- No existing assertion changed. No schema expansion, data migration/deletion,
  name heuristic, auth rewrite, UI layout/text change or new provider path.
- The inventory requires deliberate review when adding a public asset. It is an
  explicit packaging allowlist, not a classifier for business records. It cannot
  establish whether an unmarked real-world record is a fixture. Existing unrelated
  operational eligibility policies are not broadened or rewritten by this slice.
- Deploy verification must use exact-commit automatic deployment plus bounded
  public health/dashboard/static and unsigned-denial checks. Never send a flagged
  payload or import to production, inspect private records, or claim their absence.
  No changed-screen screenshot is needed: rendered controls/layout are unchanged.
