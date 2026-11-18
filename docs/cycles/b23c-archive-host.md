# B-23c4 Archive Host Correction

Base: released main08253f4. PR526 hosted326/0/0, automatic deployment7870354209,
fixed public/static and unauthenticated source-count401 checks PASS.

## Evidence And Trace

The [official replacement archive index](https://www.elliscountytx.gov/Archive.aspx?AMID=60)
was observed as the public County Clerk Foreclosures archive. Only the index was
read, not a notice PDF or property row. This does not prove any particular notice,
address, date, ownership, amount or source completeness. No claim is made about
why the old hostname behaves differently; it was not re-probed.

Trace found three independent URL points:
1. tx-county-foreclosure-source-profiles.source_url/human_portal_url/search_hints
   feed county-source-profile-registry, source catalog and the existing adapter.
2. deal-board-queue-service.recordNoticeScan independently fetched a hard-coded
   legacy archive. It now resolves the single existing county/kind profile,
   validates its official URL, then validates the returned archive URL.
3. official-notice-dossier resolved relative links against a fixed legacy host.
   Its optional archive URL parameter now uses the validated response base;
   old two-argument callers keep the exact legacy default.

No host allowlist is widened. Historical direct notice URLs stay accepted under
the existing official-host list and no stored evidence is migrated or discarded.
Unsupported/ambiguous profile selection or a nonofficial response URL fails closed.
Relative links cannot escape the existing official URL validator. Ambiguous dated
links still do not select a document. Date/money/subject matching are unchanged.

## Tests And Honest Failures

New notice-archive-host.test.js first failed on the stale configured profile URL;
first result retained locally at b23c-archive-host-first.txt. It now covers current
profile and actual service request, relative response-base URLs, legacy behavior,
look-alike/nonofficial origins, ambiguous dates, unsafe response rejection with no
proposal write, and no live fetch/PDF/OCR. PASS.

The existing cycle48 test first failed at line177 because the actual resolved
document now correctly used the current archive response host. That result is
retained at b23c-archive-cycle48-first.txt. Exactly one intentional expectation:
tests/cycle-48-notice-extraction.test.js:177 documentUrl (legacy host) -> explicit
https://www.elliscountytx.gov/Archive.aspx?ADID=5233. Same synthetic document ID,
same strict equality; no regex/substring relaxation. Legacy URL assertions remain.
Changed test then PASS G1-G16 under a no-live-network harness with a dotenv stub
to avoid reading local environment files. No unchanged failed-test rerun occurred.

No other original assertion, fixture, timeout, date, money, saved-lead/ownership
or auth behavior changes. Full exact-head hosted gate is still required.

After green merge, await exact-source automatic deployment and fixed public/static
checks plus counts endpoint unauth401 only. Do not invoke notice scan, OCR, source
collection, business writes or authenticated customer reads in production.
Remaining B-23 reader/host migration/catalog/daily work is not claimed complete.
