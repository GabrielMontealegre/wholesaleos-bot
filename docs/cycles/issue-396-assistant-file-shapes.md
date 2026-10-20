# Assistant File Shapes -- 396

The architect measured input_shape_invalid for all four real files on the
merged producer. Do not repeat that private-file measurement or submit data
as verification. This fix is local parsing/reporting only; no server/UI,
pairing, pending-import, approval, matching, readiness or provenance change.

## Trace

Writer: existing owner-side assistant routines (not this CLI) create private
JSON files. Reader: readJson retains4MiB/file; readInputs assigns file kind,
then plan uses canonical validateAgentItems/ingestMixed. run remains dry-run
by default. Only explicit --submit uses the existing signed POST path,
unchanged request budgets, human pace and stop/no-retry behavior.

Accepted named payloads only:
buyers.json -> buyers; land-buyers.json -> buyers;
deals.json -> deals; agents.json -> agents.
Sibling metadata is ignored, never counted as records or passed to the
canonical validators/server. Conflicting recognized payload keys, a wrong
key or a non-array payload fail closed. Bare arrays and strict items-only
objects remain supported. Agents remain unsupported records, never relabeled
as buyers; accepting their wrapper is not an agent-import feature.

## Limits And Counts

MAX_ROWS500 now applies per file, not across all files. Each file reports
rows (raw count), rows_considered and truncated_count; the report also sums
truncated_count. Offline preview examines the bounded prefix and records
input_row_limit for any excess. Any file-level error, including truncation,
blocks the entire submit before credential reads or requests. CLI exits
nonzero. Never silently submit a truncated prefix.

The existing10 requests/run,50 items/request and256KiB/request do not grow.
A valid multi-file offline plan can exceed the live request budget; submit
then refuses before config/network. Pagination/larger runs require a separate
bounded change, not a quiet permission increase. No output includes row
values, paths, metadata or credential contents.

## Evidence

New assistant-named-files test uses synthetic in-memory filesystem fixtures
with the measured wrapper shapes, malformed/unknown/ambiguous negatives,
legacy compatibility,600 rows across two files,501-row truncation/counts/
submit refusal before config, unchanged request cap and raw-row-only payload.
All real fetch/http/https/writes/mkdir are denied and counted zero. Existing
submit-assistant-finds test passes unmodified. No real exports/config loaded.
Full suite600s/file required on draft head; no real submit or production
business-data verification is authorized by this fix.

Release stays behind the outstanding live-browser gate. Latest owner order
from#393 prioritizes this fix, then Pipeline#395, profit, offer machine#375,
then chat. Demo397 is already a draft and must not leapfrog these priorities.
