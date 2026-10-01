# Decisions

Decisions that agents must follow. Gabriel's decisions outrank architect decisions; both outrank
agent assumptions. Agents append `ASSUMED` entries at the bottom; the architect promotes or
corrects them during review.

## Gabriel's decisions

| ID | Date | Decision |
|---|---|---|
| D-001 | 2026-09-26 | **Texas is parked, not abandoned.** Texas sale prices are not public. No new Texas comp machinery beyond the operator-browser lane and the paid-comp switch (off). Texas leads still get ranking, cards, links, phones, CRM. |
| D-002 | 2026-09-26 | **Charlotte (Mecklenburg County, NC) is the first automatic-comp market.** Wake County, NC is the fallback if Mecklenburg data needs a mailed request. Detroit (Wayne County, MI) second. |
| D-003 | 2026-09-26 | **Detroit ballpark comps**: county data has no bedrooms/baths, so comps may match on sq ft, year, lot, distance and recency, labeled "Ballpark — bedrooms/baths not confirmed". MAO from these is labeled ballpark. A screenshot or the call upgrades to verified. |
| D-004 | 2026-09-26 | **Paid comps switch exists, off by default.** Estimates/AVMs are never comps. No provider chosen. |
| D-005 | 2026-09-30 | **2 verified comps = preliminary value** (always labeled preliminary). 3 = verified. |
| D-006 | 2026-09-30 | **Possible phone numbers** from any source (skip trace, people-search page, screenshot, the call) are shown labeled "Possible number — not confirmed", with the source. A sourced possible number makes the lead callable. If none: show people-search links. The system tries first in the operator's browser. |
| D-007 | 2026-09-30 | **Texting**: Gabriel picks up to 20 leads at a time; messages are human-sounding; sent from the operator's phone (tap-to-send). No automated sending. |
| D-008 | 2026-09-30 | **One CRM timeline per lead**: every interaction logged with date, time and who (Gabriel or which VA): acquired, opened, closed, reopened, calls, texts, notes. Plus lead clocks: sale/event date, stale date, last touch. |
| D-009 | 2026-09-30 | **Passed sale dates are not dead leads.** They move to an "After the sale" lane (postponed, still-owner, bank-owned, sold to investor, redemption) — never discarded. |
| D-010 | 2026-09-30 | **Loan interest rate matters** (low rate → subject-to). It is a call question; a typical-rate clue from the loan date is allowed, labeled. |
| D-012 | 2026-09-30 | **No paid services yet.** Everything must work free first. |
| D-013 | 2026-10-01 | **Generic adapters for every state.** No county-specific naming in new code; Dallas, Ellis, etc. are profiles. |
| D-014 | 2026-09-26 | **VA materials** exclude MAO, spreads, buy boxes and title companies. |
| D-015 | 2026-09-26 | **Offer math**: MAO = ARV × band% − repairs − fee. Band: 70% under $120k ARV; above that, the course chart up to 80–83%. Repairs before condition is known: $20/sq ft light to $50/sq ft heavy, labeled estimate. |
| D-016 | 2026-10-01 | **Codex merges and deploys when all gates are green.** The architect reviews after merge. Gabriel is asked only for business, money, legal and outreach decisions. |
| D-017 | 2026-09-30 | **Presentation**: professional, plain English, not crowded. |

## Architect decisions (Gabriel may veto)

| ID | Date | Decision |
|---|---|---|
| D-011 | 2026-09-30 | **Estimated equity band (High / Medium / Low / Unknown) for sorting only**, only where the actual loan is known (loan date + original amount from a recorded notice or deed of trust). Never a dollar amount on a card, never an offer input. |
| A-001 | 2026-10-01 | Server-side work uses public government sources only. Listing and people-search sites are used only in the operator's browser via the local helper. |
| A-002 | 2026-10-01 | Every lead lives in exactly one lane with a plain reason; nothing is silently dropped. |

## Open questions

(Agents add questions here only if they cannot open a `needs-architect` GitHub issue.)

## Agent assumptions (ASSUMED)

(Format: `ASSUMED: <what> — because <rule> — <date> — <PR link>`)

ASSUMED: B-01's existing PR branch is updated from current main with a merge commit rather than a force-pushed rebase — because the backlog explicitly names PR #205 and preserving its reviewed history is the safer way to satisfy the current-main requirement — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/205

ASSUMED: B-02 hides legacy market-generated buy boxes from read APIs and matching without deleting their stored records — because safety and data preservation outrank showing invented buyers — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/207

ASSUMED: B-03 remains BLOCKED rather than being marked fixed when the reported 502 cannot be reproduced or attributed — because data truth forbids a speculative root cause and saved-lead safety forbids a speculative mutation — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/issues/209

ASSUMED: B-04b treats a date explicitly sourced from filed_date, created_at, posted_at or date as non-sale evidence even when the text is unambiguous ISO or a registered adapter is present; a separately sourced sale_date or auction_date remains eligible — because source provenance outranks convenient date parsing and a filing timestamp does not prove a sale event — 2026-10-01 — https://github.com/GabrielMontealegre/wholesaleos-bot/pull/211

ASSUMED: B-04c marks any post-sale or disclosure rule whose general legal effect is not established by its cited primary source as unverified, even if the backlog gives a shorthand; only the cited trustee-sale day rule can resolve an ambiguous date — because legal uncertainty must not become an automated eligibility fact — 2026-10-01 — B-04c sub-PR

ASSUMED: B-04d registers California tax-default sources under the tax-sale process but marks them notice_only; neither a completed sale nor a sale price follows from a notice — because provenance and the value gates outrank a convenient category label — 2026-10-01 — B-04d sub-PR
