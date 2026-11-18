# B-23d Operational OFF Catalog

Base main5183521: PR527 corrected gate327/0/0, auto7873418253 and bounded
public/static/counts401 verification PASS. Its earlier failed gate remains failed.
Scope follows [architect528 answer](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/528#issuecomment-6967037126),
read once. It does not authorize real previews, promotion or imports.

## Operational Contract

Existing format-compatible readers remain technical fixture codecs. A separate
operational profile set is authoritative for catalog/daily readiness: every
new distress source is candidate, enabled:false, runnable:false, auto_select:false,
promotion_status:blocked_pending_validated_preview, preview-only/no-ingestion.
Only the three B-23c3 schema-based synthetic fixture sets have a named operational
reader for code validation; all other profiles have reader:null/status:needs_corpus.
Access/login/forbidden reasons remain attached and cannot be overridden by a corpus.
This makes no claims that unverified first-list HTML/PDF/XLSX/CSV parsers exist.

All registered distress profiles are included OFF when their market or explicit
source ID is requested. All new operational profiles are available as disabled
metadata, including sources without a technical registry entry. No cron/scheduler
entry is activated. Normal source selection and both existing fallback branches
filter disabled entries. Request-body enabled/promotion/fixture flags do not alter
the server-owned catalog. Only explicit in-process fixture catalogs can exercise
existing technical codecs; no HTTP catalog override or activation flag is added.

Disabled sources have their own no-attempt control report in acquisition results
and diagnostics. Existing runJob persists diagnostics as before; the strict counts
reader now recognizes those saved controls. They do not become a zero-row fetch.
Counts show every new source as not-enabled or needs-sample-data with enabled:false,
the blocked promotion state and reader:null when no corpus exists. Existing saved
row counts remain explicitly historical preview observations, not live ingestion.

## Identity And Promotion

The existing Detroit buildingdetroit.org ID, adapter, URLs and historical evidence
are unchanged. The separately registered DLBA_For_Sale ID remains OFF with only
related_source_id/relation:candidate_successor audit metadata. No alias, row rewrite,
or copying of owner/price/ZIP occurs; missing fields stay unknown.

canPromoteSource is a pure eligibility check, NOT authentication, owner approval,
or an actuator. A future authorized promotion path must supply a trusted validation
receipt from approved real-row review, not untrusted HTTP JSON/self-asserted flags.
The check requires own exact real/synthetic/metadata/count markers, configured
source identity and origin, a named validation receipt bound to current capture,
actual scalar row data and exact configured object-ID references. Empty, metadata,
counts-only, stale/mixed/ambiguous capture, wrong-origin/port/path, synthetic,
inherited, missing or mismatched references fail closed. The validator does not
infer individual sale-date truth: the mapper still quarantines ambiguous dates.
No caller turns a source on; all operational profiles stay frozen and OFF even
when eligibility is simulated true in a synthetic unit test.

## Trace And Tests

Policy JSON + technical profiles -> immutable operational profiles -> source catalog
-> normal/fallback acquisition selection -> disabled source diagnostics -> existing
saved scout diagnostics -> strict counts projection -> existing admin/no-store GET.
No new database writer, private route, source fetch or business action is introduced.

New synthetic test covers every registered catalog entry, all-OFF/null-reader counts,
forged job flags, direct and fallback no-dispatch, persisted skip controls, pure
receipt positive simulation and forged/stale/ambiguous/missing/wrong-origin negatives,
clock/network purity, separate legacy IDs and missing owner/price/ZIP. Existing
adapter, counts, status-route and provenance-pipeline focused tests also PASS.

Intentional existing assertion changes per the new architecture contract:
- distress-list-acquisition-adapter.test.js:70 catalog absence -> catalog entries
  all disabled/auto_select:false/blocked, plus new real-selector no-dispatch tests.
- distress-list-source-counts.test.js:22 technical ready-not-scheduled -> needs_corpus
  for an unvalidated CSV source; line23 manual reason plus reader:null retained;
  line24 needs-reader-settings -> needs_corpus; add universal disabled/blocked check.
No date, money, auth, external-request, privacy or no-write assertion is weakened.

First hosted head7d50cd5/run44234975957:326 passed/2 failed/0 skipped,total328.
Only catalog expectations failed: mi-land-bank-acquisition-adapter.test.js:254
expected legacy-only metadata, and :256 plus
ca-los-angeles-tax-default-acquisition-adapter.test.js:284 expected no Cleveland
metadata. The bounded correction keeps the exact enabled Detroit legacy source
set and LA/Detroit queue defaults, checks all added entries OFF/auto_select:false/
blocked, and requires the exact configured Cleveland policy IDs (nonempty).
This is the intentional #528 OFF catalog contract, not a safety waiver or runtime
patch. The original failed artifact remains retained; no unchanged run is retried.

Hosted exact-head full suite, automatic deployment and fixed public/static plus
counts unauth401 remain required. B-23 code may be marked DONE only afterward.
The synthetic [configuration proof](proof-b23d-off/config-state.json) records
207 OFF profiles, 204 needing corpus and three schema-only fixture readers;
it is not a real-source preview or promotion receipt.
B-23 promotion remains BLOCKED until Gabriel approves a preview run per source.
Next is OFF-only B-24a523 hardening; no paid vendor/pricing/transport is enabled.
