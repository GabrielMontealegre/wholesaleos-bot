'use strict';
const assert=require('node:assert/strict');
const {present,markup}=require('../dashboard/wos-match-profit');
const {priced,value}=require('./match-profit.test');
const p=value(priced()),before=JSON.stringify(p);
assert.deepEqual(present(p).profit,{low:8500,high:12000});
assert.equal((markup(p).match(/data-profit-headline/g)||[]).length,1);
assert(!markup(p).includes('Our share:')); assert(!markup(p).includes('Not established'));
for(const field of ['buyer_price','contract_price','costs']){
  const v=present({...p,[field]:null,our_net:{low:999999,high:999999}});
  assert.equal(v.profit,null);assert(v.missing.includes(field));
}
for(const patch of [{reported_only:'true'},{buyer_confirmed:true},{buyer_confirmed:'false'},
  {source_kind:'public_record'},{report_id:null},{our_share:'0.5'},{our_share:0},{missing:['costs']},
  {net_fee:null},{our_net:{low:12000,high:8500}},{our_net:{low:NaN,high:12000}},
  {field_provenance:{...p.field_provenance,costs:{...p.field_provenance.costs,source_url:'javascript:bad'}}}])assert.equal(present({...p,...patch}).profit,null);
assert.equal(present(value(priced({our_share:null}))).profit,null);
assert.deepEqual(present(value(priced({buyer_price:{low:130000,high:135000}}))).profit,{low:-6500,high:-3000});
assert.equal(present({...p,estimated_spread:{low:4313,high:4313},our_net:null}).profit,null,'criteria room never fills missing reported profit');
assert(markup(null).includes('Missing: contract price.'));
assert.equal(JSON.stringify(p),before);
const fs=require('node:fs'),http=require('node:http'),https=require('node:https');
const saved={fetch:global.fetch,now:Date.now,write:fs.writeFileSync,get:http.get,request:http.request,secureGet:https.get,secureRequest:https.request};
let effects=0;const denied=()=>{effects++;throw Error('profit presentation must stay pure');};
try{
 global.fetch=Date.now=fs.writeFileSync=http.get=http.request=https.get=https.request=denied;
 assert.deepEqual(present(p).profit,{low:8500,high:12000});
 for(const captured_at of ['2026-02-30T12:00:00Z','11/12/2026',null])assert.equal(present({...p,field_provenance:{...p.field_provenance,buyer_price:{...p.field_provenance.buyer_price,captured_at}}}).profit,null);
 assert.equal(effects,0);
}finally{global.fetch=saved.fetch;Date.now=saved.now;fs.writeFileSync=saved.write;http.get=saved.get;http.request=saved.request;https.get=saved.secureGet;https.request=saved.secureRequest;}
console.log('profit-view: one estimated headline from existing reported net/share, exact flags/provenance/missing/loss/forged range guards, no criteria-room fallback or confirmation and immutable inputs PASS');
