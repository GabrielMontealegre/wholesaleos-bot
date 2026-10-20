'use strict';
const assert=require('node:assert/strict'),express=require('express'),crypto=require('node:crypto'),http=require('node:http'),https=require('node:https');
const reviews=require('../modules/records/pipeline-report-review'),sessions=require('../modules/security/dashboard-session');
const {seeded,request,now}=require('./pipeline-report-review.test');
(async()=>{
 let server,store=seeded(),writes=0,broken=false,failWrite=false,effects=0;const initial=JSON.stringify(store),old={fetch:global.fetch,hg:http.get,hr:http.request,sg:https.get,sr:https.request};
 try{
  const secret=crypto.randomBytes(48).toString('base64url'),options={secret,now:Date.parse(now)},cookie=(role,scope='dashboard')=>'wos_session='+sessions.issueSession({userId:'fixture-admin',role,scope},options).token;
  const db={readDBStrict:()=>{if(broken)throw Error('PRIVATE DATABASE PATH');return store;},writeDB:value=>{if(failWrite)throw Error('PRIVATE WRITE ERROR');store=value;writes++;}};
  const requireAdmin=(req,res,next)=>{const identity=sessions.verifySession(sessions.tokenFromRequest(req),options);if(!identity.ok||identity.user.scope!=='dashboard')return res.status(401).json({code:'SESSION_REQUIRED'});if(identity.user.role!=='admin')return res.status(403).json({code:'ADMIN_REQUIRED'});req.currentUser=identity.user;next();};
  const app=express();app.use(express.json());reviews.register(app,{db,requireAdmin,now:()=>now});server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const origin='http://127.0.0.1:'+server.address().port;
  const denied=()=>{effects++;throw Error('external network forbidden');};http.get=http.request=https.get=https.request=denied;global.fetch=(url,opts)=>String(url).startsWith(origin+'/')?old.fetch(url,opts):denied();
  const post=async(body,auth)=>{const r=await fetch(origin+'/api/dashboard/pipeline-report-reviews',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Cookie:auth}:{'x-user-id':'fixture-admin'})},body:JSON.stringify(body)});return{status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};};
  const input=request(store),admin=cookie('admin');assert.equal((await post(input)).status,401);assert.equal((await post(input,cookie('user'))).status,403);assert.equal((await post(input,cookie('admin','agent'))).status,401);assert.equal(JSON.stringify(store),initial);assert.equal(writes,0);
  assert.equal((await post({...input,approved:true},admin)).status,400);assert.equal((await post({...input,reviewed_source:false},admin)).status,409);assert.equal(writes,0);
  failWrite=true;const failure=await post(input,admin);assert.equal(failure.status,503);assert.deepEqual(failure.body,{code:'pipeline_review_store_unavailable'});assert.equal(writes,0);assert.equal(JSON.stringify(store),initial);failWrite=false;
  const saved=await post(input,admin);assert.equal(saved.status,200);assert.equal(saved.cache,'no-store');assert.deepEqual(saved.body,{ok:true,duplicate:false});assert.equal(writes,1);assert.equal(store.pipeline_report_reviews.length,1);assert.equal((await post(input,admin)).body.duplicate,true);assert.equal(writes,1);
  const stale=await post({...input,decision:'flagged',note:'Synthetic correction'},admin);assert.equal(stale.status,409);assert.equal(writes,1);
  broken=true;assert.equal((await post(input,admin)).status,503);assert.equal(effects,0);
  for(const key of ['buyers','reviewed_deals','leads','pipeline_reports'])assert.deepEqual(store[key],seeded()[key]);
  console.log('Pipeline review route: signed admin dashboard scope only, x-user-id/regular/agent refusal, explicit source check, stale/forged refusal, generic store/write failures, no-store, quiet duplicate, unchanged business reports/gates and zero external network passed.');
 }finally{global.fetch=old.fetch;http.get=old.hg;http.request=old.hr;https.get=old.sg;https.request=old.sr;if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
})().catch(e=>{console.error(e);process.exitCode=1;});
