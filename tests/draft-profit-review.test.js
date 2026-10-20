'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),https=require('node:https');
const {signedSeed}=require('./jv-signing-review.test'),{now}=require('./reviewed-deals.test'),{report}=require('./pipeline-workspace.test');
const messages=require('../modules/email/buyer-messages'),reports=require('../modules/records/pipeline-reports'),deals=require('../modules/deals/reviewed-deals'),fits=require('../modules/buyers/deal-fit-view');
function fixture(){let store=signedSeed();store={...store,buyers:store.buyers.map(b=>({...b,record_ref:'BUY-0001',source_url:'https://records.example.test/buyer',assistant_find:{...b.assistant_find,name:'Fixture buyer',email:'fixture@example.test',contact_published:{email:'fixture@example.test'},first_seen_at:now,captured_at:now,status:'new'}}))};return reports.upsert(store,report({record_ref:store.reviewed_deals[0].record_ref,captured_at:now,asked_at:'2026-10-06T12:00:00Z',next_date:'2026-10-08',buyer_price:{low:165000,high:165000},contract_price:{low:140000,high:140000},costs:{low:1000,high:1000},path:'assignment',our_share:0.6}),{now,operatorId:'fixture-admin'}).store;}
function preview(store){return messages.prepare(store,'buyer1',{kind:'buyer_teaser',deal_ids:['deal']},{now});}
const old={fetch:global.fetch,hg:http.get,hr:http.request,sg:https.get,sr:https.request,write:fs.writeFileSync,clock:Date.now};let effects=0;const deny=()=>{effects++;throw Error('network/clock/write forbidden');};
try{
 global.fetch=http.get=http.request=https.get=https.request=fs.writeFileSync=Date.now=deny;
 const store=fixture(),before=JSON.stringify(store),p=preview(store),empty=preview({...store,pipeline_reports:[]}),profit=p.profit_review[0].profit;
 assert.equal(p.body,empty.body);assert.equal(p.to,empty.to);assert.equal(p.subject,empty.subject);assert.notEqual(p.version,empty.version);
 assert.deepEqual(profit.net_fee,{low:24000,high:24000});assert.deepEqual(profit.our_net,{low:14400,high:14400});assert.equal(profit.buyer_confirmed,false);
 assert.deepEqual(profit,deals.list(store,{now}).items[0].evaluation.matches[0].profit);assert.deepEqual(profit,fits.build(store,{now}).get('buyer1').matches[0].profit);
 assert.ok(!p.body.includes('24000'));assert.ok(!p.body.includes('14400'));assert.ok(!p.body.includes(store.pipeline_reports[0].report.source_url));assert.ok(!p.body.includes('profit_review'));assert.equal(p.automatic_send_allowed,false);
 const changed=reports.upsert(store,{...store.pipeline_reports[0].report,captured_at:'2026-10-07T12:00:00.001Z',costs:{low:2000,high:2000}},{now:'2026-10-07T12:00:00.001Z',operatorId:'fixture-admin'}).store;
 const later=messages.prepare(changed,'buyer1',{kind:'buyer_teaser',deal_ids:['deal']},{now:'2026-10-07T12:00:00.001Z'});assert.notEqual(later.version,p.version);assert.equal(later.body,p.body);assert.equal(later.profit_review[0].profit.net_fee.low,23000);
 assert.deepEqual(messages.prepare(store,'buyer1',{kind:'buyer_buy_box'},{now}).profit_review,[]);
 assert.throws(()=>messages.prepare(store,'buyer1',{kind:'buyer_teaser',deal_ids:['deal'],profit_review:[]},{now}),/request_invalid/);
 assert.equal(empty.profit_review[0].profit.net_fee,null);assert.equal(JSON.stringify(store),before);assert.equal(effects,0);
 console.log('Draft profit: exact canonical card DTO, private owner-only metadata, unchanged recipient body/to/subject, price changes invalidate review version, no funds substitution, injected client metadata rejected and zero network/clock/writes passed.');
}finally{global.fetch=old.fetch;http.get=old.hg;http.request=old.hr;https.get=old.sg;https.request=old.sr;fs.writeFileSync=old.write;Date.now=old.clock;}
module.exports={fixture,preview,now};
