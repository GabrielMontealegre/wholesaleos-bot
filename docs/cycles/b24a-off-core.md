# B-24a OFF Provider Core

Continue Claude PR523 originalc4e247c, merge current mainc41a349 without rewriting
its commits. No real provider call, credential access, billing, pricing lookup,
disclosure promotion, persistence wiring, list import or outreach is performed.
Both registry entries retain null prices and exact OFF switches. The module has
no runtime callsite; vendor mapping/examples and durable transport remain B24b,
blocked until the owner chooses the vendor/pricing and authorizes wiring.

## Review And Trace

The retained synthetic first-review proof demonstrates defects in original523:
three concurrent synthetic calls reserved/logged12 against cap10; nested request
collisions; a response returned after OFF; impossible-calendar and infinite-price
rows counted as comps; unknown/inherited contact flags counted as routes.
These are code-level synthetic observations, not actual paid/provider actions.

Writers/readers: frozen registry + injected own environment + injected valid date
and atomic ledger -> status -> reservation/readback -> injected transport ->
private scoped JSON cache -> result DTO. Ledger stores only provider/capability,
cost, injected time, request digest and reserved state. No addresses, names,
phones or credentials are written there. No global env/clock/network is read.
Generic mapped provider rows + state disclosure rules -> comp/estimate/rejected
DTO; own contact flags + source provider/date/request -> possible-contact DTO.
Repository trace finds only this module and synthetic tests, no server/UI writer
or reader. Existing strict comp-grid, readiness, routes and mailbox code are untouched.

## Accounting And Cache Contract

Callers must inject ledger.rows/append/runExclusive. The lock must serialize all
clients sharing that durable ledger; a process-local mock is supplied ONLY in
tests, not as a production fallback. Reserve the known cost and read it back before
transport. Invalid/negative/nonfinite spend fails closed. Recheck authorization
and cap after reservation; append failure, missing reservation, lowered cap and
OFF/key changes prevent transport. Hold cost conservatively when the outcome is
uncertain. A reserved identical request cannot automatically run again, including
after creating another client. B24b owns authorized reconciliation of reservations;
this core cannot refund, reconcile or claim actual billing completion.

The client holds the injected lock across transport. Successful responses are
cached within a private client/credential scope; keys never enter cache digests,
ledger or DTOs. OFF/current-cap checks precede cache return. Deep canonical JSON
distinguishes nested inputs and arrays, refuses accessors/cycles/nonfinite values,
and snapshots requests/results to avoid mutation. Falsy responses cache correctly.
Original capture dates remain attached to cached results; no cache hit claims a
fresh vendor lookup. No cache TTL or freshness authorization is invented here.

## Evidence And Tests

Comps require real calendar ISO day, finite positive price, valid explicit capture,
no future closing relative to that capture, source URL/reference and label, and a
different subject address. Only already verified disclosure rules admit comps;
Texas/unknown/unverified rules yield labeled estimates, never ARV. Raw gate flags
are ignored. Optional malformed numeric fields remain null. This is generic DTO
validation, not authentication of vendor data or proof a portal URL is an exact
record; approved B24b vendor mapping must preserve exact record/page/row evidence.

Both DNC and litigator flags must be exact own booleans; missing/inherited/string
flags never mean clear. Possible contacts retain provider/capture/request source
and never bypass readiness, do-not-contact, reviewed Send or outreach restrictions.

Original paid-data-provider.test.js assertions remain unchanged. Its ledger helper
adds the required serialized runExclusive contract; positive row10 gains a clearly
synthetic HTTPS source URL and row reference. No fixture claims to be a published
vendor example or legal verification. New paid-data-provider-safety.test.js covers
the original defects plus stale/auth-isolated/falsy cache, mutation, malformed
accounting/reservation failure, key/OFF/cap changes, duplicate/uncertain no-retry,
invalid dates/prices/provenance and exact own contact flags. Both tests PASS locally
with a refused-live-network spy. Hosted exact-head full suite remains the gate.

After green merge require automatic deployment plus fixed public health200,
unauth devices401, distress-counts401 and exact-source static booleans. No private
response body, provider configuration, source preview or paid action is inspected.
B23 code is DONE; source promotion remains owner-BLOCKED. B24a release is pending;
then continue B07/B21 and B19, not unauthorized B24b activation.

First hardened head15ec6d7/run44240341791 FAILED329/1/0,total330; provider
core/safety tests passed. Only no-secrets-in-tracked-files reported module28/35
entropy-assignment: registry env_key values are public environment-variable names,
not key values. Bounded correction renames that metadata field credential_env and
all internal readers. Exact variable names are unchanged and asserted explicitly.
The scanner/test/detectors are untouched: no allowlist, ignore, encoding, split
string or weakened gate. Original failed artifact is retained. Re-run only the
corrected new head; do not merge red or retry the unchanged failed run.
