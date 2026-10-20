# Pipeline Screen (Slice 2)

The Pipeline navigation item now shows recorded pending work rather than
legacy lead status. Open it from Today or the left menu. Select a waiting
group, open its existing property/buyer/conversation workspace, or open
Calendar. Refresh and paging are GET-only. Nothing here sends or approves.

## Truth And Coverage

- Typed assistant reports remain pending and explicitly reported.
- Buyer/deal approvals use `approval-workspace.pendingRecords` unchanged.
- Conversations use `conversations.project` unchanged. A message is not
  inferred to be an offer or proof of funds.
- Fixed groups include closed reports, whose reasons remain visible.
- Missing prices/costs stay unknown. Potential ranges reuse `pipeline-money`.
  Neither match ceilings nor approval status establish a buyer's agreement.
- Missing next dates stay unknown. Existing conversation dates and report
  review dates appear on Calendar. No automatic close, reminder or message.
- Counts cover all recorded tasks before paging; pages contain at most50.
- Unsigned JV addresses and source-only lead headings retain existing guards.
- Private-file producer inputs and explicit report review controls remain
  later slices. An empty report collection is not proof that work is done.

## Writer/Reader Trace

Existing signed importer writes immutable `pipeline_reports`; no new writer.
The report projector revalidates origin, digest, references and timestamps.
New pure `pipeline-workspace` combines that projection with canonical pending
approvals and conversations. Its authenticated GET uses existing session
middleware. Today reads only its summary; Calendar adds sourced report dates
using opaque revision ids and exact targets. No business record is modified.

The new dashboard renderer owns Pipeline. The older operational-view async
renderer no longer owns that page, and the old kanban timer refuses the new
root. Today adds one navigation button. Existing detail screens are reused.

## Tests And Review

New pure tests cover groups, counts, pagination, no inferred offers/funds or
money, exact refs, forged/unlinked reports, unsigned privacy, same report
dates on Calendar, unavailable-store coverage, bad queries, escaping and
spied zero network/clock/writes. New actual-dashboard tests cover1366/400/412,
all groups, paging, deal/buyer/conversation openings, Calendar, GET refresh,
legacy timer ownership, auth/error clearing,44px targets, contrast and
list-only scrolling. Synthetic screenshot fixtures contain no real people.

Existing assertions: `tests/calendar-workspace-ui.test.js` retains all four
zero-node assertions; adds detachment waits for native asynchronous close.
`scripts/verify-operational-views.js` intentionally replaces its legacy
Pipeline property-board proof with the new empty-workflow proof. Its other
three operational views and safety assertions are unchanged. Contrast and
populated row opening are now tested on the actual new Pipeline screen.

No gate, auth authority, source routing, dependency or database writer change.
Full suite and exact-deploy read-only checks are required before release.
