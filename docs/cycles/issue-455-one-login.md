# Issue455 Item2 - One PIN Screen

LOCAL candidate,not released. Base38ea175 is verified466;only owned proof
commits carried.455item1 stays live;456 remains deferred.

Trace:server registerAppHome/registerWorkspacePreview -> workspace-preview
APP_HOME/browser Accept redirect/JSON status/CSP -> native index/app startup/
locked/signout/401 -> WOSDashboardLogin.mount. Classic restoreDashboardSession/
showDashboardLogin/unlockDashboardUser -> same mount;old white keypad markup,
global numeric key handler and duplicate submit implementation removed. Shared
renderer delegates ONLY to existing WOSDashboardAuth.authenticate and existing
role-specific successful callbacks. Same cookie/session/device ledger and all
server authorization unchanged. Native admin-only boundary remains;classic
signed users retain existing allowed tools/deep links. No new return URL or
open redirect. Legacy preview URLs still work;direct /app serves nativeToday.
Root browser entry now /app;JSON clients keep status/Vary/no-store.

One renderer owns plain dark PIN markup,uncheckedremember/submit/error/late
disposal. No storage/cookie/PIN logging or hidden authentication. Component
destroys private input/pending callbacks before old UI is replaced. Classic
scoped styling in its existing device stylesheet;native retains ONE existing
design-system stylesheet. No stylesheet-count safety assertion is changed.
Cache classic deviceCSS2/newsharedloginJS1/nativeapp10/navigation3;other native/cachekeys
unchanged. Native navigation/classic labels remain455item3,not bundled.
Home's target and text now truthfully point to nativeToday. Signed non-admin
sessions remain blocked from admin data and get a fixed existing classic-tools
link,not a role promotion or automatic new login. Native/old classic unauthorized
status text can differ truthfully;the shared form structure is identical.

Existing assertions intentionally changed under455item2:workspace-preview's
old opt-in/classic-home expectations now require native /app document without
preview and root browser redirect/app;JSON/CSP/classic bridge/admin/exact-record
negatives preserved. Remembered-device UI's old keypad click replaced with
shared password input+Unlock;all persistence/revoke/privacy assertions retained.
New shared-dashboard-login actual LOCAL fixture tests identical markup at
1366/400/412/1038shortdesktop,one signed login reuses exact cookie across both
shells/settings,session-only optout,pendingduplicate/late-response/error escaping,
zero external/unrelated writes. No real PIN/login/device/settings actions.
Shell Home href assertion deliberately changes/dashboard/->/app for455item2;
existing classic nav labels/targets/admin no-read assertions remain unchanged.
Initial new form comparison included contextual error text from the classic
guard;the test now normalizes only that text in a clone and separately verifies
message escaping/late privacy. No security assertion weakened. Scoped classic
shared-login colors override legacy important keypad themes;no global theme edit.

Synthetic candidate audit against verified38ea175:after classicPIN FCP817.5/
126/87.8ms and nativePIN134.7/79.7/35.2ms at1366/400/412. Serialized LH13.5
performance100/100 and accessibility100/100 on both changed PIN screens,all
runtime/audit errors empty,nooverflow. Baseline native phone performance76 is
retained as measured,not called a current-candidate failure or relabeled green.
Screens opaque BEFOREdisk,inspected;NOT live measurements. Original device/
shell/Today/secure-login/key-dialog focused tests PASS. Final Home/non-admin
link changes get a final affected-focused gate before one full272 dispatch.
No backend/session/ledger/dependency/lock change. Rollback to verified466 needs
no schema migration and retains the same issued credentials/revocation checks.
Full272/currenthead/PR/merge/automaticexact/liveGET-only proof still pending.

PR467 first3886ee3 full40660146565/job122720858009 completed271passed/1failed/
0skipped,600s/file,all272 rows retained failed-3886-timings.json. Job12m50s,
sum720.54s NOTwall. Existing workspace-navigation-journey still waited for
classic .desk-settings immediately after root;owner455item2 intentionally opens
nativeToday instead. First correction changes that entry assertion/step to
nativeToday->existing classicDeals. All remaining explicit Email/Back/exact-record/
locked/nonadmin/no-writes/source assertions are retained. Runtime product tree
unchanged;not a flaky/environment/cancel claim and failed gate not reused.
New exact-head full272 still required before merge. No production change.
