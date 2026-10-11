'use strict';
const assert=require('node:assert/strict');const express=require('express');
const {registerReviewedDealRoutes}=require('../modules/deals/reviewed-deal-routes');
const {seed,input,context}=require('./jv-workflow.test');
(async()=>{
  let store=seed(),writes=0;const db={readDBStrict:()=>store,writeDB:value=>{writes++;store=value;}};
  const app=express();app.use(express.json());const guard=(req,res,next)=>{if(req.headers['x-fixture-admin']!=='yes')return res.status(401).end();req.currentUser={id:context.operatorId};next();};
  registerReviewedDealRoutes(app,{db,requireAdmin:guard,now:()=>context.now});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port;
  async function request(path,method='GET',body,admin=true){return fetch(base+'/api/dashboard/todays-deals'+path,{method,headers:{'Content-Type':'application/json',...(admin?{'x-fixture-admin':'yes'}:{})},body:body?JSON.stringify(body):undefined});}
  try {
    const original=JSON.stringify(store);
    for(const path of ['/deal/buyer-teaser?buyer_id=buyer1','/deal/full-package?buyer_id=buyer1'])assert.equal((await request(path,'GET',null,false)).status,401);
    assert.equal((await request('/deal/jv-stage','POST',input('holder_interested'),false)).status,401);
    const teaser=await request('/deal/buyer-teaser?buyer_id=buyer1');assert.equal(teaser.status,200);assert.equal(teaser.headers.get('cache-control'),'no-store');assert.ok(!(await teaser.text()).includes('100 Example St'));
    assert.equal((await request('/deal/full-package?buyer_id=buyer1')).status,409);
    assert.equal((await request('/missing/jv-stage','POST',input('holder_interested'))).status,404);
    assert.equal((await request('/deal/jv-stage','POST',input('full_package',{buyer_id:'buyer1'}))).status,409);
    assert.equal((await request('/deal/jv-stage','POST',{...input('holder_interested'),signed:true})).status,400);
    assert.equal(JSON.stringify(store),original);assert.equal(writes,0);
    assert.equal((await request('/deal/jv-stage','POST',input('holder_interested'))).status,200);assert.equal(writes,1);
    const result=await(await request('')).json();assert.equal(result.items[0].jv_workflow.stage,'holder_interested');assert.equal(writes,1);
    assert.equal((await request('/deal/jv-stage','POST',input('holder_interested'))).status,409);assert.equal(writes,1);
    assert.deepEqual(store.leads,JSON.parse(original).leads);
    console.log('JV workflow routes: admin guards, read-only previews, locked package, bounded atomic stage write and real list transport passed.');
  }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
