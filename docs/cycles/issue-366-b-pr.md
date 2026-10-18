Item: #366 B - Calendar as the recorded CRM workspace

The old page showed manual calendar entries only. The new Calendar reads the
existing activity/conversation feed, saved linked email receipts, derived due
rules, pending approvals and reported/source-backed dates. Today/Month/day/All
recorded and type filters stay fixed above a separately scrolling agenda.
Events open the exact record or recorded conversation; Prepare follow-up opens
the existing draft, never sends. Manual Add Event and stored data stay intact.

Writer/reader trace: existing record-activity.append/importInteraction,
buyer-find-import/agent-conversation-import, conversations.validate/upsert and
explicit mailbox-conversation-sync write the source records. Existing
conversations.project alone supplies reminder cadence and closed suppression.
reviewed-deals validates closing/auction dates; current raw sale-origin fields
use normalizeSourceDate/resolveSourceSaleDate, never ISO copies. db.addEvent
and APP.calendar retain the manual lane. New pure calendar-workspace projects
them into requireAdmin/no-store GET, then wos-calendar-workspace renders them.
No server.js, auth, source routing, comp/readiness/JV/matching gate or ingestion
module changed. Full trace: docs/cycles/issue-366-b-trace.md.

Tests added: calendar-workspace unit/purity, route/auth/error and actual
full-dashboard1366x768/400x915/412x915 browser proof. Covers existing assistant
imports, duplicate email reports, saved versus forged mailbox receipt,
explicit/derived reminders, closed/future/invalid/ambiguous/missing/wrong-origin
dates/identity, unsigned-JV privacy, zero network/clock/writes, source escaping,
view/month/day/type, input widths/type colors, bounded list scrolling,
record/conversation/draft navigation, Today flag off, X/Escape, manual Add cancel,
empty/auth-loss clearing. Real-server session gate adds unauth/helper401,
regular403 and admin200. Existing conversation/route/activity/Today suites pass.

Existing assertions changed: none. Only additive real-server auth assertions.
New auth-loss UI check observes attached content because the unchanged global
401 handler correctly hides the app; cached private rows still must clear.

Decisions used: D-056,AGENTS3/5/7; ASSUMED read-only calendar projection,
existing reminder rules, manual local event attribution and draft-only follow-up
logged. No new dependency, credential, schedule or production import.

Self-review: exact id/ref conflicts never guess a target. Current raw date wins;
stored ISO/preset lifecycle cannot manufacture a sale event. Future/invalid times
and conflicting duplicate activity ids are excluded with diagnostic counts;
source data is never removed. Unsigned JV summaries/addresses/source links stay
withheld using unchanged jv.view. Pending approvals are not approvals performed.
Email reports are not delivery proof and closing dates are not completed closings.
Failed GET/signout invalidates cached private data. No paid/provider/listing fetch.

Full cloud203-file suite pending,600s/file; no merge until green. Exact deploy
and read-only live1366/400/412 clicks/screenshots follow; no business writes.

Risks/follow-ups: activity coverage is only what the canonical feed already
contains; no raw assistant-file import is authorized here (#379 remains blocked).
No natural-language promise parsing. Live send/approval/manual save are not tests.
Does not infer C completion or Gabriel's#341 sign-off. Carries F release proof
and timings to avoid a separate docs-only deploy. #366 remains open for later letters.

![Desktop synthetic](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-b-calendar-hub/docs/screens/2026-10-18-366-b/synthetic-calendar-1366.png)
![Phone synthetic](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-b-calendar-hub/docs/screens/2026-10-18-366-b/synthetic-calendar-400.png)
![Android synthetic](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-b-calendar-hub/docs/screens/2026-10-18-366-b/synthetic-calendar-412.png)
