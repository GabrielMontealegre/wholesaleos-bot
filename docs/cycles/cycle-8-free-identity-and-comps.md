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

Bexar retry artifact:
[[../../exports/public-parcel-api-discovery/public-parcel-api-discovery-bexar-retry-2026-08-11T21-14-55-027Z.json]]

Cycle 8 follow-up discovery artifact:
[[../../exports/public-parcel-api-discovery/public-parcel-api-discovery-2026-08-11T22-57-27-738Z.json]]

## Public API Discovery

| Market | Source | Result | Decision |
|---|---|---|---|
| Bexar TX | `maps.bexar.org` ArcGIS parcels | Failed from the local public API discovery run and failed again on a 30-second retry. | Keep profile marked unverified; any result from the guessed field map must carry a caveat. TX comps remain locked because Texas is non-disclosure. |
| San Diego CA | SD county ArcGIS GeocoderMerged layer | Open. Exposes APN, owner name fields, owner mailing address fields, situs fields, document date, assessed values. | Use as official owner-of-record and mailing-route source for San Diego rows. Assessed values are not ARV. |
| Wayne MI / Detroit | Detroit ArcGIS property sales layer | Open. Exposes parcel id, address, sale date, sale price, sale verification, property class, and zip. | Use as a disclosure-state public comp source for Detroit rows. |
| Detroit MI parcel attributes | City of Detroit Office of the Assessor `Parcels_Current` layer | Open; 380,445 records. Exposes taxpayer owner fields, mailing components, address, parcel number, and `property_class_desc`. | Use as official owner, mailing, and sourced land-use evidence. Never infer land use when the field is empty. |
| Bexar TX follow-up | `maps.bexar.org` ArcGIS parcels | Failed again with a 75-second discovery timeout/unreachable result; no official alternative public parcel layer was verified. | Keep the guessed field map unverified and caveated. |
| San Diego CA recorded sales | Verified parcel layer plus official public searches | Parcel layer is open and addressable but has document date only; no sale-price field. | Keep CA comp lane pending. |
| Los Angeles CA recorded sales | Official assessor parcel and multifamily-sales candidates | Parcel layer has no sale price/date; the 597-row multifamily table has price/date but no address or ZIP comp-location key. | Keep CA comp lane pending; do not use AIN-only records as neighborhood comps. |

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
- San Diego and Los Angeles remain `COMP_LANE_PENDING_PUBLIC_SALES_SOURCE` until
  a property-level public layer exposes sale price, sale date, and an address or ZIP.
