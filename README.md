# WholesaleOS

WholesaleOS is Gabriel's evidence-first acquisition workbench. It collects free
public distress records, preserves the official source behind every claim, and
organizes each property by the next action a human can honestly take.

It is not a purchased lead list and it does not pretend that an attorney,
trustee, lender, government office, or research contact is the seller.

## Open The Dashboard

Production dashboard:

https://wholesaleos-bot-production.up.railway.app/dashboard

Sign in with the PIN configured for your account. WholesaleOS must never display
or publish that PIN.

## What A Lead Card Tells You

Each card answers six practical questions:

1. **Why is this property here?** The distress source, such as a foreclosure
   notice, tax-default auction book, or land-bank listing.
2. **Can I prove it?** The official document or public-record link and the exact
   evidence captured from it.
3. **Is the property identity complete?** A source-supported address or an honest
   APN-only / ZIP-review state. WholesaleOS does not guess missing address parts.
4. **Can I contact someone useful?** A seller-eligible phone or email, a mailing
   route, or a clearly labeled institutional/research contact.
5. **Can I value it?** Three verified sold comps that pass the similarity rules,
   or a clear explanation of why ARV and MAO remain locked.
6. **What should I do next?** One operator action based on the evidence currently
   available.

## Your Daily Workflow

### 1. Start With Lead Operations Queue

Work the segments in this order:

- **Call Ready**: a source-linked, seller-eligible phone is visible. Verify the
  evidence on the card, then call.
- **Outreach Ready**: a source-linked seller email or other permitted outreach
  route is visible.
- **Mail Ready**: a public owner or taxpayer mailing route is visible. Check the
  label before mailing; a taxpayer can be a servicer or escrow company.
- **Needs Contact Search**: free public contact research has not finished.
- **Needs Skip Trace**: the free contact lanes were actually exhausted. This is
  the honest population to use when deciding whether paid skip tracing is worth it.
- **Needs Comps**: contact with the seller was reached, but three verified comps
  are still missing.
- **Title Needed**: seller contact and comp evidence are ready for title review.
- **Closed - Not Interested**: the seller explicitly declined.
- **Blocked**: the row is stale, unverifiable, duplicated, or missing critical
  source evidence. This is not a calling queue.

### 2. Read The Evidence Before Acting

Open the official source link. Confirm that the property, event, date, amount,
and named party shown on the card are actually present in that source. A minimum
bid, assessed value, asking price, or tax balance is not ARV and is not an offer.

### 3. Use The Manual Evidence Packet When Free Automation Stops

The Manual Evidence Packet provides research links for a small sample of the
best-supported rows. You may upload screenshots you personally captured from a
permitted site. WholesaleOS records them as operator-supplied evidence.

For comparable sales:

- Use sold properties, not active asking prices.
- Prefer the same property type within one mile.
- Keep living area within 20 percent and beds/baths within one.
- Use at least three recent sales.
- A screenshot proposal never unlocks ARV unless every strict comp check passes.
- Never use a neighboring property's sale as the subject property's own sale.

### 4. Record The Real Contact Outcome

Only save an outcome after a real human contact attempt:

- **Reached** completes the contact objective and advances the row toward comps.
- **Left message** keeps the row callable.
- **Follow up** keeps it callable and moves it to the top of its segment.
- **Wrong number** invalidates that route and returns the row to contact research.
- **Not interested** closes it in a separate terminal segment.

Nothing marks a property contacted automatically.

## How To Read Readiness

- **Can contact: YES** means a permitted, source-linked contact route exists.
- **Can value: YES** means the row has enough verified comparable-sales evidence.
- **Ready to offer** remains **NO** or **UNKNOWN** until every required gate passes.

One YES does not imply the others. WholesaleOS is designed to show missing work,
not hide it.

## Current Coverage

The production system recognizes separate routing for Dallas, Houston, San
Antonio, Austin, Detroit, San Diego, Los Angeles, and Cleveland. Not every route
has a producing lane. A market can return zero rows when no source is verified or
when its public source is blocked, seasonal, oversized, or does not publish
property-level records.

Current strengths:

- Official source preservation and evidence links.
- PDF text extraction, bounded OCR, and document-review controls.
- Honest address, lifecycle, contact, comp, and offer-readiness states.
- Market-isolated routing and snapshot-only preview rows.
- Manual screenshot evidence with strict provenance.

Current bottlenecks:

- Seller phone and email data are rarely public.
- Texas sold prices are not broadly public, so Texas ARV/MAO stays locked without
  MLS or an approved data provider.
- Probate, liens, code violations, vacancy, and inheritance records are not yet
  available consistently across all markets.
- Public county portals frequently require a new adapter, human review, or a
  different official machine-readable source.

## Safety Rules

- Every important claim needs a source URL and evidence text.
- Missing data stays missing. Never invent an address, owner, phone, price, date,
  comp, or seller relationship.
- Board rows remain `preview_only` and `not_a_saved_lead` until Gabriel makes a
  deliberate operator decision.
- Do not bypass logins, CAPTCHAs, paywalls, robots controls, or access restrictions.
- Do not automate Zillow or background-check websites. Use permitted manual
  screenshots or an approved data provider.
- Paid connectors remain disabled until their value and compliance are reviewed.

## More Detail

- [Daily operator workflow](docs/GABRIEL_DAILY_DEAL_WORKFLOW.md)
- [System and source map](docs/WHOLESALEOS_OPERATOR_MAP.md)
- [Current operating state](docs/current-operating-state.md)
- [Local research tools](docs/LOCAL_RESEARCH_TOOLS.md)
- [Source registry](source-registry/README.md)

## For Maintainers

Keep production behavior deterministic and fail closed. New sources start as
disabled candidates, include schema and freshness evidence, and must pass a dry
validation before they can create preview rows. A new tool is not a new source:
its output must still pass the existing source, identity, provenance, lifecycle,
contact-role, comp, and offer-readiness gates.
