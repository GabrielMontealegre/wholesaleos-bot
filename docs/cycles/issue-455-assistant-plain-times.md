# 455.4B Assistant Timestamp Readers

Current-main42f8c591 after491 release. Owned docs-only491 proof deliberately
carried; no491 runtime replay. Two unrelated exports remain untouched.

## Writer And Reader Trace

- assistant-snapshot.js validates exact raw snapshot bytes and appends private
  receipts. generated_at/deal.updated_at/log.at/buyer.last_contact/last_reply_at/
  text.drafted_at keep existing calendar/future/type rules. No writer change.
- assistant-v2-fields.js validates reported happened/last_touch, future-allowed
  due/follow_up_on days and future-allowed walk_plan.scheduled_at. No change.
- assistant-decision-answers.js records server answered_at; snapshot/answer
  binding, append-only history and auth guards remain unchanged.
- assistant-upload-keys.js creates server created_at/revoked_at; signed-admin
  route exposes metadata only. Key validation/auth/reveal/revoke untouched.
- assistant-model.js projects verified receipt fields, source labels, genuine
  reply ranking, exact references and due counts. No projection/schema change.
- assistant-sheet.js stamp consumes generated_at, buyer reply/contact, drafted
  day and deal log. decision-desk.js uses that same injected label for source,
  history, due, recorded answers, agent last touch and follow-up. Only walk
  scheduled_at opts into the distinct scheduled-time label.
- wos-assistant-upload-settings.js displays created_at with shared formatTime.
  Existing metadata validation and private lifecycle remain intact.
- wos-card-clock.js existing formatTime/formatDate semantics stay unchanged.
  New pure formatScheduledTime shares strict UTC-Z/calendar parsing; future
  appointments retain month/day/time/year instead of being treated as activity.
  Recent activity<=7 days uses weekday/time; older uses month/day/different year.
- Classic/native HTML refresh clock3; native sheet5/Desk3 and Settings3 only.
  Legacy/shadowed timestamp readers remain outside this bounded4B sub-slice.

## Proof Plan And Failures

New assistant-plain-times test uses actual native sheet v1/v2 and classic
Settings at1366/400/412 with an Asia/Tokyo browser zone and fixed clock.
Strict invalid/ambiguous/offset/calendar/type/schedule-vs-activity negatives
run with clock/network/filesystem traps. Rendered checks cover old year,
recent UTC-7 time, date-only contact/drafted/due/follow-up and future walk,
unchanged receipt bytes and zero non-GET/external requests/business writes.

Initial new-test navigation stopped before rendering with Chromium
ERR_NETWORK_ACCESS_DENIED to the local fixture server. Value-safe reporting
made that transport failure explicit; it is not a historical failure diagnosis.
First transport correction tried Node fulfillment from real local fixture
routes; Node then reported connect EACCES. Final harness removes sockets
entirely: actual appendSnapshot/latestSnapshot synthetic receipts and fixed
GET responses feed the real unchanged HTML/scripts through route fulfillment.
All origin/GET guards and every UI assertion remain. No product change was
made for either transport correction. This focused test now PASS at all three
widths; nine synthetic images inspected under2026-11-03-assistant-plain-times.

Existing assertion change: plain-card-times.test cache-version expectation2
becomes3 only; all rolling-boundary/year/strict future/date/provenance/purity
and actual native Email/Today checks remain. No safety assertion weakened.

No private files/real mail/keys/imports/answers/provider actions/business writes.
No release/full-gate claim until actual results are retained.

Existing focused checks PASS on the final candidate: plain-card-times5.02s,
assistant-sheet-ui9.32s, assistant-decision-desk-ui8.78s,
assistant-upload-settings-ui7.22s, assistant-sheet-model0.54s and
assistant-walk-plan0.55s. First full suite still pending. No unchanged retry.

## First Full Gate And Fixture Clock Correction

Frozen71a7ae7 full suite completed NATURALLY303/1/0 of304,600s/file. All304
timing rows retained in proof-455-assistant-times/first-local-full.json; sum is
not wall time. Failed assistant-buyer-replies.test.js:56 expected a Mon label
for its2026-10-26 reply timestamps while the browser used the ambient date.
After more than seven days the new intended label is Oct26, not a weekday.
Keep this FAILED gate unchanged; no unchanged local full retry.

The existing test intends to exercise recent reply labels and ranking. Pin
its browser Date to its own existing fixture now2026-10-26T15:00:00Z, rather
than weaken/delete its weekday assertion or change source dates. All13buyers,
top10stable reply-only ordering, unknown contact-only row, reported POF,
exact-byte receipts, future/forged/accessor/source negatives, real synthetic
writer route, area search, old-file refresh,401clearing and zero writes remain.
No runtime change after the frozen full gate. The first corrected hosted gate
is still required; no environment/Node/flakiness attribution or green claim.
The corrected buyer-reply focused test PASS at1366/400/412,7.75s, natural exit0.

## Release

PR492 sourcec45de93 mergedbca8fefc, whole tree identical. FIRST PR304/0/0,
sole MAIN304/0/0; all608 hosted timings retained beside the original local
304-row failed result. Automatic exactmerge deployment and bounded public/
static/GLOBAL proof PASS without private contents or business actions.
Full proof: proof-455-assistant-times/README.md. Remaining4B readers and whole
455/487/backlog remain incomplete; no broader timestamp/board completion claim.
