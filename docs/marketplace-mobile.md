# Marketplace and Android usability (#294)

The 2026-10-08 design update supersedes Night desk as the default. The default
uses the exact approved light tokens and Inter 400/600 with a system fallback.
The two legacy dark injectors, including the repeating inline-color writer,
return only when the new static marketplace marker is present. Older standalone
fixtures can still exercise the legacy mode. No backend or stored data changes.

Header: workspace shortcuts on desktop; navigation, title and a full-width
search on phone. Existing Guide, Ask AI, Add Lead, notifications and Sign out
move to the navigation area without changing their handlers. Existing search
identity/results and signed-session requirements remain unchanged. Sidebar
items gain keyboard activation; the existing menu open/close behavior remains.

Theme reads presentation attributes only. It normalizes legacy inline colors
and small type into the shared tokens and stacks fixed-column forms on phone.
No fetch, field-value write, browser storage, ingestion, capture, confirmation,
approval, outreach or provider enablement is added by this module.

Today/JV: 3/2/1 card grid, labeled neutral photo area, asking/bid, property facts,
value tier, buyer max and calculated gross room. Unknown inputs stay unknown.
Room is before fees/JV split, not equity, profit or an offer input. One primary
Open deal command opens the retained details, comps, buyer reasons, checks and
timeline. Back restores the prior result view. Phone footer commands only copy
the existing draft, open the source, or scroll to the existing review controls.
Nothing sends or records a workflow outcome without the existing explicit action.
An unsigned JV card does not display its subject street address. Reference-only
email subjects remain visible; their server writer contains no property address.

Filters use existing state/county/city criteria plus client-side price, bedrooms,
stored deal kind and evaluated verdict. Missing facts cannot satisfy a selected
numeric filter. No unsupported Section 8/creative tag or buyer grade is inferred;
#299/#262 supply those policies and metadata. No photo intake field is added.

44px target checks use the actual hit area (label for wrapped checkboxes).
Standalone checkboxes are 44px; wrapped checkboxes remain visually 24px inside
a >=44px label. Body/controls use 15px desktop and 16px phone; captions >=12px.
The approved warning text/background pair is below AA, so ink is used for that
chip's text with the unchanged amber tokens. Other token text pairs pass AA.
Text-only tooltips cannot intercept clicks on underlying actions.

Trace: HTML marker, font/CSS/script asset references; old theme injectors read
the marker; marketplace CSS/JS own appearance, header layout and view affordances.
Today/JV reads existing reviewed-deal/evaluation fields and emits the same action
data attributes. Activity, buyer cards, source desk and modal forms share tokens.
No field writer, backend resolver, matching rule, auth route or scheduler changes.

Proof: actual dashboard document/assets, read-only local fixtures, ten screens
at 360/393/400/412/1366/1920. Assertions cover real control bounds/hit areas,
seller-answer fields, retired writer isolation, phone search, card navigation,
unsigned-address privacy and unchanged store. Fonts are intercepted with empty
CSS in hermetic proofs; all source/helper networks and writes remain blocked.
Older UI proof now opens search/card controls explicitly and checks the approved
light colors; comp, buyer, history, privacy and no-write assertions are retained.

Remaining scope: iPhone/WebKit, remembered dark toggle, source-photo intake,
buyer legitimacy grading, full legacy mobile coverage outside these screens.
Do not claim these delivered, or claim new deals/comps/contact readiness.
