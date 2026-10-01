# Acquisition Engine Contract

WholesaleOS is an acquisition workflow engine for finding, repairing, analyzing, and calling real property opportunities. The operator flow is:

1. Request candidates by market and criteria.
2. Classify candidates into evidence buckets.
3. Repair source/address issues before valuation.
4. Send eligible candidates to AI Deal Analyzer.
5. Build Deal Call Dossiers.
6. Call or research from Daily Call Pipeline.
7. Match only against verified buyers or clearly labeled template buy boxes.

## Required Buckets

- Comp-Supported Wholesale Candidates: property-specific source proof, usable address, in-market, requested criteria, and at least 3 verified different sold comps.
- Criteria-Matched Candidates - Comps Missing: property-specific source proof, usable address, in-market, requested criteria, but comps/ARV still locked.
- Research / Source Repair: useful source or distress signal, but source proof, address, or market evidence is incomplete.
- Skip / Bad Lead: junk, wrong market, generic page, duplicate, blocked source, or no usable property identity.

## Operator Contract

- No new sidebar/nav tabs for acquisition workflow unless Gabriel explicitly requests one.
- Main Leads workspace stays clean.
- Acquisition controls live in FindMe Scout and Daily Call Pipeline.
- Lead cards come first; detail modal comes second.
- Every candidate must show why it exists, what matched, what is missing, and what to do next.
- "Found because" must use concrete criteria such as as-is/fixer, cash only, price cut, long DOM, foreclosure, tax, code, auction, FSBO, relisted, or bank-owned. Do not use vague "public source signal" as the main reason.

## Safety Contract

- No saved lead mutation from Scout runs.
- No autonomous ingestion.
- No fake owner, phone, email, debt, DOM, tax amount, auction amount, repair amount, motivation, comps, ARV, or MAO.
- Candidate evidence never unlocks valuation.
- Auction/REO/bank-owned defaults out of the normal wholesale batch.
- Foreclosure.com is not an ingestion source.
- Do not bypass login, paywall, CAPTCHA, bot challenge, or rate-limit pages.

## Dossier Contract

Each Deal Call Dossier should include:

- address
- public source URL or clear source reference
- source/domain/type
- bucket and priority
- found-because reason
- matched criteria
- top source-backed facts
- comp/valuation status
- contact status or path
- next action
- call script/questions
- missing evidence
- outcome/status fields
- notes and follow-up path

