# WholesaleOS Operating System

## Purpose

WholesaleOS exists to help Gabriel close wholesale real estate deals. Gabriel is
the first user. The product is not an abstract SaaS platform yet; it is an
operator system for finding, proving, pricing, calling, and closing deals.

Every change must move Gabriel closer to a real seller conversation, a real
offer decision, a real buyer match, or a real closing.

## Operating Objective

The system must produce executable Opportunities:

- real property identity
- real source evidence
- real motivation evidence
- real contact route when available
- real comp evidence when available
- explicit lock states when numbers are not supported
- deterministic work orders for missing proof
- next best action Gabriel can understand and execute

## Product Standard

Every feature must answer four questions before code changes:

1. What are we doing?
2. Why does this help Gabriel close deals?
3. What should change in the system?
4. What should Gabriel see?

If a change cannot answer those questions, do not build it.

## Money Path First

The highest priority is the path from Opportunity to Profit. Work that improves
source discovery but does not connect into identity, evidence, contact, comps,
work orders, or operator action is lower priority.

Do not build more adapters before the execution path can use the evidence they
produce.

## Safety Baseline

WholesaleOS must never invent deal facts. It must not fake contact information,
addresses, motivation, comps, ARV, repairs, MAO, offers, buyers, title company
status, seller intent, or closing probability.

When evidence is missing, the system must say what is missing and create the
next work order.

