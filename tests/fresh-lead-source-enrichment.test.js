'use strict';

const assert = require('assert');

const provider = require('../modules/research/gemini-scout-discovery-provider');
const leadEvidence = require('../modules/research/lead-evidence');

function response(payload, status, url, contentType) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: url || 'https://generativelanguage.googleapis.com/mock',
    headers: { get: (name) => /content-type/i.test(name) ? (contentType || 'application/json') : '' },
    text: async () => typeof payload === 'string' ? payload : JSON.stringify(payload)
  };
}

function geminiPayload(text, groundingUrl, groundingTitle, supportText) {
  return {
    candidates: [{
      content: { parts: [{ text }] },
      groundingMetadata: {
        groundingChunks: groundingUrl ? [{ web: { uri: groundingUrl, title: groundingTitle || '' } }] : [],
        groundingSupports: groundingUrl ? [{
          segment: { text: supportText || '' },
          groundingChunkIndices: [0]
        }] : []
      }
    }]
  };
}

const env = {
  GEMINI_API_KEY: 'test',
  ENABLE_GEMINI_WEB_RESEARCH: 'true',
  GEMINI_RESEARCH_MODEL: 'mock'
};

const job = {
  market: 'Texas',
  location: 'Dallas County, Texas',
  city: 'Dallas',
  state: 'TX',
  county: 'Dallas County',
  batch_size: 10,
  strategies: ['investor_special', 'fixer', 'as_is', 'cash_only'],
  max_source_verifications: 10
};

(async () => {
  const redfinUrl = 'https://www.redfin.com/TX/Dallas/5135-Southwick-Dr-75241/home/32900000';
  let postCalls = 0;
  let getCalls = 0;
  const malformed = await provider.runGeminiScoutDiscovery(job, {
    env,
    fetchImpl: async (url, init) => {
      if (init && init.method === 'POST') {
        postCalls += 1;
        return response(geminiPayload('```json\n{"candidates":[{"source_url":"' + redfinUrl + '",}\n```', redfinUrl, '5135 Southwick Dr | Redfin', 'Investor Special! Active listing at 5135 Southwick Dr.'), 200);
      }
      getCalls += 1;
      return response('<html><head><title>5135 Southwick Dr</title></head><body></body></html>', 200, redfinUrl, 'text/html');
    }
  });
  assert.strictEqual(postCalls, 1);
  assert.ok(getCalls <= 1);
  assert.strictEqual(malformed.provider_output_repaired, true);
  assert.ok(malformed.grounding_support_count >= 1);
  assert.ok(malformed.evidence_sources_merged >= 1);
  assert.ok(malformed.cards[0].exact_source_phrase);
  assert.strictEqual(malformed.cards[0].exact_source_phrase_source_type, 'grounding_support');
  assert.strictEqual(malformed.cards[0].exact_source_phrase_verbatim, true);

  const metaUrl = 'https://www.redfin.com/TX/Dallas/2222-Meta-Dr-75208/home/2222';
  const metadata = await provider.runGeminiScoutDiscovery(job, {
    env,
    fetchImpl: async (url, init) => {
      if (init && init.method === 'POST') {
        return response(geminiPayload('Not JSON. Source: ' + metaUrl, metaUrl, '2222 Meta Dr | Redfin', ''), 200);
      }
      return response('<html><head><title>2222 Meta Dr</title><meta name="description" content="Ultimate fixer-upper opportunity in Dallas."><script type="application/ld+json">{"@type":"SingleFamilyResidence","address":{"streetAddress":"2222 Meta Dr","addressLocality":"Dallas","addressRegion":"TX","postalCode":"75208"},"offers":{"price":"199000"},"numberOfBedrooms":3,"numberOfBathroomsTotal":2,"floorSize":{"value":1410}}</script></head></html>', 200, metaUrl, 'text/html');
    }
  });
  assert.ok(metadata.evidence_enrichment_attempts >= 1);
  assert.ok(metadata.evidence_enriched_count >= 1);
  assert.strictEqual(metadata.cards[0].exact_source_phrase_source_type, 'page_metadata');
  assert.strictEqual(metadata.cards[0].asking_price, '199000');
  assert.strictEqual(metadata.cards[0].beds, '3');

  const noEvidenceUrl = 'https://www.redfin.com/TX/Dallas/3333-Plain-Dr-75208/home/3333';
  const noEvidence = await provider.runGeminiScoutDiscovery(job, {
    env,
    fetchImpl: async (url, init) => {
      if (init && init.method === 'POST') return response(geminiPayload('Source: ' + noEvidenceUrl, noEvidenceUrl, '3333 Plain Dr | Redfin', ''), 200);
      return response('<html><head><title>3333 Plain Dr</title><meta name="description" content="Single family home in Dallas."></head></html>', 200, noEvidenceUrl, 'text/html');
    }
  });
  assert.strictEqual(noEvidence.cards[0].exact_source_phrase, '');
  assert.strictEqual(leadEvidence.dealFinderGroup(noEvidence.cards[0]), 'Research / Reference');

  const paraphraseUrl = 'https://www.redfin.com/TX/Dallas/4444-Para-Dr-75208/home/4444';
  const paraphrase = await provider.runGeminiScoutDiscovery(job, {
    env,
    purpose: 'evidence_enrichment',
    enrichment_candidates: [{ address_or_source_text: '4444 Para Dr, Dallas, TX 75208', source_url: paraphraseUrl }],
    fetchImpl: async (url, init) => {
      if (init && init.method === 'POST') {
        return response(geminiPayload(JSON.stringify({ candidates: [{
          address: '4444 Para Dr, Dallas, TX 75208',
          source_url: paraphraseUrl,
          listing_status: 'Active',
          exact_source_phrase: 'This appears to be a fixer opportunity.',
          exact_source_phrase_verbatim: false
        }] }), paraphraseUrl, '4444 Para Dr | Redfin', ''), 200);
      }
      return response('<html><head><title>4444 Para Dr</title><meta name="description" content="Single family home."></head></html>', 200, paraphraseUrl, 'text/html');
    }
  });
  assert.strictEqual(paraphrase.cards[0].exact_source_phrase, '');
  assert.strictEqual(leadEvidence.dealFinderGroup(paraphrase.cards[0]), 'Research / Reference');

  const blockedUrl = 'https://www.redfin.com/TX/Dallas/5555-Blocked-Dr-75208/home/5555';
  const blocked = await provider.runGeminiScoutDiscovery(job, {
    env,
    fetchImpl: async (url, init) => {
      if (init && init.method === 'POST') return response(geminiPayload('Source: ' + blockedUrl, blockedUrl, '5555 Blocked Dr | Redfin', ''), 200);
      return response('Forbidden', 403, blockedUrl, 'text/html');
    }
  });
  assert.ok(blocked.source_refresh_blocked_count >= 1);
  assert.strictEqual(blocked.cards[0].exact_source_phrase, '');

  console.log('fresh lead source enrichment tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
