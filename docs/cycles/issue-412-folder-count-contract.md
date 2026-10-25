# D-063 B: Folder Count Contract (Local Preparation Only)

No runtime import,provider request,route,UI integration,full-suite eligibility,
PR or release is claimed. Current live447 is untouched. This pure projection
is a tested preparation for a later bounded active-folder count slice.

## Source Evidence Checked2026-10-25

- Installed ImapFlow2.3.0 StatusObject: path,messages,unseen,uidValidity.
  MailboxObject.unseen from SELECT is the sequence number of the FIRST unseen
  message,NOT an unread count. Never use it for folder totals.
  https://imapflow.com/docs/api/imapflow-client/
- Gmail users.labels.get is read-only GET;Label has messagesTotal/messagesUnread
  separately from threadsTotal/threadsUnread. messages.list resultSizeEstimate
  is not an exact count. Never substitute threads/estimates/loaded row lengths.
  https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels/get
  https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels

## Pure Contract

imapStatus binds actual path+UIDVALIDITY to the requested allowlisted folder;
rejects SELECT-shaped exists objects,missing total,stale/wrong UID/path,invalid
clock,count coercion,negative/unsafe/nonfinite totals and unread>total. Gmail
binds the returned exact label ID. Real0 stays0;missing unread stays null. The
DTO carries connected source/origin/scope ID/captured time/message scope. It
does NOT establish a folder allowlist itself:the future reader must use its
existing FOLDERS registry and admin boundary. It has no clock/network/writes.
Inherited fields,arrays disguised as source objects and callback coercion are
also refused. Only explicit own provider fields are evidence. The targeted
pure test passes;no full integrated gate or runtime consumer is claimed.

## Next Wiring / Acceptance

1. Preserve immediate message hydration. A count request must not repaint or
   reset an active reply draft/review/uncertain outcome. Prefer one separately
   bounded signed-admin/no-store active-folder summary GET after successful
   metadata,capability-advertised by the actual route;unsupported fixtures/old
   readers remain unknown rather than making requests to nonexistent APIs.
2. At most ONE bounded source summary per explicit folder load,not all-folder
   fanout,body fetches,schedule or automatic retries. IMAP STATUS must run outside
   an active fetch generator;request explicit messages/unseen/UIDVALIDITY,check
   path/validity. Preserve readOnly locks/logger suppression/concurrency reserve.
   OAuth reads the exact resolved label ID with bounded timeout/no retries.
   Stop401/403/429;source failure withholds counts,not the already-loaded list.
3. Wire a pure native snapshot validator:current folder/provider/source scope,
   captured time/nonfuture/stale safeguards,count consistency and unknown values.
   Label message counts as messages,not displayed grouped conversations. Keep
   the existing loaded-thread range;do NOT claim1-50ofNthreads from message N.
4. Loading,error,obsolete folder/session and expired counts show no stale0 or
   previous-folder value. An async summary updates only its own status text,
   not the reader/composer DOM. Existing request ownership/draft gates remain.
5. Real adapter/route/admin/no-store/unsupported/timeout/rate/error tests plus
   actual3size UI late-count-during-draft/cross-folder/401/count0/unknown cases,
   exact extra-request bound and zero writes. Then full600s/file/self-review/
   exactautoDeployment/approved mixed read-only proof before any merge claim.

Source summary is a timestamped provider snapshot,not current business state,
not a contact/value gate and not pagination. Cursor semantics remain a separate
piece. No secret/settings change or real business write is authorized.
