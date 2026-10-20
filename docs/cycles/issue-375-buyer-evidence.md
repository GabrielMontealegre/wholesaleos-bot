# Buyer Source Notes Before Offer Volume

This is a tracking prerequisite, not proof verification, a buyer commitment,
an offer machine or permission to contact anyone. It does not change any
matching, comp, price, contact or readiness gate.

Trace:
- Admin-only buyer-evidence GET/POST routes are registered through the
  existing buyer-route module and the existing signed dashboard guard.
  Assistant pairing tokens, regular users and x-user-id alone cannot write.
- `buyer-evidence-notes.record` validates an exact unique buyer/reference,
  source, captured time, explicit validity date, source-review checkbox and
  current identity/history version. It appends a separate journal receipt
  and a fixed generic activity. Existing buyer/deal/lead values stay intact.
- Receipts retain source URL/text/date and operator origin. No source is
  fetched, uploaded or parsed. Query/signed URLs, credentials, private hosts,
  wrong origins, future/invalid dates and unknown bank fields are refused.
  Google's harmless usp share marker is removed only on Drive/Docs links;
  any additional query is still refused. Ordinary Gmail message links work.
- `project` revalidates journal provenance/digests and keeps expired, stale,
  conflicting, flagged or corrupt evidence separate from current reported
  receipts. Exact duplicate receipts do not create contradictory facts.
  No cached/legacy buyer flags establish evidence. No default validity period.
- `assistant-finds.listFinds` adds the read-only evidence DTO. Malformed note
  history does not hide the buyer list; evidence controls become unavailable.
  Matching and profit consumers are unchanged; funds stay not established.
- Buyer details show the two source-note states and an explicit record form.
  A flag preserves all history. Source/capture/validity and source-review
  checks are required. Failed or uncertain results never auto-retry. A known
  input rejection lets the operator fix fields;409 requires a fresh review;
  network/503 uncertainty stays disabled until a manual refresh.

Identity/criteria/reference/source changes require fresh source review;
ordinary contact history does not. The validity date is provided by the
operator from the reviewed source, never a guessed business policy. Notes
do not collect structured bank accounts/balances and warn against entering
those or credentials in the private note. No note text enters aggregate logs.

Tests: pure/no network-clock-writes, signed admin dashboard scope, x-user-id/
regular/agent refusal, replay/stale/forged/future/missing/ambiguous dates,
duplicate identities, malformed/conflicting/expired receipts, source URL
privacy, generic write failures, preserved business data and actual dashboard
1366/400/412 fixture record/flag/error/unknown states with no unrelated writes.
No existing assertions changed. A new route fixture initially omitted its
local base declaration; only that scaffolding was corrected.

Live verification is GET/navigation only. Do not record/flag a real note,
confirm funds, fetch financial documents, preview/send a message or run offers.
Positive evidence interactions and receipts remain synthetic proof until an
operator separately chooses to use them.
