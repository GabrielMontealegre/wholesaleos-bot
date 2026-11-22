'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),https=require('node:https'),express=require('express');
const reports=require('../modules/records/pipeline-reports'),workspace=require('../modules/records/pipeline-workspace'),imports=require('../modules/buyers/buyer-find-import');
const editor=require('../dashboard/wos-pipeline-report-review'),{registerAssistantFindRoutes}=require('../modules/buyers/assistant-find-routes');
const {priced,now}=require('./match-profit.test'),at=new Date(Date.parse(now)+60000).toISOString(),capture=new Date(Date.parse(now)+3000).toISOString();
function values(){return {buyer_price_low:'160000',buyer_price_high:'165000',contract_price_low:'140000',contract_price_high:'141000',costs_low:'1000',costs_high:'2000',our_share:'50',source_url:priced().pipeline_reports[0].report.source_url,evidence_text:'Synthetic revised source confirms prices and unchanged workflow.',captured_at:capture.slice(0,19)};}
const store=priced(),item=workspace.build(store,{now:at}).items.find(r=>r.kind==='pipeline_report'),before=JSON.stringify(store);
const original={fetch:global.fetch,Date:global.Date,write:fs.writeFileSync,get:http.get,request:http.request,sg:https.get,sr:https.request};let effects=0;const deny=()=>{effects++;throw Error('network/clock/write forbidden');};
try{
 global.fetch=fs.writeFileSync=http.get=http.request=https.get=https.request=deny;global.Date=class extends original.Date{constructor(...args){if(!args.length)deny();super(...args);}static now(){return deny();}};
 const body=editor.priceDraft(item,values());assert.equal(body.expected_pipeline_revision,item.id);assert.equal(body.items[0].our_share,.5);assert.equal(body.items[0].captured_at,capture);
 const plan=imports.prepareImport(store,body,{now:at}),result=imports.commitImport(store,plan,{now:at,operatorId:'fixture-admin',createId:()=> 'fixture'}).store;
 assert.equal(plan.summary.counts.new_items,1);assert.equal(result.pipeline_reports.length,2);assert.equal(result.pipeline_reports[0].id,item.id);assert.equal(result.pipeline_reports[1].review_status,'pending');assert.deepEqual(result.leads,store.leads);assert.deepEqual(result.buyers,store.buyers);assert.deepEqual(result.reviewed_deals,store.reviewed_deals);
 const newer=reports.upsert(store,{...body.items[0],captured_at:new Date(Date.parse(now)+2000).toISOString()},{now:at,operatorId:'fixture-other'}).store;
 assert.throws(()=>imports.commitImport(newer,plan,{now:at,operatorId:'fixture-admin'}),/find_pipeline_changed/,'Stale commit blocked even when proposed capture is newer');
 assert.throws(()=>imports.prepareImport(newer,body,{now:at}),/find_pipeline_changed/,'Stale form blocked before preview');
 for(const patch of [{source_url:'https://records.example.test/other'},{waiting_on:'closed',reason_code:'price',next_date:''},{next_step:'Changed workflow'}])assert.throws(()=>imports.prepareImport(store,{...body,items:[{...body.items[0],...patch}]},{now:at}),/find_pipeline_context_changed/);
 const unapproved={...store,reviewed_deals:store.reviewed_deals.map(row=>({...row,approval:'pending'}))};assert.throws(()=>imports.prepareImport(unapproved,body,{now:at}),/find_pipeline_changed/);assert.throws(()=>imports.commitImport(unapproved,plan,{now:at,operatorId:'fixture-admin'}),/find_pipeline_changed/);
 const corrupt={...store,pipeline_reports:store.pipeline_reports.concat({id:'bad',report:{report_id:'other'}})};assert.throws(()=>imports.prepareImport(corrupt,body,{now:at}),/find_pipeline_changed/);
 for(const patch of [{expected_pipeline_revision:null},{expected_pipeline_revision:'bad'},{expected_pipeline_revision:'f'.repeat(64)},{items:[body.items[0],body.items[0]]}])assert.throws(()=>imports.prepareImport(store,{...body,...patch},{now:at}));
 for(const patch of [{reported:'true'},{verified:true},{address_withheld:true},{report_review:{can_review:false}},{report_review:{can_review:true,conflict:true}},{provenance:{...item.provenance,source_kind:'derived_workflow'}},{provenance:{...item.provenance,captured_at:'2026-02-30T12:00:00Z'}}])assert.equal(editor.canEditPrices({...item,...patch}),false);
 for(const patch of [{contract_price_low:'1e5'},{contract_price_high:'1'},{our_share:'101'},{our_share:'NaN'},{captured_at:''},{captured_at:item.provenance.captured_at.slice(0,19)},{captured_at:'2026-02-30T12:00:00'},{source_url:'javascript:bad'},{evidence_text:''}])assert.throws(()=>editor.priceDraft(item,{...values(),...patch}));
 const estimated={...item,money:{...item.money,costs_basis:'configured_estimate',costs:{low:777,high:888}}};assert(!editor.priceMarkup(estimated).includes('value="777"'),'Configured estimates are never prefilled as sourced costs');
 assert.equal(effects,0);assert.equal(JSON.stringify(store),before);
}finally{global.fetch=original.fetch;global.Date=original.Date;fs.writeFileSync=original.write;http.get=original.get;http.request=original.request;https.get=original.sg;https.request=original.sr;}
(async()=>{
 let current=priced(),reads=0,writes=0,server;const app=express();app.use(express.json());
 const fallback=(req,res,next)=>{req.currentUser={id:'anonymous-fallback',role:'admin'};next();};
 const signed=(req,res,next)=>{if(req.headers['x-fixture-signed']!=='yes')return res.status(401).json({code:'SESSION_REQUIRED'});if(req.headers['x-fixture-role']!=='admin')return res.status(403).json({code:'ADMIN_REQUIRED'});req.currentUser={id:'fixture-admin',role:'admin'};next();};
 registerAssistantFindRoutes(app,{db:{readDBStrict:()=>{reads++;return current;},writeDB:v=>{writes++;current=v;}},requireAdmin:fallback,requireImportAdmin:signed,now:()=>at});
 try{
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port;
  const post=async(action,body,headers={})=>{const r=await fetch(base+'/api/dashboard/buyers-found/import/'+action,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:r.status,cache:r.headers.get('cache-control'),body:await r.json()};};
  const body=editor.priceDraft(item,values()),auth={'x-fixture-signed':'yes','x-fixture-role':'admin'};
  for(const action of ['preview','commit']){assert.equal((await post(action,body)).status,401);assert.equal((await post(action,body,{'x-user-id':'admin'})).status,401);assert.equal((await post(action,body,{'x-fixture-signed':'yes','x-fixture-role':'staff'})).status,403);}assert.equal(reads,0);assert.equal(writes,0,'Fallback admin never reaches importer');
  const p=await post('preview',body,auth);assert.equal(p.status,200);assert.equal(p.cache,'no-store');assert.equal(writes,0);
  const saved=await post('commit',{preview_id:p.body.preview_id,bulk_approve:false},auth);assert.equal(saved.status,200);assert.equal(saved.body.created,1);assert.equal(saved.body.approved,0);assert.equal(writes,1);assert.equal(current.pipeline_reports.length,2);
  assert.equal((await post('commit',{preview_id:p.body.preview_id,bulk_approve:false},auth)).status,409);assert.equal(writes,1);
  assert.equal((await post('preview',body,auth)).status,409);assert.equal(writes,1);
  assert.deepEqual(current.leads,store.leads);assert.deepEqual(current.buyers,store.buyers);assert.deepEqual(current.reviewed_deals,store.reviewed_deals);
  const source=fs.readFileSync(require('node:path').join(__dirname,'../server.js'),'utf8');assert(source.includes('requireImportAdmin:requireSignedContactAdmin'),'Production registration uses signed identity, not hosted fallback');
  console.log('pipeline-price-entry: sourced explicit capture/ranges/share, append-only preview/commit, stale form/plan conflicts, no fallback admin authority, actor/once/no-store, unchanged business records and purity PASS');
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
