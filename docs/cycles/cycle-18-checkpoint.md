# Cycle 18 checkpoint

## M0 - orientation

- Branch: feat/cycle-18-evidence-packet-throughput-v1
- Base/current SHA: 643b995bda7d420a1f651581c85ac01c09f5c926
- Working copy: the wholesaleos-bot-cycle10 visualization checkout named in the request.
- Local and fetched origin/main match; starting tree was clean.
- Cursor Node v22.22.0 confirmed. GitHub fetch works with sandbox network escalation.
- No live snapshot or db.json exists locally. Production inventory is UNREACHABLE because production access is prohibited for this build.
- Authorization: local public-document reads, implementation, tests, feature branch and draft PR only.
- No production requests, paid calls, new dependencies, contact outcomes, merge or deploy.

## Scope

M3 scope frozen after first local text-layer measurement and source-to-board tracing.
IN: TX notice property-address identity preservation through extractor, candidate and
board; reject trustee/courthouse contamination; show independent evidence-packet axes;
tests, benchmark, screenshots and cycle INDEX maintenance.
OUT: identity-source expansion, contact hunting, OCR tuning, new sources, new dependencies,
retry changes, comp changes, live inventory, routing and production access.
Expected delta: recover source-stated complete identities for Flamingo/Stanford without
borrowing courthouse details; remove two courthouse substitutions and one trustee office.
No expected contact or comp gain: this corpus has no verified seller routes or sold comps.

## Decisions

- Use the existing checkout and preserve other checkouts (avoid unrelated changes).
- Frozen fetch failures remain recorded failures; do not retry around access controls.
- Historical July 2 evidence is not current inventory.
- No dependency installation (explicit scope constraint).
- Architect's identity-first prior overturned for this corpus: 17 text-layer rows become
  4 nonempty board addresses, but 2 are courthouse substitutions and 1 is a trustee office.
  The remaining 13 rows are incomplete. Only 1 of those 4 addresses is presently supported
  as the property (Thibodaux). Fix address integrity before any contact enrichment.
- 59 PDFs cached (including 20 same-origin Hunt wrapper PDFs), 7 Ellis redirects refused
  by the capture allowlist. Ellis is UNREACHABLE UNDER CAPTURE POLICY, not proven blocked
  by the source. Cache frozen via corpus-lock.json before measurement.
- 33/59 PDFs have no text layer; baseline is explicitly text-layer-only. OCR yield remains
  unmeasured pending installed runtime check. No zero substituted for unmeasured OCR.
- Several ledger PDFs are administrative documents (Kaufman tax rates, Parker fees,
  Van Zandt youth-diversion plan). Zero notice rows is correct for those documents.
- Candidate transport and board address fallback are observed through the actual private
  mapper exported in memory only by the measurement harness; no production invocation.
- Tools: file read/write and shell tested; browser inventory tested (browser surfaces
  available, native apps list empty); pdf-parse workers tested; no production tab opened.
- Cursor Node and installed modules resolve; gh authentication works with network access.
- tests/.tmp is already gitignored. Preserve and verify that rule.

## Acceptance

M0-M3 completed; M4 not invoked because the measured identity defect binds first.
M5 implemented and targeted suites pass; M6 local synthetic browser workflow passes.
M7 complete: final 64/64 tests pass with 300s per-file timeouts and recorded durations.
INDEX corrected, aggregate report generated, and actual PDF addresses visually checked.
Cycle 19 completes the previously unmet OCR/three-county trace criterion using cached
Navarro/Rockwall scans. Final delivery work: update the existing DRAFT PR, then STOP for QA.

Acceptance: 16/16 for the bounded Cycle 18/19 evidence package, separate from usable-lead yield.

| Criterion | Result | Evidence / limitation |
| --- | --- | --- |
| 1 checkpoint / resume | PASS | This file records scope, boundaries, decisions and exact next action |
| 2 frozen corpus | PASS | corpus-lock.json; before/after matching manifest hash |
| 3 county / market baseline | PASS | summary.json; absent capture/unique inventory null with reasons |
| 4 production unreachable | PASS | All six live markets UNREACHABLE; no production access |
| 5 six property rows / three counties | PASS | Cycle 19 OCR traces cover Hunt, Navarro and Rockwall; OCR rows remain review-only |
| 6 named anomalies | PASS | Cycle note explains market family, separate counters, unresolved original failure reasons |
| 7 ranked measured losses | PASS | Cycle note priority table: 3 false addresses, 2 extra unique identities, 33 unmeasured scans |
| 8 scope frozen first | PASS | M3 IN/OUT and decision above predate implementation |
| 9 independent axes | PASS | Packet service tests, aggregate report and actual dashboard JS screenshots |
| 10 dependencies | PASS | None installed; existing runtime limitation reported |
| 11 benchmark | PASS | Same cached text, timing/RSS/accuracy/cost in summary.json |
| 12 gates | PASS | Existing comp rejection matrix, provenance, policy, routing and OCR tests green |
| 13 full suite / cleanup / diff | PASS | Final 64/64; timings in proof; cleanup and diff checked before commit |
| 14 browser / instructions | PASS | Five labeled synthetic screenshots, failed/duplicate upload and refresh proof |
| 15 complete packet or dependency | PASS | No complete packet; exact current-event/contact/property/comp dependency named |
| 16 INDEX | PASS | Added actual implementation links for 11-15 and 17 |

Visual inspection of Hunt PDFs 07, 10 and 17 confirms all three retained unique property
addresses. All three notices state September 1, 2026 sales; current availability is unknown.
Before: 17 rows, four normalized addresses, only one property-supported unique address.
After: nine rows, four normalized addresses, three property-supported unique addresses.
No seller-contact or comp yield gain. No production access.
Cycle 19 verified the local OCR runtime mismatch: Playwright default launch resolved to
missing `chromium_headless_shell-1234`; the installed `chromium-1117` launched when named.
A shared resolver now tries Playwright default first, then discovers installed Playwright
browser cache executables. OCR recovery is MEASURED on the frozen Navarro/Rockwall scans.
Existing Chromium 1117 was explicitly used for local screenshots and PDF visual inspection
only; no runtime setting, dependency or rendering/extraction parameter was changed.
The approval-review usage limit interrupted PDF rendering once; the next authorized retry
succeeded. No bypass used.

## Exact resume step

Before commit: verify `git diff --check`, confirm tests/.tmp removed and staged paths
contain only Cycle 18 files; commit/push this branch and open one draft PR.
If resumed after the draft exists, DO NOT create another: run
`gh pr list --head feat/cycle-18-evidence-packet-throughput-v1 --state open` and hand it
to architect QA using docs/cycles/cycle-18-architect-review.md. No ready/merge/deploy.

## Final regression notes

- Initial full run: 63/64; dashboard assertion still expected v25 after v26 asset bump.
  Updated that assertion; final complete rerun is 64/64.
- Candidate-to-card address propagation needed the same source-only marker. Added it
  and exact parity assertions so the card path cannot reintroduce unrelated addresses.
- OCR formatter authority is explicitly cleared; normalized address and precise maps
  remain absent on OCR-review candidates in both transports.
- Benchmark: 6.282ms -> 4.389ms median per 59-document cached-text extraction pass;
  peak RSS 51,252KB -> 51,128KB. Not a production latency claim.

## Deferred follow-ups

- Document-review operator attribution and timestamp-order reset behavior.
- Cook SoQL date literal and subject PIN dependency.
- Franklin/Hamilton/Mecklenburg/Wake discovery hostname failures.
- Production default-PIN display and write-endpoint authentication hardening (no production access here).
- Market-demand index readMarketDemandIndex re-parses JSON per call; mtime cache is absent.
- Cycle 19 cache-only OCR measurement: Navarro 7 docs / 22 pages / 1 OCR row / 0 complete
  source-supported addresses / 1 partial; Rockwall 26 docs / 94 pages / 15 OCR rows /
  14 complete source-visible addresses / 1 partial. All OCR rows remain review-only with
  empty normalized_address and no precise maps_url.
- Criterion 5 is now met across Hunt, Navarro and Rockwall by source-backed property-row
  traces, but this still does not create callable sellers or offer-ready rows.
- Read-only production snapshot export requires a later authorized cycle.
