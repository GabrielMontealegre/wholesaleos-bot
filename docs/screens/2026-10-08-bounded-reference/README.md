# Bounded reference proof (#297)

Local synthetic dashboard proof from scripts/verify-record-activity-ui.js.
These are fixture records, not production leads, buyers or contact actions.
All nonlocal source requests and writes are denied by the fixture.

- [Desktop, 1366 px](synthetic-1366.png)
- [Phone, 400 px](synthetic-400.png)
- [Android-oriented, 412 x 915](synthetic-412.png)

The actual full dashboard opens the reference details and checks the non-lead
assignment label plus the 1030 reserve summary. It also checks card references,
immutable timelines, import parsing, filtering, shared search and Dashboard
mounting with no horizontal overflow or page errors. Broader legacy header and
tap-target work remains #294; this proof does not claim those issues fixed.

## Production result (2026-10-08)

PR #302, application merge 9e511ca. Exact Railway status success; health 200;
record bundle v2; 12,039 leads hydrate, 100 rows and a card open; zero console
errors. One rollout 502 recovered before the operation.

Exactly one authorized operation: private byte-for-byte backup 67,308,046 bytes;
4 buyer references assigned, 0 reviewed deals, 0 matches, 0 legacy leads touched.
Missing references: buyers 4 -> 0; deals/matches stay 0; leads stay 12,039.
Every one of 57 deal namespaces has a floor >=1030; the minimum is 1030.
Activity 56 -> 60, the four new rows are reference assignment only. Executable
preservation guard passed; no existing fact, alias, approval, eligibility,
contact outcome or historical event changes.

These live images crop to the reference-count/receipt panel only. It contains
no owner name, address, phone, email, credential or private backup contents.
Measured panel left/right stay inside each actual viewport.

- [Before, 1366 px](live-before-1366.jpg)
- [After, desktop 1366 px](live-after-1366.jpg)
- [After, phone 400 px](live-after-400.jpg)
- [After, Android 412 x 915](live-after-412.jpg)

No batch, acquisition, enrichment, import, approval, contact, capture or evidence
confirmation. Backup stays private alongside the production database; no copy
of production data was downloaded or committed.
