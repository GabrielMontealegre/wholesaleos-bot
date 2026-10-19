# Ask WholesaleOS -- Bounded Read-Only Demo

D-060 / architect#390 authorizes this slice before full#366 sign-off. It is
not the full#372 assistant and does not enable downstream#369/#361/#351.
#393's broader assistant parity follows this demo. No AI key/provider,
message draft/send, approval, import, evidence confirmation, profile/contract
fill, capture, paid service or production business writer is added.

## Writer And Reader Trace

There are no new business writers or stored collections. The sole endpoint,
admin GET `/api/dashboard/ask-workspace`, reads the existing strict store at
one injected timestamp and returns no-store, derived read-only data:

* Today actions/counts/coverage from `buildTodayWorkspace`.
* Calendar brief, dated activity and linked conversation reports from
  `buildCalendarWorkspace` (no mailbox fetch).
* Deal stages, value tiers/ranges, buyer matches/ceilings/room and next steps
  from `reviewed-deals.list/evaluate` and `jv-workflow.view` unchanged.
* Buyer identity/criteria/approval from `assistant-finds.listFinds`, never
  labeled a confirmed purchase or proof of funds. Structured phone/email fields
  are omitted; reported text can still contain private details and stays in
  the authenticated dashboard, never a provider, query log or aggregate report.

Projection caps:100 deals (canonical list),250 buyers,100 actions,250 events,
250 linked conversation reports and50 matches per deal, all with explicit
totals. Missing/duplicate/ambiguous references are not guessed. Unsigned JV
street address, holder contact and source URL are not projected. Comps are
not copied or re-verified; canonical tier/count/value are presentation only.
First-seen uses a valid non-future stored RFC3339 instant in the existing
dashboard time zone; a refreshed captured_at cannot stand in for it.

The browser's fixed command model supports waiting work, first-recorded-today
deals, yesterday's recorded work, an exact reference/unique recorded name,
and matching buyers for a deal. Unsupported instructions (including sends
or approvals) stay unsupported. Queries never go into a URL, server request,
log, provider or localStorage. A fresh snapshot is requested only on explicit
open/reload; no polling or browsing on load. Close/auth loss aborts pending
reads and removes private context; late responses cannot repaint it.

## UI And Voice

An admin-only Ask button appears on every page. Native dialog has X/Escape,
fixed header, scrolling content and a context column on desktop/stacked on
phone. Feed incomplete and read-only are always visible. Canonical stages
are labeled recorded/not recorded. No offer is invented. Snapshot uses
human time. Existing deal/buyer workspace and Calendar navigation are reused.
The existing on-device-only EN/ES voice controller attaches to the query
field. Nothing starts automatically; no pack/provider/cloud fallback. Ask
remains a separate tap. There is no Send or Approve action in this demo.

## Evidence And Release Gate

New tests: ask-workspace and ask-demo-ui. Unit/route/purity negatives cover
future/invalid/missing first-seen, capture-date substitution, wrong-origin
data, ambiguous/unknown references, unsupported commands, canonical match
identity, caps versus totals, admin401, generic503/no error-content leak,
immutable input and zero network/clock/writes. Real full dashboard fixture
tests1366/400/412 cover all demo controls, record/Calendar navigation,
voice presence without real audio, no-load fetch, no query request, X/Esc,
auth-late-response cleanup, bounds/44px and zero writes/external/errors.
Existing assertions changed: none. Voice tests are unchanged. The Calendar
driver includes the same <=3s native-dialog detachment waits already proven
in PR394 (f5559cd); all zero-node assertions remain identical. That pending
PR is not a dependency, and no Calendar product code is copied or changed.

Screenshots in `docs/screens/2026-10-19-372-demo/` are synthetic local
data, not production proof. Full hosted suite required on the draft head.
No merge/deploy until the live browser control gate is restored; finish
PR391's pending live proof. New owner order prioritizes396,395,profit and375
before this demo; it stays parked rather than leapfrogging them. This independent
branch starts from main, not the unreleased Profile branch; rebase/retest
when main advances. Do not treat green CI as live verification.

## Initial Full-Suite Failure And Fix

Hosted39338143349 at753552e:217 passed,1 failed,0 skipped of218.
The unchanged desk-shell test's normal Open Lead click was intercepted by
the floating Ask launcher. This was a real product overlap, not a test
timing problem. Move the launcher into the existing header flow and reserve
its44px phone grid track. No forced click, hidden overlay or weakened
existing assertion. New demo geometry checks verify the launcher belongs
to the header, stays44px/in-bounds and overlaps no other header control.
The unchanged desk-shell and strengthened demo UI tests pass locally;
synthetic1366/400/412 screenshots regenerated. Final full suite required.
