'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),express=require('express');
const {fixture}=require('./helpers/assistant-snapshot-fixture');
const {appendSnapshot,latestSnapshot,decodeSnapshot}=require('../modules/records/assistant-snapshot');
const {registerAssistantSnapshotRoutes}=require('../modules/records/assistant-snapshot-routes');
const model=require('../dashboard/workspace/assistant-model');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const now='2026-10-26T15:00:00Z',options={now,operatorId:'synthetic-owner',filename:'synthetic.json'};
const data=fixture(),base=data.buyers[0];data.buyers=[];
for(let i=0;i<12;i++)data.buyers.push({...structuredClone(base),id:'reply-buyer-'+i,name:'Synthetic reply buyer '+i,last_reply_at:'2026-10-26T12:'+String(i).padStart(2,'0')+':00Z',pof:i%3===0?true:i%3===1?false:null});
data.buyers.push({...structuredClone(base),id:'missing-reply',name:'Synthetic contact only',last_contact:'2026-10-26'});
const raw=Buffer.from(JSON.stringify(data)),store=appendSnapshot({buyers:[],reviewed_deals:[]},raw,options),receipt=latestSnapshot(store,options),before=JSON.stringify(receipt),view=model.project(receipt);
assert.deepEqual(view.recent_replies.map(b=>b.id),Array.from({length:10},(_,i)=>'reply-buyer-'+(11-i)));
assert(!view.recent_replies.some(b=>b.id==='missing-reply'),'Newest contact without a reply stays unranked');
assert.equal(view.buyers.length,13);assert.equal(view.buyers[12].last_reply_at,null);assert.equal(store.buyers.length,0);assert.equal(store.reviewed_deals.length,0);
assert.equal(receipt.snapshot.buyers[12].last_reply_at,undefined,'No inferred field persisted');
assert.equal(JSON.stringify(receipt),before);assert.equal(Object.keys(receipt).length,8);
const ties=fixture();ties.buyers[0].last_reply_at='2026-10-26T12:00:00Z';ties.buyers.push({...structuredClone(ties.buyers[0]),id:'tie-other'});
const tied=latestSnapshot(appendSnapshot({},Buffer.from(JSON.stringify(ties)),options),options);assert.deepEqual(model.project(tied).recent_replies.map(b=>b.id),['demo-buyer','tie-other'],'Equal reply times retain source order');
for(const bad of [null,'','2026-02-30T12:00:00Z','2026-10-26','2026-10-26T15:00:00.001Z',1,{},true]){
 const invalid=fixture();invalid.buyers[0].last_reply_at=bad;
 assert.throws(()=>decodeSnapshot(Buffer.from(JSON.stringify(invalid)),options),e=>e.code==='assistant_snapshot_date_invalid');
 const forged=structuredClone(receipt);forged.snapshot.buyers[0].last_reply_at=bad;assert.throws(()=>model.project(forged),/^Error: assistant_sheet_invalid$/);
}
let getters=0;const accessor=structuredClone(receipt);Object.defineProperty(accessor.snapshot.buyers[0],'last_reply_at',{enumerable:true,get(){getters++;throw Error('Private');}});assert.throws(()=>model.project(accessor),/^Error: assistant_sheet_invalid$/);assert.equal(getters,0);
const wrong=structuredClone(receipt);wrong.source_kind='canonical_buyer';assert.throws(()=>model.project(wrong),/^Error: assistant_sheet_invalid$/);
const savedNow=Date.now,savedFetch=global.fetch;try{Date.now=global.fetch=()=>{throw Error('Ambient effect');};assert.equal(model.project(receipt).recent_replies.length,10);}finally{Date.now=savedNow;global.fetch=savedFetch;}

async function writerRouteProof(){
 let persisted={buyers:[],reviewed_deals:[]},writes=0;const app=express();
 registerAssistantSnapshotRoutes(app,{db:{readDBStrict:()=>persisted,writeDB:value=>{writes++;persisted=value;}},now:()=>now,requireAdmin(req,res,next){req.currentUser={id:options.operatorId};next();}});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),origin='http://127.0.0.1:'+server.address().port,url=origin+'/api/dashboard/assistant-snapshots';
 try{
  const headers={Origin:origin,'Content-Type':'application/octet-stream','X-WOS-Assistant-Import':'1','X-WOS-Assistant-Filename':options.filename};
  let response=await fetch(url,{method:'POST',headers,body:raw});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const accepted=await response.json();assert.equal(accepted.file_sha256,receipt.file_sha256);assert.equal(writes,1);
  response=await fetch(url);const result=await response.json();assert.deepEqual(result.latest.snapshot.buyers,data.buyers);assert.equal(Object.keys(result.latest).length,8);assert.deepEqual(model.project(result.latest).recent_replies.map(b=>b.id),view.recent_replies.map(b=>b.id));
  const history=JSON.stringify(persisted);const future=structuredClone(data);future.buyers[0].last_reply_at='2026-10-26T15:00:00.001Z';response=await fetch(url,{method:'POST',headers,body:JSON.stringify(future)});assert.equal(response.status,400);assert.equal((await response.json()).code,'assistant_snapshot_date_invalid');assert.equal(writes,1);assert.equal(JSON.stringify(persisted),history,'Future reply is atomically rejected through the actual route');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
async function main(){
 await writerRouteProof();
 const {browser}=await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true});
 try{for(const width of [1366,400,412]){
  let active=store,authenticated=true,writes=0;
  const app=express();app.use((req,res,next)=>req.method==='GET'?next():res.status(405).end());
  app.get('/api/auth/session',(_,res)=>res.json({authenticated,role:'admin'}));
  app.get('/api/dashboard/today-workspace',(_,res)=>res.json({source_kind:'derived_workflow',now,today:'2026-10-26',counts:{},actions:[],best_deals:[],last_24h:[],capabilities:{assistant_snapshot_import:true}}));
  registerAssistantSnapshotRoutes(app,{db:{readDBStrict:()=>active,writeDB:()=>{writes++;throw Error('No writes');}},now:()=>now,requireAdmin(req,res,next){if(!authenticated)return res.status(401).json({code:'SESSION_REQUIRED'});req.currentUser={id:options.operatorId};next();}});
  app.get('/app',(_,res)=>res.sendFile(path.join(__dirname,'../dashboard/workspace/index.html')));app.get('/favicon.ico',(_,res)=>res.status(204).end());app.use('/dashboard',express.static(path.join(__dirname,'../dashboard')));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),baseUrl='http://127.0.0.1:'+server.address().port,height=width===1366?768:915;
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[],external=[],posts=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{const r=route.request();if(new URL(r.url()).origin!==baseUrl){external.push('external');return route.abort();}if(r.method()!=='GET'){posts.push(r.method());return route.abort();}return route.continue();});
  try{
   await page.goto(baseUrl+'/app?preview=1');const rows=page.locator('[data-assistant-recent-buyers] > li');await rows.first().waitFor();assert.equal(await rows.count(),10);
   assert.deepEqual(await rows.locator('strong').allTextContents(),view.recent_replies.map(b=>b.name));
   const shortlist=await page.locator('[data-assistant-recent-buyers]').innerText();assert(shortlist.includes('Buyer'));assert(shortlist.includes('Proof of funds reported: Yes'));assert(shortlist.includes('Proof of funds reported: No'));assert(shortlist.includes('Proof of funds reported: Unknown'));assert(shortlist.includes('From the assistant'));assert(shortlist.includes('Reply reported: Mon'));assert(!shortlist.includes('2026-10-26T'));assert(!shortlist.includes('reply-buyer-'));assert(!shortlist.includes('synthetic.json'));assert(!shortlist.includes('Synthetic contact only'));
   await page.getByRole('button',{name:'All reported buyers',exact:true}).click();await page.locator('#assistant-buyer-search').fill('Example Area');assert.equal(await page.locator('[data-assistant-buyers] > li').count(),13,'Full area-search includes unranked buyers');
   await page.locator('#assistant-buyer-search').fill('contact only');assert.equal(await page.locator('[data-assistant-buyers] > li').count(),1);assert((await page.locator('[data-assistant-buyers]').innerText()).includes('Reply reported: Not reported'));
   await page.getByRole('button',{name:'Close Reported buyers',exact:true}).click();await page.getByRole('heading',{name:'Top 10 buyers by most recent reply',exact:true}).scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(process.env.WOS_REPLY_PROOF_DIR){fs.mkdirSync(process.env.WOS_REPLY_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.WOS_REPLY_PROOF_DIR,'synthetic-replies-'+width+'.png')});}
   active=appendSnapshot(active,Buffer.from(JSON.stringify(fixture())),options);await page.getByRole('button',{name:'Refresh assistant sheet',exact:true}).click();await page.getByText('No reply times reported in this assistant file.',{exact:true}).waitFor();assert.equal(await rows.count(),0,'Newer old-format import clears old reply shortlist,no contact fallback');
   authenticated=false;await page.getByRole('button',{name:'Refresh assistant sheet',exact:true}).click();await page.getByRole('heading',{name:'Unlock your workspace',exact:true}).waitFor();assert.equal(await page.locator('[data-assistant-recent-buyers]').count(),0);
   assert.equal(writes,0);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(posts,[]);
  }finally{await context.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }}finally{await browser.close();}
 console.log('assistant-buyer-replies: actual importer/GET projection,strict optional times,top10reply-only stable ordering,reported POF,full area search,old-file refresh/session clearing and3size zero-write UI passed');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
