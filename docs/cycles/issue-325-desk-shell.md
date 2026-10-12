# Night desk shell

The dashboard defaults to a near-black workspace with readable light text.
Green denotes primary actions, blue secondary controls/links/selection, and red
retains danger/error meaning. The navigation is on the right, grouped into
Today, Leads, Buyers, Outreach, Deals and Admin. The phone drawer also opens
from the right, with the existing Escape/focus/overlay behavior preserved.
The top bar has a Settings gear. Light mode is an optional switch in the menu.

This is the first ordered #325 slice, not the completed UX item. Hover/long-press
help, card clocks, email role/thread layouts, clean buyer cards and the final JV
workspace are separate follow-ups. Actual Send remains #288; no send is enabled.
Canonical D-048 stages, signature gates and stored facts are untouched.

## Trace and safety

- index.html creates the existing sidebar nodes, inline navigate/menu functions
  and page renderers. marketplace.js supplies the menu close/focus handlers,
  header/search/tools and token normalization. Its behavior remains unchanged.
- New desk-shell moves the same existing menu nodes, retaining onclick handlers,
  role restrictions, IDs and count badges. It neither replaces routes nor reads
  private lead/buyer/email data. The gear calls existing Settings navigation.
- New CSS overrides the existing shared palette; the previous marketplace
  stylesheet remains for layout and optional-light compatibility. No retired
  theme writer is reactivated. Explicit semantic colors and disabled states are
  retained. Card radius is eight pixels.
- Only the new wos_ui_scheme preference is read/written in localStorage, never
  auth/identity/session values. The sole writer is the operator's toggle. Missing,
  malformed or denied preferences fall back to dark; denied saves do not throw.
- No backend, acquisition, data/source, authentication, comp, contact, delivery,
  schedule or provider changes. No new dependency or third-party asset fetch.

## Proof

Actual full-index synthetic browser test: desktop1366, phone400 and Android412,
same nav item count/groups, right-edge drawer, existing Escape/focus behavior,
gear navigation, dark/light reload, denied/unknown preferences, header contrast,
blue secondary controls,44px/in-viewport controls, no overflow, no server writes,
external calls or console errors. Palette pairs meet AA contrast in both schemes.
Screenshots under docs/screens/2026-10-12-desk-shell are synthetic only.
Visual review caught an unreadable old header color; it was fixed and pinned by
an actual computed-color assertion, not hidden by a screenshot-only claim.

Existing assertion intentionally changed: scripts/verify-marketplace-ui.js:144
default body rgb(247,248,250) -> rgb(11,13,18), because #325's owner comment
explicitly supersedes the light default. Overflow,44px,control visibility, data
preservation, network and console assertions are unchanged. Both themes' AA
pairs and explicit light persistence are additionally tested.
