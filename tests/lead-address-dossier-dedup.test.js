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

const tmpDir = path.resolve(__dirname, '.tmp', 'lead-address-dossier-dedup');
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

const propertyIdentity = require('../modules/research/property-identity');
const leadEvidence = require('../modules/research/lead-evidence');
const aiDealAnalyzerJobs = require('../modules/research/ai-deal-analyzer-jobs');
const dealCallDossiers = require('../modules/research/deal-call-dossiers');

const sourceUrl = 'https://www.redfin.com/TX/Dallas/10527-Cayuga-Dr-75228/home/32490000';
const phrase = 'Investor Special!';

assert.strictEqual(propertyIdentity.canonicalAddress({
  address: '10527 Cayuga Dr',
  city: 'Dallas',
  state: 'TX',
  zip: '75228'
}), '10527 Cayuga Dr, Dallas, TX 75228');

assert.strictEqual(propertyIdentity.canonicalAddress('10527 Cayuga Dr, Dallas, TX 75228'), '10527 Cayuga Dr, Dallas, TX 75228');

assert.strictEqual(propertyIdentity.canonicalAddress({
  normalized_address: '10527 Cayuga Dr, 10527',
  source_url: sourceUrl
}), '10527 Cayuga Dr, Dallas, TX 75228');

assert.strictEqual(
  propertyIdentity.canonicalPropertyKey({ normalized_address: '10527 Cayuga Drive, Dallas, Texas 75228' }),
  propertyIdentity.canonicalPropertyKey({ normalized_address: '10527 Cayuga Dr, Dallas, TX 75228' })
);

assert.notStrictEqual(
  propertyIdentity.canonicalPropertyKey({ normalized_address: '5926 Sandhurst Ln Unit 224, Dallas, TX 75206' }),
  propertyIdentity.canonicalPropertyKey({ normalized_address: '5926 Sandhurst Ln Unit 225, Dallas, TX 75206' })
);

const evidence = leadEvidence.normalizeLeadEvidence({
  address: '10527 Cayuga Dr',
  city: 'Dallas',
  state: 'TX',
  zip: '75228',
  source_url: sourceUrl,
  exact_source_phrase: phrase,
  listing_status: 'Active'
});
assert.strictEqual(evidence.normalized_address, '10527 Cayuga Dr, Dallas, TX 75228');
assert.strictEqual(leadEvidence.dealFinderGroup(evidence), 'Strong Leads');

const analyzerFirst = aiDealAnalyzerJobs.createJobs({
  items: [{
    input_type: 'pasted_address',
    input_value: '10527 Cayuga Dr',
    address: '10527 Cayuga Dr',
    city: 'Dallas',
    state: 'TX',
    zip: '75228',
    source_url: sourceUrl,
    source_type: 'listing_marketplace',
    exact_source_phrase: phrase,
    listing_status: 'Active',
    lead_evidence: evidence
  }]
}, { runNow: false })[0];
assert.strictEqual(analyzerFirst.normalized_address, '10527 Cayuga Dr, Dallas, TX 75228');
assert.strictEqual(analyzerFirst.lead_evidence.exact_source_phrase, phrase);

const analyzerSecond = aiDealAnalyzerJobs.createJobs({
  items: [{
    input_type: 'pasted_address',
    input_value: '10527 Cayuga Dr, 10527',
    source_url: sourceUrl,
    exact_source_phrase: phrase,
    lead_evidence: evidence
  }]
}, { runNow: false })[0];
assert.strictEqual(analyzerSecond.job_id, analyzerFirst.job_id);
assert.strictEqual(analyzerSecond.normalized_address, '10527 Cayuga Dr, Dallas, TX 75228');

const dossierFirst = dealCallDossiers.createDossier({
  analyzer_job_id: analyzerFirst.job_id
});
assert.strictEqual(dossierFirst.created, true);
assert.strictEqual(dossierFirst.dossier.property.full_address, '10527 Cayuga Dr, Dallas, TX 75228');
assert.strictEqual(dossierFirst.dossier.lead_evidence.analyzer_job_id, analyzerFirst.job_id);

const dossierSecond = dealCallDossiers.createDossier({
  analyzer_job_id: analyzerFirst.job_id
});
assert.strictEqual(dossierSecond.reused, true);
assert.strictEqual(dossierSecond.canonical_dossier_id, dossierFirst.dossier.dossier_id);

const rawStore = JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8'));
const duplicate = JSON.parse(JSON.stringify(rawStore.dossiers[0]));
duplicate.dossier_id = 'dcd_malformed_duplicate';
duplicate.property.full_address = '10527 Cayuga Dr, 10527';
duplicate.workflow.notes = 'legacy note';
duplicate.workflow.outcome_history = [{ outcome: 'Call Today', at: '2026-06-11T00:00:00.000Z', note: 'legacy' }];
rawStore.dossiers.push(duplicate);
fs.writeFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, JSON.stringify(rawStore, null, 2));

assert.strictEqual(dealCallDossiers.listDossiers({ limit: 50 }).filter((item) => /10527 Cayuga/i.test(item.property.full_address)).length, 1);

const dossierThird = dealCallDossiers.createDossier({
  address: '10527 Cayuga Dr, Dallas, TX 75228',
  source_url: sourceUrl,
  exact_source_phrase: phrase,
  listing_status: 'Active'
});
assert.strictEqual(dossierThird.reused, true);
const afterMerge = JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8')).dossiers;
assert.strictEqual(afterMerge.filter((item) => item.parked_duplicate === true).length, 1);
assert.strictEqual(dealCallDossiers.listDossiers({ limit: 50 }).filter((item) => /10527 Cayuga/i.test(item.property.full_address)).length, 1);

assert.strictEqual(dossierThird.dossier.valuation.valuation_status, 'Locked');
assert.strictEqual(dossierThird.dossier.valuation.verified_sold_comps_count, 0);
assert.strictEqual(dossierThird.dossier.valuation.arv_range, null);
assert.strictEqual(dossierThird.dossier.valuation.mao_range, null);

console.log('lead address and dossier dedup tests passed');
