Item: #415 / D-061 phase2 -- exact reviewed reply composer

## Current Ordered Reconciliation (2026-10-24)

Prior427/425 technical release gates now complete on main5b8b89e. Merge
this existing424 branch with that source, preserving compact Email/body
request ownership and Today/navigation behavior. Keep componentsv4 (Cc plus
amber tone),navigationv2,email-replyv1,Emailv6,today-modelv1,app/CSSv6.
The proof-script conflict retains BOTH WOS_EMAIL_PROOF_DIR and --reply;
all density/send/context/security assertions remain. Docs retain historical
evidence and add current release status;435 is answered/closed,not blocked.
Reply before-images now use exact last-live5b8b89e instead of old422 so
the comparison does not misattribute already-released Email density to424.
No writer/send/auth/policy changes while resolving the merge. Previous1248de7
243/0/0 is historical; this actual ordered source needs its own full gate,
before/after screenshots/accessibility and exact live default-OFF checks.
No production Preview/Send,typed draft or flag/secret change is authorized.

Ten focused files pass on the reconciled source: reply context/security,
mailbox participants,preview route,reply composer,Email UI/loading,shell,
Today and actual classic/native navigation. All original assertions retained.
Serialized pinned1.44.0 synthetic --reply before/after at1366/400/412 passes
with no provider/send route: FCP52.1/36/34.5ms,reader573/695/695px,Send fits,
no overflow and Lighthouse13.5.0=98/100. New proof is isolated under
docs/screens/2026-10-24-reply-composer. Those timings are synthetic; real
preview/send remains unauthorized. Full changed-head hosted gate pending.

Screenshot review prompted an additional outcome-text geometry assertion:
the whole reply status, not just Send, must fit the viewport. Serialized
1366/400/412 --reply proof passes this stronger check without a CSS change;
no clipping failure or invented product regression is claimed. The original
Send-fit and zero-write/external assertions remain unchanged.

## Change And Dependency

Bind the existing native Email composer to the independently tested reply
API. No new screen or CSS layer. Backend422 merged as7b36ed2 but its release
is BLOCKED on workspace deploy availability (#423). This PR remains draft
and unmerged until that exact source is deployed and read-only verified.
Native Email already live through421 remains the healthy running version.

No actual send, production preview or business write is authorized. The
new API stays OFF unless the existing explicit enable/kill flags permit it;
no variable is changed. Send remains visible/disabled plus Open in Gmail.

## Writer/Reader Trace

- mailbox-reader/thread-view/thread-reply-policy retain exact source IDs,
  participants and graph; policy produces default To/Cc excluding own mailbox.
- reviewed-thread-replies adds signed-admin, no-store GET/context, reading
  only the selected source messages and current DB role, returning defaults
  without source bodies, own mailbox, writes or inferred identities. Disabled
  status blocks this read too. Existing preview/send gates stay unchanged.
- Both accepted send responses include preview_id/version so the client
  cannot claim success for a different review. SMTP receipt is still truth
  of server acceptance only, never confirmed delivery.
- components adds optional Cc and returns existing binding's sync method;
  default-disabled explicit permission/review/callback rules are unchanged.
- email-screen owns selected IDs/key, local draft Cc and per-thread terminal
  outcomes. It destroys bindings on paint/session loss; the421 metadata/body
  ownership fix is unchanged. No automatic body fetch on list load.
- email-reply owns GET-only explicit Reply availability/defaults, operator
  inputs, explicit preview, read-only exact reviewed fields, Edit invalidation,
  five-minute expiry, checkbox and explicit Send. Nothing sends on Enter,
  render, load, timer or retry. Only the exact preview identity is posted.
  Late responses cannot touch a new thread/session. A35s bounded request
  includes body parsing; uncertainty stays terminal through close/reopen.
- Legacy generic routes remain410, buyer/JV/legal/template/package paths
  and auth/gates/comp/readiness/source routing are untouched. No dependency.

## Tests And Proof

New thread-reply-context.test.js: source-only read, signed-admin boundary,
missing/forged/stale/role-change/default-OFF, no body/own-mailbox exposure,
zero network/send/write. New workspace-email-reply.test.js:1366/400/412,
GET-only open, defaults, explicit additions, exact text, preview/edit/review,
single send click, accepted/unknown terminal states, session clearing;
all providers/responses synthetic. No real mail sent.

Existing assertions changed: none. workspace-email-ui.test.js adds only
a GET/status disabled fixture response so all existing zero-write/read-only
assertions still run unchanged. Full final242-file gate600s/file required.

verify-native-email --reply uses the exact422 native screen as synthetic
baseline and current local code after. A saved synthetic fixture serves
three preview responses, never sends or mutates the fixture DB. Its initial
proof locator targeted collapsed history; fixed to latest expanded message.
Its wait used eval blocked by the existing CSP; replaced with an enabled
locator, not a security-policy relaxation. Final proof succeeds.

Synthetic first paint:1366 46.2ms,400 46.2ms,412 35.2ms; no horizontal
overflow, Send fully visible. Lighthouse13.5.0:98 desktop/100 phone.
Before/after images and JSON: docs/screens/2026-10-21-reply-composer/.
These are synthetic results, not production timing or delivered mail.

## Self-Review / Live Gate

No new state/county behavior, data deletion, credential, auto-send, provider
or package/auth/gate rewrite. Exact source/version checked again server-side;
client controls are not the security boundary. Preview and send remain
explicit signed-admin/CSRF actions. No real message can be used as a test.

After dependency423 resolves and full gate is green: merge commit, exact
deployment, health200, signed GET flags OFF and live1366/400/412 Email/lead
hydration clean console. Do not click Preview or Send, type a draft, hand off
to Gmail, change flags or touch business data during live verification.

## Current-Main Preparation (2026-10-23 UTC)

Integrated main9f4caaf/PR431 into this existing draft branch. The HTML conflict
retains componentsv3, navigationv2, email-replyv1, email-screenv3 and appv3,
plus current shared stylesheetv3. Both D-061 and D-062 decisions are retained.
No context/send/security implementation changed in this reconciliation.

Focused source-context, reply-security, mailbox-participant, preview-route,
composer, Email UI/loading, native-shell and actual classic/native journey
tests pass together. Refreshed --reply synthetic proof uses local stubbed
GET/context and POST/preview only, with NO send route or real provider. Existing
fixture data remains unchanged. FCP46.5/57.7/51.1ms at1366/400/412; Send fits,
no horizontal overflow, Lighthouse13.5.0 accessibility98desktop/100phone.
These are synthetic screenshots, not a production send or live acceptance.

Updated final-head full hosted suite is required before eligibility; historical
242/0/0 is not substituted. Keep424 DRAFT/unmerged:427 then425 precede it in
the latest order, and deployed422/431 still lacks required exact-size live
proof under tooling issue435. Default-off kill switch, explicit reviewed
version, idempotency, uncertain/no-retry and existing legal/package gates stay
unchanged. No new credential/setting, business write or outreach authorization.
