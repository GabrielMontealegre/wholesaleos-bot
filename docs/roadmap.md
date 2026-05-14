# WholesaleOS Roadmap

## Future Module: Tax Deed / Auction Opportunity

Planned for a future phase, this module would help surface tax deed and auction-style opportunities without changing the current ingestion or event flow.

### What It Should Track

- Tax deed and tax auction opportunities
- Low opening bid relative to estimated ARV
- Auction timing and urgency
- Manual seller context from the lead detail and Manual Deal Analyzer
- Risk signals tied to title, redemption, liens, occupancy, condition, and resale uncertainty

### Data Signals To Reuse

- `auction_date`
- `opening_bid`
- `tax_due`
- `parcel/APN`
- source URLs
- existing lead intelligence and analyzer values

### Analyzer Connection

The future module should connect to the Manual Deal Analyzer so a user can review a possible auction opportunity in the same place they already inspect deal math, comp confidence, and offer strategy.

### Risk Warnings To Surface

- Title uncertainty
- Redemption period risk
- Outstanding liens
- Occupancy unknown or unclear
- Unknown condition
- Resale uncertainty after auction purchase

### Future Notification Idea

One possible later notification could read:

`AI found a possible auction deal`

That should remain a future idea only. Do not build automation yet, and do not send alerts until validation confidence is high.

### Guardrails

- Do not change ingestion for this module.
- Do not add automatic alerts yet.
- Do not treat auction signals as finalized deal recommendations without validation.
- Keep the module additive and reversible.

