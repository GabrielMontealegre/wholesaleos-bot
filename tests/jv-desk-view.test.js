'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const deals=require('../modules/deals/reviewed-deals');
const workflow=require('../modules/deals/jv-workflow');
const desk=require('../dashboard/wos-jv-desk');
const {seed,input,context}=require('./jv-workflow.test');
let store=seed();
const ready=deals.list(store,{now:context.now,jv:true}).items[0];
assert.equal(ready.jv_section,'ready');
store=workflow.record(store,'deal',input('holder_interested'),context,deals.evaluate(store.reviewed_deals[0],store.buyers,context.now));
const later='2026-10-08T12:00:00Z';
const active=deals.list(store,{now:later,jv:true}).items[0];
assert.equal(active.jv_section,'active');assert.equal(active.evaluation.jv_eligible,false);
assert.equal(active.evaluation.introduction_allowed,false);
assert.notEqual(active.evaluation.ready_to_offer,'YES');
const original=JSON.stringify(store);
const mixed={...store,reviewed_deals:[store.reviewed_deals[0],{...ready,id:'near',jv_workflow_events:[],approval:'pending'},
 {...ready,id:'other',deal_kind:'own_lead'},
 {...ready,id:'forged',status:'jv_signed',jv_workflow_events:[{to:'holder_interested',source_kind:'derived_workflow'}]},
 {...store.reviewed_deals[0],id:'closed',status:'closed'}]};
const rows=deals.list(mixed,{now:later,jv:true}).items;
assert.deepEqual(rows.map(row=>row.id).sort(),['deal','forged','near']);
assert.equal(rows.find(row=>row.id==='forged').jv_section,'near_miss');
assert.equal(deals.list(mixed,{now:context.now,jv:true}).items.find(row=>row.id==='forged').jv_section,'near_miss','invalid workflow is never labeled ready even when old eligibility passes');
assert.equal(rows.find(row=>row.id==='near').jv_section,'near_miss');
assert.equal(deals.list(mixed,{now:later,jv:true,includeHidden:true}).items.find(row=>row.id==='closed').jv_section,'near_miss');
const html=desk.render({...active,holder_contact:{name:'<img src=x onerror=alert(1)>',email:'fixture@example.test'},drafted_message:'<script>test</script>'});
assert.ok(html.includes('Now:'));assert.ok(html.includes('Holder interested'));
assert.ok(html.includes('Buyer readiness:'));assert.ok(html.includes('Introduction locked'));
assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<img'));assert.ok(!html.includes(active.address));
assert.equal((html.match(/ disabled title=/g)||[]).length,3);
assert.ok(html.includes('data-deal-action="draft"'));assert.ok(!html.includes('DocuSign'));
assert.equal(desk.render({...active,deal_kind:'own_lead'}),'');
let calls=0;const originals=[global.fetch,fs.writeFileSync,Date.now];
try {const forbidden=()=>{calls++;throw Error('side effect');};global.fetch=fs.writeFileSync=Date.now=forbidden;
 deals.list(store,{now:later,jv:true});desk.render(active);
}finally{[global.fetch,fs.writeFileSync,Date.now]=originals;}
assert.equal(calls,0);assert.equal(JSON.stringify(store),original);
console.log('JV desk: active/readiness separation, forged/terminal/non-JV negatives, escaped private-free header, disabled Send, pure unchanged gates passed.');
