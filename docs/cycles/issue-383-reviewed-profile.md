# Reviewed Operator Profile (366I / 383)

## Boundary

2026-10-29 RECONCILIATION IN PROGRESS, existing PR394. Main7262b11 separately
released392; it remains excluded from Profile integration. Historical218 green
below is not a current gate. Fresh current unit/routes/private-parser boundary
and actual1366/400/412 UI tests pass; full/audit/release gates remain pending.

D-059 authorizes storage and canonical unsigned JV, template and buyer email
draft consumers only. The existing legacy contract-fill route is unchanged
and is not a profile consumer. Its separate repair is #392. A typed or image
signature is draft presentation, never signature evidence or a JV gate.
No bank/wire data is accepted. No deposit amount is calculated; required
deposits stay blank for review or buyer-funded at assignment, not Gabriel-funded.

## Writer And Reader Trace

* `operator_profile_history`: only the new admin POST writes reviewed versions,
  scoped to `req.currentUser.id`, using the existing strict private-store read
  and write. Prior entries and unrelated collections remain intact. The GET
  reads the current operator only, `no-store`. No list/export/aggregate route
  is added. Validation errors never echo values. The existing private database
  persistence/backup policy remains unchanged; no new provider receives data.
* `legal_name`, optional `llc`, `email`, `phone`, `mailing_address`,
  `typed_signature`, `signature_image`: explicit Settings input only. No
  inferred/default identity and no assistant import. Text/contact/length checks;
  image limited to canonical PNG/JPEG data with magic bytes and 64 KB decoded cap.
  No SVG or remote URL. Every write requires review and the prior version.
* `draft`: read-only validated profile for the current operator. Future/corrupt
  latest history fails closed, not fallback to an older profile. Missing profile
  preserves blank JV identity and the original buyer-email version/body.
* `reviewed-deals.jvDraft`: optional legal identity/contact and unsigned typed
  sign-off. Existing property, fee split, expiration and signature/authority
  gates remain canonical. Profile validation precedes the POST's activity write.
* `buyer-messages.prepare`: optional operator sign-off; preview, saved draft and
  explicit send re-derive it. Profile version participates in a profiled draft's
  digest; changed profile rejects a stale send before writes or sender calls.
  Recipients, deal selection, teaser restrictions and approval gates unchanged.
* `template-approvals`: raw stored templates/digests/review history unchanged.
  GET adds derived previews for a small known token set only. UI offers field
  insertion and a saved-template preview; no automatic template save or send.
* UI: Settings render replaces only the old Company Info block using DOM parsing.
  Security, Drive, Email and other settings remain. Private caches and pending
  responses clear on sign-out/login display. No persistent browser storage.
  Reconciled cache URLs: Profile JS2, template JS2, shared UI kit CSS2. The old
  unmerged Profile-only CSS is removed; generic Settings form rules live in
  the existing shared UI kit. All other current asset versions are preserved.
* New private request boundary precedes generic body parsers: no-store/admin
  before parsing, GET/POST only, JSON96KB cap, value-free malformed/oversize/
  content-type errors. No raw Profile input is echoed in parser diagnostics.
* Buyer-email review fingerprints retain current profit_review in addition to
  optional Profile version. No-profile compatibility and current profit gates
  remain intact. Current Calendar test is byte-identical to main; its historical
  driver correction is not replayed over newer code.
* Profile occupies the removed Company Info slot rather than prepending above
  remembered-device/upload-key controls. Original device in-viewport44px and
  key-dialog ownership gates pass. Profile read/save clears derived template
  preview caches and invalidates late responses without another request/write;
  current three-size UI tests assert that stale preview forms disappear.

## 2026-10-29 Reconciliation Checks

Nineteen focused files passed across the original fifteen successful checks,
the completed four-file tail and rechecking the three UI files affected by final
placement/cache invalidation. The first remembered-device UI run failed at
synthetic-server startup before routing any request. A bounded startup probe
also hit its60s deadline without recognized error flags; a further readiness/
fixed-flag diagnostic reached ready. The original timeout cause is UNKNOWN,
not called flaky/environment or fixed by the unrelated placement change. The
original startup deadline/assertions/runtime server code were not loosened.
The device file then passed, plus Calendar/auth/offline and current affected UI.
No full CI run yet. Current actual test inventory is284, not the old218.

Initial complete UI audit on frozenfcbbd8d passed candidate Settings performance
97/100 and template99/100, accessibility98 throughout; FCP all below2s. Baseline
desktop63/36 was not green and its cause is unknown; no causal improvement claim.
That audit is retained as history, not reused after the subsequent slow-response
client repair. Profile fields now lock until source loading completes, one30s
deadline spans fetch+JSON with no automatic retry, logout/pagehide cancels pending
requests, and a delayed image read keeps the latest typed draft fields. Fresh
synthetic UI tests passed those cases, including a real30s held-read timeout,
explicit reload, local image-edit preservation and late logout cancellation.
Existing PIN/key/device controls are explicitly retained. Final audit/full gates
still required for the changed runtime.

Fresh audit on e9b956c did not pass the release gate: Settings performance100/100,
template100 desktop/88 mobile, accessibility98 throughout. FCP remained below2s.
The mobile88 is retained, not waived; a concurrent supplemental capture is not
a proven cause. One bounded mobile diagnostic scored100 with CLS0, but is not a
replacement gate. A scope correction then checked the actual Lighthouse page,
not only a separate Playwright route and final URL. Its baseline Settings run
observed Dashboard after Lighthouse returned, so that score is unqualified.
Installed Lighthouse13.5 source documents destructive gatherers and clears
origin storage before returning. Measurement-phase scope probe v4 captured
Settings with its original Company Info form during the required Accessibility
artifact, then Leads after Lighthouse returned. The post-return scope check is
therefore too late; the exact destructive phase is not isolated. Earlier probes
failed config initialization twice, then found ViewportDimensions filtered out
of these categories; none supplied a candidate gate. The corrected observer
delegates the unchanged Accessibility implementation and records only structural
state before it. No category, threshold, storage reset or app state is suppressed.
Full corrected-protocol before/after audit on e9b956c then passed: Settings
100/100, template97/100, accessibility98 for all candidate audits, FCP below2s.
The diagnostic95/98 is not a candidate gate or an explanation of the old88.
Self-review subsequently found derived template previews survived pagehide even
though Profile itself cleared. A new synthetic regression failed exactly2!=0
at the cache-empty assertion. Template pagehide now clears cached preview/forms
and invalidates late responses via the same existing sequence guard, without
requesting or writing anything. Fresh UI and exact-source audit remain required
after this runtime repair; the e9b956c scores cannot substitute for that gate.
The repaired three-size UI test then passed, including the two current PIN/key/
device preservation assertions, pagehide clearing, slow-read timeout, explicit
reload, image-draft preservation and late logout handling. All six newly masked
captures were inspected; staged offline privacy gate passed. Exact-source UI
audit and full284 PR/main suites remain pending.

Additional capture disclosure: a static hardcoded owner label in baseline
Settings Team Access appeared in a synthetic contact preview. This was tracked
fixture markup, not a real Profile/Gmail read. Uncommitted Settings captures and
unsafe contact sheets were removed before staging/push; numeric audit reports
remain. Replacement capture-only views validate and mask the entire Team Access
section before disk, plus baseline Settings inputs, without hiding Profile or
security controls in the running application. Fifteen safe supplemental views
were inspected. The UI test's optional Settings screenshot path now applies the
same validated whole-Team-Access mask. Privacy-tainted original images are not retained;
do not claim all original screenshots or zero historical metadata exposure.

Privacy disclosure: an earlier usage-check orchestration emitted account/reset-
credit identifiers instead of only percentages into tool output. No identifiers
are repeated here; no reset/purchase was called. Subsequent checks are filtered.
This does not relabel the already disclosed468/470 private-content incidents or
claim that no metadata was ever logged.

Merge conflict resolution deliberately preserves current shared shell/docs/
Calendar and combines profit_review plus optional Profile version in buyer-email
review hashes. Existing old Profile checkpoint6626a93 and current481proof2f8d45a
are retained, not blindly reset or bundled with another runtime feature.

## Evidence

New tests: `operator-profile.test.js`, `operator-profile-ui.test.js`, and the
reconciliation's `operator-profile-boundary.test.js`.
Negative cases include forged actor/fields, bank field, review missing, stale
version, future/corrupt history, injected email header/HTML, remote/SVG/bad magic/
oversize image, wrong operator, no-profile compatibility, changed-profile send,
JV failure before write, and late GET after logout. Pure functions are spied for
network/clock/writes. Actual UI fixture checks 1366/400/412, 44px controls,
no horizontal overflow, image draft-only behavior, insertion/save/preview,
and no external request/console errors. Reconciliation changes two incidental
UI signature-image selectors from all Profile img nodes to figure img, retaining
the same1/0 assertions, because decorative Lucide button icons now exist. No
safety assertion is weakened. Pure tests keep current profit fingerprints.

Screenshots in `docs/screens/2026-10-19-366-i/` are **synthetic local evidence**,
not live production proof. No real profile, email, contract, signature or source
record was saved. Full suite and exact PR head are recorded in the PR once run.

Initial hosted run39325431056:217 passed/1 failed/0 skipped,8m52s job.
Both new Profile suites passed (UI3.64s/unit0.14s). The sole failure was the
existing Calendar driver's immediate count after Escape (line40): native close
events remove a dialog asynchronously. Local reproduction passed without a
product change. Driver now waits up to3s for detachment before the same zero-node
assertions; X/Escape and Today-disabled expectations are unchanged. No Calendar
product code changed. Initial report retained in issue-383-initial. Final full
suite rerun required; never substitute the local pass for that gate.

## Release Gate

Historical2026-10-19 gate below is superseded by current435 mixed-proof approval
and working Chrome4. Reconciliation still needs fresh UI FCP<2s/performance AND
accessibility90+, full candidate/main suites, exact automatic deployment and
approved read-only verification. No old218 result or old screenshot substitutes.

Historical: Do not merge this draft until Chrome control permits the outstanding live UI
verification. Prior PR391 exact Railway deploy succeeded and health was200;
browser operations still time out before dispatch, despite the owner reconnect
reply. No speculative product rollback or new Railway deployment was performed.
After release, only read Settings/Profile, template preview and normal hydrated
lead navigation at1366/400/412; never save a real profile or send/generate/sign a
contract as verification. Profile storage is usable only after the owner enters
and reviews their actual details.
