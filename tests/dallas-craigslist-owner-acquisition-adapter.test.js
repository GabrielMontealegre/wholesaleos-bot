'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return originalLoad.call(this, request, parent, isMain);
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-craigslist-owner-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [], reviewQueue: [] }, null, 2));
fs.writeFileSync(process.env.FINDME_SCOUT_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, JSON.stringify({ version: 1, dossiers: [] }, null, 2));

const adapter = require('../modules/sources/dallas-craigslist-owner-acquisition-adapter');
const sourceEvidenceAdapter = require('../modules/research/source-evidence-adapter');
const sourceAdapterRegistry = require('../modules/sources/source-adapter-registry');
const sourceCatalog = require('../modules/sources/source-catalog');
const sourceAcquisitionOrchestrator = require('../modules/research/source-acquisition-orchestrator');

const NOW = '2026-06-22T12:00:00.000Z';
const PHONE_URL = 'https://dallas.craigslist.org/dal/reo/d/dallas-motivated-seller-fixer/7918000001.html';
const REPLY_URL = 'https://dallas.craigslist.org/dal/reo/d/dallas-as-is-owner-property/7918000002.html';
const INCOMPLETE_URL = 'https://dallas.craigslist.org/dal/reo/d/dallas-needs-rehab/7918000003.html';
const BODY_DUPLICATE_URL = 'https://dallas.craigslist.org/dal/reo/d/dallas-needs-rehab-copy/7918000004.html';
const STALE_URL = 'https://dallas.craigslist.org/dal/reo/d/dallas-old-fixer/7918000005.html';
const ADDRESS_DUPLICATE_URL = 'https://dallas.craigslist.org/dal/reo/d/dallas-motivated-copy/7918000006.html';
const PHONE_DUPLICATE_URL = 'https://dallas.craigslist.org/dal/reo/d/dallas-another-fixer/7918000007.html';
const WRONG_MARKET_URL = 'https://dallas.craigslist.org/ftw/reo/d/fort-worth-owner-fixer/7918000008.html';

function response(body, url, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: {
      get(name) {
        if (/content-type/i.test(name)) return 'text/html; charset=utf-8';
        if (/content-length/i.test(name)) return String(Buffer.byteLength(body));
        return '';
      }
    },
    async text() {
      return body;
    }
  };
}

function postHtml(input = {}) {
  const address = input.address || '';
  const addressJson = address
    ? (() => {
      const parts = address.match(/^(.+),\s*([^,]+),\s*(TX)\s+(\d{5})$/i);
      return parts ? `<script type="application/ld+json">{
        "streetAddress":"${parts[1]}",
        "addressLocality":"${parts[2]}",
        "addressRegion":"${parts[3]}",
        "postalCode":"${parts[4]}",
        "datePosted":"${input.postedAt}"
      }</script>` : '';
    })()
    : '';
  return `<html>
    <head><title>${input.title || 'Dallas owner real estate post'} - craigslist</title>${addressJson}</head>
    <body>
      <time class="date timeago" datetime="${input.postedAt}"></time>
      ${address ? `<div class="mapaddress">${address}</div>` : ''}
      <section id="postingbody">QR Code Link to This Post ${input.body || ''}</section>
      ${input.reply ? '<a class="reply-button" href="/reply/dal/reo/7918000002">reply</a>' : ''}
    </body>
  </html>`;
}

function snapshotFiles() {
  return {
    db: fs.readFileSync(process.env.DB_PATH, 'utf8'),
    scout: fs.readFileSync(process.env.FINDME_SCOUT_JOBS_PATH, 'utf8'),
    analyzer: fs.readFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, 'utf8'),
    dossiers: fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8')
  };
}

(async () => {
  try {
    const queries = adapter.buildCraigslistOwnerSearchQueries({ city: 'Dallas' });
    assert.strictEqual(queries.length, 4);
    assert.deepStrictEqual(queries.map((item) => item.query), ['motivated seller', 'as is', 'fixer', 'needs rehab']);
    assert.ok(queries.every((item) => item.provider_family === 'craigslist_direct'));
    assert.ok(queries.every((item) => adapter.isCraigslistOwnerSearchUrl(item.source_url)));

    assert.strictEqual(adapter.isCraigslistOwnerPostUrl(PHONE_URL), true);
    assert.strictEqual(sourceEvidenceAdapter.classifySourceUrl(PHONE_URL), 'exact_property_record');
    assert.strictEqual(adapter.isCraigslistOwnerPostUrl('https://dallas.craigslist.org/search/rea?purveyor=owner'), false);
    assert.strictEqual(adapter.isCraigslistOwnerPostUrl('https://dallas.craigslist.org/dal/apa/d/dallas-rental/7918000999.html'), false);
    assert.strictEqual(adapter.isCraigslistOwnerPostUrl('https://dallas.craigslist.org/dal/rew/d/dallas-wanted/7918000998.html'), false);
    assert.strictEqual(adapter.isCraigslistOwnerPostUrl('https://example.com/dal/reo/d/dallas-fixer/7918000997.html'), false);

    const searchHtml = `<html><body>
      <a href="${PHONE_URL}">phone post</a>
      <a href="${REPLY_URL}">reply post</a>
      <a href="${INCOMPLETE_URL}">incomplete address</a>
      <a href="${BODY_DUPLICATE_URL}">duplicate body</a>
      <a href="${STALE_URL}">stale post</a>
      <a href="${ADDRESS_DUPLICATE_URL}">duplicate address</a>
      <a href="${PHONE_DUPLICATE_URL}">duplicate phone</a>
      <a href="${WRONG_MARKET_URL}">wrong market</a>
      <a href="/search/rea?purveyor=owner">search page</a>
      <a href="/dal/apa/d/dallas-rental/7918000999.html">rental</a>
      <a href="/dal/rew/d/dallas-wanted/7918000998.html">wanted</a>
      <a href="https://example.com/dal/reo/d/fake/7918000997.html">external</a>
    </body></html>`;
    const extracted = adapter.extractCraigslistPostUrls(searchHtml, queries[0].source_url);
    assert.strictEqual(extracted.length, 8);
    assert.ok(extracted.every((url) => adapter.isCraigslistOwnerPostUrl(url)));

    const rankedSearchHtml = `<html><body>
      <li><a href="${INCOMPLETE_URL}">Needs rehab near Dallas</a></li>
      <li><a href="${REPLY_URL}">As-is property at 124 Main St, Dallas, TX 75208</a></li>
    </body></html>`;
    const ranked = adapter.extractCraigslistPostUrlRecords(rankedSearchHtml, queries[0].source_url);
    assert.strictEqual(ranked[0].source_url, REPLY_URL);
    assert.strictEqual(ranked[0].address_signal, '124 Main St, Dallas, TX 75208');
    assert.strictEqual(ranked[0].address_signal_visible, true);

    const metadataAddress = adapter.extractCompleteAddress(
      '<meta property="og:description" content="Fixer at 128 Main St, Dallas, TX 75208">',
      '',
      ''
    );
    assert.strictEqual(metadataAddress.address, '128 Main St, Dallas, TX 75208');
    assert.strictEqual(metadataAddress.basis, 'page_metadata');

    const nestedJsonLdAddress = adapter.extractCompleteAddress(
      '<script type="application/ld+json">{"@type":"RealEstateListing","address":{"streetAddress":"129 Main St","addressLocality":"Dallas","addressRegion":"TX","postalCode":"75208"}}</script>',
      '',
      ''
    );
    assert.strictEqual(nestedJsonLdAddress.address, '129 Main St, Dallas, TX 75208');
    assert.strictEqual(nestedJsonLdAddress.basis, 'structured_page_metadata');

    const incompleteVisibleAddress = adapter.extractCompleteAddress(
      '<meta property="og:description" content="Main St, Fort Worth, TX 76102">',
      'Fort Worth fixer',
      'Near Main St'
    );
    assert.strictEqual(incompleteVisibleAddress.address, '');

    const unprovenPhone = adapter.extractCraigslistContactEvidence({
      source_url: PHONE_URL,
      title: 'Fixer in Dallas',
      body: 'Cash only. Number shown without contact language: (214) 555-0999.'
    });
    assert.strictEqual(unprovenPhone.contact_verified, false);
    assert.strictEqual(unprovenPhone.contact_phone, '');
    assert.strictEqual(unprovenPhone.contact_role, 'Craigslist poster');

    const visibleEmail = adapter.extractCraigslistContactEvidence({
      source_url: REPLY_URL,
      title: 'As-is Dallas property',
      body: 'Email poster@example.com for details.'
    });
    assert.strictEqual(visibleEmail.contact_route, 'Direct Email');
    assert.strictEqual(visibleEmail.contact_email, 'poster@example.com');
    assert.strictEqual(visibleEmail.contact_verified, true);

    const explicitOwner = adapter.extractCraigslistContactEvidence({
      source_url: PHONE_URL,
      title: 'For sale by owner',
      body: 'For sale by owner. Call (214) 555-0123.'
    });
    assert.strictEqual(explicitOwner.contact_role, 'Self-described owner poster');

    const pages = new Map();
    pages.set(PHONE_URL, postHtml({
      address: '123 Main St, Dallas, TX 75208',
      postedAt: '2026-06-21T10:00:00-05:00',
      title: 'Motivated seller fixer - 123 Main St',
      body: 'Active for sale by owner. Cash only assignment opportunity. Call or text (214) 555-0123.'
    }));
    pages.set(REPLY_URL, postHtml({
      address: '124 Main St, Dallas, TX 75208',
      postedAt: '2026-06-12T10:00:00-05:00',
      title: 'As-is Dallas owner property',
      body: 'For sale by owner. Sold as-is. Use the public reply link for details.',
      reply: true
    }));
    const duplicateBody = 'Needs rehab. For sale. Contact route not shown.';
    pages.set(INCOMPLETE_URL, postHtml({
      postedAt: '2026-06-21T10:00:00-05:00',
      title: 'Needs rehab near Dallas',
      body: duplicateBody
    }));
    pages.set(BODY_DUPLICATE_URL, postHtml({
      postedAt: '2026-06-21T10:00:00-05:00',
      title: 'Needs rehab near Dallas',
      body: duplicateBody
    }));
    pages.set(STALE_URL, postHtml({
      address: '125 Main St, Dallas, TX 75208',
      postedAt: '2026-05-20T10:00:00-05:00',
      title: 'Old fixer in Dallas',
      body: 'For sale by owner. Fixer. Call (214) 555-0144.'
    }));
    pages.set(ADDRESS_DUPLICATE_URL, postHtml({
      address: '123 Main St, Dallas, TX 75208',
      postedAt: '2026-06-21T10:00:00-05:00',
      title: 'Motivated seller duplicate',
      body: 'For sale. Motivated seller. Call (214) 555-0155.'
    }));
    pages.set(PHONE_DUPLICATE_URL, postHtml({
      address: '126 Main St, Dallas, TX 75208',
      postedAt: '2026-06-21T10:00:00-05:00',
      title: 'Fixer with duplicate phone',
      body: 'For sale. Fixer. Call or text (214) 555-0123.'
    }));
    pages.set(WRONG_MARKET_URL, postHtml({
      address: '127 Main St, Fort Worth, TX 76102',
      postedAt: '2026-06-21T10:00:00-05:00',
      title: 'Fort Worth owner fixer',
      body: 'For sale by owner. Fixer. Call (817) 555-0127.'
    }));

    const before = snapshotFiles();
    let searchFetches = 0;
    let postFetches = 0;
    const fetchImpl = async (url) => {
      if (adapter.isCraigslistOwnerSearchUrl(url)) {
        searchFetches += 1;
        return response(searchHtml, url);
      }
      if (adapter.isCraigslistOwnerPostUrl(url)) {
        postFetches += 1;
        return response(pages.get(url) || '', url, pages.has(url) ? 200 : 404);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await adapter.runDallasCraigslistOwnerAcquisitionAdapter({
      acquisition_run_id: 'craigslist_owner_test',
      city: 'Dallas',
      county: 'Dallas',
      state: 'TX',
      now: NOW,
      max_search_pages: 99,
      max_discovered_urls: 999,
      max_post_fetches: 999,
      timeout_ms: 99999,
      page_fetch_impl: fetchImpl
    });

    assert.strictEqual(searchFetches, 4);
    assert.strictEqual(postFetches, 8);
    assert.strictEqual(result.preview_only, true);
    assert.strictEqual(result.should_ingest, false);
    assert.strictEqual(result.no_global_mutation, true);
    assert.strictEqual(result.diagnostics.provider, 'craigslist_direct');
    assert.strictEqual(result.diagnostics.provider_calls_made, 0);
    assert.strictEqual(result.diagnostics.search_pages_cap, 4);
    assert.strictEqual(result.diagnostics.post_fetch_cap, 8);
    assert.strictEqual(result.diagnostics.max_page_bytes, 512 * 1024);
    assert.strictEqual(result.diagnostics.timeout_ms, 8000);
    assert.strictEqual(result.diagnostics.retries, 0);

    const phoneCandidate = result.candidates.find((candidate) => candidate.source_url === PHONE_URL);
    const replyCandidate = result.candidates.find((candidate) => candidate.source_url === REPLY_URL);
    const incompleteCandidate = result.candidates.find((candidate) => candidate.source_url === INCOMPLETE_URL);
    assert.ok(phoneCandidate);
    assert.ok(replyCandidate);
    assert.ok(incompleteCandidate);
    assert.strictEqual(phoneCandidate.normalized_address, '123 Main St, Dallas, TX 75208');
    assert.strictEqual(phoneCandidate.source_confidence, 88);
    assert.strictEqual(phoneCandidate.contact_phone, '(214) 555-0123');
    assert.strictEqual(phoneCandidate.contact_role, 'Self-described owner poster');
    assert.ok(phoneCandidate.risk_flags.includes('POSTER_ROLE_UNVERIFIED'));
    assert.ok(phoneCandidate.risk_flags.includes('POSSIBLE_WHOLESALER'));
    assert.ok(replyCandidate.risk_flags.includes('CRAIGSLIST_STALE_RISK'));
    assert.strictEqual(replyCandidate.contact_route, 'Public Reply');
    assert.strictEqual(incompleteCandidate.normalized_address, '');

    const phonePacket = result.packets.find((packet) => packet.property.source_url === PHONE_URL);
    const replyPacket = result.packets.find((packet) => packet.property.source_url === REPLY_URL);
    const incompletePacket = result.packets.find((packet) => packet.property.source_url === INCOMPLETE_URL);
    assert.strictEqual(phonePacket.packet_status, 'CALL_READY');
    assert.strictEqual(phonePacket.contact.role, 'Self-described owner poster');
    assert.ok(phonePacket.risk_flags.includes('POSTER_ROLE_UNVERIFIED'));
    assert.ok(phonePacket.risk_flags.includes('POSSIBLE_WHOLESALER'));
    assert.strictEqual(replyPacket.packet_status, 'OUTREACH_READY');
    assert.strictEqual(replyPacket.contact.route_type, 'PUBLIC_REPLY');
    assert.strictEqual(incompletePacket.packet_status, 'RESEARCH_ONLY');
    assert.strictEqual(incompletePacket.source_evidence.property_specific, true);
    assert.strictEqual(incompletePacket.source_evidence.identity_ready, false);
    assert.strictEqual(incompletePacket.source_evidence.source_ready, false);
    assert.ok(incompletePacket.risk_flags.includes('PROPERTY_IDENTITY_INCOMPLETE'));
    assert.ok(!incompletePacket.risk_flags.includes('SOURCE_PROOF_INCOMPLETE'));
    assert.strictEqual(phonePacket.arv.range, null);
    assert.strictEqual(phonePacket.mao.range, null);
    assert.strictEqual(phonePacket.offer_recommendation.maximum_contract_price_range, null);
    assert.strictEqual(phonePacket.repairs.amount, null);

    assert.strictEqual(result.diagnostics.rejected_reason_counts.stale_post_over_14_days, 1);
    assert.strictEqual(result.diagnostics.rejected_reason_counts.duplicate_address, 1);
    assert.strictEqual(result.diagnostics.rejected_reason_counts.duplicate_phone, 1);
    assert.strictEqual(result.diagnostics.rejected_reason_counts.duplicate_body_hash, 1);
    assert.strictEqual(result.diagnostics.rejected_reason_counts.wrong_market_address, 1);
    assert.strictEqual(result.diagnostics.property_specific_url_count, 3);
    assert.strictEqual(result.diagnostics.identity_ready_count, 2);
    assert.strictEqual(result.diagnostics.source_ready_count, 2);
    assert.strictEqual(result.diagnostics.missing_complete_address, 1);
    assert.strictEqual(result.diagnostics.incomplete_address_candidates.length, 1);
    assert.strictEqual(result.diagnostics.incomplete_address_candidates[0].source_url, INCOMPLETE_URL);

    let rateLimitFetches = 0;
    const rateLimited = await adapter.runDallasCraigslistOwnerAcquisitionAdapter({
      acquisition_run_id: 'craigslist_rate_limit_test',
      city: 'Dallas',
      state: 'TX',
      now: NOW,
      page_fetch_impl: async (url) => {
        rateLimitFetches += 1;
        return response('', url, 429);
      }
    });
    assert.strictEqual(rateLimitFetches, 1);
    assert.strictEqual(rateLimited.status, 'source_blocked');
    assert.strictEqual(rateLimited.diagnostics.stopped_by_403_or_429, true);
    assert.strictEqual(rateLimited.diagnostics.retries, 0);

    const registryEntry = sourceAdapterRegistry.adapterForSourceId(adapter.SOURCE_ID);
    assert.ok(registryEntry);
    assert.strictEqual(registryEntry.adapter_id, 'dallas_craigslist_owner_acquisition_adapter');
    assert.ok(sourceCatalog.buildSourceCatalog({ state: 'TX', county: 'Dallas County' })
      .some((source) => source.source_id === adapter.SOURCE_ID));

    const core = await sourceAcquisitionOrchestrator.runAcquisitionCore({
      job_id: 'craigslist_core_test',
      discovery_batch_id: 'craigslist_core_test',
      city: 'Dallas',
      county: 'Dallas',
      state: 'TX',
      source_ids: [adapter.SOURCE_ID],
      source_families: [adapter.SOURCE_FAMILY]
    }, {
      now: NOW,
      max_search_pages: 1,
      max_post_fetches: 2,
      page_fetch_impl: fetchImpl
    });
    assert.strictEqual(core.status, 'available');
    assert.strictEqual(core.call_ready_packet_count, 2);
    assert.ok(core.call_ready_packets.some((packet) => packet.packet_status === 'CALL_READY'));
    assert.ok(core.call_ready_packets.some((packet) => packet.packet_status === 'OUTREACH_READY'));
    assert.strictEqual(core.preview_only, true);
    assert.strictEqual(core.should_ingest, false);

    assert.deepStrictEqual(snapshotFiles(), before);
    console.log('Dallas Craigslist owner acquisition adapter tests passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
