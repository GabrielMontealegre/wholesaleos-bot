'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const workflow=require('../modules/deals/jv-workflow');
const deals=require('../modules/deals/reviewed-deals');
const {fixture,buyer,now}=require('./reviewed-deals.test');
const context={now,operatorId:'fixture-operator'};
const source='https://records.example.test/holder-message';
function seed() {
  let store=deals.ingest({buyers:[buyer],leads:[{id:'unchanged'}]},[deals.validate(fixture(),now)],{...context,createId:()=> 'deal'}).store;
  store=deals.update(store,'deal',{action:'approve',reviewed_comps:true},context);
  store=deals.update(store,'deal',{action:'availability',evidence_url:source,checks:{still_available:true}},context);
  return deals.ingest(store,[{kind:'deal_update',ref:store.reviewed_deals[0].record_ref,source_url:source,captured_at:now,evidence_text:'Synthetic holder terms',
    contract_price:140000,closing_date:'October 20, 2026',title_company:'Synthetic Title',jv_split:0.6,emd:1000}],context).store;
}
function input(stage,extra={}) {return {action:'jv_stage',stage,happened_at:now,source_url:source,evidence_text:'Synthetic actual-action report',checks:Object.fromEntries((workflow.CHECKS[stage]||[]).map(k=>[k,true])),...extra};}
function advance(store,stage,extra={}) {const deal=store.reviewed_deals[0];return workflow.record(store,'deal',input(stage,extra),context,deals.evaluate(deal,store.buyers,now));}
function beforeSigning() {let store=seed();store=advance(store,'holder_interested');store=advance(store,'buyer_teaser',{buyer_id:buyer.id});return advance(store,'buyer_interested',{buyer_id:buyer.id,buyer_price:165000});}
const signature={signed_date_text:'October 6, 2026',contract_source_url:'https://records.example.test/contract',agreement_source_url:'https://records.example.test/jv'};
const original=seed();const bytes=JSON.stringify(original);
assert.equal(workflow.view(original.reviewed_deals[0],now).stage,'found');
assert.throws(()=>advance(original,'jv_signed',signature),/transition_invalid/);
assert.throws(()=>advance(original,'holder_interested',{checks:{holder_agreed:false}}),/checks_required/);
assert.throws(()=>advance(original,'holder_interested',{happened_at:'2026-10-08T00:00:00Z'}),/event_date_invalid/);
assert.throws(()=>advance(original,'holder_interested',{happened_at:'2026-02-30T00:00:00Z'}),/event_date_invalid/);
assert.throws(()=>advance(original,'holder_interested',{source_url:'http://records.example.test/x'}),/source_invalid/);
assert.throws(()=>advance({...original,reviewed_deals:[{...original.reviewed_deals[0],contract_price:null}]},'holder_interested'),/holder_terms_required/);
assert.throws(()=>advance(original,'holder_interested',{operator_id:'forged'}),/request_invalid/);
const invalidHistory={...original,reviewed_deals:[{...original.reviewed_deals[0],jv_workflow_events:[{to:'jv_signed',source_kind:'derived_workflow'}]}]};
assert.equal(workflow.view(invalidHistory.reviewed_deals[0],now).history_invalid,true);
assert.equal(workflow.view(invalidHistory.reviewed_deals[0],now).full_package_evidence_ready,false);
assert.throws(()=>advance(invalidHistory,'holder_interested'),/history_invalid/);
let store=beforeSigning();const before=JSON.stringify(store);
assert.throws(()=>advance(store,'jv_signed'),/signed_date_unproven/);
assert.throws(()=>advance(store,'jv_signed',{...signature,signed_date_text:'10/06/2026'}),/signed_date_unproven/);
assert.throws(()=>advance(store,'jv_signed',{...signature,signed_date_text:'October 8, 2026'}),/signed_date_unproven/);
assert.throws(()=>advance(store,'jv_signed',{...signature,checks:{...input('jv_signed').checks,contract_copy_verified:false}}),/checks_required/);
assert.throws(()=>advance(store,'jv_signed',{...signature,agreement_source_url:''}),/source_invalid/);
const forged={...store.reviewed_deals[0],status:'full_package',jv_stage:'full_package',jv_signed_at:now,contract_verified_at:now};
assert.equal(workflow.view(forged,now).full_package_evidence_ready,false);
assert.throws(()=>workflow.fullPackage(forged,deals.evaluate(forged,store.buyers,now),buyer.id,now),/full_package_locked/);
assert.equal(JSON.stringify(store),before);
store=advance(store,'jv_signed',signature);
assert.equal(workflow.view(store.reviewed_deals[0],now).signed_date,'2026-10-06');
assert.equal(workflow.view(store.reviewed_deals[0],now).contract_copy_verified,true);
assert.equal(workflow.fullPackage(store.reviewed_deals[0],deals.evaluate(store.reviewed_deals[0],store.buyers,now),buyer.id,now).address,fixture().address);
const changed={...store.reviewed_deals[0],jv_split:0.4};
assert.equal(workflow.view(changed,now).full_package_evidence_ready,false,'changed terms invalidate the signing evidence without erasing it');
assert.throws(()=>workflow.fullPackage(changed,deals.evaluate(changed,store.buyers,now),buyer.id,now),/full_package_locked/);
assert.throws(()=>advance(store,'full_package',{buyer_id:'other'}),/buyer_not_matched/);
for(const stage of ['full_package','emd_at_title','assigned','closed'])store=advance(store,stage,{buyer_id:buyer.id});
assert.equal(workflow.view(store.reviewed_deals[0],now).stage,'closed');
assert.equal(deals.list(store,{now,includeHidden:true}).items[0].evaluation.status,'closed');
assert.equal(deals.evaluate(store.reviewed_deals[0],store.buyers,now).jv_eligible,false);
assert.equal(store.reviewed_deals[0].status,original.reviewed_deals[0].status,'legacy status is retained, not rewritten');
assert.deepEqual(store.leads,original.leads);assert.deepEqual(store.buyers,original.buyers);
assert.equal(store.reviewed_deals[0].jv_workflow_events.length,8);
assert.ok(store.reviewed_deals[0].jv_workflow_events.every(e=>e.operator_id===context.operatorId&&e.source_kind==='operator_input'&&e.happened_at===now));
assert.equal(store.activities.filter(e=>e.jv_stage).length,8);
assert.throws(()=>advance(store,'dead'),/terminal/);
assert.equal(workflow.view(JSON.parse(JSON.stringify(store)).reviewed_deals[0],now).stage,'closed');
const updated=deals.ingest(beforeSigning(),[{kind:'deal_update',ref:original.reviewed_deals[0].record_ref,source_url:source,captured_at:now,evidence_text:'Synthetic correction',title_company:'Other Title'}],context).store;
assert.equal(workflow.view(updated.reviewed_deals[0],now).stage,'buyer_interested','fact updates preserve pipeline history');
const dead=advance(original,'dead');assert.equal(deals.evaluate(dead.reviewed_deals[0],dead.buyers,now).verdict,'NO');
assert.throws(()=>advance(beforeSigning(),'jv_signed',{...signature,happened_at:'2026-10-06T00:00:00Z'}),/event_stale/);
const privateDeal={...original.reviewed_deals[0],holder_contact:{name:'Private Holder Name',phone:'555-999-8888',email:'private@example.test'}};
const teaser=workflow.teaser(privateDeal,deals.evaluate(privateDeal,original.buyers,now),buyer.id);const payload=JSON.stringify(teaser);
for(const hidden of [fixture().address,'Private Holder Name','555-999-8888','private@example.test',source])assert.ok(!payload.includes(hidden));
assert.equal(teaser.sent,false);assert.equal(teaser.source_kind,'derived_workflow');
assert.throws(()=>workflow.teaser(privateDeal,deals.evaluate(privateDeal,[{...buyer,assistant_find:{...buyer.assistant_find,approval:'pending'}}],now),buyer.id),/buyer_not_matched/);
assert.equal(JSON.stringify(original),bytes);
const old={fetch:global.fetch,write:fs.writeFileSync,clock:Date.now};let calls=0;
try{const forbidden=()=>{calls++;throw Error('side effect');};global.fetch=forbidden;fs.writeFileSync=forbidden;Date.now=forbidden;
  workflow.view(original.reviewed_deals[0],now);advance(original,'holder_interested');workflow.teaser(privateDeal,deals.evaluate(privateDeal,original.buyers,now),buyer.id);
}finally{global.fetch=old.fetch;fs.writeFileSync=old.write;Date.now=old.clock;}
assert.equal(calls,0);
module.exports={seed,input,context};
console.log('JV workflow: all nine stages, real date/contract guards, blind teaser, changed terms, atomic/pure failures and preserved history passed.');
