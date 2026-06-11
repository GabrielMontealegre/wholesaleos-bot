'use strict';

const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return originalLoad.call(this, request, parent, isMain);
};

process.env.DB_PATH = process.env.DB_PATH || './tests/.tmp/actionable-lead-db.json';
process.env.FINDME_SCOUT_JOBS_PATH = process.env.FINDME_SCOUT_JOBS_PATH || './tests/.tmp/findme-scout-jobs.json';
process.env.AI_DEAL_ANALYZER_JOBS_PATH = process.env.AI_DEAL_ANALYZER_JOBS_PATH || './tests/.tmp/ai-deal-analyzer-jobs.json';
process.env.DEAL_CALL_DOSSIERS_PATH = process.env.DEAL_CALL_DOSSIERS_PATH || './tests/.tmp/deal-call-dossiers.json';

const leadEvidence = require('../modules/research/lead-evidence');
const dealCallDossiers = require('../modules/research/deal-call-dossiers');

const sourceUrl = 'https://www.realtor.com/realestateandhomes-detail/2912-Warren-Ave_Dallas_TX_75215_M12345';
const phrase = 'Investor Special - Cash Only Opportunity! AS IS SALE! Home back on the market due to buyer!!';

const strongEvidence = leadEvidence.normalizeLeadEvidence({
  address: '2912 Warren Ave, Dallas, TX 75215',
  source_url: sourceUrl,
  exact_source_phrase: phrase,
  listing_status: 'Active',
  asking_price: '$139,000',
  beds: '3',
  baths: '1',
  sqft: '1188',
  year_built: '1948'
});

assert.strictEqual(strongEvidence.canonical_source_url, sourceUrl);
assert.strictEqual(strongEvidence.public_contact_route, 'Public Contact Form');
assert.strictEqual(strongEvidence.comp_status, 'Needs Comps');
assert.strictEqual(leadEvidence.dealFinderGroup(strongEvidence), 'Strong Leads');

const needsComps = leadEvidence.normalizeLeadEvidence(strongEvidence, {
  public_contact_route: 'Manual Lookup Needed'
});
assert.strictEqual(leadEvidence.dealFinderGroup(needsComps), 'Valid Leads - Needs Comps');

const reference = leadEvidence.normalizeLeadEvidence({
  address: '2912 Warren Ave, Dallas, TX 75215',
  source_url: 'https://www.realtor.com/realestateandhomes-search/Dallas_TX',
  listing_status: 'Sold',
  exact_source_phrase: ''
});
assert.strictEqual(leadEvidence.dealFinderGroup(reference), 'Research / Reference');

const dossier = dealCallDossiers.buildDossier({
  address: strongEvidence.normalized_address,
  source_url: strongEvidence.canonical_source_url,
  source_title: '2912 Warren Ave',
  source_page_text: phrase,
  exact_source_phrase: phrase,
  listing_status: 'Active',
  asking_price: '$139,000',
  beds: '3',
  baths: '1',
  sqft: '1188',
  year_built: '1948',
  lead_evidence: strongEvidence
});

assert.strictEqual(dossier.lead_evidence.exact_source_phrase, phrase);
assert.strictEqual(dossier.contact.target, 'Public Contact Form');
assert.strictEqual(dossier.workflow.outcome, 'Call Today');
assert.ok(dossier.call_script.why_calling.includes(phrase));
assert.strictEqual(dossier.call_script.role_specific_questions.length, 5);
assert.ok(dossier.call_script.role_specific_questions.some((q) => /prior buyer/i.test(q)));
assert.ok(/locked/i.test(dossier.valuation.valuation_status));
assert.strictEqual(dossier.valuation.verified_sold_comps_count, 0);

console.log('actionable lead reconnection tests passed');
