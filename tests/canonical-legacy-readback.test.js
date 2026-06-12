'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return originalLoad.call(this, request, parent, isMain);
};

const tmpDir = path.resolve(__dirname, '.tmp', 'canonical-legacy-readback');
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

const findMeScoutJobs = require('../modules/research/findme-scout-jobs');
const aiDealAnalyzerJobs = require('../modules/research/ai-deal-analyzer-jobs');
const dealCallDossiers = require('../modules/research/deal-call-dossiers');

const sourceUrl = 'https://www.redfin.com/TX/Dallas/10527-Cayuga-Dr-75228/home/32490000';
const sourceUrlAlt = 'https://www.redfin.com/TX/Dallas/10527-Cayuga-Dr-75228/home/32900000';
const phrase = 'Investor Special!';

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

writeJson(process.env.FINDME_SCOUT_JOBS_PATH, {
  version: 1,
  updated_at: '2026-06-12T00:00:00.000Z',
  jobs: [{
    job_id: 'fms_readback',
    created_at: '2026-06-12T00:00:00.000Z',
    updated_at: '2026-06-12T00:00:00.000Z',
    status: 'completed',
    market: 'Dallas',
    location: 'Dallas, TX',
    strategies: ['investor_special'],
    cards: [{
      card_id: 'fmc_partial_with_url',
      status: 'Research Ready',
      address_or_source_text: '10527 Cayuga Dr',
      source_url: sourceUrl,
      canonical_source_url: sourceUrl,
      source_title: '10527 Cayuga Dr, Dallas, TX 75228 | Redfin',
      exact_source_phrase: phrase,
      matched_source_phrase: phrase,
      public_contact_route: 'Public Contact Form',
      comp_status: 'Needs Comps',
      can_send_to_analyzer: true,
      lead_evidence: {
        normalized_address: '10527 Cayuga Dr',
        canonical_source_url: sourceUrl,
        exact_source_phrase: phrase,
        public_contact_route: 'Public Contact Form',
        comp_status: 'Needs Comps'
      }
    }, {
      card_id: 'fmc_complete_duplicate',
      status: 'Research Ready',
      address_or_source_text: '10527 Cayuga Dr, Dallas, TX 75228',
      source_url: sourceUrlAlt,
      canonical_source_url: sourceUrlAlt,
      source_title: '10527 Cayuga Dr, Dallas, TX 75228 | Redfin',
      exact_source_phrase: '',
      public_contact_route: 'Manual Lookup Needed',
      comp_status: 'Needs Comps',
      can_send_to_analyzer: true,
      lead_evidence: {
        normalized_address: '10527 Cayuga Dr, Dallas, TX 75228',
        canonical_source_url: sourceUrlAlt,
        comp_status: 'Needs Comps'
      }
    }, {
      card_id: 'fmc_partial_no_proof',
      status: 'Needs Address Repair',
      address_or_source_text: '10527 Cayuga Dr',
      source_url: '',
      can_send_to_analyzer: false,
      lead_evidence: {
        normalized_address: '10527 Cayuga Dr'
      }
    }]
  }]
});

const scoutJob = findMeScoutJobs.listJobs(10)[0];
const cayugaCards = scoutJob.cards.filter((card) => /10527 Cayuga/i.test(card.address_or_source_text));
const canonicalCards = cayugaCards.filter((card) => card.address_identity_status === 'canonical');
const partialCards = cayugaCards.filter((card) => card.address_identity_status === 'incomplete');
assert.strictEqual(canonicalCards.length, 1);
assert.strictEqual(canonicalCards[0].address_or_source_text, '10527 Cayuga Dr, Dallas, TX 75228');
assert.strictEqual(canonicalCards[0].lead_evidence.normalized_address, '10527 Cayuga Dr, Dallas, TX 75228');
assert.strictEqual(canonicalCards[0].lead_evidence.exact_source_phrase, phrase);
assert.strictEqual(canonicalCards[0].public_contact_route, 'Public Contact Form');
assert.ok((canonicalCards[0].legacy_duplicate_card_ids || []).includes('fmc_complete_duplicate'));
assert.strictEqual(partialCards.length, 1);
assert.strictEqual(partialCards[0].address_or_source_text, '10527 Cayuga Dr');
assert.ok((partialCards[0].missing_evidence || []).includes('Address incomplete - source verification required.'));
assert.strictEqual(scoutJob.counts.total_cards, 2);

writeJson(process.env.AI_DEAL_ANALYZER_JOBS_PATH, {
  version: 1,
  updated_at: '2026-06-12T00:00:00.000Z',
  jobs: [{
    job_id: 'aidj_4f40b1de-d1dd-4117-bcd6-ed0e00f5ac98',
    created_at: '2026-06-12T00:00:00.000Z',
    updated_at: '2026-06-12T00:03:00.000Z',
    status: 'needs_comps',
    input_type: 'pasted_address',
    input_value: '10527 Cayuga Dr',
    normalized_address: '10527 Cayuga Dr, 10527',
    source_url: sourceUrl,
    source_type: 'listing_marketplace',
    lead_evidence: {
      normalized_address: '10527 Cayuga Dr, 10527',
      canonical_source_url: sourceUrl,
      exact_source_phrase: phrase,
      public_contact_route: 'Public Contact Form',
      comp_status: 'Needs Comps'
    },
    source_evidence: [{
      type: 'source_evidence_pack',
      source_url: sourceUrl,
      source_url_address_candidate: '10527 Cayuga Dr, Dallas, TX 75228',
      address_candidate: '10527 Cayuga Dr, 10527',
      city_candidate: 'Dallas',
      state_candidate: 'TX',
      zip_candidate: '75228'
    }]
  }, {
    job_id: 'aidj_legacy_malformed',
    created_at: '2026-06-12T00:00:00.000Z',
    updated_at: '2026-06-12T00:02:00.000Z',
    status: 'needs_comps',
    input_type: 'pasted_address',
    input_value: '10527 Cayuga Dr, Dallas, TX 75228',
    normalized_address: '10527 Cayuga Dr, Dallas, TX, 10527',
    source_url: sourceUrlAlt,
    source_evidence: [{
      type: 'source_evidence_pack',
      source_url: sourceUrlAlt,
      source_url_address_candidate: '10527 Cayuga Dr, Dallas, TX 75228',
      address_candidate: '10527 Cayuga Dr, Dallas, TX, 10527'
    }]
  }, {
    job_id: 'aidj_unit_224',
    created_at: '2026-06-12T00:00:00.000Z',
    updated_at: '2026-06-12T00:01:00.000Z',
    status: 'needs_comps',
    input_type: 'pasted_address',
    input_value: '5926 Sandhurst Ln Unit 224, Dallas, TX 75206',
    normalized_address: '5926 Sandhurst Ln Unit 224, Dallas, TX 75206',
    source_url: 'https://www.redfin.com/TX/Dallas/5926-Sandhurst-Ln-Unit-224-75206/home/1'
  }, {
    job_id: 'aidj_unit_225',
    created_at: '2026-06-12T00:00:00.000Z',
    updated_at: '2026-06-12T00:01:00.000Z',
    status: 'needs_comps',
    input_type: 'pasted_address',
    input_value: '5926 Sandhurst Ln Unit 225, Dallas, TX 75206',
    normalized_address: '5926 Sandhurst Ln Unit 225, Dallas, TX 75206',
    source_url: 'https://www.redfin.com/TX/Dallas/5926-Sandhurst-Ln-Unit-225-75206/home/2'
  }]
});

const analyzerJobs = aiDealAnalyzerJobs.listJobs(20);
const analyzer10527 = analyzerJobs.filter((job) => /10527 Cayuga/i.test(JSON.stringify(job)));
assert.strictEqual(analyzer10527.length, 1);
assert.strictEqual(analyzer10527[0].job_id, 'aidj_4f40b1de-d1dd-4117-bcd6-ed0e00f5ac98');
assert.strictEqual(analyzer10527[0].normalized_address, '10527 Cayuga Dr, Dallas, TX 75228');
assert.strictEqual(analyzer10527[0].lead_evidence.normalized_address, '10527 Cayuga Dr, Dallas, TX 75228');
assert.ok((analyzer10527[0].legacy_duplicate_job_ids || []).includes('aidj_legacy_malformed'));
const legacyJob = aiDealAnalyzerJobs.getJob('aidj_legacy_malformed');
assert.strictEqual(legacyJob.legacy_duplicate, true);
assert.strictEqual(legacyJob.canonical_job_id, 'aidj_4f40b1de-d1dd-4117-bcd6-ed0e00f5ac98');
assert.strictEqual(legacyJob.normalized_address, '10527 Cayuga Dr, Dallas, TX 75228');
assert.ok(analyzerJobs.some((job) => job.job_id === 'aidj_unit_224'));
assert.ok(analyzerJobs.some((job) => job.job_id === 'aidj_unit_225'));

const created = aiDealAnalyzerJobs.createJobs({
  items: [{
    input_type: 'pasted_address',
    input_value: '10527 Cayuga Dr, Dallas, TX 75228',
    address: '10527 Cayuga Dr, Dallas, TX 75228',
    source_url: sourceUrl,
    exact_source_phrase: phrase
  }]
}, { runNow: false })[0];
assert.strictEqual(created.job_id, 'aidj_4f40b1de-d1dd-4117-bcd6-ed0e00f5ac98');
assert.strictEqual(created.normalized_address, '10527 Cayuga Dr, Dallas, TX 75228');

const dossierFirst = dealCallDossiers.createDossier({ analyzer_job_id: created.job_id });
const dossierSecond = dealCallDossiers.createDossier({ analyzer_job_id: created.job_id });
assert.strictEqual(dossierSecond.reused, true);
assert.strictEqual(dossierSecond.canonical_dossier_id, dossierFirst.dossier.dossier_id);
assert.strictEqual(dealCallDossiers.listDossiers({ limit: 50 }).filter((item) => /10527 Cayuga/i.test(item.property.full_address)).length, 1);
assert.strictEqual(dossierSecond.dossier.valuation.valuation_status, 'Locked');
assert.strictEqual(dossierSecond.dossier.valuation.arv_range, null);
assert.strictEqual(dossierSecond.dossier.valuation.mao_range, null);

console.log('canonical legacy readback tests passed');
