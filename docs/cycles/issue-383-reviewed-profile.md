# Reviewed Operator Profile (366I / 383)

## Boundary

D-059 authorizes storage and canonical unsigned JV, template and buyer email
draft consumers only. The existing legacy contract-fill route is unchanged
and is not a profile consumer. Its separate repair is #392. A typed or image
signature is draft presentation, never signature evidence or a JV gate.
No bank/wire data is accepted. No deposit amount is calculated; required
deposits stay blank for review or buyer-funded at assignment, not Gabriel-funded.

## Writer And Reader Trace

* `operator_profile_history`: only the new admin POST writes reviewed versions,
  scoped to `req.currentUser.id`, using the existing strict private-store read
  and write. Prior entries and unrelated collections remain intact. The GET
  reads the current operator only, `no-store`. No list/export/aggregate route
  is added. Validation errors never echo values. The existing private database
  persistence/backup policy remains unchanged; no new provider receives data.
* `legal_name`, optional `llc`, `email`, `phone`, `mailing_address`,
  `typed_signature`, `signature_image`: explicit Settings input only. No
  inferred/default identity and no assistant import. Text/contact/length checks;
  image limited to canonical PNG/JPEG data with magic bytes and 64 KB decoded cap.
  No SVG or remote URL. Every write requires review and the prior version.
* `draft`: read-only validated profile for the current operator. Future/corrupt
  latest history fails closed, not fallback to an older profile. Missing profile
  preserves blank JV identity and the original buyer-email version/body.
* `reviewed-deals.jvDraft`: optional legal identity/contact and unsigned typed
  sign-off. Existing property, fee split, expiration and signature/authority
  gates remain canonical. Profile validation precedes the POST's activity write.
* `buyer-messages.prepare`: optional operator sign-off; preview, saved draft and
  explicit send re-derive it. Profile version participates in a profiled draft's
  digest; changed profile rejects a stale send before writes or sender calls.
  Recipients, deal selection, teaser restrictions and approval gates unchanged.
* `template-approvals`: raw stored templates/digests/review history unchanged.
  GET adds derived previews for a small known token set only. UI offers field
  insertion and a saved-template preview; no automatic template save or send.
* UI: Settings render replaces only the old Company Info block using DOM parsing.
  Security, Drive, Email and other settings remain. Private caches and pending
  responses clear on sign-out/login display. No persistent browser storage.
  Cache URLs: Profile JS/CSS1, template JS2.

## Evidence

New tests: `operator-profile.test.js`, `operator-profile-ui.test.js`.
Negative cases include forged actor/fields, bank field, review missing, stale
version, future/corrupt history, injected email header/HTML, remote/SVG/bad magic/
oversize image, wrong operator, no-profile compatibility, changed-profile send,
JV failure before write, and late GET after logout. Pure functions are spied for
network/clock/writes. Actual UI fixture checks 1366/400/412, 44px controls,
no horizontal overflow, image draft-only behavior, insertion/save/preview,
and no external request/console errors. Existing assertions changed: none.

Screenshots in `docs/screens/2026-10-19-366-i/` are **synthetic local evidence**,
not live production proof. No real profile, email, contract, signature or source
record was saved. Full suite and exact PR head are recorded in the PR once run.

## Release Gate

Do not merge this draft until Chrome control permits the outstanding live UI
verification. Prior PR391 exact Railway deploy succeeded and health was200;
browser operations still time out before dispatch, despite the owner reconnect
reply. No speculative product rollback or new Railway deployment was performed.
After release, only read Settings/Profile, template preview and normal hydrated
lead navigation at1366/400/412; never save a real profile or send/generate/sign a
contract as verification. Profile storage is usable only after the owner enters
and reviews their actual details.
