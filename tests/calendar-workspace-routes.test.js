'use strict';
const assert=require('node:assert/strict'),express=require('express');
const {registerCalendarWorkspace}=require('../modules/records/calendar-workspace');
(async()=>{
 const app=express(),store={buyers:[],activities:[]},frozen=JSON.stringify(store);let writes=0,broken=false;
 registerCalendarWorkspace(app,{db:{readDBStrict:()=>{if(broken)throw Error('PRIVATE STORE PATH');return store;},writeDB:()=>writes++},requireAdmin:(req,res,next)=>{if(req.headers['x-fixture-admin']!=='yes')return res.status(401).json({code:'admin_required'});next();},now:()=> '2026-10-18T12:00:00Z'});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
 try{assert.equal((await fetch(base+'/api/dashboard/calendar-workspace')).status,401);
 const response=await fetch(base+'/api/dashboard/calendar-workspace',{headers:{'x-fixture-admin':'yes'}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).total,0);
 broken=true;const failed=await fetch(base+'/api/dashboard/calendar-workspace',{headers:{'x-fixture-admin':'yes'}});assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{code:'calendar_workspace_unavailable'});
 assert.equal(writes,0);assert.equal(JSON.stringify(store),frozen);console.log('Calendar routes: admin, no-store, store-error redaction, empty truth and zero writes passed.');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
