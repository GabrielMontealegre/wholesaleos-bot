---
market: multi-market
state: TX/CA/MI/OH
status: build
pr: pending
main_sha: 066851aa338f5a74e7156c2c11bec8584e062ff5
blocker: free enrichment attempts had no durable per-row rotation memory
---

# Cycle 7 - Enrichment Ledger, Lifecycle Status, Rotation Scheduler

## Why

San Antonio proved the acquisition lane can produce real Bexar rows, but the
free public contact hunter still worked like a stateless batch script: six rows
per run, always from the front of the current batch. Across 24 daily runs that
should be enough capacity to touch the whole San Antonio board, but without a
ledger the same first rows could be hunted repeatedly while later rows stayed
untouched.

## Build

- [[../WHOLESALEOS_OPERATOR_MAP|Operator map]] keeps the money-path rule:
  missing contact and comps become work orders, never fake facts.
- `lead-lifecycle-status` computes FRESH, AGING, SALE_PASSED,
  SUPERSEDED_DUPLICATE, and UNVERIFIABLE with human reasons.
- `enrichment-ledger` records free and paid-fallback attempts per row with
  lane, outcome, reason, source URL, cost, and next eligibility.
- `enrichment-scheduler` selects rows deterministically so unchanged caps still
  sweep the queue over the day.
- `market-comp-policy` disables free sold-comp hunting in TX because public sold
  prices are structurally unavailable. The row gets a work order instead of
  burning search budget.
- `paid-provider-fallback-registry` declares paid paths but keeps every provider
  disabled until Gabriel makes an explicit budget decision.
- `tx-bexar-county-free-lookup-profile` adds a public BCAD lookup profile for
  owner-of-record/mailing clues when the public appraisal page responds.

## Expected Operator Result

On San Antonio/Bexar, repeated 20-minute batches should stop re-hunting the same
six rows. The board should show a lifecycle chip, what the system tried, why a
row is blocked, whether paid fallback is merely available, and which rows are
quarantined before calling.

The expected contact-enrichment capacity is unchanged: 24 runs/day x 6 rows =
144 free contact attempt slots. The scheduler test proves 61 synthetic rows get
full-sweep coverage without raising caps.

## Still Missing

- Production proof requires the post-merge verification batch.
- BCAD may block or shape-change; if so rows show blocked evidence instead of
  owner clues.
- TX ARV/MAO stay locked until MLS access or paid comp data is approved.
