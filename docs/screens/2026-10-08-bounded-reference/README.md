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
mounting with no horizontal overflow or page errors. Production verification
and the authorized one-time operation will be recorded after deployment.
