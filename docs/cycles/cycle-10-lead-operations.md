---
market: multi-market
state: multi-state
status: build
pr: pending
main_sha: 6537642
blocker: needs QA review before release
---

# Cycle 10 - Lead Operations Queue

Cycle 10 turns the public-deal snapshot into an operator work queue. It does
not create new leads, buy data, send messages, or save anything into the lead
database. It classifies existing preview rows into the next practical action
Gabriel can take.

## Operator Result

The dashboard Deal Finder now groups rows into:

- CALL_READY
- OUTREACH_READY
- MAIL_READY
- NEEDS_CONTACT_SEARCH
- NEEDS_SKIP_TRACE
- NEEDS_COMPS
- TITLE_NEEDED
- BLOCKED / Quarantined

`NEEDS_CONTACT_SEARCH` means identity is known but the free public contact
search has not finished yet. `NEEDS_SKIP_TRACE` means identity is known and
all free contact lanes are genuinely exhausted or blocked. These stay separate
so Gabriel does not price paid skip tracing from rows that have simply not been
searched yet.

## Known Next Gap

Nothing in the system currently sets `contact_workflow_complete`. Until an
operator control exists to mark a row as contacted, the queue cannot reliably
advance contacted rows into `NEEDS_COMPS` and then `TITLE_NEEDED`. That is the
next workflow gap after this cycle.

## Related

- [[cycle-9-county-onboarding]]
- [[cycle-8-free-identity-and-comps]]
- [[cycle-7-enrichment-ledger]]
- [[../WHOLESALEOS_OPERATOR_MAP|Operator blocker table]]
