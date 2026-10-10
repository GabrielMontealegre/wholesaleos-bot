# Conversations and reminders (#307 A1)

Dashboard home starts with People waiting on you, before Today's Deals. Records
come from explicit conversation reports through the existing admin-owned import
preview/commit path, plus existing dated interaction activities. Reports are
labeled as reports, not independently verified contact outcomes. Unknown names,
drafts and conversation links stay visibly missing. Copy message copies only;
there is no send control or inferred outreach action in this slice.

Import kind conversation requires person, role (holder/buyer/partner), channels,
status and captured_at. Optional refs must identify exactly one existing record;
an empty refs list remains Unlinked. Person plus sorted refs identifies an upsert.
Newer reports append history; older/duplicate reports cannot overwrite it; a
conflicting report at the same timestamp is rejected. Malformed/future dates,
unknown fields, unknown/ambiguous refs and unsafe thread links are rejected.
Allowed thread links are HTTPS Facebook/Messenger/Gmail links, without credentials.

Read-only GET /api/dashboard/conversations is admin-only/no-store. It joins
reported activity by exact person/ref/channel when possible, never guesses a
person or role, and never writes during reads. Closed conversations and linked
closed/dead/declined records are omitted. Newer incoming replies come first;
older/tied/future replies cannot invent an unanswered reply. Then overdue dates.
UTC-7 calendar-day cadence: Day0 is the first reported outgoing, next Day2,
then Day5, then every seven days. Missed dates remain overdue, not silently moved.
Explicit reported due dates are retained. Every draft comes from the report.

Trace: existing activity writers (recordEvent, imported interactions, reviewed
deal/buyer actions) stay unchanged. buyer-find-import validates and previews the
new kind, then commit appends conversations and generic activity metadata.
db.writeDB serializes the full store; existing leads/buyers/deals remain intact.
conversations.list reads that collection and activities with injected now;
conversation-routes and wos-conversations consume the read model. No comp,
source, date, reachability, contact outcome, approval, readiness or auth rule changes.

This is not all of #307. Gmail thread synchronization and email-kind approval
counters/templates remain A2 work. The paired write-only dropbox now accepts
conversation and interaction reports alongside unchanged buyer inputs, using
the admin import's shared validators/merge. Authentication, scope, caps and
result-only responses stay unchanged. Mixed failures write nothing. Newly
appended interactions reach the existing owner-alert hook after persistence;
duplicates stay quiet and hook failure cannot misreport a successful import.
No production import/message/send is used for verification.

Released PR #319, application merge 46b639a. Full final suite143 passed,
no failures/skips. Live read-only check:13 open reports,12 waiting/due;
correct mount order, no400/412 overflow, no fresh console errors, Leads/card
hydration confirmed. No reported interaction was created for the proof.
Synthetic crops are labeled fictional. The browser screenshot tool could not
save the live header crop; the live pixel-artifact gap is explicit in BACKLOG.
