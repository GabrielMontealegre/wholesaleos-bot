# WholesaleOS Cycle Vault

This folder is the Obsidian-ready map for the public deal source expansion.
Use Graph View on the wikilinks to see how markets, blockers, source lanes, and PRs relate.

## Completed / Current Cycles

- [[cycle-0-multi-market]] - laneless-market safety and Dallas regression guard.
- [[cycle-1-cuyahoga]] - Cuyahoga blocked by county network reachability.
- [[cycle-2-detroit]] - Detroit Land Bank public inventory lane.
- [[cycle-3-jefferson-al]] - Jefferson County AL survey, blocked for now.
- [[cycle-4-san-diego-ca]] - San Diego County CA tax-defaulted power-to-sell notice, verified open (build pending).
- [[cycle-5-los-angeles-ca]] - Los Angeles County CA tax-defaulted auction book, verified open (build pending).
- [[cycle-6-tx-volume-wave]] - Texas metro volume wave: Bexar/San Antonio and Fort Bend/Houston fit existing TX source families; Austin deferred.
- [[cycle-7-enrichment-ledger]] - enrichment ledger, lifecycle status, and hunter rotation so existing rows get worked before more raw volume.
- [[cycle-8-free-identity-and-comps]] - free public owner/mailing routes, entity resolution, and disclosure-state comp unlock.
- [[cycle-9-county-onboarding]] - county candidate registry, probe artifact, and multi-market throughput planning.
- [[cycle-10-lead-operations]] - segmented lead operations queue and manual mail-ready export.
- Cycle 11 - operator contact outcomes, invalidated routes and closed-not-interested state ([state implementation](../../modules/research/lead-operations-state.js)).
- Cycle 12 - read-only blocked inventory breakdown reconciled with queue segments ([implementation](../../modules/research/blocked-inventory-breakdown.js)).
- Cycle 13 - bounded stored-document re-extraction and terminal backoff ([implementation](../../modules/research/document-reextraction-pass.js)).
- Cycle 14 - document review queue, operator reset and document-URL-scoped eligibility ([queue service](../../modules/research/deal-board-queue-service.js)).
- Cycle 15 - public sales schema discovery, parcel-only comp self-exclusion and dry-run paid connectors ([comp resolver](../../modules/research/disclosure-state-comp-resolution.js)).
- [[cycle-16-manual-evidence-packet]] - screenshot-assisted evidence packets for the best current rows in every live market.
- Cycle 17 - market demand index and strict, shared official/screenshot comp grid ([market index](../../modules/research/market-demand-index.js), [grid](../../modules/research/strict-comp-grid-config.js)).
- [[cycle-18-evidence-packet-throughput]] - frozen-corpus property-address integrity and independent packet readiness; draft review only, no production access.

Cycles 11-15 and 17 are linked to their actual implementations because separate cycle
note files were not present in this checkout. These entries do not claim new deployments.

## Market Notes

- [[jefferson-al]]
- [[san-diego-ca]]
- [[los-angeles-ca]]
- [[cycle-9-county-onboarding]]

## Shared References

- [[../WHOLESALEOS_OPERATOR_MAP|Operator blocker table]]
- [[../CODEX_HANDOFF_2026-07-09|Codex handoff]]
- [[../GABRIEL_DAILY_DEAL_WORKFLOW|Daily deal workflow]]
