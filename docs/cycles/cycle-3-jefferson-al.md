---
market: Jefferson County / Birmingham
state: AL
status: blocked
pr: none
main_sha: 5aa1505
blocker: jefferson_al_tax_lien_sources_blocked_from_automated_vantages
---

# Cycle 3 - Jefferson County AL

## Verdict Summary

No Jefferson lane was added. The official county tax-lien landing pages are Cloudflare-blocked from headless Chromium,
and the direct tax-lien embed endpoints return 403. AlabamaPublicNotices.com is publicly readable as a portal, but this
cycle did not verify Jefferson property-address detail rows reachable without login, CAPTCHA, paywall, or subscription.

The operator-owned blocker wording stays in [[../WHOLESALEOS_OPERATOR_MAP|the operator blocker table]].

Evidence links:

- `../../exports/cycle3-jefferson-al-gate/probe-results.json`
- `../../exports/cycle3-jefferson-al-gate/jccal-birmingham.png`
- `../../exports/cycle3-jefferson-al-gate/jccal-bessemer.png`
- `../../exports/cycle3-jefferson-al-gate/jccal-taxlien-birmingham.png`
- `../../exports/cycle3-jefferson-al-gate/jccal-taxlien-bessemer.png`
- `../../exports/cycle3-jefferson-al-gate/alabama-public-notices.png`
- `../../exports/cycle3-jefferson-al-gate/birmingham-land-bank-programs.png`
- `../../exports/cycle3-jefferson-al-gate/al-revenue-land-sales.png`

## Probe Table

| Source | URL | Result | Decision |
|---|---|---|---|
| Jefferson County 2025 Birmingham tax delinquent parcels | `https://www.jccal.org/1018/2025-Tax-Delinquent-Parcels---Birmingham` | HTTP 429 Cloudflare security verification; no rows rendered | blocked |
| Jefferson County 2025 Bessemer tax delinquent parcels | `https://www.jccal.org/1019/2025-Tax-Delinquent-Parcels---Bessemer-D` | HTTP 429 Cloudflare security verification; no rows rendered | blocked |
| Jefferson County tax-lien embed, Birmingham | `https://taxlien.jccal.org/taxlien/embed?division=Birmingham&year=2025` | HTTP 403; no body | blocked |
| Jefferson County tax-lien embed, Bessemer | `https://taxlien.jccal.org/taxlien/embed?division=Bessemer&year=2025` | HTTP 403; no body | blocked |
| Alabama Public Notice | `https://www.alabamapublicnotices.com/` | Portal renders and lists searchable notice categories; Jefferson detail rows not proven open in this cycle | survey only |
| Birmingham Land Bank programs | `https://birminghamlandbank.org/programs/` | Program information renders; property inventory rows not verified as open | survey only |
| Alabama Revenue land sales | `https://www.revenue.alabama.gov/property-tax/tax-delinquent-property-and-land-sales/` | Informational state page renders; not a property-row source for Jefferson | survey only |

Related notes:

- [[jefferson-al]]
- [[cycle-2-detroit]]
- [[san-diego-ca]]
- [[los-angeles-ca]]

## Verbatim Codex Prompt

```text
/wholesaleos build

PRE-CONDITION: start only after PR #103 (Detroit) is merged and its
first-light verify is reported. Base: the post-merge main.

BRANCH: feat/cycle-3-jefferson-al

PART A - CYCLE VAULT SCAFFOLDING (docs only, ~30 min):
Create docs/cycles/INDEX.md plus one note per completed cycle:
cycle-0-multi-market.md, cycle-1-cuyahoga.md (blocked), and
cycle-2-detroit.md, and market notes for pending markets (jefferson-al,
san-diego-ca, los-angeles-ca). Each note: frontmatter (market, state,
status live|blocked|survey, pr, main_sha, blocker), the verbatim Codex
prompt used for that cycle (from the PR descriptions and
docs/CODEX_HANDOFF history where recorded), verdict summary, and
links to evidence artifacts in exports/ and the operator-map blocker
table. Use [[wikilinks]] between markets, PRs, and blockers so
Obsidian's Graph View renders the dependency map. Facts only with
evidence links; blocker wording stays owned by
docs/WHOLESALEOS_OPERATOR_MAP.md - link, do not fork. No secrets.

PART B - JEFFERSON COUNTY AL (Birmingham) SURVEY + CONDITIONAL BUILD:
1. GATE (normal UA, free public only, no login/captcha/paywall):
   probe Jefferson County official foreclosure/sheriff sale postings,
   the county land-sale lists, and alabamalegalnotices.com (statewide
   public-notice portal - verify whether foreclosure notices with
   property addresses are readable without subscription). Record the
   full probe table into docs/cycles/cycle-3-jefferson-al.md.
2. IF a verified-open source exists: build the AL lane per the Detroit
   playbook - state-aware profile (al_jefferson_*), adapter with
   honest caps (25 rows / 5 pages or docs), market-scoped rotation,
   official-host validation, verbatim addresses from explicit source
   fields only, prices/dates only when displayed, preview_only +
   not_a_saved_lead, Birmingham/Jefferson/AL selecting ONLY that lane,
   all other market routing untouched. Hermetic fixtures from real
   fetched content, relative dates.
3. IF gated: record the honest blocker in the operator map + cycle
   note and stop Part B there.

TESTS: new lane suite (if built) + the eight standing suites
(dashboard-public-deal-queue, free-public-deal-board,
tx-county-foreclosure-adapter, mi-land-bank-acquisition-adapter,
ocr-notice-extraction, server-free-public-deal-board-preview,
census-zip-resolution, source-acquisition-engine) + git diff --check;
node = Cursor-bundled node.exe; delete tests/.tmp.

SAFETY: no fake data, no bypasses, no paid APIs, snapshot stores only,
no legacy agents, no Railway/preview/production actions.

CONCRETE STOP POINT: stop when Part A notes exist AND Part B is either
green (lane + fixtures + suites) or honestly blocked with the recorded
probe table - BEFORE any commit to main, PR-merge, deploy, or batch.
REPORT: probe table, decision, files, SHA, tests, and % progress
(Cycle 3 of the six-market mission).
```
