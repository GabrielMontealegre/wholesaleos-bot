'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const finds=require('../modules/buyers/assistant-finds'),deals=require('../modules/deals/reviewed-deals'),view=require('../modules/buyers/deal-fit-view'),ui=require('../dashboard/wos-buyers-found');
const {fixture,now}=require('./reviewed-deals.test');
const buyer={id:'fixture-buyer',name:'Fixture Investor',assistant_find:{approval:'approved',classification:'end_buyer',status:'new',states:['FL'],areas:['Tampa'],buy_box:{types:['house'],pct_arv:'75%',price_max:200000},history:[]}};
function run(){
 let store=deals.ingest({buyers:[buyer],leads:[{id:'source-only'}]},[deals.validate(fixture(),now)],{now,operatorId:'fixture-admin',createId:()=> 'fixture-deal'}).store;
 const pending=view.build(store,{now}).get(buyer.id);assert.equal(pending.count,0);assert.match(pending.near_misses[0].reason,/value is not established/);
 store=deals.update(store,'fixture-deal',{action:'approve',reviewed_comps:true},{now,operatorId:'fixture-admin'});
 const frozen=JSON.stringify(store),oldFetch=global.fetch,oldNow=Date.now,oldWrite=fs.writeFileSync;global.fetch=()=>{throw Error('no network')};Date.now=()=>{throw Error('inject clock')};fs.writeFileSync=()=>{throw Error('no writes')};
 try{
  const model=view.build(store,{now}).get(buyer.id);assert.equal(model.count,1);assert.equal(model.matches.length,1);assert.equal(model.last_contact_at,null);assert.ok(!JSON.stringify(model).includes(fixture().address),'JV address never enters this buyer fit payload');
  const expensive=view.build({...store,reviewed_deals:store.reviewed_deals.map(d=>({...d,asking_price:180000}))},{now}).get(buyer.id);assert.equal(expensive.count,0);assert.equal(expensive.near_misses[0].reason,'$11,750 above the buyer maximum.');
  const outside=view.build({...store,buyers:[{...buyer,assistant_find:{...buyer.assistant_find,areas:['Another city']}}]},{now}).get(buyer.id);assert.equal(outside.count,0);assert.match(outside.near_misses[0].reason,/Area differs/);
  const unapproved=view.build({...store,buyers:[{...buyer,assistant_find:{...buyer.assistant_find,approval:'pending'}}]},{now}).get(buyer.id);assert.equal(unapproved.count,0);
  const ai=view.build({...store,buyers:[{...buyer,name:'AI-generated buyer'}]},{now}).get(buyer.id);assert.equal(ai.count,0);
  const missing=view.build({...store,reviewed_deals:store.reviewed_deals.map(d=>({...d,repair_estimate:null}))},{now}).get(buyer.id);assert.equal(missing.count,0);
  const dead=view.build({...store,reviewed_deals:store.reviewed_deals.map(d=>({...d,status:'dead'}))},{now}).get(buyer.id);assert.equal(dead.count,0);
  const reported=view.build({...store,buyers:[{...buyer,assistant_find:{...buyer.assistant_find,history:[{kind:'outreach',to:'emailed',at:now,operator_id:'fixture-admin'}]}}]},{now}).get(buyer.id);assert.equal(reported.last_contact_at,now);
  const future=view.build({...store,buyers:[{...buyer,assistant_find:{...buyer.assistant_find,history:[{kind:'outreach',to:'emailed',at:'2027-01-01T00:00:00Z',operator_id:'fixture-admin'}]}}]},{now}).get(buyer.id);assert.equal(future.last_contact_at,null);
  assert.equal(JSON.stringify(store),frozen);
  const item={id:buyer.id,name:'<script>bad</script>',email:'PRIVATE CONTACT EMAIL',phone:'PRIVATE PHONE',email_subject:'PRIVATE SUBJECT',record_ref:'BUY-0001',approval:'approved',status:'new',states:['FL'],areas:['Tampa'],buy_box:buyer.assistant_find.buy_box,deal_fit:model,history:[]};
  const html=ui.card(item);assert.ok(html.includes('&lt;script&gt;'));for(const value of [item.email,item.phone,item.email_subject,item.record_ref,'Source search','Approval reason'])assert.ok(!html.includes(value));assert.ok(html.includes('1 deal matches'));assert.ok(ui.detailedCard({...item,holder_contact:{},drafted_message:''}).includes('PRIVATE CONTACT EMAIL'));
  assert.ok(html.includes('data-buyer-card-open="fixture-buyer"'));
  assert.ok(html.includes('tabindex="0"'));
  assert.ok(!html.includes('Last contact report:'),'No invented contact history');
  const empty=ui.card({...item,areas:[],states:[],buy_box:{},status:'',deal_fit:undefined});
  assert.ok(!empty.includes('<p>Unknown</p>'));assert.ok(!empty.includes('Buy box not supplied'));
  assert.ok(empty.includes('Deal matches not measured'));assert.ok(!empty.includes('0 deal matches'));
  assert.ok(ui.card({...item,deal_fit:{...model,count:0}}).includes('0 deals match'),'Known zero remains visible');
  const detail=ui.detailedCard({...item,drafted_message:''});
  assert.ok(detail.indexOf('<h3>')<detail.indexOf('BUY-0001'),'Name precedes reference');
  assert.ok(detail.includes('PRIVATE CONTACT EMAIL'),'Explicit detail view still carries supplied contact information');
 }finally{global.fetch=oldFetch;Date.now=oldNow;fs.writeFileSync=oldWrite;}
 console.log('Clean buyer cards: reviewed-deal counts not source-lead counts,canonical price/value/approval/AI/area/terminal guards,reported-only contact clock,JV privacy,plain compact list and pure projection passed.');
}
if(require.main===module)run();module.exports={run};
