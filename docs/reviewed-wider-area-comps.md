# Reviewed wider-area comps (#310 / D-051)

The normal grid stays at one mile. Reviewed deals first count unique qualifying
sales in that area. With fewer than three, only distance-only rejections may be
rechecked up to 2.5 miles. Every other rule, including the six-month reviewed-deal
window, remains unchanged. Missing coordinates cannot be rescued by a submitted
distance or area flag. Three qualifying nearby comps prevent the wider pass.
Any admitted wider comp carries its computed distance and area marker; any value
using it is at most Preliminary. Texas last-list prices remain labeled as such.
Existing rural review/limits remain unchanged. Other callers keep the strict
default unless their service supplies the reviewed expansion context.

Trace: strict-comp-grid-config declares the two new D-051 constants;
reviewed-deals.compValue makes both passes using evaluateStrictCompGrid and
rejectReason; review stamps come only from the existing admin approval action.
Evaluation returns area/distance/submitted index/tier to list -> Today's Deals
and JV cards. Neither GET nor evaluation writes or creates review facts.

The admin PATCH action exclude_comp requires a nonblank reason, current index
and exact fact fingerprint. It appends snapshot-independent reviewed-deal
history plus an Activity event, and records the exclusion without erasing the
submitted comp. Future refresh/import updates preserve that data; changing a
comp's facts changes its key and resets review through the existing update path.
Stale keys fail 409. No exclusion/confirmation is made on production to test it.
Controls sit below the comp table for phone access; reasons remain visible.

Tests cover three standard comps vs a thin area, distance/other-rule failures,
missing facts, own sales/duplicates, unreviewed/forged inputs, paid provenance,
exclusion reason/audit/stale cards, rural limits and no network/clock/writes.
Actual dashboard proof checks Preliminary/wider labels and empty-exclusion
no-request behavior across six widths. Existing config-object assertion gains
only the two authorized constants; the normalized config fingerprint is repinned
to D-051's exact file, keeping its unauthorized-change guard intact.
