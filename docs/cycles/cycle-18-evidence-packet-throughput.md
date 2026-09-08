# Cycle 18: evidence packet throughput

## Delivery and boundary

Branch: `feat/cycle-18-evidence-packet-throughput-v1`; base `643b995`.
Working copy: the visualization checkout specified in the implementation request.
Draft review only. No production request, production batch, merge, deployment, paid call,
new dependency, outreach, contact outcome or production snapshot write was performed.
The implementation is NOT an assertion that the live dashboard has changed.

## Plain-English result

The old path could replace the property's address with the courthouse or trustee office.
This change keeps the address attached to its own source row. On the frozen documents,
three distinct property addresses are now supported, compared with one before. That is
an identity improvement, NOT three callable sellers, current auctions, or valued deals.
All three visually reviewed notices schedule September 1, 2026 sales, already past at the
September 7 measurement date. Availability needs fresh official confirmation.

The packet now separates whether a contact route exists, whether enough sold comps pass,
and whether an offer is supported. Having a mailing address does not supply a property
value. Having three comps does not establish current availability, title or repairs.
The new offer indicator is deliberately NO/UNKNOWN, never an authorization to make an offer.

## Frozen inputs and measured yield

[Aggregate report](../../exports/cycle-18-baseline/summary.json),
[root manifest](../../exports/cycle-18-baseline/manifest.json),
[embedded PDF manifest](../../exports/cycle-18-baseline/embedded-manifest.json),
[corpus hash](../../exports/cycle-18-baseline/corpus-lock.json).

The ledger was last updated August 26, 2026. Public document capture began September 7,
2026 at 23:46 UTC. Every URL, capture time, hash, HTTP outcome and ledger timestamp is
retained in the manifests. Twenty Hunt HTML wrappers exposed same-origin PDF objects;
these exact links were captured once. Subsequent measurements read cached bytes only.
Raw PDFs, full text, historical row bodies and private measurement dumps remain ignored.
Five real, source-labeled PDF text slices are committed as hermetic test fixtures.

| Frozen text-layer measurement | Before | After |
| --- | ---: | ---: |
| Root ledger documents | 66 | 66 |
| Captured PDFs, including Hunt embedded documents | 59 | 59 |
| Extracted rows (not unique properties) | 17 | 9 |
| Nonempty normalized address rows | 4 | 4 |
| Property-supported address rows, manually checked | 1 | 4 |
| Distinct property-supported addresses | 1 | 3 |
| Wrong courthouse/trustee normalized addresses | 3 | 0 |
| Partial rows | 13 | 5 |
| Supported seller phone / email / mail routes | 0 / 0 / 0 | 0 / 0 / 0 |
| Qualifying sold comps / rejected comp candidates supplied | 0 / 0 | 0 / 0 |
| CAN CONTACT / CAN VALUE / READY TO OFFER | 0 / 0 / 0 | 0 / 0 / 0 |

No enrichment was run. Zero routes/comps means none is supported by the measured rows,
not that searching other authorized records could never find one. Owner/trustor clues
are not proof of current ownership. Total unique property inventory is UNKNOWN because
partial identities and unprocessed scans cannot be safely deduplicated.

| County, Dallas configured market family | Docs | PDFs | Text rows before/after | Complete rows before/after | Scan OCR yield |
| --- | ---: | ---: | ---: | ---: | --- |
| Hunt | 20 | 20 | 17 / 9 | 4 / 4 | Not needed for text measurement |
| Navarro | 7 | 7 | 0 / 0 | 0 / 0 | UNMEASURED: 7 scans |
| Rockwall | 26 | 26 | 0 / 0 | 0 / 0 | UNMEASURED: 26 scans |
| Tarrant | 2 | 2 | 0 / 0 | 0 / 0 | No additional OCR measurement |
| Parker | 2 | 2 | 0 / 0 | 0 / 0 | Administrative fee schedules |
| Kaufman | 1 | 1 | 0 / 0 | 0 / 0 | Tax-rate table, not notice rows |
| Van Zandt | 1 | 1 | 0 / 0 | 0 / 0 | Youth-diversion administrative plan |
| Ellis | 7 | 0 | UNREACHABLE | UNREACHABLE | Redirect outside frozen host allowlist |

All live counts for Dallas, San Antonio, Detroit, San Diego, Los Angeles and Houston are
**UNREACHABLE**, never zero: no local snapshot exists and production access is prohibited.
A separately authorized read-only snapshot export is needed for live yield measurement.
Per-county missing-field distributions, extracted lifecycle counts and source timestamps
are in the aggregate JSON. They describe only this corpus, not a live snapshot.

The July 2 historical export contains five exported rows and eight board deals. Its saved
counters report six INSPECT_NOW, two CALL_READY, one free-call-ready and zero free-comp-ready.
Those are historical labels, not re-verified routes or current inventory; they are not
mixed into the before/after table.

## Loss traces and limits

The observation harness invokes the real extractor, normalizer, private candidate mapper,
board deal builder and queue segment function. It does NOT pretend an offline pass ran
enrichment or wrote a real snapshot. The real packet service and browser are separately
exercised with an isolated, unmistakably synthetic snapshot.

Shared path references (current branch line numbers): extractor
`tx-trustee-notice-text-extractor.js:219`, candidate `property-candidate.js:69`, candidate
transport `free-public-deal-board.js:1056`, card transport `free-public-deal-board.js:1112`,
board `free-public-deal-board.js:912`, queue `lead-operations-queue.js:45`, packet
`manual-evidence-packet-service.js:312`, dashboard `wos-public-deals.js:295`.
Files are under `modules/research/` unless prefixed dashboard.

| Trace | Source -> extraction -> candidate/board | Queue -> packet/render | Loss attribution |
| --- | --- | --- | --- |
| Hunt 26:1, PDF 07 | Flamingo property text; old canonicalization selected 2507 Lee St; strict complete identity now stays Flamingo through candidate AND card paths | BLOCKED in the isolated pure-board trace; no owner proof, seller route or comps supplied | PREVENTABLE: candidate fallback `property-candidate.js:122` and board fallback `free-public-deal-board.js:332` |
| Hunt 29:1, PDF 10 | Stanford street/city/state/ZIP all printed; old parser output lost normalized identity; source-only formatter now preserves it | Still missing current status/contact/comps, no manufactured promotion | PREVENTABLE: formatter `tx-trustee-notice-text-extractor.js:97` |
| Hunt 46:1, PDF 17 | Thibodaux complete identity already worked; preserved exactly in both transports | No live seller or sold evidence added | Existing success retained; absent source inputs remain UNKNOWN beyond corpus |
| Hunt 3:1, PDF 03 | Text layer says split number `19 16`; old fallback selected courthouse; now normalized address empty | Review-only partial, no exact property map | PREVENTABLE courthouse substitution removed; ambiguous source text not silently repaired |
| Hunt 47:1, PDF 18 | Trustee-address context previously treated 10119 Lake Creek as property; now excluded | No property row to enrich/render from that office | PREVENTABLE: context guard `tx-trustee-notice-text-extractor.js:234` |
| Navarro scan document | Cached PDF has zero text characters; no property rows from text extraction | No actual property row exists to carry through snapshot/queue | LOCAL ENVIRONMENT: OCR browser missing; OCR yield UNMEASURED, not external county block |
| Kaufman tax-rate document | Table contains administrative rates, not notice property rows | No actual property row exists to carry downstream | EXTERNAL TO THIS DOCUMENT: requested property evidence is not in this selected artifact; not a claim about county availability |
| Parker fee schedules | Civil/family fee amounts, not property prices | No actual property row exists to carry downstream | EXTERNAL TO THIS DOCUMENT: wrong artifact for this objective; no prices/addresses invented |

Acceptance limitation: actual extracted property rows occur only in Hunt. These are five
property traces and additional document traces, NOT six property rows across three
counties. Criterion 5 remains unmet; expanding sources to manufacture that denominator
would violate the frozen scope. Snapshot/enrichment hops that were not executable remain
explicitly unmeasured. Do not call this 16/16 or a finished callable-lead workflow.

## Three anomaly findings

1. Dallas ledger partition is intentional market-family scope: `marketKeyForLedger`
   uses `options.market` (`tx-county-foreclosure-acquisition-adapter.js:133`), and the
   Dallas default source list spans county lanes. No cross-market routing was changed.
2. The historical 0-vs-5 counters count different populations. `foreclosureProofDiagnostics`
   (`free-public-deal-board.js:1245`) counts fallback proof records, while
   `pdfNoticeDiagnostics` (`:1266`) reads PDF candidate diagnostics. The export has two
   proof records with no address and five extracted candidate addresses. Neither counter
   is five lost addresses; their labels invite confusion and should be clarified later.
3. Ten hard-failed entries: seven now-cached scans (five Navarro, two Rockwall) and three
   Ellis documents not captured under the frozen redirect policy. Original causes remain
   UNRESOLVED because `recordDocumentLedgerAttempt` (`adapter:256`) stores status, not
   detailed failure. `documentAlreadyRead` (`adapter:251`) skips done/hard_failed for the
   same URL/month/parser signature. This is signature-scoped suppression, not the separate
   row-enrichment six-hour cooldown. Do not claim it rechecks changed bytes at the same URL.

## Scope decision and benchmark

The scope was frozen in the checkpoint BEFORE implementation. Architect's identity-first
prior was overturned: repairing contacts against wrong property addresses would be unsafe.

| Priority | Measured loss/opportunity | Work unit and decision |
| --- | --- | --- |
| 1 | Three wrong normalized addresses; two additional distinct source-supported properties recoverable | One connected extractor/candidate/board path plus tests; selected |
| 2 | 33 scan documents without text | Runtime correction and OCR validation, unknown property yield; deferred, not claimed as 33 leads |
| 3 | Seven inaccessible-to-capture Ellis redirects, including three historical failures | Verify redirect destination/allowlist in a separate bounded survey; unknown yield |
| 4 | Zero supported seller routes or comps on measured notice rows | Needs parcel/contact/sales evidence not present in corpus; unknown engineering yield |

IN: source-bound property identity, candidate/card protection, OCR authority guard,
independent packet-readiness labels, tests/proof/docs. OUT: sources, identity hunting,
OCR tuning, retry changes, routing, comp policy and gates, production.

Same 59 cached PDF texts, one warmup and ten measured extractor-only passes per phase:
median 6.282ms -> 4.389ms; peak process RSS 51,252KB -> 51,128KB. This is a local
microbenchmark, not a production latency or OCR throughput promise. Full timing details
and unchanged PDF parsing worker cost are in summary.json. Accuracy denominator is the
four nonempty normalized address rows: correct 1/4 -> 4/4, with no new wrong normalized
property address in that set. Whole-document recall is UNKNOWN, not 100%.

No dependencies installed. Existing pdf-parse MIT, Playwright Apache-2.0, Tesseract.js
Apache-2.0 remain unchanged. New provider cost is zero; existing CPU/RAM/storage still
have resource cost. No infrastructure dollar estimate is fabricated.

## Source and UI proof

Visually read from the cached PDFs, page 1 (not an OCR re-extraction):
- [Hunt 07](https://apps.huntcounty.net/foreclosures/LinkedDir/2026/2026-09-01-foreclosure-07.pdf): `Property Address: 6407 FLAMINGO RD GREENVILLE, TEXAS 75402`.
- [Hunt 10](https://apps.huntcounty.net/foreclosures/LinkedDir/2026/2026-09-01-foreclosure-10.pdf): `Commonly known as: 1929 STANFORD ST GREENVILLE, TX 75401`.
- [Hunt 17](https://apps.huntcounty.net/foreclosures/LinkedDir/2026/2026-09-01-foreclosure-17.pdf): `FOR INFORMATIONAL PURPOSES ONLY: MORE COMMONLY KNOWN AS 1430 THIBODAUX DR, GREENVILLE, TX 75402`.

Public PDF renders remain local; hashes/URLs in document-proof.json are committed.
Browser proof uses the actual packet service and dashboard JavaScript, a minimal loopback
harness, synthetic data and the already-installed Chromium 1117. It is not a production
dashboard screenshot, full server integration test, real mailing route or live listing.
All non-loopback browser requests were denied; no external requests occurred.
Default product OCR launch fails because the expected headless Chromium 1234 file is
absent locally. Visual inspection explicitly selected existing Chromium, without changing
the product runtime or lowering OCR settings.

Synthetic screenshots in `exports/cycle-18-proof/`:
`synthetic-desktop-packet.png`, `synthetic-failed-upload.png`,
`synthetic-desktop-persistence.png`, `synthetic-mobile-packet.png`,
`synthetic-mobile-upload.png`. Invalid-image upload rejected; repeated uploads remain
unconfirmed; refresh retains both proposals; comp readiness stays NO; source snapshot
byte-identical; browser page errors zero. Packet fits 390px viewport. Existing surrounding
market-toolbar mobile crowding is outside this packet change and remains a UI follow-up.

### Gabriel's steps after a separately approved release

1. Open a property's evidence packet. Read the property address and original county link.
2. Check the three lines: Can contact, Can value, Ready to offer. One YES does not mean
   the other two are YES. A taxpayer mailing address may belong to an escrow company.
3. Compare the sale date with the last-checked date. A recent check does not prove an
   auction is still scheduled. Missing status needs confirmation before acting.
4. Open a research link. It is a search, not a guaranteed matching property page. Confirm
   the exact address before taking a screenshot. Never treat a nearby listing as a sold comp.
5. Capture only the missing facts: for a sold comp, address, sold date, sold price, house
   type, size, beds/baths, and visible age/lot details. The source must support location;
   a screenshot cannot replace missing property coordinates with a county center.
6. In the matching upload box, paste the page link and choose the screenshot. Review its
   extracted fields before confirming. An unreadable image shows an error, not evidence.
7. Refreshing keeps uploaded proposals. Do not repeat a capture already present. Three
   uploads are not automatically three qualifying comps, and a contact clue is not an
   owner-confirmed phone number. Closed/not-interested contacts are not offer-ready.

## Verification and acceptance

Full per-file results: [test-results.json](../../exports/cycle-18-proof/test-results.json).
The first run passed 63/64; its failure was the stale v25 script assertion after the v26
asset bump. Updated that assertion and added candidate-to-card parity and OCR regressions.
Final result is recorded in test-results.json; no CI is claimed.

Quality gates are pinned by the unchanged disclosure-comp rejection matrix (distance,
type, area, beds/baths, age, lot, recency, nominal transfers, subject exclusion, missing
facts), screenshot packet tests, provenance, market demand, taxpayer/owner, policy and
queue suites. This change does not add property coordinates or change any gate constants.

Acceptance target: 15/16; criterion 5 cannot be satisfied with actual property rows in
three counties from this frozen corpus. Criteria 1-4 and 6-16 each have evidence above,
in the checkpoint, aggregate JSON, test timings and browser proof. Final checklist is in
the checkpoint. This percentage is completion of this bounded review package, NOT
percentage of the entire SaaS or of 100 daily callable leads.

No complete real offer packet is demonstrated. Exact missing inputs: verified current
event status, owner/authorized-seller identity and sourced route, property facts and
coordinates, and three independent qualifying sold transactions. Do not substitute
trustor names, court locations, ZIP centers, estimates or listing prices.

## Deferred follow-ups

- Document-review clear attribution is not persisted; timestamp ordering may silently no-op.
- Cook SoQL date literal may need a full timestamp; parcel-only Cook comps require subject PIN.
- Re-probe Franklin OH, Hamilton OH, Mecklenburg NC and Wake NC wrong-hostname failures.
- Previously reported default PIN display/write authentication needs hardening; not checked live here.
- Market-demand index is NOT mtime-cached: `market-demand-index.js:258` re-parses per read.
- Authorized read-only snapshot export for live measurement; no production inventory available here.
- Runtime/browser compatibility for OCR; historical acquisition hard-failure reason/backoff visibility.
- Existing document signature suppresses previously-read PDFs: a future release must explicitly
  decide whether/how to revisit them; this draft does not bypass the ledger.
- Better row-local sale-date and trustor-role extraction; all three manually viewed dates are past.
- The source-only partial pool still contains courthouse/prose clues. They never become normalized
  addresses in this path, but should be removed or relabeled in a separately measured follow-up.
- Existing duplicate confirmed screenshot-comp handling deserves a separate identity-dedup audit;
  this cycle tested duplicate unconfirmed uploads only and did not change valuation gates.

Next: architect reviews this draft and the explicit acceptance limitation. No release is
authorized by this document. Engineering review may take a focused session; subsequent
contact/comp work depends on accessible, property-specific evidence. There is no honest
calendar promise for a callable lead or a closed deal from these measurements.
