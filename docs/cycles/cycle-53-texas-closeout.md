# Cycle 53, PR 1: Texas close-out and reusable card explanations

The public comp lane stays off in non-disclosure states, including Texas. Operator-confirmed sold-property screenshots remain available. A verified public sales profile opens the existing public comp engine in its market; a market without one remains pending. This does not create a new source or change a comp threshold.

Every preview row now has a read-only priority, deal-fit explanation, one next step, and plain-English glossary. Holding-period claims require a sourced prior recorded sale. A deed date alone is not a recorded sale. A foreclosure notice does not establish the current balance or equity. A county assessment is neither ARV nor debt. A property without a verified distress signal can rise no higher than WORTH_A_LOOK. Quarantined rows remain blocked from contact regardless of the displayed research priority.

The prior equity projection subtracted an original mortgage amount as though it were a current payoff. It now keeps the original amount as a sourced clue but reports estimated debt, equity, and room to offer as unknown until a current total payoff is established. This can reduce the number of rows shown as having room to offer; it is an honesty correction, not a loss of source evidence.

Paid comps remain off. No provider is selected and no key is configured in this release. Future activation requires all three state-scoped environment settings: `WOS_PAID_COMP_ENABLE_<STATE>=true`, `WOS_PAID_COMP_PROVIDER_<STATE>`, and `WOS_PAID_COMP_KEY_<STATE>`. A candidate must identify the same provider, carry `subject_state`, use `recorded_sale` or `mls_closed_sale` as its price basis, have ordinary provenance, and pass the unchanged strict comp grid. Estimates and AVMs cannot count. No connector runs from this change.

The existing source-date normalization already accepts a spelled-out date such as `October 6, 2026`. Slash dates such as `10/06/2026` remain ambiguous until their month/day order is explicitly verified. The Cycle 50 quarantine rule is intentionally unchanged; accepting a bare slash date in the lifecycle parser would bypass that rule. Therefore the requested bare-numeric-date P7 assertion is not met and needs a source-specific date-order decision before release.

ArcGIS parcel profiles may now allowlist either MapServer or FeatureServer paths, including an ArcGIS Online organization prefix. Optional living-area, bedroom, bathroom, and sale fields appear only when a profile maps them. The Ellis profile and its existing record shape remain unchanged.
