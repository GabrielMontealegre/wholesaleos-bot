'use strict';
const assert=require('node:assert/strict');const {createOwnerTelegram,registerOwnerTelegram}=require('../modules/agents/owner-telegram');
async function main(){
 let calls=0;const logs=[];let tick=3600000;const secret='synthetic-not-a-real-token';const env={TELEGRAM_BOT_TOKEN:secret,BOT_OWNER_ID:'fixture-owner'};
 const missing=createOwnerTelegram({env:{},fetchImpl:()=>{throw Error('network forbidden');}});assert.equal((await missing.send('Fixture')).code,'telegram_not_connected');assert.equal(missing.status().status,'Telegram not connected');
 const service=createOwnerTelegram({env,clock:()=>tick,log:e=>logs.push(e),fetchImpl:async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.chat_id,'fixture-owner');assert.ok(!body.parse_mode);return {ok:true,json:async()=>({ok:true})};}});
 for(let i=0;i<30;i++)assert.equal((await service.send('PRIVATE TEXT','BUY-0001')).sent,true);assert.equal((await service.send('Fixture')).code,'telegram_rate_limited');assert.equal(calls,30);tick+=3600000;assert.equal((await service.send('Fixture')).sent,true);
 assert.ok(!JSON.stringify(logs).includes(secret));assert.ok(!JSON.stringify(logs).includes('PRIVATE TEXT'));
 assert.equal((await service.send('x'.repeat(3501))).code,'telegram_input_invalid');assert.equal((await service.send('Fixture','wrong ref')).code,'telegram_input_invalid');
 const failure=createOwnerTelegram({env,log:e=>logs.push(e),fetchImpl:async()=>{throw Error('upstream secret '+secret);}});const failed=await failure.send('Fixture');assert.equal(failed.code,'telegram_send_failed');assert.ok(!JSON.stringify([failed,logs]).includes(secret));
 const before=calls;await service.incoming([{direction:'out',type:'reply_received',buyer_ref:'BUY-0002'},{direction:'in',buyer_ref:'BUY-0003'}]);assert.equal(calls,before+1);
 const express=require('express');const app=express();app.use(express.json());const admin=(req,res,next)=>req.headers['x-fixture-role']==='admin'?next():res.status(403).json({code:'admin_required'});registerOwnerTelegram(app,{db:{readDBStrict:()=>({})},requireAdmin:admin,service,now:()=> '2026-10-10T12:00:00Z'});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});try{const base='http://127.0.0.1:'+server.address().port;assert.equal((await fetch(base+'/api/notify/telegram',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"text":"Fixture"}'})).status,403);
 const headers={'x-fixture-role':'admin','Content-Type':'application/json'};const count=calls;assert.equal((await fetch(base+'/api/notify/telegram/status',{headers})).status,200);assert.equal((await fetch(base+'/api/notify/telegram/brief',{headers})).status,200);assert.equal(calls,count,'read-only checks must not send');
 for(const path of ['/api/dashboard/operator-channel-status','/api/dashboard/operator-brief']){assert.equal((await fetch(base+path)).status,403);const r=await fetch(base+path,{headers});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');}assert.equal(calls,count,'read aliases must not send');
 assert.equal((await fetch(base+'/api/notify/telegram',{method:'POST',headers,body:JSON.stringify({text:'Fixture',chat_id:'other-recipient'})})).status,400);
 const daily=await fetch(base+'/api/daily-summary',{method:'POST',headers,body:'{}'});assert.equal((await daily.json()).success,true,'legacy success field reports actual mock delivery');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 console.log('Owner Telegram: fixed recipient, missing config, cap/rate, safe failures/logs, incoming direction, admin and no-send GETs passed.');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
