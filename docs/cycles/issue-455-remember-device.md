# Issue455 - Remember This Device

## Scope And Trace

First455 slice only: opt-in30day persistent device cookie and own-device
revocation from Settings. No PIN-screen consolidation/nav/date/card changes.
Current45da4ac sessionCookie already uses HttpOnly/Secure/SameSite=Strict and
Max-Age14days. Do not claim the owner's close-window observation reproduced
without evidence. Trace:dashboard-session issue/verify/cookie;server
setDashboardSessionCookie/dashboardIdentity/auth-session/PIN-login/logout and
email-login;dashboard-pairing readers;classiccheckPin/nativeunlock and shared
wos-dashboard-auth client;Settings wrapper;actualsession/APIprivacy fixtures.

Remembered tokens will use version2: old45da4ac verifier rejects them,so rollback
cannot silently bypass new device revocation. Default verifier must also reject
version2 unless invoked by the device-bound verifier. Fixed30day expiry,never
renew beyond that deadline. Existing version1/agent session semantics retained;
explicit unchecked new PIN login is a browser-session cookie with existing
server lifetime,tracked for renewal without turning it persistent later.

New private ledger stores only token hashes,owner,public revocation identity and
server dates/revocation,not raw cookies/PINs/UA/fingerprints. Strict immutable
append/revoke and fail-closed corrupt/missing/down store. Current user eligibility
always from server users,not a stale role in token. Own-device list/revoke uses
existing signed-session authorization and same-origin/action guards. No public
exception,credential/general-auth rewrite,secret/settings changes or real logins.

Complete actual outward-reader/telemetry/canonical-writer preservation audit
BEFORE production registration/persistence. Synthetic-only expiry/forgery/other
actor/revocation/logout/restart/browser-reopen/rollback and storage failures;
three-size PIN/Settings UI and current-source full600s-file/negative/selfreview/
green merge/main/exactautomaticdeploy/approved435 GET-only proof required.
Never type a REALPIN/create a REALremembered credential/revoke a REALdevice as
verification. Owner463GitHubprotection Notyet,already acknowledged/no repeat ask.
454 firstrealkey/upload/routine pending owner,not a whole-backlog gate;456deferred.

## Local Candidate Checkpoint

The candidate now registers actual signed-user device metadata/revocation and
30day opt-in PIN issuance. PR466 is DRAFT/unmerged/undeployed. Production remains
45da4ac. No real PIN/key/cookie/device/settings action was used.

Seven-field remembered_devices records contain id/source_kind/user_id/
token_sha256/created_at/expires_at/revoked_at only. The token digest also binds
current canonical PIN/password/role/creation state using the existing signing
secret;the binding itself is not persisted. Credential/role/admin-PIN changes
invalidate remembered cookies without rewriting credential handlers. Removed
users fail closed. All reads use the current user and strict private history.
No device identity from generic request fields is trusted.

Actor+client login UUID derives a separate deterministic version4 nonce/domain.
Transparent replay reconstructs the same signed cookie from original issue time,
does not append or extend expiry,and conflicts after revocation/expiry/credential
change. This is not assistant upload SHA identity;those paths are unchanged.
Logout revokes remembered tokens before success and reports write uncertainty.
Settings lists only the caller's metadata,never hashes/cookies/user IDs;own
revocation has zero-body/same-origin/action guards and all responses no-store.

Actual temp-server ten outward-read sentinels,canonical-writer preservation,
redacted server logs and telemetry sanitizer tests PASS;original key/snapshot
assertions retained. This is a bounded collection audit,not whole-app assurance.
The private backup exclusion already shipped465;no private backups inspected.
O(history) strict validation/JSON I/O remains a known cost;no truncation/cache.

Focused current-source tests PASS:pure contract,controller fixture,real PIN/
session/devices/restart/expiry/forgery/own scope/logout/atomic write rejection,
cycle29/31,actual247-registration API gate,telemetry and existing key Settings.
Pinned1.44/Chromium1117 synthetic browser profile proves close/reopen persistence,
both PIN screens at1366/400/412 plus1038x503,own/current/other revocation,session
loss/late navigation clearing and preservation of a distinct open synthetic key
dialog. Zero external/unrelated writes;existing loopback helper status is stubbed
as in prior UI tests,never contacted. Production GET-only proof is still pending.

UI adds only an unchecked opt-in checkbox and an unframed Settings device list.
No one-login/navigation/card/date scope bundled. PIN duplicate-submit guard
prevents automatic-four-digit plus OK creating distinct credentials. The shared
auth client reports uncertain logout rather than claiming server revocation.
Session-ended event clears the existing transient key dialog without resetting
other Settings state. Native design-system CSS13/app9/auth3/key-settings2;
classic-only device CSS/JS1;Email12/layout3/components6/assistantmodel2/sheet3
unchanged. Root legacy HTML
gets only the shared auth3 cache tag. Cycle29's literal cache2 assertion becomes
cache3;identity/header assertions retained and option/uncertain-logout added.

Visual inspection caught low contrast in the first synthetic screenshots;the
scoped styles now use existing dark/light tokens and explicit white-PIN text.
Serialized before/after audit now PASSES against45da4ac. Corrected candidate FCP
at1366/400/412:classic PIN219.6/236/284.5ms,native188.2/65.7/120.8ms,
Settings237.7/201.2/218.1ms. Lighthouse13.5 desktop/412 performance100/100
for all three;accessibility91/91 classic,100/100 native,98/98 Settings. All audit
runtime-error fields null/error arrays empty;no overflow. Synthetic NOT live.
Initial low-contrast functional screenshots remain locally retained as prior
evidence,not relabeled final. Final masked audit/screens are in
docs/screens/2026-10-27-remember-device-candidate. Full271-file suite/release
still pending for the corrected source. Initial full40600660469/job122527652316
at8861a5d completed269/2/0 with all271 timings retained,600s/file,job15m10s,
sum852.30s NOTwall. All four new tests passed;the failures were the unchanged
workspace-shell and Today tests' exact single-design-system stylesheet guards.
This caught real cross-surface CSS coupling,not a flaky/environment failure.
The first correction removes the extra native stylesheet,uses existing ws-check,
excludes checkboxes from generic login text-input sizing,and bumps CSS13.
Both failing tests and the actual signed-server UI journey now PASS locally
with original assertions UNCHANGED. Corrected native-only serialized before/
after audit FCP34.9/32.6/34.3ms at1366/400/412,performance100/100 andaccess100/100,
null runtime errors/empty audit-error arrays/no overflow,synthetic NOTlive.
Other changed screens' runtime styles are unaffected by this correction;
initial all-screen audit remains historical alongside final native audit in
docs/screens/2026-10-27-remember-device-native-final. A new full271 gate is
required,not reuse of failed8861. Restricted startup and virtual-host redirect
harness issues were isolated;canonical slash URL and cancellation-safe routing
corrected the fixture,not production auth. No real owner close-window cause
has been established. No credential/lock/dependency/settings changes or hidden
automation. Owner463 response remains Not yet;no repeated question.
