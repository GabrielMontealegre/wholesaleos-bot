'use strict';
const assert=require('node:assert/strict'),crypto=require('crypto'),fs=require('fs'),os=require('os'),path=require('path'),express=require('express');
const pairing=require('../modules/security/dashboard-pairing');
const {registerAssistantFindRoutes}=require('../modules/buyers/assistant-find-routes');
const imports=require('../modules/buyers/buyer-find-import');
const now='2026-10-10T12:00:00Z';
const conversation={kind:'conversation',person:'SYNTHETIC PARTNER',role:'partner',refs:['BUY-0001'],channels:['manual'],status:'to_send',captured_at:now};
const interaction={kind:'interaction',ts:now,who:'Fixture assistant',channel:'manual',dir:'in',with:'SYNTHETIC PARTNER',ref:'BUY-0001',summary:'Fixture reply'};
for(const items of [[{kind:'deal'}],[{...conversation,verified:true}],[{...interaction,dir:'auto'}],Array(51).fill(conversation)])assert.throws(()=>imports.validateAgentItems({items},now));
async function main(){const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wos-agent-report-test-'));let server;
try{const options={state_path:path.join(tmp,'pairing.json'),secret:crypto.randomBytes(48).toString('base64url'),now:Date.parse(now)};
const token=pairing.exchangePairing(pairing.createPairing({id:'fixture-admin',role:'admin'},options).pairing_token,options).agent_token;
let store={buyers:[{id:'fixture-buyer',record_ref:'BUY-0001'}],leads:[{id:'fixture-lead',status:'unchanged'}],activities:[]},writes=0;const hooks=[];
const app=express();app.use(express.json());registerAssistantFindRoutes(app,{db:{readDBStrict:()=>store,writeDB:v=>{store=v;writes++;}},requireAdmin:(req,res)=>res.status(403).end(),pairingOptions:options,now:()=>now,onIncomingInteractions:events=>{assert.ok(writes>0);hooks.push(...events);throw Error('fixture transport failure');}});
server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port+'/api/assistant/finds';
const post=async(items,bearer=token)=>{const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+bearer},body:JSON.stringify({items})});return {status:r.status,body:await r.json()};};
assert.equal((await post([conversation],'invalid')).status,401);assert.equal(writes,0);
assert.equal((await fetch(base,{headers:{Authorization:'Bearer '+token}})).status,405,'agent remains write-only');
const before=JSON.stringify(store);assert.equal((await post([conversation,{...interaction,ref:'BUY-9999'}])).status,409);assert.equal(JSON.stringify(store),before);assert.equal(writes,0,'mixed failure writes nothing');
let r=await post([conversation,interaction]);assert.equal(r.status,200);assert.deepEqual(r.body.results.map(v=>v.result),['created','created']);assert.equal(store.conversations.length,1);assert.equal(hooks.filter(v=>v.direction==='in').length,1);
r=await post([conversation,interaction]);assert.equal(r.status,200);assert.ok(r.body.results.every(v=>v.result==='duplicate'));assert.equal(store.conversations[0].history.length,1);assert.equal(hooks.filter(v=>v.direction==='in').length,1,'duplicate does not notify again');assert.deepEqual(store.leads,[{id:'fixture-lead',status:'unchanged'}]);
assert.ok(!JSON.stringify(r.body).includes(token));assert.ok(!JSON.stringify(r.body).includes(conversation.person));
}finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}fs.rmSync(tmp,{recursive:true,force:true});}
console.log('Paired report import: unchanged auth/write-only/caps, atomic failure, conversation + interaction, duplicate quiet, hook-after-write/failure isolation, lead preservation and response privacy passed.');}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
