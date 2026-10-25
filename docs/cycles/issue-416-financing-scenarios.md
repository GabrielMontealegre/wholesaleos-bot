# Financing scenarios foundation (#416)

This is a local, pure calculation foundation for the ordered Deals workspace.
It is not wired to a route, stored record, card, matcher, offer or sender. Keep
the PR draft and unmerged behind the #415/#412 release queue. Do not deploy
this backend-only foundation separately or mark the overall #416 item done.

## Existing writers and readers

- reviewed-deals.js remains the authority for deal facts, verified value and
  matching. No field, gate or calculation in it changes.
- pipeline-reports.js and pipeline-report-review.js retain reported price and
  expense provenance. pipeline-money.js remains the canonical fee/net calculation.
- match-profit.js continues to project exact buyer/deal reports through those
  rules. A financing scenario is never an agreed price, verified rent, buyer
  commitment, payoff, maximum offer or proof of funds.
- financing-scenarios.js is new and has no product readers or writers. Its only
  current reader is financing-scenarios.test.js. It has no imports, network,
  clock, storage or environment dependency.

## Input contract

All money is dollars. Rates and returns are percentage points, so6 means6%.
Required debt inputs: price, down_payment, annual_rate_percent, term_years.
Years must represent whole months, from1 through100 years. No numeric strings,
nonfinite numbers or negative costs are accepted. Cash purchases require no
loan rate/term. The caller chooses each bank/seller-financing/assumable scenario;
the module never assumes an actual loan can be assumed or approved.

Optional interest_only_months is inside the supplied amortization term. The
remaining months repay principal. Omission models zero interest-only months and
returns that assumption explicitly. The rate is fixed and payments are monthly.
An all-interest-only schedule retains principal at its end. balloon_year is an
explicit maturity point, separate from amortization; balance is after that
month's regular payment. A balloon lump sum is not hidden in regular payments.

Income is either annual_noi, or monthly_rent minus monthly_operating_expenses.
Supplying both bases is rejected. Missing expenses do not become zero. NOI is
the caller's scenario input, after all operating expenses and before financing.
Loan payments are principal/interest only; property taxes and insurance belong
in operating expenses, not a second subtraction from cash flow.

Cash invested is down payment + explicit closing_costs + other_initial_cash.
The last field can include repairs/reserves. Omission explicitly models no
other initial cash; this is an assumption, not a claim those costs are zero.
Missing closing costs leaves the cash-on-cash return unknown. Zero invested
cash and zero debt service never produce an infinite return or coverage ratio.

## Outputs and formulas

Outputs are always labeled scenario_calculation, verified:false, is_offer:false.
monthly_payment and monthly_cash_flow describe the initial payment period.
amortizing_monthly_payment shows the later payment separately. Yearly cash flow
uses actual scheduled payments across the first12 months, including a midyear
interest-only transition. Cash-on-cash and debt-service coverage use that same
first-year basis. Negative income/cash flow remains negative. These figures
exclude balloon payoffs, resale, refinancing and income taxes explicitly.

For principalP, monthly r and amortizing countn:
payment=P*r/(1-(1+r)^(-n)); at0% useP/n.
Afterk amortizing payments, balance=P*(1-(1+r)^(k-n))/(1-(1+r)^(-n)).
log1p/expm1 avoid cancellation for tiny rates; nothing rounds until presentation.
The one-percentage-point reduction comparison changes only the rate, floors
it at0%, and shows both initial and amortizing monthly payment savings.

CFPB definitions checked2026-10-21:
- [Interest-only principal remains outstanding](https://www.consumerfinance.gov/ask-cfpb/what-is-an-interest-only-loan-en-101/).
- [Balloon payment is a separate large maturity payment](https://www.consumerfinance.gov/ask-cfpb/what-is-a-balloon-payment-when-is-one-allowed-en-104/).

## Remaining integration

The Deals screen, sourced input mapping, scenario controls, rate slider, timeline
brief, questions, state/county filters and authorized target-return ceiling remain
future ordered slices. They must preserve the existing offer/value/provenance
rules; this mathematical module authorizes none of them by itself. No UI or
live screenshot is claimed for this dormant foundation.

## Verification

Unit coverage: known fixed-rate numbers, independent monthly amortization
recurrence, zero and tiny interest, IO-only and midyear transitions, retained
balloon principal, cash purchases, negative cash flow, incomplete expenses/costs,
conflicting bases, invalid types/ranges/months, scenario-kind dedupe, input
immutability and zero clock/network/write effects. Full hosted suite passed on
productb7dc6e753396917eca5a417c888c92e1ac92138f, run39659500396:
241 passed,0 failed,0 skipped,600s/file. Test step8m32s,job9m25s;
finance0.06s,unchanged match-profit0.25s/reviewed-deals0.14s/county-notice172.85s.
All per-file timings are under docs/test-results/issue-416-financing-scenarios/.

Next-screen trace: reviewed-deal-routes.js GET /api/dashboard/todays-deals
already returns reviewed-deals.list's canonical value/match/profit projection
and location_counts when location_exact=true. It returns at most100 items;
the UI must not mislabel that subset as the full count. Existing record-activity
timeline summaries retain reported attribution and strip message bodies.
Future briefs must use those sources and respect jv_workflow's withheld-address
and signed-interest rules. No new reader or route is added by this trace.

## Current-Main Preparation (2026-10-23 UTC)

Integrated main9f4caaf/PR431 into the existing dormant foundation branch.
Only BACKLOG/DECISIONS conflicted; both histories and the latest D-062 order
are retained. Calculator and its test are byte-identical to prior remote head.
The source search over server.js/modules/dashboard still finds no runtime
import of financing-scenarios. No activation, route, source mapping, UI,
offer input, rate assumption or financial decision is added by integration.

Focused finance, existing match-profit/reviewed-deal projections and strict
workspace-preview tests pass. Full updated-head cloud gate remains required;
do not substitute historical241/0/0. Keep DRAFT/unmerged behind427/425/424,
with no standalone deploy. Prior live viewport evidence is pending435 and
corrected Email has no owner sign-off. No production action or setting change.

## Current-Main Preparation (2026-10-25)

Existing426 reconciled with main3d19945 after verified427/425/424. Only
documentation conflicts; calculator and test bytes remain unchanged. The
current owner Gmail-structure requirement supersedes earlier sign-off waits;
no native Deals migration,finance UI/route or stored-data consumer is enabled.
Keep this PR draft/unmerged and never trigger a standalone finance deployment.
Updated head requires its own full600s/file gate; prior5373890/242 green is
historical. Gmail candidate440/capability question439 remain separate work.
