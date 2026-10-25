# #412 Gmail-Structure Email Migration

## Authoritative Scope

Owner/architect6389032123 replaces the compact split-pane layout with Gmail's
structure: centered search, folder/label rail, dense full-width threads,
five categories, reader replacing list, collapsed history, bottom-only reply,
collapsible context, floating compose and phone full-screen reading.
Keep the shared dark system and existing exact-thread D-061 gates unchanged.
Gabriel has NOT approved the current screen; do not start native Deals.

## Capability Trace And Ordered Gates

| Requirement | Current writer / source | Reader / next gate |
| --- | --- | --- |
| Message identity, source chronology, role | mailbox-reader metadata; thread-view exact anchor annotation; conversations operator/import records | email-model validates provenance/role date; layout projection must reuse it |
| Full reader / history / local reply | mailbox-reader message/thread GET; email-screen sequence ownership | replace list rather than split panes; preserve source/body/401 races and local drafts |
| Review / Send | reviewed-thread-replies signed-admin/CSRF/version/receipt/idempotency/cap/kill boundary | email-reply binding unchanged; default OFF; no real preview/send verification |
| Search / categories / label counts | only loaded metadata and recorded roles currently exist | pure local projection first; label loaded scope, never invent global search/counts |
| 50 rows / authoritative total / older pages | provider list cap50; no exposed cursor/total | separate read-only capability, not fake arrows or totalN |
| Snippet / attachments | OAuth snippet exists; IMAP snippet empty; no attachment manifest | missing stays absent; no speculative body fetch or attachment chip |
| Archive/read/star/snooze/delete/move/labels | no approved provider writer | BLOCKED affected commands pending needs-architect439; no fake success |
| New-thread Compose / Forward / files / voice | outside exact-existing-thread D-061 boundary | BLOCKED affected commands pending439; never reuse buyer package transport |
| Gmail comparison | actual Gmail reference at1366/400 with private fields masked | synthetic before/after + approved435 live contract; owner screenshot approval required |

439 asks whether the structural read-only migration may precede unsupported
commands using visibly unavailable controls plus Open in Gmail, with later
capabilities separately approved. Do not infer that answer or call a partial
layout the completed specification. Independent pure presentation preparation
can proceed without changing runtime, send, provider access or business state.

## Design Direction

Reuse near-black surfaces, green actions, blue links, red urgency and existing
type/tokens; no new CSS layer or hero. Email list and opened reader occupy the
same main-area track. The folder rail persists on desktop and becomes a drawer
on phones. Search belongs to chrome; source text belongs to the scrolling
reader. Action controls must name real capabilities, not imply disconnected
mailbox writes. The current full specification remains open through each phase.

## Preparation Boundary

mail-layout-model is a pure, unwired projection over email-model.list. Inputs
are existing connected-mailbox metadata and an injected clock. Search is literal
over loaded metadata only; five display categories use source-backed role/
automated-sender classification and explicit mailbox report labels, never
subject-based identity guesses. Counts/ranges are explicitly LOADED scope;
folder total and older-page capability remain unavailable. It neither fetches
bodies nor persists selection, snippets, labels, drafts or workflow facts.

Independent structural work also makes opening a message replace the list at
ALL widths, not only phones. Reply moves after the source thread and no empty
composer mounts until explicit Reply. The existing state/request ownership,
history,unsent-draft memory and exact-thread binding remain unchanged. This
is an IN-PROGRESS candidate, not the complete Gmail specification or a release;
rail/search/dense rows/context and the439 capability decision remain required.

Foundation focused model and original Email UI tests pass. Additive assertions
prove no default composer,full-width list/reader,desktop+phone list replacement,
Reply after the full source thread,and Back restoration. Existing assertions
were not weakened or removed. Synthetic --layout compares exact live3d19945
including its stylesheet,not a staged composer falsely shown as the default.
New verifier option initially shadowed its local layout variable; corrected
only that verifier name. Serialized pinned1.44.0 proof then passed at all3 sizes:
FCP65.7/40.1/38ms,reader573/695/695px,Lighthouse13.5.0=100/100,zero writes/
external/pageerrors. Screens docs/screens/2026-10-25-gmail-reading-foundation.
These are working-tree synthetic results,not live release or Gmail references.

## Phase Two: Mailbox Chrome Candidate (Not Released)

The reading foundation is now verified separately in PR440; its exact source,
deployment and mixed live proof are recorded under
`docs/screens/2026-10-25-pr440-release`. It is not whole-412 approval.

The next bounded candidate wires the existing pure projection into a narrow
folder rail/drawer, centered loaded-mail search, five sourced categories,
44px desktop rows, local checkboxes and optional recorded-context panel.
Search never calls global discovery or writes; labels are local filters, not
mailbox-label mutations. Latest50 metadata uses the already-supported GET
limit; exact body/reply caps remain unchanged. Unknown total, older paging,
star state and new Compose remain explicitly unavailable, not fabricated.
No archive/delete/snooze/move/label or new-thread send route is added.

Writer/reader trace: mailbox-reader's connected metadata -> email-model.list
validation -> mail-layout-model.project -> category counts/range/rows. Role
source/date/link validation precedes chips and context; a record link requires
one strict canonical ref on a linked, validated-role message. Snippets require
consistent connected-source copies. Search/query/selection/context are local
screen memory and clear on destroy; private drafts retain the prior D-061
binding. Folder changes use existing GET routes and independent metadata/body
request ownership. app.js only supplies Email chrome and literal input events;
Today, classic links, signed-admin/CSRF and send services are not rewritten.

Intentional assertion changes in workspace-email-ui: People/two tabs become
the owner's five named tabs, initial Primary then explicit Buyers; tab keyboard
navigation uses five roving targets. The old132/180px list-top allowance becomes
180/196px for the explicit list toolbar/category strip; opened readers still
hide it and occupy the full canvas. Phone folder access uses the real drawer,
and category controls hide on opened readers at ALL sizes. Source/body/history,
draft/error/401 and zero-write assertions remain. Loading assertions select
Sent through that same phone drawer, retaining all delayed/obsolete-response
negatives. No safety assertion was removed or weakened.

Focused pure model/components/Email/loading/reply/shell/actual navigation and
new mailbox-chrome tests pass at1366/400/412 using pinned Playwright1.44.0.
The new search fixture initially used separate words whose one-letter token
also matched "subject"; changed only to a distinct literal synthetic token.
A sandbox Chromium launch failure and one wrong test filename were execution
errors, not product skips. The final context negative withholds forged unlinked
refs; actual linked context, X/Escape, draft preservation, local selection,
folder50 GETs and literal/NFKC search are covered without provider writes.

Synthetic comparison uses exact current-live32c0c2a HTML/app/components/Email/
CSS, not prior compact UI. Three-size proof: FCP56.6/47.3/65.5ms, reader645/
740/740px, Lighthouse13.5.0 accessibility98/98, no overflow/writes/external
requests/page errors. Screens `docs/screens/2026-10-25-gmail-mailbox-chrome`.
These are SYNTHETIC, not a live release or actual Gmail reference comparison.
Whole Gmail acceptance, full final-head suite, affected439 scope, exact deploy,
approved mixed live proof and owner approval remain outstanding. Do not merge
this candidate merely because a focused suite passes. No native Deals yet.
