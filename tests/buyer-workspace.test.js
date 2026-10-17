'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const finds = require('../modules/buyers/assistant-finds');
const types = require('../modules/buyers/buyer-type');
const imports = require('../modules/buyers/buyer-find-import');
const messages = require('../modules/email/buyer-messages');
const ui = require('../dashboard/wos-buyers-found');
const { fixture, buyer, now } = require('./reviewed-deals.test');
const deals = require('../modules/deals/reviewed-deals');
const context = { now, operatorId:'operator', createId:()=> 'buyer' };
const input = { name:'Example Investor',platform:'manual',source_url:'https://records.example.test/buy-box',
  what_they_buy:'Houses in Tampa',deal_type:'house',states:['FL'],areas:['Tampa'],email:'buyer@example.test',
  captured_at:now,buyer_type:'Acquisitions company (verify)',classification:'end_buyer',buy_box:{types:['house'],pct_arv:'75%',price_max:200000} };
const valid = finds.validateItems({items:[input]},now);
let store = finds.ingest({buyers:[],leads:[{id:'untouched'}]},valid,context).store;
assert.equal(store.buyers[0].assistant_find.buyer_type,'acquisitions');
assert.equal(store.buyers[0].assistant_find.buyer_type_source.source_kind,'assistant_report');
assert.equal(types.view(store.buyers[0].assistant_find).verify_purchase,true);
assert.equal(types.view({approval:'approved'}).kind,'unknown');
assert.equal(types.normalize('made up investor type'),null);
const contactRepeat = finds.ingest(store,finds.validateItems({items:[{...input,buyer_type:'flipper'}]},now),context).store;
assert.equal(contactRepeat.buyers[0].assistant_find.buyer_type,'acquisitions','contact-only possible duplicates do not replace source facts');
assert.throws(()=>finds.validateItems({items:[{...input,buyer_type:{verified:true}}]},now),/buyer_type_invalid/);
store = finds.update(store,'buyer',{approval:'approved'},context);
store = finds.update(store,'buyer',{buyer_type:'Flipper'},context);
const ref = store.buyers[0].record_ref;
const assistantTyped={...store,buyers:store.buyers.map(row=>({...row,assistant_find:{...row.assistant_find,buyer_type:'institutional',buyer_type_source:{source_kind:'assistant_report',captured_at:now}}}))};
const staleType=finds.ingest(assistantTyped,finds.validateItems({items:[{...input,ref,buyer_type:'builder',captured_at:'2026-10-06T12:00:00Z'}]},now),context).store;
assert.equal(staleType.buyers[0].assistant_find.buyer_type,'institutional','older reported type never replaces newer evidence');
const repeated = finds.ingest(store,finds.validateItems({items:[{...input,ref,buy_box:{price_max:999999},buyer_type:'landlord'}]},now),context).store;
assert.equal(repeated.buyers.length,1);
assert.equal(repeated.buyers[0].assistant_find.buyer_type,'flipper','operator type cannot be replaced by an assistant import');
assert.deepEqual(repeated.buyers[0].assistant_find.buy_box,store.buyers[0].assistant_find.buy_box);
assert.deepEqual(repeated.buyers[0].assistant_find.history,store.buyers[0].assistant_find.history);
assert.equal(repeated.buyers[0].assistant_find.approval,'approved');
assert.equal(repeated.buyer_find_last_import_at,now);
assert.equal(finds.listFinds(repeated,{now}).last_import_at,now);
assert.equal(finds.listFinds({...repeated,buyer_find_last_import_at:'2999-01-01T00:00:00Z'},{now}).last_import_at,null);
assert.throws(()=>finds.ingest({...store,buyers:[store.buyers[0],{...store.buyers[0],id:'duplicate-ref'}]},finds.validateItems({items:[{...input,ref}]},now),context),/ref_conflict/);
assert.equal(imports.validateAgentItems({items:[{...input,kind:'buyer'}]},now)[0].buyer_type,'acquisitions');
assert.equal(imports.validateAgentItems({items:[fixture()]},now)[0].kind,'deal');
assert.throws(()=>imports.validateAgentItems({items:[{...fixture(),approval:'approved'}]},now),/^Error: find_/);

let dealStore = deals.ingest({...store,buyers:[{...buyer,assistant_find:{...buyer.assistant_find,email:input.email,contact_published:{email:input.email}}}]},[deals.validate(fixture(),now)],{...context,createId:()=> 'deal'}).store;
dealStore = deals.update(dealStore,'deal',{action:'approve',reviewed_comps:true},context);
dealStore = deals.update(dealStore,'deal',{action:'availability',evidence_url:fixture().source_url,checks:{still_available:true}},context);
const original = JSON.stringify(dealStore);
const preview = messages.prepare(dealStore,buyer.id,{kind:'buyer_teaser',deal_ids:['deal']},{now});
assert.ok(!JSON.stringify(preview).includes(fixture().address));
assert.ok(!JSON.stringify(preview).includes(fixture().source_url));
assert.ok(preview.body.includes('Verified')&&preview.body.includes('3 reviewed comps'));
assert.equal(preview.preview_only,true);assert.equal(preview.automatic_send_allowed,false);
assert.equal(preview.policy.full_preview_required,true);
for (const body of [{kind:'buyer_teaser',deal_ids:[]},{kind:'buyer_teaser',deal_ids:['deal','deal']},
  {kind:'buyer_teaser',deal_ids:Array.from({length:21},(_,i)=>String(i))},{kind:'buyer_buy_box',deal_ids:['deal']},
  {kind:'buyer_teaser',deal_ids:['deal'],to:'attacker@example.test'},{kind:'buyer_teaser',deal_ids:['deal'],body:'secret'}])
  assert.throws(()=>messages.prepare(dealStore,buyer.id,body,{now}),/^Error: buyer_email_/);
assert.throws(()=>messages.prepare({...dealStore,buyers:[{...dealStore.buyers[0],assistant_find:{...dealStore.buyers[0].assistant_find,approval:'pending'}}]},buyer.id,{kind:'buyer_buy_box'},{now}),/not_approved/);
assert.throws(()=>messages.prepare(dealStore,buyer.id,{kind:'buyer_teaser',deal_ids:['deal']},{now:'2026-11-01T12:00:00Z'}),/not_ready/);
assert.throws(()=>messages.prepare({...dealStore,buyers:[{...dealStore.buyers[0],assistant_find:{...dealStore.buyers[0].assistant_find,email:'x\r\nBcc:y@example.test',contact_published:{}}}]},buyer.id,{kind:'buyer_buy_box'},{now}),/published_email/);
const view = finds.listFinds({...dealStore,buyers:[{...dealStore.buyers[0],assistant_find:{...dealStore.buyers[0].assistant_find,first_seen_at:now}}]},{now}).items[0];
assert.equal(view.deal_fit.count,1);assert.equal(view.deal_fit.matches[0].teaser_ready,true);
assert.ok(ui.card(view).includes(input.email));assert.ok(ui.card({...view,email:''}).includes('Email missing'));
assert.ok(ui.card({...view,buyer_type_view:{kind:'institutional',verify_purchase:true}}).includes('Verify they close'));
const html = ui.detailedCard(view);
assert.ok(html.includes('role="tablist"')&&html.includes('Email this buyer')&&html.includes('Send matching deals'));
assert.ok(html.includes('data-buyer-email-deal="deal"'));
assert.equal(JSON.stringify(dealStore),original);
let sideEffects=0;const oldFetch=global.fetch,oldWrite=fs.writeFileSync,oldClock=Date.now;
try { global.fetch=fs.writeFileSync=Date.now=()=>{sideEffects++;throw new Error('unexpected side effect');};
  messages.prepare(dealStore,buyer.id,{kind:'buyer_teaser',deal_ids:['deal']},{now});types.view({buyer_type:'flipper'});
} finally { global.fetch=oldFetch;fs.writeFileSync=oldWrite;Date.now=oldClock; }
assert.equal(sideEffects,0);

async function routes() {
  const registered=new Map();const app={get:(path,...handlers)=>registered.set('GET '+path,handlers),post:(path,...handlers)=>registered.set('POST '+path,handlers)};
  let current=structuredClone(dealStore),writes=0,sends=0,clock=now,throwSend=false;
  const requireAdmin=(req,res,next)=>req.currentUser?next():res.status(401).json({code:'unauthorized'});
  const sender={configured:()=>true,send:async message=>{sends++;assert.equal(current.buyer_email_drafts.at(-1).status,'sending');if(throwSend)throw new Error('SECRET SMTP DETAIL');return {accepted:[message.to],rejected:[]};}};
  messages.registerRoutes(app,{db:{readDBStrict:()=>current,writeDB:value=>{current=value;writes++;}},requireAdmin,now:()=>clock,sender});
  async function request(action,body,user='operator',method='POST') {
    const handlers=registered.get(method+' /api/dashboard/buyers-found/:id/email'+(action?'/'+action:''));
    const response={statusCode:200,status(code){this.statusCode=code;return this;},set(){return this;},json(value){this.body=value;return this;}};
    const req={params:{id:buyer.id},body,currentUser:user?{id:user}:null};let allowed=false;handlers[0](req,response,()=>{allowed=true;});if(allowed)await handlers.at(-1)(req,response);return response;
  }
  assert.equal((await request('preview',{kind:'buyer_buy_box'},'')).statusCode,401);
  assert.equal((await request('',null,'operator','GET')).statusCode,200);assert.equal(writes,0);assert.equal(sends,0);
  let result=await request('preview',{kind:'buyer_teaser',deal_ids:['deal']});const p=result.body;assert.equal(writes,0);
  assert.equal((await request('draft',{kind:p.kind,deal_ids:p.deal_ids,version:'forged'})).statusCode,409);
  result=await request('draft',{kind:p.kind,deal_ids:p.deal_ids,version:p.version});const id=result.body.id;
  assert.equal((await request('send',{draft_id:id,reviewed:false})).statusCode,400);
  assert.equal((await request('send',{draft_id:id,reviewed:true},'other')).statusCode,404);
  clock='2026-10-07T12:06:00Z';assert.equal((await request('send',{draft_id:id,reviewed:true})).statusCode,409);assert.equal(sends,0);clock=now;
  const before=current;current={...current,reviewed_deals:current.reviewed_deals.map(d=>({...d,asking_price:100000}))};
  assert.equal((await request('send',{draft_id:id,reviewed:true})).statusCode,409);assert.equal(sends,0);current=before;
  result=await request('send',{draft_id:id,reviewed:true});assert.equal(result.body.status,'accepted');assert.equal(sends,1);
  assert.equal(current.email_delivery_receipts.length,1);assert.equal(current.email_draft_approvals.length,1);
  assert.equal(current.activities.filter(a=>a.type==='email_sent'&&a.buyer_id===buyer.id).length,2,'one buyer activity plus one deal activity, not two emails');
  assert.equal((await request('send',{draft_id:id,reviewed:true})).body.already_sent,true);assert.equal(sends,1);
  assert.deepEqual(current.leads,dealStore.leads);assert.deepEqual(current.reviewed_deals,dealStore.reviewed_deals);
  result=await request('preview',{kind:'buyer_buy_box'});const q=result.body;
  result=await request('draft',{kind:q.kind,deal_ids:q.deal_ids,version:q.version});const uncertain=result.body.id;
  throwSend=true;result=await request('send',{draft_id:uncertain,reviewed:true});assert.equal(result.statusCode,502);
  assert.ok(!JSON.stringify(result).includes('SECRET'));assert.equal(current.buyer_email_drafts.at(-1).status,'unknown');
  assert.equal((await request('send',{draft_id:uncertain,reviewed:true})).statusCode,409);assert.equal(sends,2);
  assert.equal(current.email_delivery_receipts.length,1,'failed/uncertain sends never become receipts');
  assert.equal(require('../modules/email/template-approvals').policy(current,'buyer_teaser',now).approved_send_count,1);
  assert.equal(require('../modules/email/template-approvals').policy(current,'buyer_buy_box',now).approved_send_count,0);
  let connections=0,closed=0;
  const smtp=messages.createSender({env:{GMAIL_USER:'operator@example.test',GMAIL_APP_PASSWORD:'LOCAL TEST PASSWORD'},mailer:{createTransport(options){
    connections++;assert.equal(options.host,'smtp.gmail.com');assert.equal(options.secure,true);assert.equal(options.tls.rejectUnauthorized,true);
    assert.equal(options.logger,false);assert.equal(options.debug,false);
    return {close(){closed++;},async sendMail(input){assert.equal(input.disableFileAccess,true);assert.equal(input.disableUrlAccess,true);assert.equal(input.from,'operator@example.test');return {accepted:[input.to]};}};
  }}});
  assert.equal(smtp.configured(),true);assert.equal(connections,0,'status checks never connect to SMTP');
  await smtp.send({to:'buyer@example.test',subject:'Synthetic',body:'Local test only',message_id:'<example@wholesaleos.local>'});
  assert.equal(connections,1);assert.equal(closed,1);
  const off=messages.createSender({env:{},mailer:{createTransport(){throw new Error('must not connect');}}});
  assert.equal(off.configured(),false);await assert.rejects(()=>off.send({}),/not_configured/);
  console.log('Buyer workspace: types/provenance, safe repeat imports, real match/teaser gates, reviewed preview/draft/send, stale/forged/duplicate/unknown failures and no implicit send passed.');
}
routes().catch(error=>{console.error(error);process.exitCode=1;});
