'use strict';
const assert=require('node:assert/strict');const express=require('express');const {registerAssistantFindRoutes}=require('../modules/buyers/assistant-find-routes');
async function main(){let store={buyers:[{id:'fixture-buyer',record_ref:'BUY-0001'}],activities:[]};let writes=0;const events=[];let rejectHook=false;const app=express();app.use(express.json());
 const admin=(req,res,next)=>{req.currentUser={id:'fixture-admin'};next();};registerAssistantFindRoutes(app,{requireAdmin:admin,now:()=> '2026-10-10T12:00:00Z',db:{readDBStrict:()=>store,writeDB:v=>{store=v;writes++;}},onIncomingInteractions:rows=>{assert.ok(writes>0,'hook only after persistence');events.push(...rows);if(rejectHook)throw Error('mock send failure');}});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{const base='http://127.0.0.1:'+server.address().port+'/api/dashboard/buyers-found/import/';const post=async(path,body)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const item={kind:'interaction',ts:'2026-10-10T11:00:00Z',who:'Fixture assistant',channel:'email',dir:'in',with:'Private fixture person',ref:'BUY-0001',summary:'Private fixture reply'};
 const preview=await post('preview',{items:[item]});assert.equal(writes,0);assert.equal(events.length,0);rejectHook=true;const committed=await post('commit',{preview_id:preview.body.preview_id,bulk_approve:false});assert.equal(committed.status,200);assert.equal(writes,1);assert.equal(events.filter(a=>a.direction==='in').length,1);
 const retry=await post('preview',{items:[item]});await post('commit',{preview_id:retry.body.preview_id,bulk_approve:false});assert.equal(events.filter(a=>a.direction==='in').length,1,'duplicate imports do not alert again');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 console.log('Reply import hook: preview quiet, after-write notification, send failure cannot fail commit, duplicate quiet passed.');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
