# Calendar CRM Trace

## Scope

Calendar was reading APP.calendar only. Both legacy renderCalendar definitions
in index.html therefore missed the canonical assistant activity/conversation
feed. This additive renderer replaces that page at runtime, not the source
records, readiness rules, ingestion or legacy manual-event writer.

## Writers And Readers

- record-activity.validateInteraction/importInteraction, buyer-find-import and
  agent-conversation-import accept the existing authenticated assistant feed.
  recordEvent/append and existing buyer/deal/email workflows append activities.
  No new import endpoint, scheduler or file watcher is added.
- conversations.validate/upsert stores explicit person/ref/channel/source report,
  last-in/out, next step and optional due date, preserving report history.
  mailbox-conversation-sync explicitly stores exactly linked receipt metadata;
  savedReplies validates it. Calendar never fetches a mailbox.
- conversations.project remains the sole reminder rule: explicit due dates,
  incoming replies waiting, existing outgoing follow-up cadence and closed-row
  suppression. Calendar labels that result derived, and saves nothing.
- reviewed-deals validates raw closing_date/auction_date; Calendar displays them
  as reported dates, never proof of a completed sale/closing. Pending approvals
  read current approval and original first-seen/capture time, not a new clock.
- Saved-lead sale dates require current raw sale-origin fields and the existing
  normalizeSourceDate/resolveSourceSaleDate. Stored ISO copies cannot create an
  event; posted/filing dates cannot become sales. No date/gate module is edited.
- Manual events stored by existing db.addEvent or APP.calendar/localStorage stay
  intact. Local-only events are labeled that way; duplicates by server event id
  are not added twice. Existing Add Event/saveEvent path remains unchanged.
- New pure calendar-workspace projection reads the above collections, injects
  now/time zone, returns counts/events/provenance and existing conversations.
  Unique exact references/ids resolve click targets; conflicts stay unlinked.
  Future/invalid activity times and duplicate activity ids do not fabricate
  events. Unsigned-JV event summary/source/address remain withheld using jv.view.
- New requireAdmin GET calendar-workspace registers beside conversation routes,
  behind the existing dashboard session gate; no-store and redacted503 failure.
  It never calls a write, mailbox client, provider or readiness evaluator.
- New dashboard Calendar: Today/Month/All recorded/day/type, yesterday counts,
  due/overdue counts, distinct type colors, fixed controls/list-only scrolling.
  Event X/Escape, exact record and recorded conversation openers, and Prepare
  follow-up reuse the existing conversation/draft surface. No automatic Send.
  Failed GET/auth loss clears the cached private projection; request sequence
  and sign-out invalidate stale responses. No production action is a test.

## Tests And Review

New unit test: canonical assistant import and dedupe, reminders, time zone,
mail reports versus proof, pending/manual dates, unsigned-JV privacy, current
raw sale-date versus derived-only/ambiguous/wrong-origin, missing/conflicting
references, duplicate ids, invalid/future timestamps, escaping, zero network,
clock reads or writes. New route test: admin/no-store/empty/error redaction.
Real-server api-session-gate adds401 unauth/helper,403 regular,200 admin.
Actual-dashboard synthetic browser proof at1366x768/400x915/412x915 covers
all views/filters, fixed header/list scroll, actual filter input widths,
event/conversation/prepare, X/Escape, Add cancel, empty/auth-loss clearing and
zero writes/external requests. Existing assertions changed:none. One new test's
auth-loss observation uses attached rather than visible because the existing
global401 handler correctly hides the whole app; cached rows still must clear.

Full hosted suite and read-only live proof pending. No completion claim yet.

## Limits

Only saved linked email receipts/reported interactions appear, not a pretend
complete inbox. No feed import occurs during release; assistant coverage may
be incomplete (separate#379). No NLP inference of promises like tomorrow:
the assistant supplies an explicit due_date through the validated existing
feed, or the existing reminder rule supplies a labeled derived date.
Prepare follow-up opens the recorded draft; sending remains Gabriel's action.
The legacy manual-event editor remains unchanged, including its local storage.
