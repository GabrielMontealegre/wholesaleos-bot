# JV workspace foundation

This is an ordered #325 slice, not completion of the whole mockup.

The JV tab separates three exclusive groups:
- Active JVs: a valid non-terminal operator-recorded action after Found.
- Ready for buyer: the existing eligibility rules pass, with no invalid workflow.
- Near misses: retained JV records that do not belong to those two groups.

An active deal need not be ready for buyer contact today. Its existing reasons,
signature review, expiry and privacy controls remain unchanged. Closed/dead and
rejected records appear only when Include expired and rejected is selected.
The response cap stays100; section headers report loaded counts, not full totals.

Open deal shows current/next canonical stage, asking price, reviewed value tier,
buyer maximum, derived estimated share, recorded partner terms and buyer checks.
There are nine canonical D-048 stages, not ten invented ones. No signing provider,
access instructions, earned fee or contact action is invented. An unsigned
subject's street address stays withheld under the existing evidence guard.

Send email, Send text and Use another template are disabled. The existing unsent
draft control moves into the workspace; Save draft remains the same explicit
guarded action. There is one composer, not a second divergent saved value.
Existing progress controls remain unchanged below. Connecting the
exact recorded conversation and reviewed-template chooser remains the next slice;
actual Send remains #288/#336. This item sends nothing and writes no records.

## Trace

`jv_workflow_events`: explicit workflow.record writes append-only sourced events;
ingest preserves them. workflow.view validates and projects them; evaluate reads
terminal state/signature guards. No writer or workflow gate changed.

`jv_eligible`: evaluate computes it from unchanged approval, date/freshness,
availability, value/repair and buyer rules; teaser still requires it. list now
uses deal kind for JV visibility instead of treating eligibility as membership.
The authenticated list GET and Today/JV frontend consume the additive jv_section.
It is a pure read projection, not persisted or reused as an eligibility flag.

`drafted_message`: validation/import and explicit update(action:draft) remain the
only writers. Existing card copy/save handler remains unchanged; the relocated
composer uses the same data-deal-draft selector. No new route, sender or dependency.

## Verification

New pure tests cover mixed exclusive groups, expired availability without
eligibility carryover, invalid/forged events, terminal/other-kind records,
escaped content, unsigned-address omission, disabled actions, purity and no mutation.
Full-index UI tests run1366/400/412, deny writes/external requests, open an active
deal, check all nine real stages, inert Send and phone geometry.

One existing assertion intentionally changes: reviewed-deals.test.js:29 used to
expect an unavailable JV to disappear. It now expects Near misses while all
existing eligibility/introduction/same-day evidence assertions remain intact.
dashboard-deal-mount-order.test.js:84 narrows the incidental heading locator
from /JV/ to exact JV; the original no-invented-card assertion stays unchanged.
Synthetic screenshots: docs/screens/2026-10-12-jv-desk/. No real-person image.
Full-suite timings and post-deploy observations are recorded in BACKLOG.md.
