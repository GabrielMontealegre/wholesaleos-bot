'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),https=require('node:https');
const {build:fixture,now}=require('./pipeline-buyer-context.test');
const profits=require('../modules/deals/match-profit'),reports=require('../modules/records/pipeline-reports'),reviews=require('../modules/records/pipeline-report-review');
const deals=require('../modules/deals/reviewed-deals'),fits=require('../modules/buyers/deal-fit-view'),{markup}=require('../dashboard/wos-match-profit');
function priced(extra={}){
 const store=fixture(),r=store.pipeline_reports[0].report;
 return reports.upsert({...store,pipeline_reports:[]},{...r,path:'assignment',our_share:0.5,buyer_price:{low:160000,high:165000},contract_price:{low:140000,high:141000},costs:{low:1000,high:2000},...extra},{now,operatorId:'fixture-admin'}).store;
}
function value(store,policies={}){const deal=store.reviewed_deals[0],evaluation=deals.evaluate(deal,store.buyers,now);return profits.build(store,{now,policies}).forMatch(deal,evaluation.matches[0],evaluation);}
const original={fetch:global.fetch,hg:http.get,hr:http.request,sg:https.get,sr:https.request,write:fs.writeFileSync,now:Date.now};let effects=0;const denied=()=>{effects++;throw Error('network/clock/write forbidden');};
try{
 global.fetch=http.get=http.request=https.get=https.request=fs.writeFileSync=Date.now=denied;
 const store=priced(),before=JSON.stringify(store),p=value(store);
 assert.deepEqual(p.net_fee,{low:17000,high:24000});assert.deepEqual(p.our_net,{low:8500,high:12000});assert.equal(p.buyer_max,168250);assert.equal(p.buyer_confirmed,false);assert.equal(p.proof_of_funds,'Not established');assert.equal(p.reported_only,true);assert.equal(p.field_provenance.contract_price.source_url,store.pipeline_reports[0].report.source_url);
 const dto=deals.list(store,{now}).items[0].evaluation.matches[0].profit,fit=fits.build(store,{now}).get('buyer1').matches[0].profit;assert.deepEqual(dto,p);assert.deepEqual(fit,p);assert.equal(deals.evaluate(store.reviewed_deals[0],store.buyers,now).matches[0].profit,undefined,'core matching stays unchanged');
 for(const key of ['buyer_price','contract_price','costs']){const missing=value(priced({[key]:null}));assert.equal(missing.net_fee,null);assert.ok(missing.missing.includes(key));}
 assert.deepEqual(value(priced({buyer_price:{low:130000,high:135000}})).net_fee,{low:-13000,high:-6000});assert.equal(value(priced({our_share:null})).our_net,null);
 const estimated=value(priced({costs:null}),{FL:{assignment:{label:'Fixture admin estimate',range:{low:500,high:900}}}});assert.equal(estimated.costs_basis,'configured_estimate');assert.equal(estimated.estimate_label,'Fixture admin estimate');
 const conflict=reports.upsert(store,{...store.pipeline_reports[0].report,report_id:'other-current',buyer_price:{low:170000,high:170000}},{now,operatorId:'fixture-admin'}).store;assert.equal(value(conflict).net_fee,null);assert.match(value(conflict).reason,/reconciliation/);
 for(const bad of [s=>({...s,pipeline_reports:[]}),s=>({...s,pipeline_reports:{bad:true}}),s=>({...s,pipeline_reports:s.pipeline_reports.map(r=>({...r,source_kind:'public_record'}))}),s=>({...s,pipeline_reports:s.pipeline_reports.map(r=>({...r,report:{...r.report,captured_at:'2027-01-01T00:00:00Z'}}))}),s=>({...s,buyers:s.buyers.map(b=>({...b,record_ref:'BUY-0002'}))}),s=>({...s,reviewed_deals:s.reviewed_deals.map(d=>({...d,status:'closed'}))}),s=>({...s,reviewed_deals:s.reviewed_deals.map(d=>({...d,approval:'pending'}))}),s=>({...s,reviewed_deals:s.reviewed_deals.map(d=>({...d,deal_kind:'jv'}))})])assert.equal(value(bad(store)).net_fee,null);
 assert.equal(value(priced({waiting_on:'closed',reason_code:'no_funds',next_date:''})).net_fee,null);
 for(const key of ['buyers','reviewed_deals']){const future={...store,[key]:store[key].map(row=>({...row,captured_at:'2027-01-01T00:00:00Z',...(row.assistant_find?{assistant_find:{...row.assistant_find,captured_at:'2027-01-01T00:00:00Z'}}:{})}))};assert.equal(value(future).net_fee,null);}
 const item=reports.project(store,{now}).items[0],review=reviews.project(store,{now}).reviews.get(item.id);
 const flagged=reviews.decide(store,{revision_id:item.id,version:review.version,decision:'flagged',note:'Fixture correction needed.'},{now,operatorId:'fixture-admin'});assert.equal(value(flagged).net_fee,null);
 const reviewed=reviews.decide(store,{revision_id:item.id,version:review.version,decision:'reviewed',reviewed_source:true},{now,operatorId:'fixture-admin'});assert.equal(value(reviewed).buyer_confirmed,false);assert.deepEqual(value(reviewed).net_fee,p.net_fee);
 const html=markup(p);assert.ok(html.includes('Potential net fee: $17,000 - $24,000'));assert.ok(html.includes('Our share: $8,500 - $12,000'));assert.ok(html.includes('no confirmed buyer'));assert.ok(html.includes('Reported source'));assert.ok(!markup({...p,reason:'<img src=x>',field_provenance:{costs:{source_url:'javascript:alert(1)'}}}).includes('<img'));assert.ok(!markup({...p,field_provenance:{costs:{source_url:'javascript:alert(1)'}}}).includes('href="javascript:'));
 assert.equal(JSON.stringify(store),before);assert.equal(effects,0);
 console.log('Match profit: same pure calculator on deal/buyer DTOs, exact source prices not ceilings/asking, missing/cost/loss/split, conflicting/forged/future/closed/pending/hidden/flagged refusal, unknown funds, escaped source markup and zero network/clock/writes passed.');
}finally{global.fetch=original.fetch;http.get=original.hg;http.request=original.hr;https.get=original.sg;https.request=original.sr;fs.writeFileSync=original.write;Date.now=original.now;}
module.exports={priced,value,now};
