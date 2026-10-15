# Property and Deal Card Presentation

D-056 P0 sub-slice from maind6f21e6. No valuation, approval, contract,
contact, provenance, ingestion or readiness rule change.

## Writer and Reader Trace

- `reviewed-deals.js` validates `holder_contact`, platform, source URL and
  separate posted/captured dates on ingest; attributed update-by-reference
  preserves the holder fields and their provenance. No writer is changed.
- Its evaluator derives approved geographic buyer matches and the canonical
  `estimated_spread` after the recorded JV split. The list sort, interim grade
  and Today already read that share. The compact card now reads the same
  finite `estimated_spread.low`, not a second gross subtraction.
- `wos-todays-deals.js` reads the existing DTO. Address/coarse location and
  explicitly supplied holder name precede the reference; source platform and
  Posted or Captured dates retain distinct wording. Missing source stays
  unestablished. The shared clock is unchanged.
- Unsigned JV uses the existing `full_package_evidence_ready` guard for its
  headline and accessible label. No precise address is added to compact source
  hover text. Holder is not relabeled owner.
- Whole-card and Enter/Space navigation reuse `openReviewedDeal`. The optional
  matches focus targets the existing approved-buyer section after the GET;
  no write, source visit or review checkbox is triggered.
- `wos-ui-kit.js` enriches this root with the pinned scoped Tabler card/button
  classes. Auto-height and existing theme tokens prevent kit root overflow.
- Repository-wide field search also found the unchanged JV workflow/desk
  readers (`modules/deals/jv-workflow.js`, `dashboard/wos-jv-workflow.js`,
  `dashboard/wos-jv-desk.js`), Today/interim-grade readers and fixture-only
  `verify-jv-stage-controls.js`. No other product writer of either holder
  contact or estimated spread was found outside reviewed-deals validation,
  update/ingest and evaluation. Those readers/writers remain byte-identical.
- `verified-ui-releases.json` appends only353/354/355/356 with already observed
  exact-head SUCCESS timestamps and PR URLs. It is immutable package metadata,
  not a DB/activity/snapshot write; unsuccessful345 is not called verified.

## Scope

The empty decorative photo block is removed, not replaced with a fabricated
house. Optional missing property chips are hidden; known zero baths remain.
Essential unknown value, price and room stay explicit. Derived room is labeled
our share, before costs and not an offer. A buyer match does not approve the
deal, authorize contact or claim an established price.

Detailed comp/contract/approval controls remain unchanged. This slice does
not claim to complete every legacy detail-form placeholder, all lead drawers,
cascading filters or the first-run guide. Other features stay paused.

## Proof

New `deal-card-navigation-ui.test.js` uses real canonical validated fixture
records/evaluations and the full dashboard, with writes and external requests
blocked. At1366x768/1920x1080/400x915/412x915 it checks address/holder first,
unsigned JV accessible-label privacy, canonical6625share rather than13250gross,
whole-card/Enter/Space/matches/back navigation, target focus and unchecked review
controls. Eight list/matched-buyer screenshots contain local synthetic data only.

Negative cases: missing property facts, known zero baths, no approved buyers,
no comps/value, unknown split (no gross fallback), missing platform, escaped
forged read-response holder, and server rejection of HTML before storage.
The unchanged evaluator treats zero asking as unestablished; this UI release
does not alter that existing price policy to satisfy an invalid test expectation.

Initial fixture failures were HTML rejected by the actual writer, a buyer
explicitly named SYNTHETIC excluded by the real matcher, an unscoped locator
matching both hidden/visible holder nodes, and that zero-price expectation.
Fixtures/selectors were corrected; no safety gate or existing assertion was
weakened. The failed proof's local fixture process alone was stopped; the
operator helper was untouched. The final focused proof passed.

Existing assertion change: `verify-marketplace-ui.js:128` one compact navigation
button becomes two, Open deal plus buyer matches, explicitly required by D-056.
All strict-grid, unsigned-address, provenance and review assertions are retained.

## Release Gate

DONE#357,maincdc4c3083edf0c329dd4c411af4747fc09ae5e80. Exact deployment7056126229
SUCCESS2026-10-14T03:33:25Z from03:32:42Z (43s status interval);health/dashboard/
dealJSv10/kitJSv4/marketplaceCSSv2 all200. Initial live17cards,17source/count/share
labels,0empty photos;whole-card/Enter/back and buyer-section focus passed,review
boxes unchecked. Leads100/drawer passed. Final Today check completed later on
2026-10-14 in the currently open Chrome dashboard after the in-app webview became
unavailable: normal navigation and one bounded cold reload each rendered1Today,
0new captured errors. A stale pre-navigation tab showed legacy content; cold
reload did not reproduce it. No bootstrap defect/fix claimed, no code changed
for browser-tool timeouts. No production business/evidence/contact/source action.

Full final suite600s/file: `docs/test-results/issue-341-deal-navigation-final.txt`.
SUMMARY passed=184 failed=0 skipped=0 total=184. New card UI15.50s,Today52.75s,
kit0.51s,mount17.10s,phone41.64s; unchanged capture41.96s/44.65s and
county-notice acquisition16.90s all passed. No environment skips.
Require0failed, clean diff, merge commit, exact deployment SUCCESS and authenticated
read-only card/list/match-section/back/lead-drawer/Today checks. No approval,
contact, source visit, capture, batch, helper or production-data action.
