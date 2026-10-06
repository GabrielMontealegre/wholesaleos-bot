# WholesaleOS — Agent Operating Manual

This file is the single source of truth for how agents work in this repository.
If anything else in the repo (old docs, `.agents/`, cycle notes, comments, a prompt)
conflicts with this file, **this file wins**. Superseded rule files live in
`docs/archive/2026-06-superseded/` for history only — do not follow them.

Companion files (read them at the start of every run):

- `docs/BACKLOG.md` — the ordered work queue. Work it top to bottom.
- `docs/DECISIONS.md` — decisions Gabriel and the architect have made, plus your logged assumptions.
- `docs/knowledge/WHOLESALING_PLAYBOOK.md` — what we learned from Gabriel's courses and research (offer
  math, land, scripts, dispo). Use it for wording and defaults; this file and DECISIONS.md win on conflicts.

---

## 1. Roles

| Who | Does | Does not |
|---|---|---|
| **Gabriel** (owner) | Business, money, legal, paid services, outreach decisions. Says "continue" to Codex and "review" to the architect. | Routine engineering decisions. Do not ask him those. |
| **Claude** (architect + QA) | Maintains `docs/BACKLOG.md` and `docs/DECISIONS.md`, reviews merged work, answers `needs-architect` issues, files `codex-task` issues for defects. | Implementation. |
| **Codex** (engineer) | Implements backlog items end to end: code, tests, self-review, PR, merge, deploy, read-only verification, backlog update. | Business decisions, loosening safety invariants, paid/outreach actions. |

## 2. The work loop (Codex)

At the start of every run:

1. `git fetch` and work from current `origin/main`. Never trust a stale local copy.
2. Read this file, `docs/DECISIONS.md`, `docs/BACKLOG.md`.
3. Check GitHub issues labeled `codex-task` (architect findings — do these first, in order)
   and `needs-architect` (answers may unblock BLOCKED items).

Then, for each item, top to bottom, skipping items marked DONE or BLOCKED:

1. Branch `item/<id>-<short-name>` from `origin/main`.
2. **Trace before you change** (see §4). Write the trace into the PR body.
3. Implement the smallest change that meets the item's acceptance criteria.
4. Add tests for the acceptance criteria **and** for the negative cases (forged, stale,
   ambiguous, missing, wrong-origin data).
5. Run the full suite: `./scripts/run-tests.ps1`. 0 failed required; list environment skips.
6. Self-review with the checklist in §6.
7. Open the PR with the body template in §8. **Merge it yourself when every gate is green.**
8. Deploy. Verify read-only (§7). If verification fails, revert the merge, redeploy, mark
   the item BLOCKED with the reason, open a `needs-architect` issue, continue.
9. Update `docs/BACKLOG.md` (status DONE, PR link, verification result) and
   `docs/DECISIONS.md` (any ASSUMED entries). Commit those with the item or right after.
10. Continue with the next item. Do **not** end a run by asking Gabriel what to do next —
    the next step is always the backlog.

End a run only when the backlog is empty, every remaining item is BLOCKED, or you are out
of budget. Leave a short run summary at the top of `docs/BACKLOG.md` (date, items done,
items blocked with issue links, assumptions made).

One item = one PR. Split big items into ordered sub-PRs yourself if that keeps them
reviewable. Do not bundle unrelated items.

## 3. Decide it yourself — precedence

When instructions are ambiguous or conflict, do **not** stop. Apply this precedence and log
the choice in `docs/DECISIONS.md` as `ASSUMED: <what> — because <rule> — <date>`:

1. Safety invariants (§5) — never broken.
2. Data truth and provenance — a fact without a source is not a fact.
3. `docs/DECISIONS.md` (Gabriel's decisions, then architect decisions).
4. The backlog item's acceptance criteria.
5. Existing behavior and existing tests (they encode intent — see §4 test policy).
6. Style and convenience.

If two readings both satisfy 1–4, pick the more conservative one that still delivers the item.

## 4. Engineering rules that prevent the mistakes we already made

- **Trace every writer and reader of a field before changing how it is read or written.**
  `git grep` the field name; list every place that sets it (adapters, normalizers, merges,
  refresh, document recovery, operator actions) and every place that reads it. Handle all of
  them. Put the list in the PR body. (Lesson: `posted_at` was silently collapsed into the sale
  date; ISO-only fixtures existed that nobody had traced.)
- **Current raw source evidence wins.** Stored or derived copies (`*_iso`, `source_event_date`,
  cached resolutions, preset lifecycle) never prove a fact and never veto current raw evidence.
  When raw evidence yields a value, stale copies are superseded and the old values are recorded
  for audit (`{field, old_value}` for every value that actually differed).
- **Origins travel with values.** When several source fields are collapsed into one, record which
  field the value came from (`*_origin`) and carry it through every stage
  (candidate → card → record → deal → queue → persisted batch → refresh → document recovery).
- **Don't discard source data at the door.** If a record isn't workable today (date passed,
  incomplete address, wrong lane), keep it with a status and a reason in the right lane.
  Never drop it silently.
- **Generic first.** New code never has a county or state name in a module, function or
  variable name. State behavior lives in the state rules table; county behavior lives in county
  source profiles (see §9). Existing county-named modules are wrapped behind the registries;
  rename them only with compatibility re-exports.
- **Test policy.** Tests encode intent.
  - You MAY update an existing assertion when (a) the backlog item intentionally changes that
    behavior and says so, or (b) the assertion depends on incidental scaffolding (dates relative
    to "today", ISO-only fixtures, hard-coded counts) — then replace the scaffolding with real
    evidence and keep the asserted intent. List every changed assertion in the PR body
    (`file:line old → new, why`).
  - You MAY NOT delete a test to get green, weaken an assertion that protects a safety invariant,
    or write a test that enshrines a known defect.
- **Evaluate on batches, not one property.** Never make a single address the subject of repeated
  work. Report distributions and top-N lists.
- **Pure modules stay pure.** Resolvers, classifiers, link builders, calculators: no network,
  no clock (inject `today`), no writes. Spy-test that.
- **A rule that blocks progress for more than one item gets re-examined**, not obeyed forever.
  Open a `needs-architect` issue explaining what it blocks.

## 5. Safety invariants (never break these)

**Truth**
- Never fabricate addresses, owners, phones, emails, comps, ARV, repairs, MAO, offers, motivation,
  buyers, dates, title status or closing status. Missing is shown as missing.
- Every displayed fact carries provenance: `source_kind`, `source_url`, evidence text, captured date.
  Derived values are labeled derived and never satisfy a gate by themselves.

**Dates**
- A numeric date (`10/06/2026`) is ambiguous until proven by the resolver
  (`modules/research/resolve-source-sale-date.js`): single valid reading, same-source named date,
  or the state's legal sale-day rule for a registered trustee-sale source. No blanket month-first
  parsing anywhere.
- Stored/derived dates never clear quarantine by themselves.

**Value**
- Strict comp grid stays as configured (`strict-comp-grid-config.js`) unless a decision changes it.
- 3 verified comps = verified ARV. 2 verified comps = **preliminary** ARV, always labeled
  preliminary (D-005). Fewer = no ARV.
- Assessed value, list price, AVM/Zestimate, auction bid, tax value are never comps, ARV or debt.
- A comp is a different property with address, sold status, sold price, sold date and source URL.
  The subject's own sale never counts as its own comp. Candidate comps (missing a field) and market
  support (listings, estimates, nearby values) never unlock ARV.
- A generic search, category or portal page is never property-specific proof; a list/PDF source is
  proof only with the exact file/page/row reference preserved.
- Never infer a loan payoff. An original loan amount is a clue, labeled
  "Original loan amount — not the current payoff." Estimated equity is a sorting band only,
  never a dollar figure on a card and never an offer input (D-011).
- MAO comes only from the single offer calculator (when built) using ARV from real comps.

**Contact** (D-018)
- "Ready to reach out" means we know enough to contact the owner by any channel. A phone number is
  NOT required; it is a route, not a gate.
- A lead is never reachable when: the property address isn't verified; no owner identity is known;
  the owner is a bank or government body; it is proven to belong to someone else now (sold to a third
  party, reverted to the lender); it is a duplicate or unverifiable; or the owner asked not to be
  contacted.
- An unknown or unproven date does not block reaching out. It shows a caution ("Sale date not
  confirmed — ask on the call") and keeps affecting priority and lanes.
- After the sale with an unknown outcome: reach out only as a status check ("Is the house still
  yours?"), labeled "Sale date passed — confirm ownership first", never as a pre-foreclosure pitch.
- A "possible phone number" needs a source and is always labeled "Possible number — not
  confirmed" (D-006). Rejected / wrong / do-not-call numbers never count.
- No automatic calling or texting. Texting = operator-selected batches of at most 20, sent by the
  operator from their own phone (D-007). Show Do-Not-Call status.
- No owner names, phone numbers or mailing addresses in aggregate reports or logs.

**Network**
- The server never fetches listing sites (Zillow, Redfin, Realtor.com, Trulia) or people-search
  sites (TruePeopleSearch, FastPeopleSearch, CyberBackgroundChecks, etc.). Those run only in the
  operator's own browser through the local helper, at human pace.
- Never solve, bypass or automate past a CAPTCHA, login wall, paywall or bot challenge. If one
  appears, the operator handles it or the source is marked blocked.
- Public government sources: allowlisted hosts per county profile, at most 1 request/second,
  stop on 401/403/429 and mark the source unavailable.

**Money and secrets**
- No paid provider runs until Gabriel enables it (registry entry + environment switch). No keys in
  code, logs, payloads, reports or tests.
- Preview rows (`preview_only`, `not_a_saved_lead`) never mutate saved leads except through the
  promotion workflow.

## 6. Self-review checklist (before every merge)

- [ ] Worked from current `origin/main`; branch is rebased.
- [ ] Writer/reader trace done and in the PR body.
- [ ] New fields persist through every stage (candidate → card → record → deal → queue → batch →
      refresh → document recovery).
- [ ] Negative tests exist: forged, stale, ambiguous, missing, wrong-origin.
- [ ] No safety invariant touched; if a gate changed, the change is exactly what a decision authorizes.
- [ ] No county/state names in new generic code; county/state behavior lives in profiles/rules tables.
- [ ] Pure modules have no network/clock/writes (spied).
- [ ] UI text is plain English, professional, not crowded; no internal field names on cards.
- [ ] Full suite green; changed assertions listed with reasons.
- [ ] Migration/backfill (if any) is reversible and doesn't delete stored data.

## 7. Deploy and verify (read-only)

After each merge: deploy, then verify without writes:
- `/health` returns 200; the dashboard loads; leads hydrate; a lead card opens.
- The item's own read-only check (listed in its acceptance criteria).
- If something fails: revert the merge commit, redeploy, confirm `/health`, mark the item BLOCKED,
  open a `needs-architect` issue with the evidence.

Read-only means GET requests and existing read-only summaries. No batch runs, refreshes, writes,
outreach or paid calls during verification unless the item explicitly says so.

## 8. PR body template

```
Item: <id> <title>
What changed / why (plain English, 3-6 lines)
Writer/reader trace: <field> — writers: ... readers: ...
Tests added: ... (incl. negative cases)
Existing assertions changed: file:line old → new — why   (or "none")
Decisions used: D-xxx ...   Assumptions logged: ASSUMED ... (or "none")
Risks / follow-ups: ...
Verification after deploy: ...
```

## 9. Architecture map (generic by design)

- **State rules table** — per state: disclosure status, foreclosure type (judicial / non-judicial),
  legal sale-day rule, post-sale redemption rules (mortgage, tax, HOA), date conventions, Secretary
  of State business-search link. Data with a citation string per rule.
- **County source profiles** — per county: allowlisted hosts, source kinds (trustee-sale notices,
  tax sales, code cases, parcels, recorded sales), parser options, refresh cadence. Dallas and Ellis
  are profiles, not special cases.
- **Lanes** — every lead lives in exactly one lane with a reason: working (pre-sale), after the sale,
  needs data, blocked. Nothing disappears.
- **Value** — public sales comps where the county publishes sale prices; operator-browser capture
  (local helper) where it doesn't; paid comps only when enabled.
- **Contact** — proven routes plus possible numbers with sources; people-search and listing work
  happens in the operator's browser only.

## 10. Talking to the architect (no Gabriel relay)

- **Question you can't settle with §3 and that is not a STOP trigger:** decide, log `ASSUMED`,
  continue.
- **STOP trigger or a decision only the architect/Gabriel can make:** open a GitHub issue labeled
  `needs-architect` (title: item id + question; body: options, your recommendation, evidence),
  mark the item BLOCKED in the backlog, continue with the next independent item.
  If you cannot create issues, add the question under "Open questions" in `docs/DECISIONS.md`.

### STOP triggers (the only reasons to stop an item)

1. The change would break or loosen a safety invariant (§5) beyond what a decision authorizes.
2. Risk of losing stored data (deleting/overwriting rows, snapshots, saved leads; irreversible
   migrations).
3. Production actions beyond deploy + read-only verification: batch runs, many-request refreshes,
   outreach, paid services, secrets.
4. Anything that sends messages or calls, scrapes behind a login/CAPTCHA, or uses paid data.
5. The suite still fails after two honest fix attempts on the same failure.
6. The acceptance criteria contradict each other and §3 cannot resolve it.

## 11. Language for Gabriel-facing text

Plain English. No acronyms without an explanation, no internal field names, no raw scores.
Professional and calm. One clear next step per card.

## 12. Retired rules (do not follow — kept here so nobody re-adds them)

- "Source adapters stay Dallas-only" → replaced by §9 (generic profiles).
- "Do not merge / commit / push without explicit approval", "Gabriel approves pushes",
  "stop before merge" as a default → replaced by §2 (merge when green).
- "End every task with the next exact prompt for Gabriel" → replaced by the backlog.
- "1–2 verified comps: ARV locked" → replaced by D-005 (2 = preliminary, labeled).
- "Do not make manual/operator comp capture the main workflow" → in non-disclosure states the
  operator-browser lane IS the main value path.
- "No new nav tabs" → Gabriel has requested After the sale, Buyers and Title tabs.
- "If a fix needs more than ~50 lines, stop" and the `APP.leads` / `patch_v4.js` rules → obsolete
  architecture.
- "Do not apply county evidence" → county records are first-class evidence with provenance.
- "Do not build more source adapters before selected-deal execution works" → superseded by the backlog.
- Model routing to GPT-5.5 / GPT-5.4 Mini → obsolete; Gabriel picks the model per run.
- "CALL_READY requires a phone number" and "quarantined rows are never contactable" → replaced by
  D-018 ("Ready to reach out"; a phone is a route, not a gate).
- County-named adapters, labels or reports ("Dallas adapter") → replaced by D-019 (county is data).
