# P0 slice 1: left shell

Gabriel's D-056 replaces the old right-side choice. This is only the first
ordered #341 slice. Today/Approvals/notification data/all-row/date cleanup
follow separately; the parent stays open until Gabriel's final sign-off.

The menu is fixed full-height on the left, without an inner scrolling box.
Nine existing primary destinations and More fit at1366x768. Legacy destinations
remain accessible under More; their original DOM nodes, route handlers, IDs,
role visibility and badges are moved, not deleted or cloned. New P0 pages are
not represented by fake functioning links before they exist.

Theme and sign-out controls live behind the bottom Account avatar menu.
Large sidebar Leads/Fees tiles and the old footer are hidden, not erased.
The existing bell stays in the top bar, beside search and Settings; its data
upgrade is slice4. Mobile uses a left drawer with a real overlay/focus boundary.
More tools use a separate bounded overlay, not an inner-scrolling main menu.

## Trace

index.html owns the original navigation nodes, badges and onclick handlers.
wos-marketplace adds semantic keyboard controls, mobile close/search and relocates
legacy topbar tools; it no longer removes the bell from the top bar. desk-shell
groups the same nodes into primary/More, moves sign-out, and installs the user
menu plus existing theme preference reader/writer. Permission-driven node hiding
and count writers retain their original IDs. No backend field or route changes.

wos_ui_scheme is still the only preference touched: existing localStorage
read/change handler, dark fallback and denied-storage behavior. No production
theme/sign-out action is used in verification. Bell Enter/Space calls the same
existing toggle; no mark-read operation is used as a live test.

## Proof

The actual full-index Playwright fixture clicks every preserved nav destination,
More close, gear, user menu, light/dark and bell click/keyboard. A clearly
synthetic, locked research-only lead makes the lead drawer smoke meaningful.
The default shared fixture remains unchanged for all other callers.

Screenshots:1366x768,1920x1080,412x915 plus400-wide. Checks include full-height
left geometry,no inner sidebar/nav scrolling,all original nav nodes present,
correct overlay stacking,44px controls,theme reload/invalid/denied storage,
no page errors/external requests and unchanged fixture data.

Changed old assertions intentionally replace right drawer/six large groups with
left drawer/four primary groups and More under D-056. Theme visibility checks
now open the actual Account menu before using the same switch. Existing
dark/light/contrast/route/data-safety assertions remain. Shared mobile proof
opens Account before asserting the unchanged Sign out control is present.
Its same initial drawer-focus assertion now runs immediately after Open menu,
before the explicit Account click intentionally moves focus to that summary.
The dashboard mount-order fixture likewise opens/closes Account around its
same Sign out visibility check; ordering/hydration assertions stay unchanged.

The private mockup URL showed a Claude sign-in wall in this session. No login
or access-control bypass was attempted. Implementation uses the explicit
version3/#341 and #325 written specs; actual visual comparison awaits the
architect/Gabriel with artifact access.

During focused proof, normal clicks exposed an inaccessible summary role and
a phone overlay above the drawer. Both were fixed in real markup/layering;
no force-click bypass or weakened pointer assertion was used. The header bell
was also made discoverable as its existing keyboard-operable control.

No outreach,approval,evidence confirmation,source run,triage,helper action,
production write,provider,auth change or dependency. See BACKLOG for full-suite
durations and live verification. Other feature work remains paused under D-056.
