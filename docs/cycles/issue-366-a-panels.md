# 366 A: Panel closing, density and scroll hygiene

## Trace

- Shared modal-overlay/modal-content is written by showModal, compactLead drawer
  and record search. Existing closeModal also restores lead queue state; delegate
  to it, never hide that overlay independently.
- Today creates a native dialog; native close/remove hooks remain. Notification
  workspace owns its open state and close callback; Esc delegates via its existing
  close control. Login is not a dismissible panel.
- Eight legacy overlay IDs are created by existing email/SMS compose, buyer,
  search, generator, validator, guide and pull-list views. Presentation-only close
  removes the overlay (plModal hides its reusable shell). No tool is run.
- Marketplace owns mobile navigation X/Esc; desk-shell owns More/account details
  and focus return. Retain identities/handlers; account gets X; More's existing
  close becomes an icon with its accessible name retained.
- panel-hygiene observes child additions to decorate these known shells;
  one X per shell, topmost-only Escape. No clock, request, storage or data writer.
- lead-queue-table-shell owns rows; bound that scroller and keep its column
  headers inside it. MODE toolbar is static, not a sticky mid-page overlay.
  Retain every diagnostic/filter. Letter G owns modes/checkbox changes.
- Scoped density reduces cards20->14px and grid20->12px, preserves44px command
  targets, adjusts corresponding media margins. No business facts changed.

## Proof

Full-index fixture1366/1920/400/412: real conversation and lead X/Esc, eight
legacy shells without invoking operational tools, nested Esc closes top only,
authentication not dismissible, More hit area/full height and account X, actual
row scroll with contained column header, zero writes/external requests and
unchanged fixture store. Existing assertions unchanged.
Initial full suite191passed/1failed/0skipped. Existing desk-shell located the
shared inline close hook, which the first decoration unnecessarily removed.
Retain existing shared/delegated hooks rather than alter that test; add a new
retention assertion. Failed report preserved. Final full suite192passed/0failed/
0skipped,600s/file;panel9.39s,shell29.19s,county-notice11.46s. All old assertions
unchanged. Global margin reset also put native dialogs top-left; scoped auto
margin restores centering, pinned by a geometric browser assertion.
Released PR#368,mainffa3dd0d6a1f1cd05c6e70af1d2959900de1194b.
Exact deploy7108050258 success2026-10-16T00:51:38Z,60s. Health/dashboard200;
shellJS4/CSS3/hygiene1 served. Live1366/412 More full height/X,account X,
centered conversation X/Esc,lead X/Esc,bell X/Esc,100Leads,last-row click scrolls
bounded list with header retained,MODE static,no page overflow. Old tab502 at
00:51:27Z predates success;fresh post-deploy tabs hydrate100with0errors.
Viewport restored. Live More screenshots inspected before publishing;no private
row fields. No source/capture/contact/confirmation/business data writes.

This branch carries D's verified post-release screenshots/report to avoid a
separate docs-only production deployment. C and B remain NOT LIVE.
