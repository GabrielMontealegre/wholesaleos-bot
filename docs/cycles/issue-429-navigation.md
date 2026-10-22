# One Shell Navigation

Issue429 corrects a verified design jump: Email used the native shell while
Deals and the other links replaced the entire document with the classic app.
Home remains the existing dashboard content, not an invented summary.

## Trace

- `modules/ui/workspace-preview.js` owns the native HTML route; `server.js`
  registers it before dashboard static serving so canonical dashboard URLs
  render one shell. Exact embedded=1 serves the existing classic document.
- `dashboard/workspace/navigation.js` owns allowlisted page names, hrefs and
  record-ref validation. Embedded classic navigation reports only validated
  keys/refs to the exact same-origin parent. Raw source URLs never become a
  route or a record ref.
- `dashboard/workspace/app.js` reads those routes and owns parent history,
  active navigation, header, native Email lifecycle and the classic content
  frame. Source-window/origin checks reject sibling/forged messages. Browser
  Back/Forward render the recorded destination without replacing the shell.
- Existing classic `navigate`, record-activity deep-link resolution and all
  view renderers remain the content writers. Shared UI-kit CSS hides only
  duplicate classic chrome inside a same-origin embedding; no business view
  or input is hidden. Native shared CSS owns the frame's stable layout.
- Existing signed-session restoration, API permissions, admin-only preview,
  value/readiness and all send gates remain. Non-admin canonical entry retains
  the original standalone classic document instead of losing its dashboard.

## Verification

New actual-application synthetic test exercises Home -> Deals -> Email ->
Deals at1366x768,400x915,412x915, then every navigation item, Settings,
browser Back/Forward, exact source-supported lead ref, locked content,
non-admin compatibility and wrong-origin/source/forged routing. It asserts
the same shell node survives and zero top-level document reloads occur for
tab clicks; no production data, external requests or writes.

Before screenshots use baseline workspace source7b36ed2 and reproduce the
old shell jump. After screenshots and machine-readable synthetic proof are
under `docs/screens/2026-10-22-navigation/`. Synthetic first contentful paint
is725/69/79ms at1366/400/412, not a production timing claim. Lighthouse13.5.0
accessibility is100 at1366 and412, including the default classic Home within
the shell. Full-suite results are recorded in the PR/test artifacts.

Existing assertions intentionally changed: workspace-preview document route
registration now includes canonical dashboard aliases and same-origin frames;
the shell fixture serves the shared document at canonical URLs and selects
the canonical Email link. Record validation, deferred signed-admin classic
navigation,401 clearing and role restrictions are not weakened. The Email
comparison script explicitly requests embedded legacy content for its old
baseline, preventing it from accidentally comparing native Email to itself.

## Release Boundary

Railway Hobby builds unavailable: D-062 permits tested non-sensitive items
to merge as deploy pending, not released or owner-approved.422 already counts
toward the three-item cap. No Railway settings, variables, billing or secret
changes. No send, capture, batch, refresh job, confirmation or business write.
When builds return, verify exact source plus all navigation clicks/screens
and normal lead hydration. If this item's live check fails, revert only its
merge. The classic content is still a compatibility view, not a completed
native Deals rebuild, and reinitializes when switching classic destinations.
