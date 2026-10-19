# Pipeline -- 395: Writer/Reader Trace

Local trace checkpoint,2026-10-19. No Pipeline feature is implemented or
released by this document. Latest owner order is396,395,profit,375,chat.

## Existing Contracts

- `server.js` legacy `/api/pipeline` groups saved-lead status; its PATCH
  changes that status. It is not the reviewed-deal/JV workflow. Do not
  replace it with a second writer to reviewed deals.
- `modules/records/conversations.js` validates explicit reported person,
  role, exact refs, channels, incoming/outgoing timestamps, next step and
  due date. Upsert retains history and mailbox receipts, rejects unknown
  or ambiguous refs and stale/conflicting reports. Project derives reply
  and reminder state; it does not parse a message into money or funds proof.
- `modules/deals/jv-workflow.js` records explicit attributed stage events.
  buyer_interested includes buyer_price; agreement or buyer eligibility is
  not proof of funds. Signed-copy/holder-term gates remain authoritative.
- `modules/deals/reviewed-deals.js` owns source-backed asking/contract
  fields, comp review, value and canonical buyer matches. A computed buyer
  ceiling is not an agreed buyer price or our offer.
- `modules/agents/today-workspace.js` projects conversation tasks, pending
  approvals and deal deadlines; counts and row membership share a view.
- `modules/records/calendar-workspace.js` reuses conversations.project
  due dates and exact references, labels derived reminders, and preserves
  unsigned-JV restrictions. It never fetches a mailbox or sends reminders.
- `modules/buyers/buyer-find-import.js` routes typed reports through
  validators and immutable in-memory ingestion. `assistant-find-routes.js`
  owns signed write-only import, rate/caps, fresh strict DB read and commit.
  Local `scripts/submit-assistant-finds.js` currently examines only the four
  named private files.396 changes wrappers, not supported record kinds.
- Existing Pipeline UI has both legacy and operational renderers. Trace
  their actual installation order before replacing a render path; do not
  silently leave an unreachable new renderer beside them.

## Missing State Must Not Be Guessed

No canonical structured proof-of-funds or offer-outcome contract currently
exists. The new view cannot infer either from buyer approval, a match,
holder agreement, a stage label, free-text notes or a timestamp alone.
Private pipeline.md/offer-outcomes.json/reply-playbook.md were not read or
submitted during this trace; do not assume a schema from their filenames.

The assignment-cost default in393 reads `00-,000`. Its intended amount is
unknown. An injected state/path policy may supply an explicit estimated
range later; absent configuration means costs and net remain unknown,
never0. No earnest money or due-diligence fee from Gabriel is inferred.

## Ordered Implementation Plan

1. Introduce an explicit attributed pending workflow report with fixed wait
   and close reason codes, unique known record references, real source URL
   and captured date. Preserve revisions/history; reject stale/conflicting,
   wrong-origin, missing and ambiguous input. Pending reports do not verify
   facts, change value/contact gates or overwrite existing conversation data.
2. Add the requested pure injected-config money calculator. Preserve each
   input's source and price basis. Unknown inputs produce unknown net;
   buyer below contract produces a loss, not a positive fee. Keep confirmed
   price distinct from a match ceiling. Test ranges, costs, split/referral,
   missing values and invalid configuration; no network, clock or writes.
3. Share one projection between Pipeline groups, Today rollup and Calendar
   dates. Every accepted open report belongs to one explicit wait group;
   missing dates remain visibly missing. Closed reports keep their reason.
   Existing unknown records are not reclassified as funded or contacted.
4. The two/five-day sequence schedules review tasks only. Closing a deal
   or conversation requires an explicit attributed outcome; no automatic
   destructive change or message follows a missed date. All real imports,
   approvals, messages and offers remain separately authorized operations.
5. Replace the actual Pipeline render path; open canonical workspaces by
   exact identities. Full negative and actual-dashboard1366/400/412 proof,
   one reviewed PR per bounded slice, full suite600s/file, then the normal
   deploy/read-only gate. Do not claim an empty funds group is a measured0
   while that contract is not connected.

Release verification is currently blocked by supported browser-control
timeouts in399, not by a demonstrated application/auth failure. Do not
change auth, read session secrets, bypass the browser tool or infer that
green CI replaces live verification. Independent local implementation can
continue from current main after the prioritized396 checkpoint.
