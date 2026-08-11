---
market: multi-market
state: TX/CA/MI
status: build
pr: pending
main_sha: 3f8a0d3
blocker: free owner and comp sources exist only where public records expose them
---

# Cycle 8 - Free Public Identity, Entity, and Real-Comp Unlock

Cycle 8 adds the first free public enrichment layer that is not just PDF
acquisition: official parcel owner/mailing lookup, business-entity resolution,
and real sold-comp unlock in disclosure states where public sales are visible.

Evidence artifact:
[[../../exports/public-parcel-api-discovery/public-parcel-api-discovery-2026-08-11T20-18-58-090Z.json]]

## Public API Discovery

| Market | Source | Result | Decision |
|---|---|---|---|
| Bexar TX | `maps.bexar.org` ArcGIS parcels | Timeout from the local public API discovery run. | Keep owner lookup honest: report blocked/failed when the endpoint does not answer. TX comps remain locked because Texas is non-disclosure. |
| San Diego CA | SD county ArcGIS GeocoderMerged layer | Open. Exposes APN, owner name fields, owner mailing address fields, situs fields, document date, assessed values. | Use as official owner-of-record and mailing-route source for San Diego rows. Assessed values are not ARV. |
| Wayne MI / Detroit | Detroit ArcGIS property sales layer | Open. Exposes parcel id, address, sale date, sale price, sale verification, property class, and zip. | Use as a disclosure-state public comp source for Detroit rows. |

## Build Decision

- `public-parcel-owner-lookup` queries configured public ArcGIS profiles and
  records owner-of-record and mailing-route evidence only when source
  provenance is present.
- `business-entity-owner-resolution` resolves entity owners through public
  registry profiles when available. Registered-agent routes are labeled as
  agent routes, not seller routes.
- `disclosure-state-comp-resolution` unlocks comps only when at least three
  verified sold comps carry address, sale price, sale date, source URL, source
  kind, and evidence text.
- TX markets keep the MLS/paid-data work order for comps. CA/MI/OH markets can
  run public disclosure-state comp resolution when a configured public source
  exists.

## Operator Result

Gabriel should see a clearer row state:

- `CALL_READY` when a source-linked phone exists.
- `OUTREACH_READY` when a source-linked email/form/reply route exists.
- `MAIL_READY` when the official owner mailing address exists but no phone or
  email is visible.
- `COMP_READY` only when three public sold comps with provenance exist.
- `NEEDS_SKIP_TRACE` or `NEEDS_COMPS` when the free path is exhausted.

## Still Missing

- Bexar owner lookup may remain blocked by the public endpoint timeout.
- TX sold comps remain locked until MLS access or paid comp data is approved.
- Free public entity registries do not guarantee owner phone numbers; registered
  agents are labeled honestly.
