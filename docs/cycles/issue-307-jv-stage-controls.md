# JV stage controls - #307

## What is usable

Open a JV deal from Today's Deals. The card now shows the nine canonical
stages, the current recorded stage and an expandable history with action time,
operator and reported evidence. Legacy history is retained in the activity timeline.

1. Expand Holder terms. Enter the actual contract price, fee or share, closing
   date, title company and earnest money. Provide the holder's message/document
   URL and what they stated; Save holder terms records source-backed changes.
   Blank fields are not guessed or used to erase existing terms.
2. Choose the next actual outcome. Fill the required checks, buyer/price or
   signing documents when shown, the actual action time in the owner's UTC-7
   zone, a source URL and evidence text. Save recorded action records what
   happened; it does not contact anyone, sign an agreement or send a message.
3. Choose a matched approved buyer to preview a blind teaser. It contains no
   street address or holder identity. A preview is not a reported send.
4. Full package preview stays disabled until current signed-date/contract-copy
   evidence exists. The server also rechecks current approval, reviewed value,
   active status and the same matched buyer. A stored stage label cannot unlock it.

An unsuccessful save shows a plain-English inline error and retains the entered
evidence. No action time, agreement or checkbox is pre-confirmed. Dead needs an
actual dated reason; closed deals offer no further transition control.

## Scope and remaining work

This is the controls sub-PR, not completion of #307. Changed signing terms still
invalidate full-package access. Explicit signature amendment/re-review controls
are next; historical signing events are never silently altered. Email templates,
approval counters and reversible lead triage remain. Send is later #288. The
legacy split-only editor remains compatible until #325 consolidates the workspace.
The app-wide dark theme/right-side menu/clocks remain #325, not claimed delivered.

## Trace

- Stage/check schema: `jv-workflow.CHECKS` -> `view().stages.required_checks`
  -> reviewed-deals list -> `wos-jv-workflow.render`.
- Explicit UI submit -> existing admin POST `/:id/jv-stage` -> pure `record`
  -> append-only `jv_workflow_events` + canonical activity -> strict store write
  -> refreshed list/card. Operator identity is server-owned; import/update paths
  preserve the event stream. Legacy status is not rewritten.
- Holder terms: UI -> existing admin PATCH action `terms` -> existing
  `applyDealUpdate`/validator -> field provenance + old/new history -> signature
  terms fingerprint. Other PATCH actions reject injected holder-term fields.
- Preview buttons -> existing admin GET buyer-teaser/full-package -> existing
  current guards. They never call send, update or confirm endpoints.
- Dashboard index loads the new module before Today; cache versions JV1/Today6.
- Existing comp/source/auth/session/readiness/provider/server modules unchanged.

## Verification

New service tests pin source-backed terms, ambiguous/missing/forged input,
unchanged lead/buyer stores and canonical check-list isolation. Real synthetic
Express + Chromium UI proof exercises all eight transitions, term updates,
teaser/package read-only behavior, reload persistence and stale-error preservation.
1366/400/412 checks measure actual control bounds, 44px targets and overflow.
Screenshots in `docs/screens/2026-10-10-jv-stage-controls/` are labeled synthetic
proof, not production reports or evidence of real signed contracts.
Full-suite and deployed read-only results are recorded in BACKLOG after completion.

Released as PR #327, application main `f78eaa5`. Exact Railway success and
health200. Full suite154 passed,0 failed,0 skipped,600s/file; timings committed.
Live JV card: nine stages,Found,explicit empty/unticked form,locked package,
no legacy stage buttons; JV1/Today6. Desktop1366/400/412 workflow bounds and
44px controls pass; Leads100/card open-close; console clean. No real reports,
terms,previews,sends or confirmations made. Live stage-bar screenshot command
timed out; synthetic artifacts are not claimed as live pixel proof.
