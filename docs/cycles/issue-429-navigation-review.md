# Navigation Review and Acceptance Follow-Up

PR431 is the selected narrow implementation. PR430 remains a draft alternate;
its iframe, CSP and routing changes are not included here.

## Trace

- Browser home: server.js registers registerAppHome from workspace-preview.js.
  Browser requests redirect to classic /dashboard/; API clients retain JSON.
  Both representations have Vary: Accept and Cache-Control: no-store.
- Native/classic link targets: navigation.js owns the allowlisted targets.
  app.js renders explicit classic labels; existing record priority and admin
  guards remain unchanged. No dynamic or external target is accepted.
- Classic-to-native entry: wos-desk-shell.js creates one fixed same-origin
  Email workspace link inside More tools during its existing once-only install.
  It is separate from the original classic Gmail handler. Its exact href is
  compared with navigation.navHref('email') by the journey test.
- Presentation: existing wos-desk-shell.css supplies the entry's44px target
  using shared tokens. index.html bumps only the affected shell cache versions.
  No new stylesheet layer, storage key, business field or API is introduced.

## Evidence

workspace-navigation-journey.test.js uses the actual classic dashboard fixture,
not a stub classic destination. At1366x768,400x915 and412x915 it clicks Home,
Deals, More tools, Email workspace, a synthetic message, Deals - classic view,
then browser Back. Exact record WOS-FL-1040 opens the fixture-lead modal even
when a competing workspace=deals is supplied. Locked and non-admin native
entries do not read mailbox data. External requests and all writes are blocked;
the synthetic fixture is unchanged. The entry remains unique and visible
without scrolling the tools list. Screens are under docs/screens/429/journey.

workspace-preview.test.js covers strict/forged keys, record priority, deferred
admin bridge, JSON/browser home and cache headers. Existing desk-shell.test.js
passes every classic navigation control, theme and account behavior unchanged.
No existing assertion was modified by this acceptance follow-up. New proof
asserts record identity/modal rather than incidental restored background page.

The original Claude product's full hosted suite passed240/0/0. That evidence
does not gate this follow-up: its final-head hosted full suite is required
before merge and is recorded on PR431. Screenshots are SYNTHETIC, not live
release verification, owner approval or a claim of actual mailbox access.

## Release Boundary

D-062 permits a full-suite-green, self-reviewed non-sensitive merge while Hobby
builds are unavailable, marked MERGED - deploy pending. Only422 currently
occupies a slot;431 would be the second,427 the third. Send/call/auth/credential
and migration items remain unmerged until individually deployable/verifiable.
No Railway settings/variables or credentials are changed. Exact-source deploy
and live1366/400/412 checks remain mandatory after provider recovery. Keep429
open until those live checks pass. No capture, send, batch, contact action,
evidence confirmation or business-data write occurred.
