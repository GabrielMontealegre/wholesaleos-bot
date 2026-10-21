Item: #415 / D-061 phase2 -- exact reviewed reply composer

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
