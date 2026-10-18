Item: #366 J - truthful Google Drive connection status

Settings and Google Drive now share the same read-only connection panel.
It distinguishes Connected, Not connected and Error, names each missing
server variable separately, and translates recognized Google errors without
returning tokens, account details or raw request messages. Unknown403 is
not guessed to be a missing scope. Connected does not imply file sync.
The old inferred file counts and automatic-sync claims are no longer rendered.
The owner can open the connection guide; no access is granted automatically.

Writer/reader trace: GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET/GDRIVE_REFRESH_TOKEN
are read by existing getDriveClient; only private server variables write them.
Existing backup and contract-upload clients/writers stay unchanged. Previous
GET /api/drive/status returned one generic missing-token message or raw provider
error/user email. Its narrow registration now uses requireAdmin plus no-store,
one about.user(permissionId) read with8s timeout/retry:false, and safe result
codes. No file listing/upload, clock, credential write or automatic polling.
Google error and OAuth references were checked2026-10-18:
https://developers.google.com/workspace/drive/api/guides/handle-errors
https://developers.google.com/identity/protocols/oauth2/web-server#offline

Both duplicate legacy renderDrive definitions remain as historical inline
code; the final external renderer overrides them, as other dashboard slices
do. All renderSettings wrappers are preserved; its new status is prepended.
Old connection stub is replaced with opening the inline owner guide. Shared
status projection clears on navigation/signout and ignores stale responses.
Client ignores unknown reason/message/account payloads; only local allowlisted
copy and expected variable names render. No account email is exposed.

Tests added: unit/config/provider classification/purity/error redaction,
stale response after signout; admin/no-store route test; actual full dashboard
Settings+Drive1366/400/412, connected vs backup truth, error403, owner guide,
44px controls/no overflow and zero writes/external calls. Existing real-server
auth suite adds401 unauth/helper,403regular,200admin/no-store proof.
Existing assertions changed: none. Test child environment explicitly blanks
the three Drive variables so the added real-server check never calls Google.
No new dependency; comp/value/readiness/provenance/JV/auth modules unchanged.

ASSUMED logged: connection success is authorization only; privacy outranks raw
error disclosure. Generic reasons stay honest when Google provides no safe
detail. Known global generic help tooltip remains outside this slice.
Setup instructions describe the existing app's Drive grant; no OAuth flow,
new scope, secret/settings change or production backup is performed.

Self-review: smallest additive status adapter and late renderer, no backend
rewrite. No stored lead/buyer/deal change. Local focused checks green. Full
210-file hosted suite600s/file, exact deploy and read-only1366/400/412 proof
required before DONE. H release proof rides this PR to avoid docs-only deploy.
I boundary remains BLOCKED#383; C feed gap BLOCKED#379; no#341 sign-off inferred.

![Desktop](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-j-drive-status/docs/screens/2026-10-18-366-j/synthetic-drive-1366.png)
![Phone](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-j-drive-status/docs/screens/2026-10-18-366-j/synthetic-drive-400.png)
![Android](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-j-drive-status/docs/screens/2026-10-18-366-j/synthetic-drive-412.png)
