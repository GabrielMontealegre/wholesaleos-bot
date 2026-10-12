# Help on the label

Help is a short dark tooltip on a label, counter or control rather than another
question-mark button. Mouse hover and keyboard focus show it; Escape hides it.
On a phone, a held touch shows the explanation and consumes its action click.
Normal taps retain their existing behavior. A cancelled hold or replaced DOM
control cannot turn that old gesture into an action or a review confirmation.
The full Glossary stays available. Existing disabled states and native titles
(including current helper-status instructions) are preserved.

## Trace

- glossary.json is the existing informational vocabulary, never evidence or a
  gate. JV status wording now matches D-048 canonical recorded steps; Keep/Park/
  Archive explicitly distinguish proposals, workflow and retained history.
- wosHelp is consumed by Today's Deals/JV markup. It now supplies hidden semantic
  anchors, not buttons. Existing ARIA descriptions are retained. The decorator
  binds the existing labels/controls; person/property-name headings are excluded
  from automatic term guessing. Mid-name matches such as Nick Price no longer
  acquire a buyer-price definition.
- The same local glossary GET is used. Malformed/prototype payloads fail closed.
  Text is escaped/textContent; titles are read at display time, never overwritten.
- A shared tooltip is presentation only. Focus remains authoritative until real
  pointer movement; focus-induced scrolling repositions it rather than hiding it.
  Touch timers show help only. Capture-phase cancellation consumes the gesture's
  click before native form/checkbox/click actions. No input values are inferred,
  field values written, server routes added or product stores mutated.
- Existing action writers remain native click/submit handlers in their original
  modules. The fixture proves ordinary explicit clicks still reach a local action,
  while long/cancelled/stale-target clicks and review-checkbox activation do not.

## Tests and assertion changes

New real full-index proof at1366/400/412: zero question buttons, fitted dark
tooltip, focus/hover/Escape/scroll, unknown prototype terms, normal action,
movement cancellation, cancelled/stale-DOM holds, unticked review checkbox,
escaped title and unchanged disabled state; zero product writes/external calls.
The two positive POSTs go only to a synthetic fixture counter, not a product route.

Existing assertions intentionally changed in verify-todays-deals-ui.js:28/32
wait/focus on the ARV label instead of Explain ARV button;34 tests Escape hide,
hover show and zero question buttons instead of click/aria-expanded toggling.
Original ARIA, comp count/value, introduction lock, glossary, overflow, privacy,
store-preservation, no-write and external-call assertions are retained.
Focused proof caught hover overriding keyboard focus and scroll hiding its
explanation; both were corrected and pinned, not asserted away.

Screenshots are synthetic, under2026-10-12-hover-help and todays-deals-local.
This does not complete #325's clocks or email/buyer/JV layouts. Send remains #288.
