'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express');
const {fixture}=require('./helpers/assistant-snapshot-fixture');
const {registerAssistantSnapshotRoutes}=require('../modules/records/assistant-snapshot-routes');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const now='2026-10-26T15:00:00Z';
async function main(){
 const {browser}=await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true});
 const proof={synthetic_only:true,production_writes:0,cases:[]};
 try{for(const width of [1366,400,412]){
  let store={buyers:[],reviewed_deals:[]},actor='synthetic-owner',authenticated=true,writes=0,reads=0,unknown=false,forgedReceipt=false,failRead=false,hold=false,release;
  const app=express();
  app.get('/api/auth/session',(_,res)=>res.json({authenticated,role:'admin'}));
  app.get('/api/dashboard/today-workspace',(_,res)=>res.json({source_kind:'derived_workflow',now,today:'2026-10-26',counts:{},actions:[],best_deals:[],last_24h:[],capabilities:{assistant_snapshot_import:true}}));
  app.use('/api/dashboard/assistant-snapshots',(req,res,next)=>{
   if(req.method==='GET'){
    reads++;if(failRead)return res.status(503).json({ok:false,code:'assistant_snapshot_unavailable'});
    if(hold){hold=false;const json=res.json.bind(res);res.json=body=>{release=()=>json(body);return res;};}
   }else if(req.method==='POST'&&unknown){res.json=()=>{res.destroy();return res;};}
   else if(req.method==='POST'&&forgedReceipt){forgedReceipt=false;const json=res.json.bind(res);res.json=body=>json({...body,file_sha256:'0'.repeat(64)});}
   next();
  });
  registerAssistantSnapshotRoutes(app,{db:{readDBStrict:()=>store,writeDB:value=>{writes++;store=value;}},requireAdmin(req,res,next){if(!authenticated)return res.status(401).json({code:'SESSION_REQUIRED'});req.currentUser={id:actor,role:'admin'};next();},now:()=>now});
  app.get('/app',(_,res)=>res.sendFile(path.join(__dirname,'../dashboard/workspace/index.html')));
  app.get('/favicon.ico',(_,res)=>res.status(204).end());
  app.use('/dashboard',express.static(path.join(__dirname,'../dashboard')));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port,height=width===1366?768:915;
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[],external=[],otherWrites=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==base){external.push(u.origin);return route.abort();}if(r.method()!=='GET'&&!(r.method()==='POST'&&u.pathname==='/api/dashboard/assistant-snapshots')){otherWrites.push(r.method());return route.abort();}return route.continue();});
  const choose=async(value,name='assistant.json')=>page.locator('#assistant-file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  try{
   hold=true;await page.goto(base+'/app?preview=1');await page.getByRole('heading',{name:'Your assistant sheet',exact:true}).waitFor();
   assert(!(await page.getByRole('heading',{name:'Your action queue',exact:true}).isVisible()),'Canonical work is placed after initial primary-sheet load,not visibly shifted');
   await page.getByRole('button',{name:'Open recorded work',exact:true}).click();assert(await page.getByRole('heading',{name:'Your action queue',exact:true}).isVisible(),'Slow assistant reads never block explicit access to recorded work');
   while(!release)await new Promise(r=>setTimeout(r,10));release();release=undefined;
   await page.getByText('No file imported yet.',{exact:true}).waitFor();
   assert.equal(writes,0);assert.equal(reads,1);assert(await page.locator('#assistant-import').isDisabled());
   assert(await page.getByRole('heading',{name:'Your action queue',exact:true}).isVisible(),'Canonical recorded work remains separate');
   const data=fixture();data.deals[0].name='Synthetic property <img src=x onerror=alert(1)>';data.calls[0].questions.push('What is next?');data.buyers[0].name='Synthetic buyer '+ 'x'.repeat(180);
   for(const [index,fees] of [[1,[null,null]],[2,[0,null]],[3,[0,15000]]]){const deal=structuredClone(data.deals[0]);deal.id='fee-example-'+index;deal.name='Synthetic fee example '+index;deal.needs_gabriel=null;deal.numbers.fee_estimate_low=fees[0];deal.numbers.fee_estimate_high=fees[1];data.deals.push(deal);}
   const chooserPromise=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose assistant file',exact:true}).click();const chooser=await chooserPromise;await chooser.setFiles({name:'assistant.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});assert.equal(writes,0,'Selecting a file does not upload it');
   await page.locator('#assistant-import').click();await page.getByText('Assistant file imported.',{exact:true}).waitFor();
   assert.equal(writes,1);assert.equal(store.assistant_snapshots.length,1);assert.equal(store.buyers.length,0);assert.equal(store.reviewed_deals.length,0);
   const text=await page.locator('#assistant-slot').innerText();
   for(const heading of ['Do this next','Calls','Texts to send','Emails waiting on you','Deals by stage','Buyers'])assert(await page.getByRole('heading',{name:heading,exact:true}).count()>0);
   await page.getByRole('button',{name:'All reported buyers',exact:true}).click();
   assert(await page.getByRole('dialog',{name:'Reported buyers',exact:true}).isVisible());
   assert((await page.locator('#assistant-buyers').innerText()).includes('Proof of funds reported: Unknown'));
   await page.getByRole('button',{name:'Close Reported buyers',exact:true}).click();
   assert(text.includes('From the assistant'));assert(!text.includes('deal-brains/demo.md'));assert(!text.includes('assistant.json'));assert(text.includes('Not estimated yet'),'D064 zero fees are not an earnings claim');
   assert.equal((text.match(/Not estimated yet/g)||[]).length,3,'Both missing,mixed zero/unknown,and both zero remain unestimated');assert(text.includes('You make about $0–$15,000 (estimate)'),'An explicit nonzero bound still displays the reported estimate');
   assert(!(await page.locator('#assistant-file').isVisible()),'D064 browser-localized raw picker is not rendered');
   assert(await page.getByRole('button',{name:'Import a file instead',exact:true}).isVisible());
   assert(!(await page.locator('#assistant-import').isVisible()),'Populated sheet does not lead with a disabled primary import command');
   assert(text.includes('Why: Confirm status.'));assert(text.includes('Why: Not reported in this file.'),'Schema has no text reason; never invent one');
   assert(text.includes('Proof of funds reported: 0 yes · 1 unknown'),'POF summary is visible on Today,not only inside the drawer');
   await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.syntheticClipboard=value;}}});});
   await page.getByRole('button',{name:'Copy text',exact:true}).click();await page.getByText('Text copied. Nothing was sent.',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.syntheticClipboard),data.texts[0].text,'Exact source text copied,not markup');assert.equal(writes,1);
   await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('denied');};});
   await page.getByRole('button',{name:'Copy text',exact:true}).click();await page.getByText('Text could not be copied. Nothing was sent.',{exact:true}).waitFor();assert.equal(writes,1);
   const touch=await page.getByRole('button',{name:'Copy text',exact:true}).boundingBox();assert(touch.height>=44);
   assert(!text.includes('2026-10-26T'));assert(!text.includes('demo-deal'));assert(!text.includes('demo-buyer'));assert(!text.includes('most recent reply'));
   assert.equal(await page.locator('#assistant-slot script,#assistant-slot img[src=x]').count(),0,'Imported markup is text,not executable DOM');
   assert.equal(await page.getByRole('link',{name:'Call Synthetic person',exact:true}).getAttribute('href'),'tel:+15551234567');
   assert.equal(await page.getByRole('link',{name:'Open text in Messages',exact:true}).getAttribute('href'),'sms:+15551234567?&body='+encodeURIComponent(data.texts[0].text));
   assert.equal(await page.getByRole('link',{name:'Open Email',exact:true}).getAttribute('href'),'/app?preview=1&view=email');
   const card=page.locator('.ws-assistant-deal').first();await card.click();assert(await page.getByRole('dialog',{name:'Assistant-reported deal',exact:true}).isVisible());
   assert((await page.locator('#assistant-detail').innerText()).includes('Reported repairs\nNot reported'));await page.keyboard.press('Escape');
   await card.click();await page.getByRole('button',{name:'Close Assistant-reported deal',exact:true}).click();assert(!(await page.locator('#assistant-detail').isVisible()));
   await page.getByRole('button',{name:'All reported buyers',exact:true}).click();
   await page.locator('#assistant-buyer-search').fill('missing-area');assert((await page.locator('[data-assistant-buyers]').innerText()).includes('No reported buyers match'));
   await page.locator('#assistant-buyer-search').fill('Example Area');assert((await page.locator('[data-assistant-buyers]').innerText()).includes('Synthetic buyer'));
   await page.keyboard.press('Escape');
   assert(!(await page.locator('#assistant-buyers').isVisible()),'Escape closes the drawer even while a search input has focus');
   const check=page.getByRole('checkbox',{name:'I sent it (saved on this device)',exact:true});await check.check();
   await page.waitForFunction(()=>localStorage.length===1);assert.equal(writes,1,'Device check is not a provider or import write');
   const storage=await page.evaluate(()=>Object.entries(localStorage));assert.equal(storage.length,1);assert.match(storage[0][0],/^wos-assistant-sent:[a-f0-9]{64}$/);assert.equal(storage[0][1],'1');
   await page.evaluate(()=>{window.savedRemove=Storage.prototype.removeItem;Storage.prototype.removeItem=function(){throw Error('local storage denied');};});
   await check.click();await page.getByText('This device could not save the check. No message was sent.',{exact:true}).waitFor();assert(await check.isChecked(),'A failed local write restores the previously saved state');
   await page.evaluate(()=>{Storage.prototype.removeItem=window.savedRemove;delete window.savedRemove;});
   await page.reload();await check.waitFor();assert(await check.isChecked(),'Same signed operator/file/text restores its device check');
   actor='another-synthetic-owner';await page.getByRole('button',{name:'Refresh assistant sheet',exact:true}).click();await page.getByText('No file imported yet.',{exact:true}).waitFor();
   await choose(data);await page.locator('#assistant-import').click();await page.getByText('Assistant file imported.',{exact:true}).waitFor();assert(!(await check.isChecked()),'Actual server viewer scope prevents cross-operator markers despite generic browser admin ID');assert.equal(writes,2);
   await page.evaluate(()=>{window.savedDigest=SubtleCrypto.prototype.digest;let calls=0;SubtleCrypto.prototype.digest=function(...args){if(++calls===1){const target=this;return new Promise(resolve=>{window.releaseFirstDigest=()=>window.savedDigest.apply(target,args).then(resolve);});}return window.savedDigest.apply(this,args);};});
   await check.click();await check.click();await page.evaluate(()=>window.releaseFirstDigest());
   await page.evaluate(()=>{SubtleCrypto.prototype.digest=window.savedDigest;delete window.savedDigest;delete window.releaseFirstDigest;});
   assert(!(await check.isChecked()));assert.equal(await page.evaluate(()=>localStorage.length),1,'Stale first toggle cannot overwrite the latest unchecked intent for another actor');
   const bad=fixture();bad.version=2;await choose(bad);await page.locator('#assistant-import').click();await page.getByText(/different version/).waitFor();assert.equal(writes,2);assert(await card.isVisible(),'A rejected file does not replace the previous accepted sheet');
   unknown=true;await choose(data);await page.locator('#assistant-import').click();
   try{await page.getByText('The import outcome is unknown. Refresh before importing again.',{exact:true}).waitFor();}catch(error){console.error(JSON.stringify({synthetic_only:true,writes,reads,status:await page.locator('#assistant-status').textContent()}));throw error;}
   assert.equal(writes,3,'Lost responses and Chromium transport replays still persist one explicit import');assert(await page.locator('#assistant-import').isDisabled());unknown=false;
   await page.getByRole('button',{name:'Refresh assistant sheet',exact:true}).click();await check.waitFor();assert.equal(writes,3,'Recovery uses GET only,no blind repeat POST');
   forgedReceipt=true;await choose(data);await page.locator('#assistant-import').click();await page.getByText('The import outcome is unknown. Refresh before importing again.',{exact:true}).waitFor();assert.equal(writes,4);assert(await page.locator('#assistant-import').isDisabled(),'Wrong receipt hash cannot claim a verified import');
   await page.getByRole('button',{name:'Refresh assistant sheet',exact:true}).click();await check.waitFor();assert.equal(writes,4);
   failRead=true;await page.getByRole('button',{name:'Refresh assistant sheet',exact:true}).click();await page.getByText('Assistant data is unavailable. Refresh to try again.',{exact:true}).waitFor();assert.equal(await page.locator('.ws-assistant-deal').count(),0);assert(await page.getByRole('heading',{name:'Your action queue',exact:true}).isVisible());
   failRead=false;await page.getByRole('button',{name:'Refresh assistant sheet',exact:true}).click();await check.waitFor();
   const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime}));assert.equal(geometry.overflow,false);assert(geometry.fcp<2000);
   if(process.env.WOS_ASSISTANT_PROOF_DIR){fs.mkdirSync(process.env.WOS_ASSISTANT_PROOF_DIR,{recursive:true});await page.locator('#assistant-slot').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.WOS_ASSISTANT_PROOF_DIR,'synthetic-sheet-'+width+'.png')});}
   await page.evaluate(()=>{navigator.clipboard.writeText=()=>new Promise(resolve=>{window.finishCopy=resolve;});});
   await page.getByRole('button',{name:'Copy text',exact:true}).click();
   hold=true;await page.getByRole('button',{name:'Refresh assistant sheet',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#assistant-status')?.textContent!==undefined);while(!release)await new Promise(r=>setTimeout(r,10));
   authenticated=false;await page.getByRole('button',{name:'Refresh recorded work',exact:true}).click();await page.getByRole('heading',{name:'Unlock your workspace',exact:true}).waitFor();release();await page.evaluate(()=>window.finishCopy());
   await page.waitForTimeout(30);assert.equal(await page.locator('#assistant-slot').count(),0,'Late private response after401 cannot restore data');
   assert.equal(writes,4);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(otherWrites,[]);
   proof.cases.push({width,height,first_contentful_paint_ms:geometry.fcp,local_synthetic_imports:writes,external_requests:external.length,page_errors:errors.length});
  }finally{await context.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }}finally{await browser.close();}
 if(process.env.WOS_ASSISTANT_PROOF_DIR)fs.writeFileSync(path.join(process.env.WOS_ASSISTANT_PROOF_DIR,'synthetic-proof.json'),JSON.stringify(proof,null,2));
 console.log('assistant-sheet-ui: actual importer3sizes,explicit upload/uncertainty/rejection,reported provenance/details/search/local-only scoped checks,late401/privacy and zero external writes/errors passed');
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
