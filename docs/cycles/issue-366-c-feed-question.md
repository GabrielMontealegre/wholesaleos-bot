# #366C: authoritative assistant feed and bounded reconciliation

The C UI release is verified, but the feed-count/match gap is NOT declared fixed.
Current read-only production UI:68 buyers,23 new today,0 messaged this week;
all68 match badges show0 deals match. Import time is not recorded. The architect's
earlier81-approved-buyer/59-deal file counts are reported history, not a current
measurement here. No owner names, contacts or property addresses are included.

The assistant buyers.json/deals.json files are absent from the active checkout.
The buyer file is also absent at the three previously documented local checkout
locations. This does not establish where the external assistant's live feed is.
No production import, approval, confirmation or other business write was run.

Already fixed in PR#378: buyer_type validation/provenance, source-safe reference
dedupe, operator overrides surviving imports, actual import timestamp, and signed
kind:buyer/kind:deal acceptance through the existing pending validators/writers.
Canonical reviewed-deal matching/value/approval/availability gates are unchanged.
A normal, authorized feed submission can use that path; GET/startup never imports.

Please identify the authoritative producer/file location and its normal import
contract. Is it already posting to /api/assistant/finds, or only writing files in
another environment? Provide failure codes/counts, not credentials or contacts.

Options:
1. Repair the existing producer's normal signed submissions; preserve approvals
   and operator edits. Reconcile counts read-only after its next authorized run.
2. Separately authorize a bounded private-backup/preview/import operation over
   the authoritative files, with before/after counts and no automatic approvals.

Recommendation:1 first. Do not invent missing source facts, count candidates as
verified matches, auto-approve the reported81 buyers, or loosen value/price gates
to make the badges positive. Production sync is beyond release read-only scope
(AGENTS10 trigger3). Mark only this feed-reconciliation portion BLOCKED; continue
independent #366F layout work. Gabriel need not relay technical instructions.
