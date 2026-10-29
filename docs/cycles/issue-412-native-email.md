Item: #412 ordered slice2 -- native read-only Email migration, D-061 OptionB

## Change And Scope

Email uses the released shared shell and the same authoritative design-system
stylesheet at `/app?preview=1&view=email`. Desktop has two sibling scrolling
panes; phone shows list or reader. Folder controls are compact, listing alerts
have their own tab, older messages collapse, and the latest body uses the full
reader height rather than a nested scrollbox. Roles require source/date/link
provenance and use shared role badges. No role or name is guessed from email.

Reply opens a full-width local composer with To/Subject/Send visible. Local
edits survive switching threads/folders only in memory. Leaving warns before
discarding a nonempty unsaved reply; logout/session loss clears it. Send is
visibly unavailable and Open in Gmail remains accessible: this
is the architect's approved interim OptionB, not a fake send or saved Gmail
draft. No reviewed suggestion is invented when no exact reply text exists.

Architect#415 approved OptionA as D-061 on2026-10-20. Actual generic reply
transport is the NEXT separate PR, with signed-admin/CSRF, thread recipients,
reviewed preview/version, idempotency/uncertain-send handling, timeline receipt,
rate cap and kill switch. Existing buyer/JV/legal/template gates stay. No real
send is authorized or tested by this migration. New-thread compose is later.

## Writer/Reader Trace

- mailbox-reader.js writes connected-mailbox metadata/body DTOs using unchanged
  signed-admin routes, bounded read-only IMAP locks and validated message refs.
- thread-view.js writes canonical thread_key and exact linked role provenance.
  New email-model.js reads only those keys, source_kind and timed role metadata.
  Invalid/future/conflicting refs remain counted as unavailable, not deleted.
- Email category is operational: only recognized automated listing mailboxes go
  to Alerts. Real agents, unknown senders and mixed threads remain in People.
  Classification never establishes a human identity, buyer or lead evidence.
- email-screen.js performs GET reads only, body-on-selection, canonical metadata
  ordering, escaped plain text, bounded folders, retained list on body failure
  and cancellation of stale responses. Session loss destroys private data/DOM.
- app.js owns auth/screen lifecycle; signed-cookie auth is unchanged. Email
  navigation intentionally becomes native; all other views stay classic.
- components.js adds a pure allowlisted shared role badge; design-system.css
  alone owns its appearance and the two-pane/composer layouts. No new CSS file,
  old patch/theme/help enhancer or frontend dependency is loaded.
- wos-card-clock remains the human formatter. Native controller injects its read
  clock into the pure view model. No sale-date, matching or readiness changes.

## Tests And Evidence

New: workspace-email-model and workspace-email-ui. Pure projection denies
network/current-clock/storage/import side effects. UI1366/400/412 covers
People/Alerts, folders, escaped long bodies, canonical chronology/collapsed
history, j/k/r/e, source roles, local drafts, visible disabled Send/Gmail,
retained list on failure and a fully settled late body after401 without private
data returning. Zero writes/external calls. Shared component/shell/preview
focused files also pass. Full final-head suite600s/file remains required.

Existing assertion intent changed: workspace-shell-ui.test.js's navigation
loop formerly expected Email among seven classic links; it now explicitly
clicks/asserts native Email, then tests the remaining six classic links. This
is the requested screen migration, not reduced navigation coverage. The
classic allowlisted Email deep-link test remains. No other existing assertion
is changed and no safety assertion is weakened.

Synthetic before/after screenshots: docs/screens/2026-10-20-native-email.
Reader/list/composer1366/400/412; no private production identities. Local first
contentful paint38/51/55ms, Lighthouse13.5.0 accessibility98/100 desktop/Android;
the machine-readable proof is in that folder. Reproduce using
`node scripts/verify-native-email.js --screenshots`, optionally setting a local
WOS_LIGHTHOUSE_PATH. Audit tooling remains outside application dependencies.

## Review And Release

### Release Checkpoint, 2026-10-20 20:32Z

PR417 merged head9c98ed05e1507fa045506179ad63dcac89bd4f33 with merge
a5b3cca723a805f00614440cf8e0912fdf131331 at20:19:39Z. Final-head CI
39457975776 completed successfully: SUMMARY passed=237 failed=0 skipped=0
total=237;600s/file,9m45s test step,10m39s job. County-notice215.41s;
Email model0.07s,UI3.44s,shell5.59s. Full per-file timing artifact is under
docs/test-results/issue-412-native-email. Main CI39491016047 also succeeded.

Deployment is BLOCKED, not verified. More than10m after merge GitHub has no
Railway deployment for this SHA. The authenticated Railway service displays
"Deploys have been paused temporarily"; active deployment is still the prior
PR414. Public /health200 at20:30:23Z belongs to that old healthy version.
The declared native Email asset is404. Do not call old health a new release.

Public incident: https://status.railway.com/incident/JUA1PC5H . Its20:20UTC
update resumes Pro/Enterprise while other workspaces wait; deploys triggered
during the pause must be triggered again after builds resume. The current
workspace still displays Limited Access / paused. No billing, setting,
variable or manual deployment action was taken. Public incident screenshot:
docs/screens/2026-10-20-native-email/railway-build-incident.jpg.

Next: wait for the workspace's build pause to lift, deploy this exact merged
main once, then authenticated native Email1366/400/412, classic lead card,
safe screenshots and console check. No send/outreach or business write.
Keep the old healthy deployment; no bad application version ran to revert.
The separately approved D-061 transport has a trace only and waits for this
live migration dependency. PR413 remains deferred.

No server/API/auth, stored business value, provenance/gate, SMTP, provider,
dependency or Railway setting change. Classical reader remains available.
No migration/deletion. Self-review covers untrusted headers/body, wrong-origin
refs, stale/future data, role/date provenance, mobile focus and no auto-send.

Release gates pending: final hosted full suite, merge commit, exact deployment,
health200, authenticated read-only1366/400/412 native Email and classic lead
hydration, safe status-only live proof and console check. Do not click Send,
Gmail handoff, copy a draft, confirm/link evidence or write business data.
