# Ask WholesaleOS -- Bounded Read-Only Demo

## 2026-10-30 Reconciliation In Progress

Existing PR397 remote5678942 is unchanged/unmerged/undeployed. Its local branch
deliberately merges current edbd255 plus owned394 proof d9974d0; old owned
2553b07 is retained at checkpoint/2026-10-19-demo-proof, not bundled with its
unrelated historical Pipeline trace. Five conflicts resolved to current shell,
server, docs and Calendar; only the new Ask hooks are reapplied. Current Calendar,
Today and Calendar projections are not edited. Historical218 is not a current gate.

Fresh390 explicitly confirms D-060 Option A. Newer372 per-deal chat belongs to
the separate412 workspace slice and is not added here. Current main contained
no Ask snapshot/model/demo implementation; this is not a runtime duplicate.
No provider/key, new business writer, downstream sign-off or native Deals route.
Current native Today/Email previously had no Ask destination. Reconciliation now
adds a 44px message-circle header command using the SAME Ask dialog/controller,
not a forced classic route or a second data projection. A bounded native host
exposes only admin identity and existing canonical record/Calendar navigation;
native data, session credentials and writers are not transferred to the dialog.
Close/Escape removes private Ask context and returns focus to the native opener
without remounting Today/Email. Native clearPrivate also clears Ask. More keeps
its existing seven destinations; native Deals remains unmigrated. Native voice
attaches ONLY to the Ask question, not existing Email composers. No dashboard
snapshot fetch occurs before explicit opening; no parent layout is frozen.

Native Today/Email entry/close/focus/geometry/no-load-fetch/401-late-response/
unsigned/nonadmin and canonical Calendar/buyer route regression passes at
1366/400/412 and short1038x503. Classic Ask (including its actual30s timeout),
existing More navigation, local voice UI and component UI also pass sequentially.
Additional native Email unsent-draft/source/search and pagehide checks now pass.
The initial expanded fixture searched AFTER opening a reply; existing Email
search intentionally closes that pane, so its post-Ask draft locator timed out.
The corrected fixture searches BEFORE opening/replying and asserts the draft
exists before Ask as well as after. No Email implementation/assertion was changed.
Final exact-source images and
qualified before/after FCP/Lighthouse gates remain PENDING, not inherited.
The first restricted Chromium launch stopped before browser creation; escalated
hermetic launch passed. This is not a product failure or an audit result.
One manual patch initially failed matching an earlier entry-tag line after a
later hunk; it applied no edits, was reordered, and then applied successfully.
Current candidate tags are nativeApp15, Askdemo3, voice4, sharedUIkit3 and
components7. Profile2/template2 and nativeCSS15/Email15/navigation3 are unchanged.
Native actor locks through the actual shared fetch guard on401; the regression
also verifies a late Ask response cannot reopen context or read as a locked actor.

The new private GET boundary applies no-store/admin before generic parsers,
rejects bodies and non-GET methods without reading the store, and returns only
generic failure codes. Pure projection and synthetic boundary tests pass.

Source trace found the old candidate could expose unsigned JV address/holder
through linked conversation text even when its deal name was withheld. New
mixed buyer/deal reference regression genuinely FAILED before the scoped fix.
Ask now applies the UNCHANGED canonical signed-evidence gate to ALL JV refs,
including beyond the loaded subset, and withholds entire linked report fields,
action names and event fields rather than regex-censoring source text. Unlinked
event details are withheld. Public buyer-only reports and genuinely signed JV
reports retain their original content. No existing canonical module/gate changes.
Signed-path fixture initially used the evaluator-only minimal buyer, which lacks
assistant ingestion metadata and caused a TypeError; it now uses the actual
canonical ingestion/update path. No production fallback or assertion waiver.
The signed/unsigned/public-preservation/purity tests then pass.

Ask styles use existing shared UI kit3, not a new one-off stylesheet. The pinned
upstream Lucide1.60.0 message-circle SVG is unmodified/local/license retained;
shared component allowlist7 and entry URLs are consistent. Classic entry adds
the existing component module before Ask scripts. ProfileJS2/templateJS2 stay
unchanged; voiceJS3 adds only the query selector. Other current cache tags stay.
Close/reload/launcher use local library icons with accessible names/tooltips;
compact answer faces omit standalone refs, while exact queries/context refs stay.

Client30s abort spans fetch+JSON, no retry. Query/Ask lock until a snapshot loads;
pagehide/session/auth/close remove private context and invalidate late responses.
Base current UI at1366/400/412 passed all old geometry/44px/navigation/no-write
assertions. Expanded real30s timeout/explicit reload/pagehide tests passed before
the later report-envelope fix; final exact-source regressions still required.
Final current-source nine-file UI/regression sequence PASS: Ask expanded
lifecycle, shared components, voice, desk shell, Calendar, upload-key Settings,
remembered-device Settings, Profile and API session registration gate. Pure Ask,
private GET boundary, component safety and voice unit tests also pass. No full
suite or performance/accessibility audit yet; current actual inventory287.
Earlier six masked screenshots precede the last compact-reference/report-envelope
changes and are not final-source visual proof. Fresh frozen-source captures due.
Optional screenshots require explicit WOS_ASK_DEMO_PROOF_DIR and mask the entire
underlying app/toasts BEFORE disk without hiding the dialog. No private/live
snapshot/queries/audio/Profile/files/send used. No current audit/full suite/PR
push/merge/deploy yet; whole372/370/412/backlog is NOT complete.

D-060 / architect#390 authorizes this slice before full#366 sign-off. It is
not the full#372 assistant and does not enable downstream#369/#361/#351.
#393's broader assistant parity follows this demo. No AI key/provider,
message draft/send, approval, import, evidence confirmation, profile/contract
fill, capture, paid service or production business writer is added.

## Writer And Reader Trace

There are no new business writers or stored collections. The sole endpoint,
admin GET `/api/dashboard/ask-workspace`, reads the existing strict store at
one injected timestamp and returns no-store, derived read-only data:

* Today actions/counts/coverage from `buildTodayWorkspace`.
* Calendar brief, dated activity and linked conversation reports from
  `buildCalendarWorkspace` (no mailbox fetch).
* Deal stages, value tiers/ranges, buyer matches/ceilings/room and next steps
  from `reviewed-deals.list/evaluate` and `jv-workflow.view` unchanged.
* Buyer identity/criteria/approval from `assistant-finds.listFinds`, never
  labeled a confirmed purchase or proof of funds. Structured phone/email fields
  are omitted; reported text can still contain private details and stays in
  the authenticated dashboard, never a provider, query log or aggregate report.

Projection caps:100 deals (canonical list),250 buyers,100 actions,250 events,
250 linked conversation reports and50 matches per deal, all with explicit
totals. Missing/duplicate/ambiguous references are not guessed. Unsigned JV
street address, holder contact and source URL are not projected. Comps are
not copied or re-verified; canonical tier/count/value are presentation only.
First-seen uses a valid non-future stored RFC3339 instant in the existing
dashboard time zone; a refreshed captured_at cannot stand in for it.

The browser's fixed command model supports waiting work, first-recorded-today
deals, yesterday's recorded work, an exact reference/unique recorded name,
and matching buyers for a deal. Unsupported instructions (including sends
or approvals) stay unsupported. Queries never go into a URL, server request,
log, provider or localStorage. A fresh snapshot is requested only on explicit
open/reload; no polling or browsing on load. Close/auth loss aborts pending
reads and removes private context; late responses cannot repaint it.

## UI And Voice

An admin-only Ask button appears on every page. Native dialog has X/Escape,
fixed header, scrolling content and a context column on desktop/stacked on
phone. Feed incomplete and read-only are always visible. Canonical stages
are labeled recorded/not recorded. No offer is invented. Snapshot uses
human time. Existing deal/buyer workspace and Calendar navigation are reused.
The existing on-device-only EN/ES voice controller attaches to the query
field. Nothing starts automatically; no pack/provider/cloud fallback. Ask
remains a separate tap. There is no Send or Approve action in this demo.

## Evidence And Release Gate

New tests: ask-workspace and ask-demo-ui. Unit/route/purity negatives cover
future/invalid/missing first-seen, capture-date substitution, wrong-origin
data, ambiguous/unknown references, unsupported commands, canonical match
identity, caps versus totals, admin401, generic503/no error-content leak,
immutable input and zero network/clock/writes. Real full dashboard fixture
tests1366/400/412 cover all demo controls, record/Calendar navigation,
voice presence without real audio, no-load fetch, no query request, X/Esc,
auth-late-response cleanup, bounds/44px and zero writes/external/errors.
Existing assertions changed: none. Voice tests are unchanged. The Calendar
driver includes the same <=3s native-dialog detachment waits already proven
in PR394 (f5559cd); all zero-node assertions remain identical. That pending
PR is not a dependency, and no Calendar product code is copied or changed.

Screenshots in `docs/screens/2026-10-19-372-demo/` are synthetic local
data, not production proof. Full hosted suite required on the draft head.
No merge/deploy until the live browser control gate is restored; finish
PR391's pending live proof. New owner order prioritizes396,395,profit and375
before this demo; it stays parked rather than leapfrogging them. This independent
branch starts from main, not the unreleased Profile branch; rebase/retest
when main advances. Do not treat green CI as live verification.

## Initial Full-Suite Failure And Fix

Hosted39338143349 at753552e:217 passed,1 failed,0 skipped of218.
The unchanged desk-shell test's normal Open Lead click was intercepted by
the floating Ask launcher. This was a real product overlap, not a test
timing problem. Move the launcher into the existing header flow and reserve
its44px phone grid track. No forced click, hidden overlay or weakened
existing assertion. New demo geometry checks verify the launcher belongs
to the header, stays44px/in-bounds and overlaps no other header control.
The unchanged desk-shell and strengthened demo UI tests pass locally;
synthetic1366/400/412 screenshots regenerated. Final full suite required.
