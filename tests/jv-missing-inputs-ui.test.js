'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const deals=require('../modules/deals/reviewed-deals');
const {seed,context:clock}=require('./jv-workflow.test');
async function run(){
 const fixture=createFixtureApp(),store=seed(),original=JSON.stringify(store),writes=[],external=[],errors=[];
 const known=deals.list(store,{now:clock.now,jv:true});
 const missingStore={...store,reviewed_deals:store.reviewed_deals.map(d=>({...d,asking_price:null,comps:[],repair_estimate:null}))};
 const missing=deals.list(missingStore,{now:clock.now,jv:true});
 assert.equal(missing.items.length,1);assert.equal(missing.items[0].evaluation.value.range,null);
 let mode='missing',browser;
 const server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
 try{
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
  const context=await browser.newContext();await context.route('**/*',route=>{
   const req=route.request(),url=new URL(req.url());
   if(!['GET','HEAD'].includes(req.method())){writes.push(req.method());return route.abort();}
   if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
   if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
   if(url.origin!==base){external.push(url.hostname);return route.abort();}
   if(url.pathname==='/api/dashboard/todays-deals'){
    if(mode==='401')return route.fulfill({status:401,json:{error:'unauthorized'}});
    return route.fulfill({json:mode==='known'?known:mode==='duplicate'?{...missing,items:[missing.items[0],missing.items[0]]}:missing});
   }
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.name));
  async function open(){await page.evaluate(()=>navigate('jv',null));await page.locator('[data-deal-open]').first().waitFor();await page.locator('[data-deal-open]').first().click();await page.locator('.td-open-view .jv-desk').first().waitFor();}
  async function clear(){await page.locator('.td-open-view .td-detail > details').first().evaluate(el=>{el.open=false;document.activeElement.blur();});}
  async function refused(){assert.equal(await page.locator('.td-open-view .td-detail > details').first().evaluate(el=>el.open),false);}
  for(const width of [1366,400,412]){
   mode='missing';await page.setViewportSize({width,height:915});await page.goto(base+'/dashboard/');await page.waitForFunction(()=>window.APP?.unlocked===true);await open();
   const workspace=page.locator('.td-open-view .jv-desk');
   assert((await workspace.innerText()).includes('Missing here: reviewed value evidence'));
   assert.equal(await workspace.locator('[data-jv-money-review]').count(),1);
   assert(!(await workspace.innerText()).includes('Not established'));
   if(process.env.WOS_JV_INPUTS_PROOF_DIR){fs.mkdirSync(process.env.WOS_JV_INPUTS_PROOF_DIR,{recursive:true});await workspace.locator('.jv-money').scrollIntoViewIfNeeded();await page.mouse.move(0,0);await page.screenshot({path:path.join(process.env.WOS_JV_INPUTS_PROOF_DIR,'synthetic-missing-'+width+'.png')});}
   await clear();await workspace.getByRole('button',{name:'Review recorded deal inputs',exact:true}).click();
   assert.equal(await page.locator('.td-open-view .td-detail > details').evaluate(el=>el.open&&document.activeElement===el.querySelector(':scope > summary')),true);
   assert.equal(await page.locator('.td-open-view [data-review-comps]').isChecked(),false);
   assert(!(await page.locator('.td-open-view h3').first().innerText()).includes(store.reviewed_deals[0].address));
   const bounds=await workspace.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,overflow:el.scrollWidth>el.clientWidth+1};});
   assert(bounds.left>=0&&bounds.right<=width&&!bounds.overflow);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await clear();await workspace.locator('[data-jv-money-review]').evaluate(el=>{el.dataset.jvMoneyReview='forged';el.click();});await refused();
   await workspace.locator('[data-jv-money-review]').evaluate(el=>el.dataset.jvMoneyReview='deal');
   await page.evaluate(()=>{APP.currentUser.role='viewer';document.querySelector('[data-jv-money-review]').click();});await refused();
   await page.evaluate(()=>{APP.currentUser.role='admin';APP.unlocked=false;document.querySelector('[data-jv-money-review]').click();});await refused();
   await page.evaluate(()=>{APP.unlocked=true;document.querySelector('.td-open-view').dataset.dealId='wrong';document.querySelector('[data-jv-money-review]').click();});await refused();
  }
  mode='duplicate';await page.goto(base+'/dashboard/');await page.waitForFunction(()=>window.APP?.unlocked===true);await open();await clear();await page.locator('[data-jv-money-review]').first().evaluate(el=>el.click());await refused();
  mode='known';await page.goto(base+'/dashboard/');await page.waitForFunction(()=>window.APP?.unlocked===true);await open();assert.equal(await page.locator('[data-jv-money-review]').count(),0);
  await page.locator('.jv-desk').evaluate(el=>{const b=document.createElement('button');b.dataset.jvMoneyReview='deal';el.appendChild(b);});await clear();await page.locator('[data-jv-money-review]').evaluate(el=>el.click());await refused();
  mode='401';await page.evaluate(()=>navigate('jv',null));await page.waitForFunction(()=>!document.querySelector('[data-jv-money-review]')&&!document.querySelector('.td-card'));
  fixture.assertUnchanged();assert.equal(JSON.stringify(store),original);assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('JV missing inputs actual1366/400/412: current exact evidence focus, known/forged/duplicate/actor/401/unsigned/geometry, no consent/writes/external requests passed');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(JSON.stringify({test:'jv-missing-inputs',assertion:error.name==='AssertionError',location:String(error.stack).match(/jv-missing-inputs-ui\.test\.js:\d+:\d+/)?.[0]||null,messageCode:/Timeout/.test(error.name)?'fixture_timeout':'test_failed'}));process.exitCode=1;});
