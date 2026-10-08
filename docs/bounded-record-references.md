# Bounded record references (#297)

The explicit admin assignment operates on buyers, reviewed deals and existing
matches only, with a maximum of 500 assignments. It never processes legacy leads,
creates new matches, evaluates eligibility, expires a deal or changes an approval.
The pure planner defaults to these three kinds; the HTTP operation rejects lead
bulk assignment. Existing aliases and supplied assistant references are retained.

Every state deal namespace starts above 1030. Existing higher counters stay
higher. This reserves the assistant's previously used deal references. Supplied
reserved references remain importable; only newly issued references use the floor.
All supported postal namespaces, the unknown-state namespace and existing deal
namespace counters receive this floor before the authorized metadata operation.

Before any assignment write, the server stores an exclusive byte-for-byte backup
under a private directory alongside its database: directory 0700, file 0600 on
POSIX. Backup failure or a changed database stops the write. The response contains
only the backup identifier, byte count, SHA-256 and per-kind counts, never data or
a filesystem path. The backup directory is ignored by Git and not served by the
dashboard static mount. Preserve it for rollback; never publish or commit it.

An executable preservation check requires all legacy leads and other top-level
facts to remain unchanged, keeps collection length/order and every existing
record field except a previously missing record_ref, and preserves all history.
Only reference-assigned audit rows may be appended by the bounded operation.

Lead references remain lazy: a validated explicit manual activity assigns only
that lead; an admin single-lead POST is available for the future Deal Check action.
GETs and deployment never assign references. No speculative contact is logged.

Writer/reader trace: record-activity.assign/assignMissing/assignOnAction write refs;
assistant-finds.ingest and reviewed-deals.ingest preserve supplied refs through
assign; explicit manual addLeadActivity and the single-lead route use assignOnAction.
Readers: record activity/search and routes, buyer/deal cards, reviewed-deal match
references, email draft reference labels and the shared dashboard ref helpers.
Counter readers/writers are confined to record-activity; private backup uses db.js.

Test assertion changes are intentional: server-issued deal numbers begin at 1031;
bulk planner tests that specifically exercise leads now select that kind explicitly;
the admin bulk route instead asserts that legacy leads remain unassigned. Existing
fact/history/privacy/contact/comp assertions are unchanged. The full-page proof's
synthetic reference expectation changes from WOS-FL-0001 to WOS-FL-1031 only.

ASSUMED: cap the explicit operation at 500 assignments and do not run match/expiry
synchronization during it. The architect authorizes reference metadata only, not
new workflow decisions. The single-lead API is an explicit-action integration
point for Deal Check, not an automatic write on reading a card.
