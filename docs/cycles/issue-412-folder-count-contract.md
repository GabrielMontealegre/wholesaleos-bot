# D-063 B: Active-Folder Message Snapshots

Candidate implementation on the existing local branch from verified3d41e6d.
No release or live count claim until the final-head full gate and exact-source
deployment proof. The former pure-only checkpoint is historical,not current.

## Writer / Reader Trace

- Existing FOLDERS remains the only mailbox registry. createMailboxReader.list
  now returns the exact selected path/UIDVALIDITY or resolved Gmail label ID
  as folder_scope. It makes no extra requests for this metadata.
- folderSummary is a separate explicit read:one optional summary in flight,
  active IMAP<2 admission reserves an interactive slot under the existing cap3.
  IMAP gets a readOnly lock and explicit STATUS messages/unseen/UIDVALIDITY;
  never SELECT.unseen. Gmail resolves an existing label and gets its message
  counts,with retry:false,timeout and AbortSignal. No body reads or fanout.
- A fixed12-second whole-operation deadline closes the count-only IMAP client
  or aborts OAuth. Stage checks refuse new commands after late completions.
  Cleanup releases the counter/lock. No logout wait can extend this deadline.
- GET /api/gmail/folder-summary uses the same requireAdmin middleware,no-store,
  exact allowlisted folder query and sanitized failures. No new auth/send/write
  surface. Metadata advertises actual method availability;old injected readers
  return false. Only successful capable metadata starts one native count GET.
- Native layout validates provider/path/UID/folder/message scope,own fields,
  integer consistency,capture time after load/nonfuture/under60seconds. Unknown
  counts remain absent;confirmed0 is0. Snapshot status is explicitly messages;
  the loaded grouped-conversation denominator remains untouched.
- The async result updates only its dedicated text span. It cannot call paint,
  replace the reader/composer,reset drafts,rebind a review or mutate outcomes.
  Folder tickets discard obsolete results;refresh/session destruction clears
  snapshot and expiry timer. A local60-second expiry only clears text;it does
  not call a provider or automatically retry. Current global401 locking stays
  authoritative,including late responses;no auth guard was weakened.
- Other readers:thread-view annotation,body/snippet/attachment contracts,
  D061 digest/reply transport,persistent records and classic UI are unchanged.
  Cache layoutmodelv4/Emailv13;all other asset versions remain unchanged.

## Tests / Assertion Changes

New pure projection/provider/route and1366/400/412 native tests cover real0,
unknown unread,path/UID/label/date/type/count refusal,SELECT sequence refusal,
constructor/timeout cleanup and late-stage refusal,one-request concurrency,
reserved interactive reads,401/403/429 no retries,guard/no-store,old readers,
immediate metadata hydration,no extra body reads,late counts preserving the
exact synthetic composer DOM/draft,obsolete-folder snapshots,late401 clearing
drafts and separate message-vs-conversation counts. Providers are fixtures;
no production draft or write is used. Existing assertions are retained.

Two new test authoring corrections were required:desktop folders use the
visible rail while phones use the drawer;the existing global auth guard must
lock on401,not ignore an obsolete response. No product auth change was made.
One restricted-shell localhost test failed transport,then passed with approved
localhost access. This is not a product failure or a full-suite green claim.

The existing reply test retains every assertion and adds delayed snapshots
after a checked review and an uncertain synthetic send;both retain the exact
form node and terminal state,with no additional send. Local count expiry is
explicitly invoked in the synthetic test and makes no request. The new route's
middleware is exercised over localhost:unsigned identity-only401,nonadmin403,
admin200/no-store. Constructor failures and OAuth cancellation release slots.

Candidate UI proof uses exact live3d41e6d as its baseline. Pinned1.44.0/
Chromium1117 synthetic1366/400/412 paint49.8/46.2/41.9ms,reading heights
645/740/740 and Lighthouse13.5.0 accessibility98/98. Zero fixture writes,
external requests or console errors. These are SYNTHETIC,not live timings.
Safe screenshots/report:docs/screens/2026-10-25-folder-snapshots.

## Review Corrections Before Merge

PR448 automated review found two valid issues in initialf943f2a;neither head
was merged/deployed. Upstream Gmail401/403 is now a sanitized non-session503,
so optional provider permission failure cannot clear a valid app session/draft.
Actual requireAdmin401/403 still locks normally;429 stops without retry.

The installed OAuth2Client refresh transport does not inherit API options and
normally enables token retries. The summary-only auth instance now wraps that
transport with the same AbortSignal/deadline/retry:false and stage checks.
Provider auth/rate errors become terminal sanitized errors before OAuth's
auth-error retry logic. No credentials/scopes/settings or other OAuth readers
change. A REAL installed OAuth2Client with synthetic transport proves token
and label calls share policy;401/403/429 never refresh/retry,and a deliberately
late token completion cannot dispatch a label request after expiry. Native
three-size provider503 retains the exact draft while genuine session401 clears
it. The final modified head needs its own full gate;old green is not reused.

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

## Ordered Acceptance / Remaining Release Gates

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
