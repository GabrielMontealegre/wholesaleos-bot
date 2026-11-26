'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),https=require('node:https');
const ui=require('../dashboard/wos-approvals'),workspace=require('../modules/records/approval-workspace'),{fixture,now}=require('./approval-workspace.test');
const store=fixture(),before=JSON.stringify(store),view=workspace.build(store,{now}),row=view.deals[0];
const original={fetch:global.fetch,Date:global.Date,write:fs.writeFileSync,get:http.get,request:http.request,sg:https.get,sr:https.request};let effects=0;const deny=()=>{effects++;throw Error('side effect forbidden');};
try{
 global.fetch=fs.writeFileSync=http.get=http.request=https.get=https.request=deny;global.Date=class extends original.Date{constructor(...args){if(!args.length)deny();super(...args);}static now(){return deny();}};
 const empty={...row,repair_estimate:null,claimed_arv:999999,evaluation:{asking:null,value:{tier:'Not established',range:null},matches:[]}};
 assert.deepEqual(ui.missingDealValues(empty),['asking price','reviewed value evidence','repair estimate','buyer price rule','value, buyer rule or split for estimated room']);
 const html=ui.markup({...view,deals:[empty]},{group:'deals'});assert(html.includes('Missing here: reviewed value evidence'));assert(html.includes('Missing here: repair estimate'));assert(html.includes('data-approval-missing'));assert(html.includes('data-approval-version="'+row.version+'"'));assert(!html.includes('999,999'));assert(!html.includes(row.address));
 const zero={...empty,repair_estimate:0,evaluation:{asking:0,value:{tier:'Preliminary',range:{low:200000,high:220000}},matches:[{max_price:0,estimated_spread:{low:0,high:0}}]}};assert.deepEqual(ui.missingDealValues(zero),[]);const known=ui.markup({...view,deals:[zero]},{group:'deals'});assert(!known.includes('data-approval-missing'));assert(known.includes('Estimated share $0'));assert(known.includes('Preliminary'));assert(!known.includes('Confirmed profit'));
 for(const tier of ['unknown','ai_generated'])assert(ui.missingDealValues({...zero,evaluation:{...zero.evaluation,value:{...zero.evaluation.value,tier}}}).includes('reviewed value evidence'));
 const evil=ui.markup({...view,deals:[{...empty,version:'"><img src=x onerror=bad()>',source_url:'javascript:bad()'}]},{group:'deals'});assert(!evil.includes('<img'));assert(!evil.includes('href="javascript:'));assert(evil.includes('&lt;img'));assert.equal(effects,0);assert.equal(JSON.stringify(store),before);
 console.log('Approval missing values: exact read-only gap list, zero/Preliminary/share preservation, no claimed-value fallback, unsigned privacy, escaping, version-bound navigation markup and purity PASS');
}finally{global.fetch=original.fetch;global.Date=original.Date;fs.writeFileSync=original.write;http.get=original.get;http.request=original.request;https.get=original.sg;https.request=original.sr;}
