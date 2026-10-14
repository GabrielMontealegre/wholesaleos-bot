# Buyer Card Navigation

D-056 P0 sub-slice, from main11fb5db. UI only; no acquisition, matching,
approval, contact, provenance or readiness rule changes.

## Trace

- `assistant-finds.js` validates/ingests imported buyer names, locations and
  buy boxes; its explicit update workflow preserves approval and history.
- `deal-fit-view.js` derives matching reviewed deals from canonical deal
  evaluations and approved/eligible buyers. Missing view stays unmeasured;
  count zero stays a recorded zero. It derives contact time only from an
  attributed, valid, non-future outreach history entry.
- `assistant-find-routes.js` serves that projection via the admin GET; explicit
  import/approval/status writes are unchanged.
- `wos-buyers-found.js` reads those fields. Whole-card, Enter/Space, match-count
  and Open buyer navigation share its existing selected record/detail view.
  Interactive descendants retain their own handlers. Matching deal buttons
  still use the existing reviewed-deal opener.
- `wos-ui-kit.js` adds the pinned scoped Tabler card/button classes. Buyer root
  and cards override kit height100% with auto; theme uses existing tokens.
- `index.html` serves buyer JSv8, buyer CSSv2 and kit JSv3.

## Presentation

Name precedes reference in the detail header. Empty area/buy-box/contact-history
lines are hidden, not filled with invented facts. Published contacts, provenance
cautions, approval controls and timeline remain in the explicit detail view.
No "Emailed, no reply" claim is inferred from a timestamp: the projection does
not establish that channel or absence of a reply.

## Tests

Existing safety assertions retained. New pure assertions pin escaped names,
name-first detail, unknown versus real zero and absent contact history.
The existing full-index browser proof now tests normal whole-card clicks,
Enter, Space, match-count and footer navigation, back and matching deal opens;
all writes and nonlocal requests are blocked. Fixture store remains unchanged.
Pinned kit classes, heading contrast and actual card boundaries are checked.
Screenshots use synthetic test data only at1366x768,1920x1080,400x915,412x915.
Both the compact list and the changed detail header have screenshots. A
separate synthetic detail capture retained both approval controls, verified
the name-first header and card bounds, and observed no writes/external calls.

The old browser locator expected one Open control; it now explicitly selects
the first/last controls because D-056 intentionally makes the match badge an
additional read-only opener. Approval/provenance/JV assertions are unchanged.

## Release Gate

Released#356,maind6f21e6a3f5e62e58ddc4b2b48aadebd25d8315a. Exact deployment7055520878
SUCCESS2026-10-14T02:48:31Z from02:47:45Z (46s status interval);health/dashboard/
buyerJSv8/CSSv2/kitJSv3 all200. Live40visible buyer cards/count openers; whole-card,
Enter,name-first detail/history/two approval controls,Back/match-section opener
passed. Inspected record0matches,not fabricated. Leads100/drawer and1Today
passed;0new errors. No real production write/approval/import/mark-read/contact/
capture/batch/helper/evidence/source action. Local four-size proof,live1280x720.

Full suite: `docs/test-results/issue-341-buyer-navigation-final.txt`.
SUMMARY passed=183 failed=0 skipped=0 total=183,600s per file.
Buyer UI53.43s,unit1.43s,Today33.40s,kit0.35s; unchanged capture suites
186.43s/270.84s and county-notice acquisition14.27s all passed.
After green: merge commit, exact-head deploy SUCCESS, health/dashboard/assets
200 and authenticated read-only buyer/list/detail/back navigation. No real
approval, mark-read, import, contact action or source browsing during verification.

Remaining P0 work includes property/deal presentation, shared cascading
filters and the first-run guide. The legacy detailed buyer form is retained,
not claimed to be a completed shared drawer redesign. GitHub#341 was observed CLOSED on this run;
no explicit final Gabriel sign-off was found in its comments. Closing an issue
alone is not treated as authorization to resume paused source/comps work.
