'use strict';
const assert = require('node:assert/strict');
const deals = require('../modules/deals/reviewed-deals');
const workflow = require('../modules/deals/jv-workflow');
const {seed, context, input} = require('./jv-workflow.test');
const store = seed(); const before = JSON.stringify(store);
const terms = {action:'terms', contract_price:145000, holder_fee:5000, emd:1200, closing_date:'October 22, 2026', title_company:'Synthetic Second Title',
  reason:'The synthetic holder stated these terms.', evidence_url:'https://records.example.test/message'};
const result = deals.update(store,'deal',terms,context); const updated = result.reviewed_deals[0];
for (const key of ['contract_price','holder_fee','emd','closing_date','title_company']) {
  assert.equal(updated.field_provenance[key].source_url,terms.evidence_url);
  assert.equal(updated.field_provenance[key].evidence_text,terms.reason);
}
assert.equal(updated.closing_date,'2026-10-22');assert.equal(updated.contract_price,145000);
assert.equal(JSON.stringify(store),before);assert.deepEqual(result.leads,store.leads);assert.deepEqual(result.buyers,store.buyers);
assert.throws(()=>deals.update(store,'deal',{...terms,closing_date:'10/06/2026'},context),/date_unproven/);
assert.throws(()=>deals.update(store,'deal',{...terms,contract_price:-1},context),/number_invalid/);
assert.throws(()=>deals.update(store,'deal',{...terms,reason:''},context),/terms_required/);
assert.throws(()=>deals.update(store,'deal',{...terms,action:'approve'},context),/update_invalid/);
assert.throws(()=>deals.update(store,'deal',{...terms,operator_id:'forged'},context),/update_invalid/);
const view = workflow.view(updated,context.now);
assert.deepEqual(view.stages.find(s=>s.stage==='jv_signed').required_checks,workflow.CHECKS.jv_signed);
view.stages.find(s=>s.stage==='jv_signed').required_checks.push('forged');
assert.ok(!workflow.CHECKS.jv_signed.includes('forged'),'presentation cannot mutate canonical checks');
const advanced = workflow.record(result,'deal',input('holder_interested'),context,deals.evaluate(updated,result.buyers,context.now));
assert.equal(advanced.reviewed_deals[0].jv_workflow_events[0].holder_terms.contract_price,145000);
console.log('JV controls terms: source-backed edits, ambiguous/missing/forged failures, unchanged lead/buyer stores, canonical checks passed.');
