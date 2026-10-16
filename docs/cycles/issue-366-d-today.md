# 366 D: Today links and overdue grouping

## Trace

- Conversations come from the unchanged records/conversations.project over
  stored reports/activity. Today build selects actions; no membership change.
- activities plus unique references across buyers/reviewed_deals/leads/matches
  now project an optional typed target on recent events. No field is persisted;
  missing/duplicate refs never guess a record kind from its prefix.
- wos-today-workspace reads these targets and invokes existing exact record
  openers, not a full reload through a generic reference URL. Best deals use
  the existing reviewed-deal opener; no grade/value/ranking rule changes.
- wos-todays-deals exact record_id previously still applied stale client price/
  type/verdict filters. Only that exact open bypasses list UI filters; it also
  invalidates pending responses while preserving immediate opens for a known
  cached target. Existing backend selection/gates remain intact,
  and Back restores the original filters/hidden choice.
- wos-conversations and wos-conversation-cards optionally show an Open
  conversation action for a real ID, using the same guarded readonly dialog as
  Today. Missing IDs produce no dead button; no thread is invented or contacted.
- groupActions is pure, injected-day, calendar-valid partitioning. Counts retain
  all actions. Overdue details start collapsed, filter counts reconcile, refresh
  retains expansion. No due date or workflow state is rewritten.
- Asset versions updated for every changed browser script/style.

## Proof

New unit test: unique typed buyer/lead targets, missing/ambiguous no inference,
valid/invalid date boundaries, no mutation, escaping, empty queue and missing ID.
Actual dashboard proof1366/1920/400/412: two overdue fixtures, expand/hide/KPI/
refresh, both conversation entry points, Best and recent deal opening under
conflicting price/verdict filters, no buyer-page redirect, honest empty state,
zero browser writes/external requests and unchanged fixture store.
Existing assertions unchanged. New-test fixes: outer summary selector narrowed
to direct child; synthetic conversation response given its real-shaped ID.
No product ID invention or auth weakening. First full suite188/3/0:
two existing UI tests caught unnecessary cached-card clearing;now narrowed
to preserve known records. A separate daily fixture crossed UTC midnight:
first_seen23:59:54.754Z onOct15;latest batch00:00:00.022Z onOct16. Product0
was correct. Its initial collection/daily-summary phase now pins a fixture
clock toUTC noon,restored afterward;all existing assertions remain unchanged.
Final full rerun: SUMMARY passed=191 failed=0 skipped=0 total=191,600s/file.
New browser12.41s/unit0.25s;queue7.25s;existing marketplace23.86s/wider21.73s;
county-notice adapter12.16s. Initial failed report retained,not overwritten.
Released PR#367,main90aca250eac4724c0d64a6832620e94c4bf3aee2.
Exact deployment7107648066 succeeded2026-10-16T00:22:30Z,45s after in_progress.
Health/dashboard200;served Today3,Deals13. Live1366/412:40actions,8overdue
collapse/expand,both recorded conversation entry points open and Esc/Close work,
actual recent Deal found opens exact deal rather than Buyers. Leads100 hydrate,
address cell opens drawer,Close lead dismisses;0console errors;viewport restored.
Live Best0 remains legitimate;no eligible live Best click claimed.
Screens live-today-1366.jpg/live-today-412.jpg contain only counts/references.
No production writes,batch,capture,contact,evidence confirmation or helper action.

Baseline live: conversation button opened correctly in this session. Best list
had no eligible current deals; report that honestly, never seed a real row.
Live1366/412 proof will include actual overdue/conversation/recent-deal controls.
C and B remain NOT LIVE. All other #366 letters remain in the owner's order.
