'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),https=require('node:https');
const desk=require('../dashboard/wos-jv-desk');
const deals=require('../modules/deals/reviewed-deals');
const {seed,context}=require('./jv-workflow.test');
const store=seed(),before=JSON.stringify(store),known=deals.list(store,{now:context.now,jv:true}).items[0];
const missing={...known,id:'missing"<tag>',evaluation:{...known.evaluation,asking:null,value:{...known.evaluation.value,range:null,tier:'Not established'},matches:[]}};
const zero={...known,evaluation:{...known.evaluation,asking:0,value:{...known.evaluation.value,range:{low:0,high:0}},matches:[{...known.evaluation.matches[0],max_price:0}]}};
let calls=0;const original=[global.fetch,fs.writeFileSync,http.request,http.get,https.request,https.get,global.Date];
try{
 const forbidden=()=>{calls++;throw Error('side effect');};global.fetch=fs.writeFileSync=http.request=http.get=https.request=https.get=forbidden;
 const RealDate=global.Date;global.Date=class extends RealDate{constructor(...args){if(!args.length)forbidden();super(...args);}static now(){return forbidden();}};
 const html=desk.render(missing);
 for(const text of ['Missing here: asking price','Missing here: reviewed value evidence','Missing here: current buyer criteria ceiling','Review recorded deal inputs'])assert(html.includes(text));
 assert(!html.includes('Not established'));assert(html.includes('missing&quot;&lt;tag&gt;'));assert(!html.includes('<tag>'));
 assert(!desk.render(zero).includes('data-jv-money-review'));assert(desk.render(zero).includes('$0'));
 assert(!desk.render(known).includes('data-jv-money-review'));
 assert(!desk.render({...missing,deal_kind:'own_lead'}));
 assert(!desk.render({...missing,jv_workflow:null}));
 assert(desk.missingInputs({...zero,evaluation:{...zero.evaluation,asking:NaN}}));
 assert(desk.missingInputs({...zero,evaluation:{...zero.evaluation,value:{...zero.evaluation.value,range:{low:0,high:Infinity}}}}));
 assert(desk.render(missing).includes('Introduction locked'));assert(desk.render(missing).includes('Sending remains locked'));
}finally{[global.fetch,fs.writeFileSync,http.request,http.get,https.request,https.get,global.Date]=original;}
assert.equal(calls,0);assert.equal(JSON.stringify(store),before);
console.log('JV missing inputs: explicit gaps, known/zero/malformed, escaping, unsigned/privacy/readiness and pure no-effects checks passed');
