# Full dashboard mounting proof

These are local synthetic-data captures, not a claim that production has vetted
deals. The actual `dashboard/index.html` and every local dashboard script were
served unchanged. Only data endpoints are local fixtures; no production data,
helper capture, contact, approval, import or source network request was used.

`tests/dashboard-deal-mount-order.test.js` failed against the original #291 mount:
the first element was `wos-public-deals`. After the scoped repair it passes:

- Real signed-in dashboard initialization: Today first, public desk second.
- Actual lead hydration and resulting render: same order, no duplicates.
- Complete content re-render: same order.
- Existing three-second public mount timer: same order.
- Deal Finder: public desk still first; no Today panel.
- Return to Dashboard: Today first again.
- Standalone Today/JV: no old source desk and no invented deal in empty inventory.
- Both 1366 and 400 widths: no page overflow or page errors, no writes.
- Android-oriented 412 x 915 proof also passes. The known legacy header/tap-target
  problems are tracked in #294; this is not a claim they have been redesigned.

| View | Desktop | Phone |
|---|---|---|
| Dashboard, real script lifecycle | [1366](dashboard-1366.png) | [400](dashboard-400.png) |
| Today tab, empty inventory | [1366](today-1366.png) | [400](today-400.png) |
| JV tab, empty inventory | [1366](jv-1366.png) | [400](jv-400.png) |

Android: [Dashboard](dashboard-412.png), [Today](today-412.png), [JV](jv-412.png).

Complete-card/comp/buyer/help fixtures are separately recorded under
`docs/screens/todays-deals-local`. They remain labeled synthetic.
That proof deliberately delays the glossary to catch the late-load tooltip race;
card value labels are decorated even when glossary data arrives after the card.
