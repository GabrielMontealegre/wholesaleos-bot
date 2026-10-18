'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('./verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const deals=require('../modules/deals/reviewed-deals'),workflow=require('../modules/deals/jv-workflow');
const {seed,input,context:actionContext}=require('../tests/jv-workflow.test');
async function prove({screenshots=false}={}) {
 const fixture=createFixtureApp(),server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;let browser;
 let store=seed();const ready=store.reviewed_deals[0];
 store=workflow.record(store,'deal',input('holder_interested'),actionContext,deals.evaluate(ready,store.buyers,actionContext.now));
 store={...store,reviewed_deals:[store.reviewed_deals[0],{...ready,id:'near',approval:'pending'},{...ready,id:'ready'}]};
 const payload=deals.list(store,{now:actionContext.now,jv:true}),frozen=JSON.stringify(store),writes=[],external=[],errors=[];
 try {
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
  const context=await browser.newContext();await context.route('**/*',route=>{
   const request=route.request(),url=request.url();if(!['GET','HEAD'].includes(request.method())){writes.push(request.method());return route.abort();}
   if(url.startsWith(base+'/api/dashboard/todays-deals'))return route.fulfill({json:payload});
   if(url.startsWith('https://fonts.googleapis.com/'))return route.fulfill({contentType:'text/css',body:''});
   if(new URL(url).pathname==='/helper/status')return route.fulfill({json:{paired:false}});
   if(url.startsWith(base+'/'))return route.continue();external.push(new URL(url).hostname);return route.abort();
  });const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1366,400,412]) {
   await page.setViewportSize({width,height:915});await page.goto(base+'/dashboard/');await page.evaluate(()=>navigate('jv',null));
   await page.locator('[data-jv-section=active] .td-card').waitFor();
   for(const section of ['active','ready','near_miss'])assert.equal(await page.locator('[data-jv-section='+section+'] .td-card').count(),1);
   await page.locator('[data-jv-section=active] [data-deal-open]').click();await page.locator('.td-open-view .jv-desk').waitFor();
   assert.equal(await page.locator('.td-open-view .jvw-stages li').count(),9);
   assert.ok((await page.locator('.td-open-view .jv-now').innerText()).includes('Holder interested'));
   assert.equal(await page.locator('.td-open-view .jv-next-message>.td-actions button:disabled').count(),3);
   assert.equal(await page.locator('.td-open-view [data-deal-draft]').count(),1,'one canonical saved-draft control, not two divergent composers');
   await page.locator('.td-open-view [data-deal-draft]').fill('SYNTHETIC UNSENT DRAFT');
   await page.locator('.td-open-view .jv-next-message>.td-actions button').first().dispatchEvent('click');
   assert.equal(await page.locator('.td-open-view [data-deal-draft]').inputValue(),'SYNTHETIC UNSENT DRAFT');
   assert.ok(!(await page.locator('.td-open-view h3').first().innerText()).includes(ready.address));
   const geometry=await page.locator('.td-open-view .jv-desk').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,overflow:el.scrollWidth>el.clientWidth+1};});
   assert.ok(geometry.left>=0&&geometry.right<=width&&!geometry.overflow);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(screenshots){await page.mouse.move(0,0);await page.keyboard.press('Escape');await page.locator('[data-deal-draft]').evaluate(el=>el.blur());const dir=path.join(__dirname,'../docs/screens/2026-10-12-jv-desk');fs.mkdirSync(dir,{recursive:true});await page.locator('.td-open-view .jv-desk').screenshot({path:path.join(dir,'synthetic-jv-desk-'+width+'.png')});}
  }
  fixture.assertUnchanged();assert.equal(JSON.stringify(store),frozen);assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('JV full-index1366/400/412: exclusive sections, active deal opens, nine canonical stages, signed-address guard, inert Send, mobile geometry, zero writes/external requests passed.');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={prove};if(require.main===module)prove({screenshots:process.argv.includes('--screenshots')}).catch(e=>{console.error(e.stack);process.exitCode=1;});
