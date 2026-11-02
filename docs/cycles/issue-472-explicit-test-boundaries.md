# Explicit Test-Data Boundaries (#472 / #487)

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
