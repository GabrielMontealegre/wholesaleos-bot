# One Workspace, One Design System

Priority: #412 supersedes the previous visual pause. PR413 stays draft.

## First Slice

Use browser-native components and the existing Express/auth/API stack.
React/Vite would add a build/runtime migration without improving this bounded
shell-first slice. One authoritative stylesheet owns tokens, typography,
spacing, shell and shared components. No CSS-in-JS or new screen patch files.

Stage the new workspace behind an explicit URL opt-in at `/app?preview=1`.
The plain `/app` URL and existing `/dashboard/` continue to use the classic
dashboard until parity. This flag is not a security boundary: signed-cookie
API guards remain exactly as today. Reuse WOSDashboardAuth and the recorded
Today API. No Railway variable, login protocol or business API changes.

The first screen is real recorded Today work, not a marketing page or fake
component gallery. Other workspaces link to their working classic screens
until migrated. A bounded allowlisted read-only deep-link bridge selects
those existing views only after the existing session is unlocked.

## Visual Contract

- Neutral near-black surfaces, light text, green primary actions, blue links,
  red urgent states. No gradients, decorative cards or one-hue backgrounds.
- System UI font, fixed 12/14/16/20/24px type scale, zero letter spacing.
- 4/8/12/16/24px spacing;44px minimum controls;4px controls/8px item cards.
- Left navigation, one top bar, one content scroll owner. Headers stay fixed;
  child lists do not add nested scrollboxes. Phone uses one pane and a native
  menu/drawer with X/Escape and focus return.
- Shared Card/List row/Tabs/Button/Badge/Drawer/Composer/Empty/Skeleton APIs.
  Components contain no network or business decisions. Send is disabled
  without an explicit callback/permission and review; no send is wired here.
- Tooltips use a delayed, reserved help region, never an overlay over controls.
- Local pinned Lucide assets, retained license; no CDN/fonts or hand-drawn SVG.

## Migration And Proof

New workspace loads none of the old patch stylesheets, Tabler mutation shim,
theme writers or tooltip enhancers. Classic remains isolated and unchanged
apart from the explicit allowlisted view deep link. Move each next screen
onto this shared system, then retire its classic styling only after parity.

Verify synthetic before/after1366/400/412, every nav/row/button, X/Escape,
keyboard/focus, long/empty/error/unauthenticated states, no overlap or nested
scroll, first paint under2s and Lighthouse accessibility90+. Positive widget
actions are fixture-only; production checks are GET/navigation only.
Email is the next ordered PR, not claimed fixed by this foundation.

## Local Checkpoint

The native shell, single stylesheet and shared component library are built
locally. Strict `/app?preview=1` registration leaves the default dashboard
unchanged. Classic navigation is allowlisted and deferred until a signed
admin session; an exact record reference takes precedence. No API changed.

Four focused files pass: component purity/escaping/icons; opt-in route and
navigation; component interactions at1366/400/412; actual native shell at
the same widths, including every classic navigation target, unknown counts,
human dates, explicit refresh, 401 data clearing, non-admin denial and zero
load writes/external calls. The separate full-classic-fixture visual proof
also checks the real classic Email deep-link bridge. Screenshots are synthetic
only and are not production proof. First contentful paint58/45/46ms at
1366/400/412; Lighthouse13.5.0 accessibility100 at1366 and412, no failed
audits. Final full suite, self-review, PR and exact-deploy verification are
still release gates.

One component defect was caught and fixed: a delayed dialog close event could
steal focus from a tab the user had already selected. Focus now returns only
when still owned by the closing dialog/body. A separate broken-icon failure
was test-fixture setup: about:blank had no same-origin base; the fixture now
uses its explicit origin. No existing assertion was changed.

Deferred PR413's hosted run39440019044 finished234 passed,0 failed,0 skipped;
full-suite job13m28s, test step12m26s, unchanged county-notice298.99s.
It remains draft by the new #412 priority, despite its green gate.
