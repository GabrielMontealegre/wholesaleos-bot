'use strict';
const assert=require('node:assert/strict');
const deals=require('../modules/deals/reviewed-deals');
const workflow=require('../modules/deals/jv-workflow');
const {seed,input,context}=require('./jv-workflow.test');
function signedSeed(){let store=seed();for(const stage of ['holder_interested','buyer_teaser','buyer_interested','jv_signed']){const extra=stage==='jv_signed'?{signed_date_text:'October 6, 2026',contract_source_url:'https://records.example.test/contract',agreement_source_url:'https://records.example.test/agreement'}:stage==='buyer_teaser'||stage==='buyer_interested'?{buyer_id:store.buyers[0].id,...(stage==='buyer_interested'?{buyer_price:165000}:{})}:{};store=workflow.record(store,'deal',input(stage,extra),context,deals.evaluate(store.reviewed_deals[0],store.buyers,context.now));}return store;}
function changedSeed(){return deals.update(signedSeed(),'deal',{action:'terms',contract_price:141000,reason:'Synthetic amended holder terms.',evidence_url:'https://records.example.test/amendment'},context);}
function reviewInput(store){return {action:'jv_signature_review',review_version:workflow.view(store.reviewed_deals[0],context.now).review_version,happened_at:context.now,
  source_url:'https://records.example.test/amendment',evidence_text:'Synthetic signed amendments reviewed against current terms.',checks:input('jv_signed').checks,signed_date_text:'October 6, 2026',
  contract_source_url:'https://records.example.test/amended-contract',agreement_source_url:'https://records.example.test/amended-jv'};}
function review(store,body=reviewInput(store),ctx=context){return workflow.recordSignatureReview(store,'deal',body,ctx,deals.evaluate(store.reviewed_deals[0],store.buyers,ctx.now));}
const original=changedSeed();const bytes=JSON.stringify(original);const before=workflow.view(original.reviewed_deals[0],context.now);
assert.equal(before.review_required,true);assert.equal(before.full_package_evidence_ready,false);
assert.throws(()=>review(seed()),/review_without_signing/);
assert.throws(()=>review(original,{...reviewInput(original),review_version:'old'}),/review_stale/);
assert.throws(()=>review(original,{...reviewInput(original),operator_id:'forged'}),/request_invalid/);
assert.throws(()=>review(original,reviewInput(original),{...context,operatorId:''}),/evidence_required/);
assert.throws(()=>review(original,{...reviewInput(original),signed_date_text:'10/06/2026'}),/signed_date_unproven/);
assert.throws(()=>review(original,{...reviewInput(original),happened_at:'2026-10-08T00:00:00Z'}),/event_date_invalid/);
assert.throws(()=>review(original,{...reviewInput(original),happened_at:'2026-10-06T00:00:00Z'}),/event_stale/);
assert.throws(()=>review(original,{...reviewInput(original),checks:{...input('jv_signed').checks,contract_copy_verified:false}}),/checks_required/);
assert.throws(()=>review(original,{...reviewInput(original),contract_source_url:'http://records.example.test/contract'}),/source_invalid/);
assert.throws(()=>review(original,{...reviewInput(original),evidence_text:''}),/evidence_required/);
const missing=JSON.parse(bytes);missing.reviewed_deals[0].emd=null;assert.throws(()=>review(missing),/holder_terms_required/);
const completed=review(original);const row=completed.reviewed_deals[0];const after=workflow.view(row,context.now);
assert.equal(after.stage,before.stage);assert.equal(after.review_required,false);assert.equal(after.full_package_evidence_ready,true);
assert.deepEqual(row.jv_workflow_events,original.reviewed_deals[0].jv_workflow_events);assert.equal(row.jv_signature_reviews.length,1);
assert.equal(row.jv_signature_reviews[0].operator_id,context.operatorId);assert.equal(row.jv_signature_reviews[0].holder_terms.contract_price,141000);
assert.equal(JSON.stringify(original),bytes);assert.deepEqual(completed.leads,original.leads);assert.deepEqual(completed.buyers,original.buyers);
assert.equal(workflow.fullPackage(row,deals.evaluate(row,completed.buyers,context.now),completed.buyers[0].id,context.now).agreement_source_url,reviewInput(original).agreement_source_url);
assert.throws(()=>review(completed,reviewInput(original)),/review_stale/,'replaying the old request never appends another review');
assert.equal(workflow.view(JSON.parse(JSON.stringify(row)),context.now).full_package_evidence_ready,true);
const twice=review(completed);assert.equal(twice.reviewed_deals[0].jv_signature_reviews.length,2);
const altered=deals.update(completed,'deal',{action:'terms',jv_split:0.4,reason:'Synthetic new split.',evidence_url:'https://records.example.test/new-split'},context);
assert.equal(workflow.view(altered.reviewed_deals[0],context.now).full_package_evidence_ready,false);
assert.equal(altered.reviewed_deals[0].jv_signature_reviews.length,1,'updates preserve earlier review history');
const forged=JSON.parse(JSON.stringify(row));forged.jv_signature_reviews[0].source_kind='derived_workflow';assert.equal(workflow.view(forged,context.now).signature_reviews_invalid,true);
assert.throws(()=>workflow.fullPackage(forged,deals.evaluate(forged,completed.buyers,context.now),completed.buyers[0].id,context.now),/full_package_locked/);
const derivedDate=JSON.parse(JSON.stringify(row));derivedDate.jv_signature_reviews[0].signed_date_text='';derivedDate.jv_signature_reviews[0].signed_date='2026-10-06';assert.equal(workflow.view(derivedDate,context.now).full_package_evidence_ready,false);
const wrongTerms=JSON.parse(JSON.stringify(row));wrongTerms.jv_signature_reviews[0].holder_terms.contract_price=1;assert.equal(workflow.view(wrongTerms,context.now).signature_reviews_invalid,true);
const fs=require('node:fs');const originals={fetch:global.fetch,write:fs.writeFileSync,clock:Date.now};let sideEffects=0;
try{const forbidden=()=>{sideEffects++;throw Error('side effect');};global.fetch=forbidden;fs.writeFileSync=forbidden;Date.now=forbidden;review(original);workflow.view(row,context.now);}
finally{global.fetch=originals.fetch;fs.writeFileSync=originals.write;Date.now=originals.clock;}
assert.equal(sideEffects,0,'signing review logic remains pure with an injected clock');
console.log('JV signing re-review: append-only/current terms, same stage, stale replay, date/source/check/actor/forged guards, persistence and unchanged leads/buyers passed.');
module.exports={signedSeed,changedSeed,reviewInput};
