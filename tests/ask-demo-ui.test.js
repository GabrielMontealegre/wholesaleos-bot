'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui'),{launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const {view}=require('./ask-workspace.test');
const proofDir=process.env.WOS_ASK_DEMO_PROOF_DIR;
if(process.argv.includes('--screenshots'))assert.ok(proofDir&&path.isAbsolute(proofDir),'Screenshot capture requires an explicit output directory');
(async()=>{
 const fixture=createFixtureApp(),server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
 let browser,reads=0,hold=false,release=null;const writes=[],external=[],errors=[];
 try{
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;const context=await browser.newContext();
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
   if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
   if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
   if(url.origin!==base){external.push(url.hostname);return route.abort();}
   if(!['GET','HEAD'].includes(req.method())){writes.push(req.method()+' '+url.pathname);return route.abort();}
   if(url.pathname==='/api/dashboard/ask-workspace'){reads++;if(hold){hold=false;await new Promise(resolve=>release=resolve);}try{return await route.fulfill({json:view});}catch{return;}}
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const ask=async text=>{await page.locator('[data-ask-query]').fill(text);await page.locator('[data-ask-form] button[type=submit]').click();};
  for(const width of [1366,400,412]){
   const before=reads;await page.setViewportSize({width,height:width===1366?768:915});await page.goto(base+'/dashboard/');await page.locator('.marketplace-topnav').waitFor({state:'attached'});
   await page.getByRole('button',{name:'Open Ask WholesaleOS',exact:true}).waitFor();assert.equal(reads,before,'no snapshot fetch on dashboard load');
   const entry=page.getByRole('button',{name:'Open Ask WholesaleOS',exact:true});
   assert.equal(await entry.evaluate(el=>el.parentElement.classList.contains('topbar')),true,'entry stays in the header, never over record actions');
   const headerBoxes=await page.locator('.topbar').evaluate(el=>Array.from(el.children).map(child=>{const r=child.getBoundingClientRect();return {id:child.id,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}).filter(r=>r.width&&r.height));
   const entryBox=headerBoxes.find(r=>r.id==='wos-ask-open');assert.ok(entryBox&&entryBox.width>=44&&entryBox.height>=44&&entryBox.x>=0&&entryBox.right<=width);
   for(const box of headerBoxes.filter(r=>r.id!=='wos-ask-open'))assert.ok(entryBox.right<=box.x||entryBox.x>=box.right||entryBox.bottom<=box.y||entryBox.y>=box.bottom,'Ask does not overlap another header control');
   await page.getByRole('button',{name:'Open Ask WholesaleOS',exact:true}).click();await page.locator('[data-ask-status]').filter({hasText:'Recorded snapshot loaded'}).waitFor();assert.equal(reads,before+1);
   assert.ok((await page.locator('#wos-ask-panel').innerText()).includes('Feed incomplete'));
   if(process.argv.includes('--screenshots')){fs.mkdirSync(proofDir,{recursive:true});assert.equal(await page.locator('#app #wos-ask-panel').count(),0);await page.mouse.move(0,0);await page.screenshot({path:path.join(proofDir,'synthetic-ask-home-'+width+'.png'),mask:[page.locator('#app'),page.locator('.toast')],maskColor:'#000000'});}
   await page.locator('[data-ask-question="What is waiting on me"]').click();assert.ok((await page.locator('.ask-answer').innerText()).includes('existing Today queue'));
   await page.locator('[data-ask-question="New deals today"]').click();await page.locator('[data-ask-item]').first().waitFor();assert.ok(!(await page.locator('[data-ask-item]').first().innerText()).includes(view.records[0].ref),'compact answer face omits standalone reference metadata');await page.locator('[data-ask-item]').first().click();
   await page.locator('.ask-context').waitFor();assert.ok((await page.locator('.ask-context').innerText()).includes('Recorded stage: Found'));assert.ok((await page.locator('.ask-context').innerText()).includes('not a confirmed purchase or proof of funds'));assert.ok(!(await page.locator('#wos-ask-panel').innerText()).includes('100 Example St'));
   assert.ok((await page.locator('.ask-context').innerText()).includes(view.records[0].ref),'detailed context preserves canonical reference');
   assert.ok((await page.locator('.ask-context').innerText()).includes('Not established by this view'));assert.equal(reads,before+1,'questions operate locally on one snapshot');
   assert.equal(await page.locator('[data-ask-query]').getAttribute('maxlength'),'300');await page.locator('#wos-ask-panel .wos-voice-tools').waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const bounds=await page.locator('#wos-ask-panel').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0);
   assert.equal(await page.locator('#wos-ask-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
   for(const button of await page.locator('#wos-ask-panel button').all())assert.ok(await button.evaluate(el=>el.getBoundingClientRect().height>=44));
   if(process.argv.includes('--screenshots')){fs.mkdirSync(proofDir,{recursive:true});if(width<650)await page.locator('.ask-context').scrollIntoViewIfNeeded();assert.equal(await page.locator('#app #wos-ask-panel').count(),0);await page.mouse.move(0,0);await page.screenshot({path:path.join(proofDir,'synthetic-ask-context-'+width+'.png'),mask:[page.locator('#app'),page.locator('.toast')],maskColor:'#000000'});}
   await ask('which buyers match '+view.records[0].ref);assert.ok((await page.locator('.ask-answer').innerText()).includes('canonical buyer matches'));
   await ask('where are we with '+view.people[0].ref);assert.ok((await page.locator('.ask-context').innerText()).includes('Proof of funds: Not established'));
   await ask('send an offer');assert.equal(await page.locator('.ask-context').count(),0);assert.ok((await page.locator('.ask-answer').innerText()).includes('read-only demo'));
   await page.locator('[data-ask-question="What did we do yesterday"]').click();await page.locator('[data-ask-calendar]').click();await page.locator('#wos-calendar-workspace').waitFor({state:'attached'});assert.equal(await page.locator('#wos-ask-panel').count(),0);
   await page.getByRole('button',{name:'Open Ask WholesaleOS',exact:true}).click();await page.locator('[data-ask-status]').filter({hasText:'Recorded snapshot loaded'}).waitFor();await ask(view.records[0].ref);await page.locator('[data-ask-record]').click();await page.locator('.td-card').waitFor();assert.equal(await page.locator('#wos-ask-panel').count(),0,'existing deal workspace opens without a write');
   await page.getByRole('button',{name:'Open Ask WholesaleOS',exact:true}).click();await page.locator('[data-ask-status]').filter({hasText:'Recorded snapshot loaded'}).waitFor();await page.keyboard.press('Escape');await page.locator('#wos-ask-panel').waitFor({state:'detached',timeout:3000});
   await page.getByRole('button',{name:'Open Ask WholesaleOS',exact:true}).click();await page.locator('[data-ask-status]').filter({hasText:'Recorded snapshot loaded'}).waitFor();await page.locator('[data-ask-close]').click();await page.locator('#wos-ask-panel').waitFor({state:'detached',timeout:3000});
  }
  await page.getByRole('button',{name:'Open Ask WholesaleOS',exact:true}).click();await page.locator('[data-ask-status]').filter({hasText:'Recorded snapshot loaded'}).waitFor();await page.locator('[data-ask-query]').fill('SYNTHETIC PRIVATE QUESTION');
  const beforeHide=reads;await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));assert.equal(await page.locator('#wos-ask-panel').count(),0);assert.equal(reads,beforeHide);
  await page.getByRole('button',{name:'Open Ask WholesaleOS',exact:true}).click();await page.locator('[data-ask-status]').filter({hasText:'Recorded snapshot loaded'}).waitFor();assert.equal(await page.locator('[data-ask-query]').inputValue(),'');assert.equal(reads,beforeHide+1);
  const beforeSlow=reads;hold=true;await page.getByRole('button',{name:'Reload snapshot',exact:true}).click();assert.equal(await page.locator('[data-ask-query]').isEnabled(),false);
  await page.locator('[data-ask-status]').filter({hasText:'Snapshot unavailable'}).waitFor({timeout:35000});assert.equal(reads,beforeSlow+1,'no automatic snapshot retry');assert.equal(await page.locator('[data-ask-form] button[type=submit]').isEnabled(),false);assert.equal(await page.getByRole('button',{name:'Reload snapshot',exact:true}).isEnabled(),true);
  if(release){release();release=null;}await page.getByRole('button',{name:'Reload snapshot',exact:true}).click();await page.locator('[data-ask-status]').filter({hasText:'Recorded snapshot loaded'}).waitFor();assert.equal(reads,beforeSlow+2);
  hold=true;await page.getByRole('button',{name:'Reload snapshot',exact:true}).click();await page.locator('[data-ask-status]').filter({hasText:'Loading recorded snapshot'}).waitFor();await page.evaluate(()=>showDashboardLogin('Fixture session ended'));
  if(release)release();await page.locator('#wos-ask-panel').waitFor({state:'detached',timeout:3000});assert.equal(await page.locator('#wos-ask-open').isVisible(),false);
  assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);fixture.assertUnchanged();
  console.log('Ask actual dashboard1366/400/412: no load fetch/write, explicit snapshot, local questions/context/matches, missing proof and withheld address, actual Calendar/deal navigation, voice toolbar without audio, X/Esc, phone bounds/44px and auth-late-response clearing; zero external requests, writes or console errors passed.');
 }finally{if(release)release();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
