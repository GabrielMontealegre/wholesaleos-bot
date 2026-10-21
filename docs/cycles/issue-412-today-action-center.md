# #412 Today Action Center

## Scope

The native Today screen now places the existing action queue, reviewed best deals,
and the last 24 hours on one page. It is a read-only presentation change. The queue
is ordered into overdue, due today, needs review, waiting on someone else, and coming
up. A row opens its existing record. Nothing here sends, approves, confirms, captures,
or writes business data.

Best deals continue to come from `buildTodayWorkspace` and the existing reviewed-deal
evaluator. Asking price, reviewed value, estimated spread before closing costs, buyer
match count, and deadline are only displayed when the existing projection provides
them; unknown values are not filled in.

## Read/Write Trace

- `modules/records/conversations.js` validates and upserts operator-reported
  `status`, `last_in`, `last_out`, and `due_date`. Its `project` function reconciles
  those with existing activity and read-only mailbox evidence, then derives reminder
  dates. This PR does not change those writes or rules.
- `modules/records/record-activity.js` is the existing append-only activity writer;
  `modules/records/mailbox-conversation-preview.js` adds only current mailbox preview
  evidence to a projection. The last-24-hour panel still uses the existing
  allowlisted projection and labels message activity as reported, not delivered.
- `modules/deals/reviewed-deals.js` and the existing buyer/deal records remain the
  sources for eligibility, reviewed value, estimated spread, and matching. No
  valuation or matching rule changes here.
- `modules/agents/today-workspace.js` is the existing signed-admin GET projection.
  It now attaches an urgency label and, only for recorded `waiting_on_deal` rows,
  elapsed whole days from `last_out`; it persists neither field.
- `dashboard/workspace/app.js` reads the GET result and uses the shared component
  layer and `design-system.css`. Record links use `navigation.recordHref`; unlinked
  items open the existing details drawer. No new API or write route is introduced.

Assumption recorded in `docs/DECISIONS.md`: canonical `due_date` determines overdue
and due-today status; waiting age requires `last_out`; absent timestamps remain
unmeasured. A delayed item can be red overdue while still displaying its recorded
waiting age.

## Verification

Focused unit, service, shared-component, shell, and synthetic browser checks cover
strict date parsing, urgency precedence, missing timestamps, safe reviewed-value
labels, canonical record navigation, locked/admin states, and zero outbound writes.
The browser proof uses synthetic records only and runs at 1366x768, 400x915, and
412x915.

The full suite passed 242/242 with no skips at a 600-second per-file cap; the
variable Dallas foreclosure adapter took 17.75 seconds. Lighthouse 13.5.0
accessibility scored 100 on the synthetic page in desktop and 412x915 mobile
emulation. Synthetic first contentful paint was 63.5 ms at 1366x768, 61.1 ms at
400x915, and 48.4 ms at 412x915. These are local fixture measurements, not live
production performance.

Before screen (native Today with tabs):
`docs/screens/2026-10-20-workspace-design/after-actions-{1366,400,412}.png`

After screen:
`docs/screens/2026-10-21-today-action-center/synthetic-today-{1366,400,412}.png`
and `synthetic-proof.json`.

Hosted PR CI, exact Railway deployment, live verification, and owner screen
sign-off remain pending. Railway release is independently blocked by workspace
deploy availability tracked in issue #423. This local candidate is not released.
