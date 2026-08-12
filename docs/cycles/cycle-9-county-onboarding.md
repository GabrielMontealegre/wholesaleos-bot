---
market: Cycle 9 county onboarding
state: multi-market
status: survey
pr: pending
main_sha: 570db96
blocker: candidate registry contains portal hypotheses, but no documented machine-readable schema URLs were verified
---

# Cycle 9 - County Onboarding Pipeline and Multi-Market Throughput

Cycle 9 turns county expansion into a repeatable intake pipeline instead of a
one-off branch per metro. The cycle surveys candidate counties, writes a dated
probe artifact, drafts profile entries from the probe evidence, and exposes a
county-readiness panel on the Dashboard so Gabriel can see what is open,
piloting, blocked, and still only a hypothesis.

Evidence artifact:
[[../../exports/county-onboarding/county-onboarding-2026-08-12T12-18-38-617Z.json]]

## Survey Summary

| Status | Counties | Notes |
|---|---:|---|
| live | 0 | No county had a documented machine-readable parcel, sales, and distress schema in the registry. |
| piloting | 0 | No county had a verified parcel plus distress schema. |
| survey | 0 | HTML portals are hypotheses, not proof-only data legs. |
| blocked | 17 | Every current candidate URL is an HTML portal or homepage, not a documented schema endpoint. |

## What the probe means

- **Live** now requires a parsed machine-readable schema for parcel, permitted
  sales, and distress legs, with required fields present.
- **Piloting** requires parsed parcel and distress schemas with the required
  identity and mailing fields.
- **Survey** requires a parsed distress schema that can identify a property.
- **Blocked** means no qualifying schema was proved. A normal HTML page is
  recorded as `html_portal_no_machine_readable_schema`, never as an open leg.

The previous survey reported 7 live, 1 piloting, 3 survey, and 6 blocked. Those
counts were invalid because HTML tokens were mistaken for field descriptors.
The invalid artifact was removed and is not release evidence.

## Operator Result

Gabriel can now see a county-readiness panel that tells him:

- which counties have proven schemas rather than portals,
- the real failed reason for each closed leg,
- candidate hypotheses in a separate column,
- and a reporting-only throughput plan that does not change live selection.

## Related

- [[../WHOLESALEOS_OPERATOR_MAP|Operator blocker table]]
- [[cycle-8-free-identity-and-comps]]
- [[cycle-7-enrichment-ledger]]
- [[cycle-6-tx-volume-wave]]
- [[cycle-5-los-angeles-ca]]
- [[cycle-4-san-diego-ca]]
- [[cycle-2-detroit]]
