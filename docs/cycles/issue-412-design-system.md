Item: #412 design system and isolated workspace foundation (ordered slice1)

## What Changed

One shared token/type/spacing stylesheet and browser-native component library
replace the patch stack in an isolated preview workspace. Left navigation,
one content scroll owner, fixed top bar, reserved delayed help, native
X/Escape drawers and explicit session handling work at desktop/phone widths.
Today displays the existing recorded workflow projection. Other navigation
targets open their working classic screens. Default `/dashboard/` is unchanged;
`/app` redirects there unless `preview=1` is explicitly set. This is a UI rollout
flag, not a security boundary. Existing signed API guards remain authoritative.

Shared Card/List row/Tabs/Button/Badge/Drawer/Composer/Empty/Skeleton components
have no business/network decisions. Composer is disabled without explicit
permission, reviewed input and a callback; no real send is wired in this slice.
Locally vendored Lucide1.60.0 includes the upstream license and nineteen icons.
No application dependency, Playwright version, API route, data or gate changed.

## Writer And Reader Trace

- Legacy appearance: index inline CSS plus patch stylesheets/theme writers,
  desk shell node mutation, Tabler mutation shim and help enhancer. None load
  in the new document. They remain only on non-migrated classic screens until
  parity; this does not add a new stylesheet layer to those screens.
- New appearance: design-system.css alone owns tokens, typography, spacing,
  shell and components; components.js returns escaped markup and binds only
  caller-selected controls. app.js renders recorded Today and session state.
- Authentication: unchanged wos-dashboard-auth.js restores the signed cookie,
  guards same-origin reads and clears identity on401. New UI also clears all
  private DOM/dialog/data and invalidates pending responses. No token/PIN is
  read from storage, embedded in source, logged or added to URLs.
- Workflow data: unchanged today-workspace.buildTodayWorkspace writes the
  derived DTO; app.js reads it without recalculating readiness, matching,
  grades, prices or counts. Unknown counts stay unknown. Human timestamps use
  unchanged wos-card-clock with the response's injected as-of timestamp.
- Navigation: navigation.js maps a fixed set of public workspace keys to
  existing page keys. Only an explicit query plus signed admin state invokes
  classic navigate once. A valid exact record_ref takes precedence and uses
  the existing record-activity opener. Invalid/forged destinations do nothing.
- Delivery: server.js adds only the non-API `/app` document route, no-store
  with self-only CSP; existing API registrations and auth implementation stay.

## Tests And Review

New focused tests: workspace-components, workspace-components-ui,
workspace-preview, workspace-shell-ui. Negatives include injection/invalid
IDs/icons, pure render with denied network/clock/storage, disabled default send,
explicit synthetic failure without leaked error details,401 DOM clearing,
non-admin/locked loads with no business request, forged navigation, ambiguous
query opt-in, missing/unknown counts and exact-record precedence.

Actual synthetic classic fixture verifies the Email navigation bridge, no
business writes or external fetches. New shell1366/400/412 verifies every
navigation target, list rows, tabs, X/Escape/focus return, refresh, error and
session states. Full hosted suite is still required before ready/merge.

Existing assertions changed: none.
Decisions: #412 priority and AGENTS3/5/7. ASSUMED browser-native incremental
migration and explicit URL flag are logged in DECISIONS.md.

## Visual Proof

All screenshots contain synthetic test records, not production identities:

- Before: `docs/screens/2026-10-20-workspace-design/before-classic-{1366,400,412}.png`
- After: `after-actions-*`, `after-best-deals-*`, `after-last-24-hours-*`,
  `after-account-*`, `after-navigation-*` in the same folder.
- `synthetic-proof.json`: first contentful paint58/45/46ms; no horizontal or
  control overflow/broken icons. Lighthouse13.5.0 accessibility100 at1366/412.

Reproduce with `node scripts/verify-workspace-design.js --screenshots`.
For the optional local release audit, set WOS_LIGHTHOUSE_PATH to an installed
Lighthouse core/index.js. Audit tooling is development-only outside this repo;
it is not an application dependency or a cloud test-suite requirement.

## Risks And Next Slice

This is the foundation, not Email completion or full classic parity. Email
rebuild on this shared system is next; no new feature work precedes it. The
current default dashboard retains legacy styling until each screen migrates.
No stored data migration and no production preview/send/confirmation occurs.

## Released And Verified

PR414 final head646933abe34b15c51208e7f76470b2762e99353f; merge/main
0d035e09e71b5602caa00c94399a4c9a072d71b4. Hosted run39446383940:
SUMMARY passed=235 failed=0 skipped=0 total=235,600s/file. Test step9m46s;
job10m41s. New files1.27s/.06s/.06s/5.19s; county-notice207.88s. Full
per-file artifact retained under docs/test-results/issue-412-design-system.

Exact Railway deployment7203827249 success2026-10-20T15:28:43Z,109s after
merge. Post-success health200 at15:30:13Z; preview document200 and CSP.
Authenticated1366/400/412: native shell and one stylesheet, no horizontal
overflow, record/account/menu X controls, tabs, all7 classic nav destinations
render, mobile Email link works and8 menu links fit44px. Classic lead drawer
opens/closes. Leads and Calendar had slow initial classic hydration, then
rendered on observation; not claimed instantaneous.0 console errors since
the post-success verification boundary. Live paint could not be measured by
the connector's DOM-only scope; only the synthetic paint numbers are claimed.

Privacy-safe live-best-deals-{1366,400,412}.jpg contain no record identities,
only aggregate counts and the actual empty best-deals state. No production
send, logout, capture, batch, approval, confirmation or business write.
Default classic dashboard remains unchanged. Email itself is not yet fixed;
next ordered slice continues, with generic reply Send isolated on#415.
