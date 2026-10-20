'use strict';
const assert=require('node:assert/strict'),express=require('express'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),https=require('node:https');
const pairing=require('../modules/security/dashboard-pairing'),{registerAssistantFindRoutes}=require('../modules/buyers/assistant-find-routes'),pipeline=require('../modules/records/pipeline-reports');
const {base,report,now}=require('./pipeline-reports.test');
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wos-pipeline-fixture-'));let server,store=base(),writes=0,broken=false,incoming=0,networkDenied=0;
 const original={fetch:global.fetch,hg:http.get,hr:http.request,sg:https.get,sr:https.request};
 try{
  const options={state_path:path.join(tmp,'fixture-pairing.json'),secret:crypto.randomBytes(48).toString('base64url'),now:Date.parse(now)};
  const token=pairing.exchangePairing(pairing.createPairing({id:'fixture-admin',role:'admin'},options).pairing_token,options).agent_token;
  const db={readDBStrict:()=>{if(broken)throw Error('PRIVATE DB PATH');return store;},writeDB:v=>{store=v;writes++;}};
  const requireAdmin=(req,res,next)=>{if(req.headers['x-fixture-admin']!=='yes')return res.status(401).json({code:'admin_required'});req.currentUser={id:'fixture-admin',role:'admin'};next();};
  const app=express();app.use(express.json());registerAssistantFindRoutes(app,{db,requireAdmin,pairingOptions:options,now:()=>now,onIncomingInteractions:events=>{incoming+=events.filter(e=>e.direction==='in').length;}});pipeline.register(app,{db,requireAdmin,now:()=>now});
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const origin='http://127.0.0.1:'+server.address().port;
  const denied=()=>{networkDenied++;throw Error('external network forbidden');};http.get=http.request=https.get=https.request=denied;
  global.fetch=(url,opts)=>{if(!String(url).startsWith(origin+'/'))return denied();return original.fetch(url,opts);};
  const post=async(items,bearer=token)=>{const r=await fetch(origin+'/api/assistant/finds',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+bearer},body:JSON.stringify({items})});return {status:r.status,body:await r.json()};};
  const before=JSON.stringify(store);
  assert.equal((await post([report()],'invalid')).status,401);assert.equal(writes,0);
  assert.equal((await fetch(origin+'/api/assistant/finds',{headers:{Authorization:'Bearer '+token}})).status,405);
  assert.equal((await post([report(),report({report_id:'bad',record_ref:'WOS-FL-9999'})])).status,409);assert.equal(JSON.stringify(store),before);assert.equal(writes,0,'mixed failure does not commit the preceding valid report');
  assert.equal((await post([{...report(),review_status:'approved'}])).status,400);assert.equal(writes,0);
  assert.equal((await post(Array(51).fill(report()))).status,400);assert.equal(writes,0);
  const created=await post([report()]);assert.equal(created.status,200);assert.equal(created.body.results[0].result,'created');assert.equal(store.pipeline_reports[0].review_status,'pending');assert.equal(incoming,0,'workflow report never reports an incoming reply');
  const duplicate=await post([report()]);assert.equal(duplicate.body.results[0].result,'duplicate');assert.equal(store.pipeline_reports.length,1);assert.equal(store.activities.length,1);
  assert.ok(!JSON.stringify(created.body).includes(token));assert.ok(!JSON.stringify(created.body).includes(report().evidence_text));
  const url=origin+'/api/dashboard/pipeline-workspace';const count=writes;
  assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{'x-user-id':'fixture-admin'}})).status,401);
  const read=await fetch(url,{headers:{'x-fixture-admin':'yes'}});assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'no-store');const view=await read.json();assert.equal(view.items.length,1);assert.equal(view.items[0].verified,false);assert.equal(view.reported_only,true);assert.equal(writes,count,'GET never commits a report');
  broken=true;const failure=await fetch(url,{headers:{'x-fixture-admin':'yes'}});assert.equal(failure.status,503);assert.deepEqual(await failure.json(),{code:'pipeline_workspace_unavailable'});assert.equal(writes,count);
  assert.deepEqual(store.leads,base().leads);assert.deepEqual(store.reviewed_deals,base().reviewed_deals);assert.deepEqual(store.buyers,base().buyers);assert.equal(networkDenied,0);
  console.log('Pipeline routes: existing signed write-only import/caps/401, atomic mixed rejection, pending-only/idempotent history, no reply notification, admin GET/no-store/x-user-id401/generic503, zero production/external network and unchanged business records passed.');
 }finally{global.fetch=original.fetch;http.get=original.hg;http.request=original.hr;https.get=original.sg;https.request=original.sr;if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
