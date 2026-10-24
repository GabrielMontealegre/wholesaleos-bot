# Approved Live Proof: PR431 And PR422

Architect decision: issue435 comment6388258726 (2026-10-24).
This proof follows that approved contract; it does not claim Chrome resized.

## Exact Source

Railway deployment a00779c6-f5c4-49e7-916f-cb7bc02cca43 Details was observed
Active / Deployment successful, with the GitHub source link pointing to
9f4caafe2fd82f858b2e125f27d62bdfe69b6e22. Health is200. No build was triggered.

## Public Live Screens

Pinned Playwright1.44.0 and cached Chromium1117 opened the deployed root,
classic dashboard and native Email URL with fresh unauthenticated contexts.
All9 checks returned200 at true1366x768,400x915 and412x915, recorded in
filenames and public/public-live-proof.json. Health200 and signed-out session
were checked at each size. Non-GET and off-origin requests were blocked;
no automatic write attempt occurred. No cookies or credentials were copied.
Screens show the real deployed login boundary, not synthetic signed-in data.

## Signed-In Chrome

Existing browser session, fresh responding tab, actual DOM and screenshot
894x577. Root/classic Home hydrated; Deals rendered; explicit More tools
Email workspace opened native Email,30 rows and a full6318-character message
body. The labeled Deals link opened classic Deals; browser Back returned
to native Email. No draft was typed or sent and no evidence was confirmed.
The signed-admin GET reply status remained enabled=false,configured=true,
automatic_send_allowed=false,max_per_hour=30. Screenshots are labeled with
both true DOM and image sizes; private card/mail regions were fully masked
in memory before saving. Hidden message content is not independently proven
by a redacted screenshot; the live interactions and synthetic tests supply
that separate evidence. No raw private screenshot was saved.

## Exact-Source Synthetic Journey

On clean detached9f4caaf, the existing workspace-navigation-journey.test.js
exported prove function passed1366/400/412 using pinned Playwright1.44.0.
It covers actual classic Home/Deals, explicit Email entry, native reader,
Deals/Back, exact record identity, locked/non-admin negatives and zero writes,
external requests or errors. Existing synthetic images are in
docs/screens/429/journey. These remain synthetic, not live phone screenshots.

Gabriel's phone screenshot is not received; architect435 makes it non-blocking.
This satisfies431/422's technical live gate, not owner approval of the upcoming
compact Email427 or a later native Deals design.
