'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),https=require('node:https');
const profiles=require('../modules/records/operator-profile'),templates=require('../modules/email/template-approvals');
const deals=require('../modules/deals/reviewed-deals'),messages=require('../modules/email/buyer-messages');
const now='2026-10-07T12:00:00.000Z',context={now,operatorId:'synthetic-admin'};
const profile={legal_name:'SYNTHETIC OPERATOR, an individual',llc:'',email:'operator@example.test',phone:'+1 555 010 1234',mailing_address:'SYNTHETIC TEST ADDRESS',typed_signature:'SYNTHETIC DRAFT SIGNATURE',signature_image:''};
const seed={leads:[{id:'unchanged'}],buyers:[],reviewed_deals:[],conversations:[]};
const input=store=>({profile,reviewed:true,version:profiles.read(store,context.operatorId,{now}).version});
const raw=JSON.stringify(seed),saved=profiles.save(seed,input(seed),context),store=saved.store;
assert.equal(JSON.stringify(seed),raw);assert.equal(saved.saved,true);assert.equal(store.operator_profile_history.length,1);
for(const key of Object.keys(seed))assert.equal(store[key],seed[key]);
assert.equal(profiles.read(store,context.operatorId,{now}).profile.legal_name,profile.legal_name);
assert.equal(profiles.read(store,'different-admin',{now}).profile,null);
assert.equal(profiles.save(store,input(store),context).store,store,'identical review appends nothing');
assert.throws(()=>profiles.save(store,input(seed),context),/changed/);
for(const patch of [{reviewed:false},{operator_id:'forged'},{profile:{...profile,bank_account:'forbidden'}},{profile:{...profile,legal_name:''}},{profile:{...profile,email:'x\r\nBcc:y@example.test'}},{profile:{...profile,typed_signature:'<img src=x>'}}])assert.throws(()=>profiles.save(seed,{...input(seed),...patch},context),/^Error: operator_profile_/);
for(const image of ['https://example.test/sign.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,'+Buffer.alloc(20).toString('base64'),'data:image/png;base64,'+Buffer.alloc(65537).toString('base64')])assert.throws(()=>profiles.validate({...profile,signature_image:image}),/signature_image_invalid/);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8s8AAAAASUVORK5CYII=','base64');
assert.throws(()=>profiles.validate({...profile,phone:'+++++++'}),/contact_invalid/);
assert.ok(profiles.validate({...profile,signature_image:'data:image/png;base64,'+png.toString('base64')}).signature_image);
for(const patch of [{reviewed:false},{source_kind:'ai_generated'},{recorded_at:'2026-10-08T00:00:00Z'},{digest:'forged'},{profile:{...profile,legal_name:'forged'}}])assert.throws(()=>profiles.read({...store,operator_profile_history:[{...store.operator_profile_history[0],...patch}]},context.operatorId,{now}),/store_invalid/);
assert.throws(()=>profiles.read(store,context.operatorId,{now:'2026-02-30T00:00:00Z'}),/clock_invalid/);
assert.ok(profiles.read(store,context.operatorId,{now:'2026-10-07T12:00:00Z'}).profile,'equivalent ISO precision is not future');
assert.throws(()=>profiles.save({...store,operator_profile_history:{}},input(seed),context),/store_invalid/);
const edited=profiles.save(store,{...input(store),profile:{...profile,llc:'SYNTHETIC OPTIONAL LLC'}},context).store;
assert.equal(edited.operator_profile_history.length,2);assert.equal(edited.operator_profile_history[0].profile.llc,'');
assert.equal(profiles.read(JSON.parse(JSON.stringify(edited)),context.operatorId,{now}).profile.llc,'SYNTHETIC OPTIONAL LLC');
const draft=profiles.draft(store,context.operatorId,{now});assert.equal(draft.signature_is_evidence,false);
assert.equal(profiles.fill('{{operator_legal_name}} / {{operator_llc}} / {{operator_unknown}}',draft),profile.legal_name+' / [Not supplied] / {{operator_unknown}}');
const legacy=fs.readFileSync(require.resolve('../modules/contracts'),'utf8');assert.ok(!legacy.includes('operator-profile'),'legacy AI-fill cannot consume the new profile');
const {fixture,buyer}=require('./reviewed-deals.test');
const d=deals.validate(fixture(),now),evaluation=deals.evaluate(d,[buyer],now),jv=deals.jvDraft(d,evaluation,draft);
assert.ok(jv.includes(profile.legal_name)&&jv.includes('NOT a signed agreement')&&jv.includes('buyer-funded at assignment'));
assert.ok(jv.includes('Deposit amount: __________________'));assert.equal(deals.evaluate(d,[buyer],now).introduction_allowed,false);assert.notEqual(evaluation.ready_to_offer,'YES');
const buyerStore={...store,buyers:[{...buyer,assistant_find:{...buyer.assistant_find,email:'buyer@example.test'}}]};
const before=messages.prepare(buyerStore,buyer.id,{kind:'buyer_buy_box'},{now,operatorId:context.operatorId});
assert.ok(before.body.endsWith(draft.signature_block));assert.equal(before.automatic_send_allowed,false);
const other=messages.prepare(buyerStore,buyer.id,{kind:'buyer_buy_box'},{now,operatorId:'different-admin'});assert.ok(!other.body.includes(profile.legal_name));
assert.equal(other.version,messages.prepare(buyerStore,buyer.id,{kind:'buyer_buy_box'},{now}).version,'no-profile compatibility');
const changed=messages.prepare({...edited,buyers:buyerStore.buyers},buyer.id,{kind:'buyer_buy_box'},{now,operatorId:context.operatorId});assert.notEqual(changed.version,before.version,'profile edit requires a new email review');
let effects=0;const blocked=()=>{effects++;throw Error('unexpected side effect');};
const originals={fetch:global.fetch,write:fs.writeFileSync,clock:Date.now,httpGet:http.get,httpRequest:http.request,httpsGet:https.get,httpsRequest:https.request};
try{global.fetch=fs.writeFileSync=Date.now=http.get=http.request=https.get=https.request=blocked;profiles.read(store,context.operatorId,{now});profiles.save(store,input(store),context);profiles.draft(store,context.operatorId,{now});profiles.fill('{{operator_signature}}',draft);messages.prepare(buyerStore,buyer.id,{kind:'buyer_buy_box'},{now,operatorId:context.operatorId});}
finally{global.fetch=originals.fetch;fs.writeFileSync=originals.write;Date.now=originals.clock;http.get=originals.httpGet;http.request=originals.httpRequest;https.get=originals.httpsGet;https.request=originals.httpsRequest;}
assert.equal(effects,0);

async function routeProof(){
 const routes=new Map(),app={get:(p,...h)=>routes.set('GET '+p,h),post:(p,...h)=>routes.set('POST '+p,h),patch:()=>{},use:()=>{}};
 let current=seed,writes=0,sends=0;
 const db={readDBStrict:()=>current,writeDB:s=>{current=s;writes++;}},requireAdmin=(req,res,next)=>req.currentUser?next():res.status(401).json({code:'unauthorized'});
 profiles.registerRoutes(app,{db,requireAdmin,now:()=>now});templates.registerRoutes(app,{db,requireAdmin,now:()=>now});
 messages.registerRoutes(app,{db,requireAdmin,now:()=>now,sender:{configured:()=>true,send:()=>{sends++;throw Error('must not send');}}});
 require('../modules/deals/reviewed-deal-routes').registerReviewedDealRoutes(app,{db,requireAdmin,now:()=>now});
 async function request(path,method='GET',body,actor=context.operatorId,params={}){let result={status:200};const res={set:(k,v)=>{result[k]=v;return res;},status:s=>{result.status=s;return res;},json:v=>{result.body=v;return res;}};const h=routes.get(method+' '+path);const req={body,currentUser:actor?{id:actor}:null,params};let next=false;h[0](req,res,()=>next=true);if(next)await h[1](req,res);return result;}
 assert.equal((await request('/api/dashboard/operator-profile','GET',null,'')).status,401);
 assert.equal((await request('/api/dashboard/operator-profile')).body.profile,null);assert.equal(writes,0);
 let response=await request('/api/dashboard/operator-profile','POST',input(seed));assert.equal(response.status,200);assert.equal(response['Cache-Control'],'no-store');assert.equal(writes,1);
 assert.equal((await request('/api/dashboard/operator-profile','GET',null,'other')).body.profile,null);
 for(const body of [{...input(current),reviewed:false},{...input(current),operator_id:'other'},input(seed)]){const count=writes;assert.ok((await request('/api/dashboard/operator-profile','POST',body)).status>=400);assert.equal(writes,count);}
 const t=templates.list(current,{now}).items[0];current=templates.save(current,{kind:t.kind,subject:'Hello {{operator_legal_name}}',body:'{{operator_signature}}',version:t.version,reviewed:true},context).store;
 const originalTemplate=JSON.stringify(current.email_template_history),count=writes;
 response=await request('/api/dashboard/email-templates');assert.equal(response.status,200);assert.ok(response.body.items[0].profile_preview.body.includes(profile.typed_signature));assert.equal(response.body.items[0].profile_preview.signature_is_evidence,false);
 const otherTemplates=await request('/api/dashboard/email-templates','GET',null,'other');assert.ok(!otherTemplates.body.items[0].profile_preview.body.includes(profile.typed_signature));
 assert.equal(JSON.stringify(current.email_template_history),originalTemplate);assert.equal(writes,count);
 current={...current,buyers:buyerStore.buyers};
 response=await request('/api/dashboard/buyers-found/:id/email/preview','POST',{kind:'buyer_buy_box'},context.operatorId,{id:buyer.id});
 const preview=response.body;assert.equal(response.status,200);
 response=await request('/api/dashboard/buyers-found/:id/email/draft','POST',{kind:'buyer_buy_box',version:preview.version},context.operatorId,{id:buyer.id});assert.equal(response.status,200);const id=response.body.id;
 current=profiles.save(current,{...input(current),profile:{...profile,llc:'Changed after draft'}},context).store;
 const beforeSend=writes;
 response=await request('/api/dashboard/buyers-found/:id/email/send','POST',{draft_id:id,reviewed:true},context.operatorId,{id:buyer.id});
 assert.equal(response.status,409);assert.equal(response.body.code,'buyer_email_changed');assert.equal(sends,0);assert.equal(writes,beforeSend);
 current={...current,reviewed_deals:[{...d,id:'synthetic-jv'}],operator_profile_history:current.operator_profile_history.map(row=>({...row,digest:'corrupt'}))};
 response=await request('/api/dashboard/todays-deals/:id/jv-draft','POST',{},context.operatorId,{id:'synthetic-jv'});
 assert.equal(response.status,503);assert.equal(writes,beforeSend,'invalid profile cannot append a JV activity before failing');
 console.log('Profile routes: admin/actor isolation, no-store, review/conflict/no-write guards, template preview leaves originals unchanged, stale email cannot send passed.');
}
routeProof().then(()=>console.log('Profile: append-only provenance, no bank fields, image guards, corrupt/future/stale/forged checks, draft-only signature, no deposit calculation, unchanged gates and zero network/clock/write purity passed.')).catch(e=>{console.error(e);process.exitCode=1;});
