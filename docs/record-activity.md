# Record references and activity

New reviewed deals get `WOS-ST-####`, buyer finds get `BUY-####`, and recorded
buyer/deal criteria matches get `M-####`. Imports preserve a supplied valid,
unique reference. Existing reference aliases are retained. References identify
records; they are not property proof, approval, an offer or a commitment.
The state segment is the namespace at issue time. It is not changed if later
facts are corrected; XX means no two-letter state code was available.

The top search also finds references, cities and ZIPs. It opens reviewed deals
and buyer finds directly, and retains the prior search fallback for other data.
Unproven saved addresses are labeled as stored records needing source proof.
Match references open the associated reviewed deal, not a different property.

Activity is one append-only stored `activities` collection. New import, approval,
draft and stage operations append accountable rows. Old lead activities remain
untouched; historical buyer/deal card entries are projected read-only unless a
canonical row already represents them. Both histories remain visible without a
startup or GET migration. Matched events appear on both associated timelines.

Interaction import accepts JSON (`items`) or JSONL. Each item supplies `kind:
interaction`, `ts`, `who`, `channel`, `dir`, `with`, `ref`, `summary`, and optionally
`type`/`body`. A JSONL item without kind is an interaction proposal. Timestamp must
be a valid ISO UTC instant, not a future assertion. References must resolve to one
existing record, including one introduced earlier in the same import. Duplicate
interactions are not re-recorded. Unknown references and forged fields fail closed.

Direction alone never proves a message was sent. Without an explicit type the
event is `interaction_reported`. Imported histories do not approve buyers, alter
contact outcomes, verify evidence, unlock value, or record commitments. Raw body
and party details stay in the database and are omitted from timeline responses;
parser errors contain fixed codes only. A private summary is shown only to an
authenticated admin and is not printed in server logs or public reports.

Date filters use the same local-calendar boundaries as the displayed timestamps.
The working JV download now explicitly POSTs to record actual generation; its GET
preview remains read-only. The term sheet stays an unsigned working draft. Workflow
expiry is computed on reads and journaled once on the next explicit write; there
is no hidden background write or invented exact-time observation.

## Existing records

Deployment and dashboard reads do not backfill old records. The Activity view
shows missing-reference counts and an explicit, admin-only assignment control.
That operation adds reference metadata and reference-assigned history; it does
not change facts, old aliases, approval, eligibility or saved contact outcomes.
It is idempotent and fails atomically on conflicts or a namespace above 9,999.
Code and tests support it; this development run does not execute it on production.
Any Codex production application needs a separately authorized bounded operation
with a private backup, not a verification click.

## Scope still open

- Broader legacy Buyers/lead-card presentation and comprehensive #285 help coverage.
- Sending/email integration stays in #288; generated subject text includes the ref
  without an address, but this slice does not send an email.
- The first-deal/source acquisition work is unchanged. An activity log is not new
  vetted inventory, and reference assignment cannot manufacture a deal.
