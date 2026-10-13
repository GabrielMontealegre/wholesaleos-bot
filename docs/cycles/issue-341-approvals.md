# P0 Approvals workspace - independent slice 3

Pending buyer and reviewed-deal proposals have their own left-menu destination.
The menu badge and page read the same pending-record projection without display
caps. Cards open the existing full buyer/deal screen and expose recorded sources,
buyer criteria or submitted comps for review. Empty optional facts stay hidden;
dates use the shared owner-time formatter. Approve is green, reject red, links blue.

Opening a source disclosure only enables the review checkbox. It does not check
it, approve, confirm a comp, or infer that Gabriel read anything. Approving needs
Gabriel's explicit checkbox and button action. Rejection needs his written reason
and keeps the record. No real decision is made as release verification.

## Writer / reader trace

- Buyer proposal/approval/history: `assistant-finds.validateItems/ingest/update`.
  Existing assistant import and dashboard PATCH writers remain unchanged.
  `approval-workspace.pendingRecords` selects exact pending/non-not-a-fit rows;
  counts and full card projection share it. New POST delegates to `finds.update`
  and the existing match-reference synchronizer, not a new matching algorithm.
- Deal proposal/approval/comp-review: `reviewed-deals.validate/ingest/update`,
  including source-backed deal updates resetting review. Pending projection uses
  the same `evaluate` as the deal screen and excludes terminal/stale/rejected rows.
  The new POST delegates to that same `update` with explicit reviewed_comps.
  No comp, value, contact, introduction, JV, source-date or offer gate changes.
- Fingerprint: SHA256 of the current stored row, computed on GET and compared
  against a fresh strict read before POST. Any changed fact/history/approval or
  duplicate identifier yields409, never approval of a different record/version.
  Caller cannot replace fields or supply an operator id. Actor comes from admin
  middleware; existing canonical history/reference writers record the decision.
- Routes: admin-only GET approvals, GET counts, explicit POST. No-store, bounded
  input, private errors, strict store reads. Counts carry no names/body/contact
  fields. GET has no writes/network/scheduler hooks. Only explicit POST writes.
- Frontend: new renderApprovals route and tenth core menu item. New renderer,
  disclosure/checkbox, explicit decision, reload and full-record open controls.
  GET/POST serialization and response cancellation prevent old-session private
  data or counts reappearing; existing sign-out is called unchanged after UI clear.
  Unknown write result asks for a reload, not a claim that nothing was saved.
- Unsigned JV subject address AND precise subject coordinates remain withheld
  in the pending card. Stored facts are not erased; other-property submitted
  comps retain their recorded source links and comparison facts.

## Data coverage limits

The repository has no writer for pending email drafts or records requests.
`email_draft_approvals` is only consumed by the existing delivery-policy reader;
reviewed templates are not pending email drafts. These groups are marked not
connected with null counts and no fake approval control. No Send/request-tracker
feature is smuggled into this UI work. This is buyer/deal approval coverage,
not completion of all P0 data feeds or Gabriel's final sign-off.

Today release remains blocked on#347; grading contract remains#344. Other
features stay paused underD-056. All local approval/rejection tests use an
explicitly synthetic memory store; production verification is read-only.

## Tests

Final suite: SUMMARY passed=176 failed=0 skipped=0 total=176, with600s per file.
New approval unit tests0.32s; actual full-index approval UI15.26s; preserved
shell/navigation41.65s; mount-order17.75s; notice acquisition14.34s.
Every file duration is recorded in docs/test-results/issue-341-approvals.txt.
Local screenshots are synthetic test data, not production approvals.

Pure tests: all125 pending buyers returned, injected clock/no network/write,
same evaluator/update helpers, mandatory review, stale/duplicate/closed/expired/
forged/missing/reason guards, retained rejection, no invented value or offer,
immutable source input/leads, caller cannot overwrite DTO identity/ref/version,
unsafe links/text escaped, unsigned address/coordinates hidden, no system dates.
Actual route guards:401/no-store/413/review409/idempotent refusal/private503;
old-session response and count cancellation after unchanged sign-out call.

Full-index local proof: menu/count/four categories, full buyer/deal openers,
every source link against intercepted fake pages, source disclosure then manual
checkbox, unchecked/reject-negative zero writes, stale409, explicit fixture
approve/reject, retained rows, approved comp evaluation stillUNKNOWN offer,
expired401 clears cards/count. Required1366x768/1920x1080/400x915/412x915 images.
Existing shell proof still exercises every preserved nav item plus Approvals.

No existing assertion is weakened. New proof waits for stored badge text when
the phone drawer closes, and for attached error state when the login lock hides
the content; cleared private data assertions remain. Restricted-sandbox browser
launch failure is environmental; successful proof uses authorized local process
access. Existing model/auth/source tests remain unchanged.

Known legacy startup Telegram toast is not a new delivery event; working bell
slice4 must replace hardcoded announcements with recorded notification data.
No claim that this page fixes that older toast or the#209 startup incident.

## Live foundation and visual correction

PR348 merged22d0502da6d5730ba698d0a36d822f9a418d4bee. Exact Railway deploy
7043396278 succeeded16:07:06Z after7m42s;health200. Fresh live33nav,
JS1/shell3,28pending=13buyers+15deals. Both full-record openers work.
Review controls remain unchecked; a disclosure enables but does not check.
100lead openers hydrate; no new console errors from the fresh load.
No production decision,source click,review assertion or evidence confirmation.

Live computed styles exposed a cosmetic override: shared shell's important
button selector outranked the page's one-ID selector. The correction uses the
same scheme/body/app scope plus the specific workspace ID, changes no handlers,
bumps CSS only to2, and asserts actual computed green/red colors in the full
browser proof at every size. Existing behavioral assertions are unchanged.

Correction full suite: SUMMARY passed=176 failed=0 skipped=0 total=176,
600s/file. Approval UI17.83s/unit0.38s,shell45.29s,mount19.46s,county-notice
12.58s. Complete timings in docs/test-results/issue-341-approval-colors.txt.
