'use strict';
const assert=require('node:assert/strict'),express=require('express'),crypto=require('node:crypto'),http=require('node:http'),https=require('node:https');
const notes=require('../modules/buyers/buyer-evidence-notes'),sessions=require('../modules/security/dashboard-session'),{fixture,input,now}=require('./buyer-evidence-notes.test');
(async()=>{
 let server,store=fixture(),writes=0,broken=false,failWrite=false,effects=0;const before=JSON.stringify(store),old={fetch:global.fetch,hg:http.get,hr:http.request,sg:https.get,sr:https.request};
 try{
  const secret=crypto.randomBytes(48).toString('base64url'),options={secret,now:Date.parse(now)},cookie=(role,scope='dashboard')=>'wos_session='+sessions.issueSession({userId:'fixture-admin',role,scope},options).token;
  const requireAdmin=(req,res,next)=>{const who=sessions.verifySession(sessions.tokenFromRequest(req),options);if(!who.ok||who.user.scope!=='dashboard')return res.status(401).json({code:'SESSION_REQUIRED'});if(who.user.role!=='admin')return res.status(403).json({code:'ADMIN_REQUIRED'});req.currentUser=who.user;next();};
  const db={readDBStrict:()=>{if(broken)throw Error('PRIVATE STORE PATH');return store;},writeDB:value=>{if(failWrite)throw Error('PRIVATE WRITE PATH');store=value;writes++;}};
  const app=express();app.use(express.json());notes.register(app,{db,requireAdmin,now:()=>now});server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port;
  const deny=()=>{effects++;throw Error('external network forbidden');};http.get=http.request=https.get=https.request=deny;global.fetch=(url,opts)=>String(url).startsWith(base+'/')?old.fetch(url,opts):deny();
  async function request(method,body,auth){const r=await fetch(base+'/api/dashboard/buyers-found/fixture-buyer/evidence',{method,headers:{'Content-Type':'application/json',...(auth?{Cookie:auth}:{'x-user-id':'fixture-admin'})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};}
  const body=input(store),admin=cookie('admin');assert.equal((await request('POST',body)).status,401);assert.equal((await request('POST',body,cookie('user'))).status,403);assert.equal((await request('POST',body,cookie('admin','agent'))).status,401);assert.equal(writes,0);
  assert.equal((await request('GET',null)).status,401);assert.equal((await request('GET',null,cookie('user'))).status,403);assert.equal((await request('GET',null,cookie('admin','agent'))).status,401);
  const get=await request('GET',null,admin);assert.equal(get.status,200);assert.equal(get.cache,'no-store');assert.equal(get.body.funds_verified,false);assert.equal(writes,0);
  assert.equal((await request('POST',{...body,funds_verified:true},admin)).status,400);assert.equal((await request('POST',{...body,reviewed_source:false},admin)).status,409);assert.equal(writes,0);
  failWrite=true;const failure=await request('POST',body,admin);assert.equal(failure.status,503);assert.deepEqual(failure.body,{code:'buyer_evidence_unavailable'});assert.equal(JSON.stringify(store),before);failWrite=false;
  const saved=await request('POST',body,admin);assert.equal(saved.status,200);assert.equal(saved.cache,'no-store');assert.equal(writes,1);assert.equal((await request('POST',body,admin)).body.duplicate,true);assert.equal(writes,1);
  assert.equal((await request('POST',{...body,evidence_kind:'buying_intent'},admin)).status,409);assert.equal(writes,1);assert.deepEqual(store.buyers,fixture().buyers);assert.deepEqual(store.leads,[]);assert.deepEqual(store.reviewed_deals,[]);
  broken=true;assert.equal((await request('GET',null,admin)).status,503);assert.equal(effects,0);console.log('Buyer evidence API: signed dashboard admin only, regular/agent/x-user-id refused, GET no-store/no writes, unknown fields/source checks, generic failures, stale/quiet replay and unchanged buyers/deals/leads with zero external network passed.');
 }finally{global.fetch=old.fetch;http.get=old.hg;http.request=old.hr;https.get=old.sg;https.request=old.sr;if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
