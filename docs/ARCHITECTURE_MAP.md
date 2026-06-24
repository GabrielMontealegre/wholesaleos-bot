# Architecture Map

## Active Canonical Systems

These systems are current and should be reused before adding new modules.

### PropertyCandidate

Canonical acquisition candidate contract. Use for source-derived possible deals
before they become operator-ready Opportunities.

### Source Acquisition Core

Source orchestration layer for adapters. It should normalize candidates,
preserve evidence, score confidence, and avoid duplicate storage.

### Selected Deal Packet Service

Preview-only path for selected URLs or complete addresses. It is the fastest
money-path proof lane because it starts from known candidate input and projects
operator-ready output.

### CallReadyDealPacket

Packet projection for identity, evidence, contact route, locks, questions, and
call readiness. It must not invent contact, comps, ARV, repairs, MAO, or offers.

### Canonical Opportunity Kernel

Operator-facing Opportunity projection. It turns packets into stage, progress,
lock state, missing evidence, risks, and next action.

### Opportunity Work Orders

Deterministic work-order layer. Every lock or missing evidence item should
become executable work.

### Executable Work Orders

Bounded preview executor for safe work orders:

- `VERIFY_PROPERTY_SOURCE`
- `FIND_CONTACT_ROUTE`
- `RUN_COMP_RESEARCH`
- `CAPTURE_REPAIR_EVIDENCE`

This layer must stay capped, preview-only, and no-mutation.

### Comp Research Provider

Reusable comp validation surface. It is allowed only when it returns
source-backed sold comps. Do not replace it with legacy comp-agent logic.

### Search Provider Worker

Provider/router layer for search-backed discovery and verification. Use
redacted provider readiness and cost caps.

## Active Source Adapters

Adapters are useful only when their output enters the canonical money path.

- Dallas foreclosure adapter
- Dallas foreclosure document hunter
- Dallas PublicSearch document input
- Dallas Craigslist owner acquisition adapter
- Dallas FSBO/contact acquisition adapter

## Legacy Or Risky Systems

These systems may contain useful references, but they should not execute in the
money path without review.

- legacy `comp-agent`
- legacy `skip-trace-agent`
- old `modules/datasources.js` scraping paths
- old deal-engine paths
- synthetic/fake lead generation paths
- demo or seeded lead paths
- any code that writes saved leads automatically from preview output

## Canonical Direction

Everything should flow toward one shape:

```text
Source record or selected input
-> PropertyCandidate
-> CallReadyDealPacket
-> Canonical Opportunity
-> Work Orders
-> Executed Work Orders
-> Operator action
```

No new subsystem should create a parallel lead, packet, dossier, or opportunity
contract unless it is a temporary adapter into this flow.

