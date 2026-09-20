# Cycle 35: Property Leverage Lane

This cycle separates property research from seller-contact research. A property with a
source-supported address can now move through property facts, value-source policy and
verified comps even when no phone, email or mailing route exists.

## What the operator gets

- `contact_state` says whether the seller contact route is ready, unfinished or exhausted.
- `property_state` independently says whether the property needs facts, a permitted value
  source, more comps or is property-ready.
- `leverage_dossier` groups sourced identity, ownership, debt, listing, rent, distress,
  neighborhood and condition evidence. Missing provenance produces `UNKNOWN`, not a guess.
- `equity_estimate` uses typed debt only. It prefers a three-comp ARV proxy and otherwise
  uses a sourced listing price. Missing debt or value keeps the estimate unknown.
- `room_to_offer` is `LIKELY`, `TIGHT`, `NONE` or `UNKNOWN`. It is a clue for prioritizing
  research, never permission to make an offer.

Texas remains `NEEDS_VALUE_SOURCE` because the current market policy requires MLS or another
approved value source. Existing `row_state`, contact behavior, comp gates and `ready_to_offer`
behavior are unchanged.

## Important interpretation

The build brief included a contradictory example: a $445,000 value and $400,000 debt leaves
$45,000 of positive equity, or about 10%. The mandatory thresholds classify that as `TIGHT`;
`NONE` is reserved for zero or negative equity. The implementation follows the formula and
thresholds rather than falsifying the arithmetic to match the example.
