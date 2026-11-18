# B-23c1 Provenance Pipeline

Base: released main19e4a77. B-23a513 passed320/0/0 and B-23b517 passed322/0/0;
both automatic deployments and fixed public/static checks passed. The previous
B-23a failed run44156436749 remains failed, never retried unchanged.

Before catalog wiring, synthetic integration exposed a separate boundary loss:
normalizePropertyCandidate reconstructed candidates without B-23 case/property
keys, document numbers, raw date/status, amount labels or lane reasons. Repeated
normalization during orchestration/card construction discarded these fields.
normalizeAdapterResult also omitted source_proof_rows, distress_audit and summary.
Recorded date had raw/status but no emitted origin, and same-day raw edits were
not audited. First failures retained locally in
`.wholesaleos-release-proof/b23c-{pipeline-preservation,recorded-date-origin}-first.txt`.

## Trace And Scope

- Readers emit fields and physical row references; mapRowToLead writes dates,
  origins and lanes; mergeLeads emits changed-value audit. Add recorded origin
  and include date raw/status/origin plus existing document/owner origins in audit.
- candidateFromLead supplies B-23 metadata, now including recorded-date evidence.
  Proof-only rows retain dates/raw/status/origin and capture/source kind, without
  owner names. Addressless rows do not become addressed candidates.
- normalizePropertyCandidate copies an explicit own-property string allowlist;
  no arbitrary spread of caller fields or authority flags. Existing candidates
  without those fields do not gain them. Existing authoritative fields and
  computed readiness logic are unchanged.
- candidateToFindMeCard normalizes again and stores property_candidate; the same
  allowlist survives that path. No UI/date/price formatter changed.
- normalizeAdapterResult retains B-23 proof rows/audit/summary; runAcquisitionCore
  carries proof-only rows at the result root. The new integration regression is
  the first consumer of these fields. No catalog entry, scheduler, route or source
  invocation is added; other adapters keep their existing result schema.

Raw/status/lane strings describe source evidence only. They never establish an
event date, asking price, verified address, saved lead or permission to ingest.
Row-level audit may contain prior source values; it is not an aggregate report
and must not be logged as one. Source summary remains counts-only.

## Verification

New regression runs the real orchestrator with a synthetic catalog and injected
CSV fetcher, restoring the catalog afterward. It covers current duplicate amount
and row-reference audit, raw recorded-date edits with unchanged normalized day,
past-sale lane, ambiguous dates, addressless proof, card re-normalization,
inherited-field exclusion, raw-only non-authority and forged ingestion booleans.
No network attempt occurs; no imports/business writes/provider activity.

Focused pipeline, property-candidate, original adapter, adapter row retention and
mapper row retention tests PASS. All original assertions remain unchanged.
Full exact-head hosted suite, green self-merge, automatic deployment and fixed
public/static verification remain required. B-23c reader settings, host fixes,
catalog/counts wiring and any actual collection are NOT complete in this slice.
