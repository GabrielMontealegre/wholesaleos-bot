# 455.7 Mobile Navigation

## Boundary And Trace

Based on verified main ccc48ef. Owner455.7 requests a full-height drawer at
400/412px that closes on outside tap. Dates471 and fixture identity472 remain
blocked; native Deals and deferred456 are not included.

- app.js shell creates mobile-nav with existing component drawer, fills fixed
  navigation links, binds existing close/focus lifecycle, and closes it before
  opening More. clearPrivate closes all dialogs and removes private surfaces.
- components.js drawer/bindDialog provide native modal, X, Escape and opener
  restoration. They are unchanged; Account/More/Record keep their sizing.
- design-system.css owns the one shared stylesheet and720px breakpoint. Only
  mobile-nav gets a left-edge full-dynamic-viewport surface with48px outside
  tap strip. Compact navigation rows remain44px, not stretched across the view.
- navigation.js owns fixed Today/Email and seven classic tool URLs. Unchanged.
- No API/auth/provider/storage/clock/data writer or new private field.

## Tests And Review

New synthetic test: Today and Email at400x915/412x915/400x503, exact full-height
geometry, compact44-52px controls, outside-vs-inside clicks, X, Escape, keyboard
wrap/focus return, one More modal/exact7tools, original synthetic source text,
no additional reads,401 clears menu, no mutations/external requests/errors.
Existing More/shell/navigation/mailbox-five-size/Today files pass unchanged.
No existing assertions changed. Initial visual inspection caught stretched
grid rows; scoped align-content repair and upper-bound assertion correct it.
Initial screenshots retained separately, not final visual proof.

Owned473 final/release documentation commits deliberately carried from the
closed branch; no unrelated changes or product code copied from other work.
Final serialized synthetic audit against ccc48ef passes at1366/400/412:
TodayFCP35.9/32.5/33.4ms,Email34.8/37.4/33.1ms;LH13.5 performance99/96,
accessibility100/100 both screens; null runtime/empty audit errors/no overflow.
Initial audit content masks obscured drawer visuals, so12 supplemental exact-
source screenshots were captured without content masking (synthetic only),
without rerunning full suites or Lighthouse. All30 final synthetic images were
inspected; initial stretched layout remains historical. NOTlive speed.
Self-review: current main base, bounded CSS15/app13 only, no changed existing
assertions, no storage/API/role/provider/clock changes; fixed routes intact.
Full suite and exact automatic live release remain pending.
No production private capture, text read, credential or business action allowed.
