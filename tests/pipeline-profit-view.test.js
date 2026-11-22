'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),https=require('node:https');
const workspace=require('../modules/records/pipeline-workspace'),profit=require('../dashboard/wos-match-profit');
const pipeline=require('../dashboard/wos-pipeline-workspace'),review=require('../dashboard/wos-pipeline-report-review');
const {priced,now}=require('./match-profit.test');
const store=priced(),before=JSON.stringify(store),item=workspace.build(store,{now}).items.find(r=>r.kind==='pipeline_report');
assert.deepEqual(profit.present(profit.fromReport(item)).profit,{low:8500,high:12000});
for(const html of [pipeline.markup({...workspace.build(store,{now}),items:[item]}),review.markup(item)]){
 assert.equal((html.match(/data-profit-headline/g)||[]).length,1);assert(html.includes('Estimated profit: $8,500 - $12,000'));
 assert(html.includes('Net fee before split'));assert(!html.includes('Potential net fee'));assert(!html.includes('Our reported share'));
}
const missing={...item,money:{...item.money,contract_price:null,net_fee:null,our_net:null,missing:['contract_price']}};
assert(profit.markup(profit.fromReport(missing)).includes('Missing: contract price.'));
assert(profit.markup(profit.fromReport(missing)).includes('data-profit-source-action'));
assert(profit.markup(profit.fromReport(missing)).includes('href="'+item.provenance.source_url+'"'));
for(const patch of [{reported:'true'},{verified:true},{verified:'false'},{address_withheld:true},{address_withheld:undefined},{source_kind:'public_record'},{kind:'approval'},{review_status:'approved'},{report_id:null},{id:null},{report_review:{state:'flagged'}},{report_review:{conflict:true}},
 {provenance:{...item.provenance,source_url:'javascript:bad'}},{provenance:{...item.provenance,source_kind:'derived_workflow'}},{provenance:{...item.provenance,captured_at:'2026-02-30T12:00:00Z'}}]){
 assert.equal(profit.fromReport({...item,...patch}),null);assert(!profit.markup(profit.fromReport({...item,...patch})).includes('data-profit-source-action'));
}
const saved={fetch:global.fetch,now:Date.now,write:fs.writeFileSync,get:http.get,request:http.request,sg:https.get,sr:https.request};let effects=0;const deny=()=>{effects++;throw Error('network/clock/write forbidden');};
try{global.fetch=Date.now=fs.writeFileSync=http.get=http.request=https.get=https.request=deny;assert.deepEqual(profit.present(profit.fromReport(item)).profit,{low:8500,high:12000});assert.equal(effects,0);}finally{global.fetch=saved.fetch;Date.now=saved.now;fs.writeFileSync=saved.write;http.get=saved.get;http.request=saved.request;https.get=saved.sg;https.request=saved.sr;}
assert.equal(JSON.stringify(store),before);
console.log('pipeline-profit-view: identical sourced profit, one headline, missing-source action, exact flags/origin/date/withheld/flagged/conflict guards, immutable and pure PASS');
