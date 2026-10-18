'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const workspace=require('../modules/records/approval-workspace'),sample=require('./approval-workspace.test');
async function prove(){
 let store=sample.fixture(),deny=false;const fixture=createFixtureApp(),server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
 let browser,reads=0;const writes=[],external=[],errors=[];
 try{browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;const context=await browser.newContext();
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(!['GET','HEAD'].includes(req.method())){writes.push(req.method());return route.abort();}if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});if(url.origin!==base){external.push(url.hostname);return route.abort();}if(url.pathname==='/api/dashboard/error-tracking-config')return route.fulfill({json:{enabled:false}});if(url.pathname==='/api/dashboard/approvals'){reads++;return route.fulfill({status:deny?401:200,json:deny?{code:'dashboard_login_required'}:workspace.build(store,{now:sample.now})});}return route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1366,400,412]){store=sample.fixture();await page.setViewportSize({width,height:width===1366?768:915});await page.goto(base+'/dashboard/');await page.locator('.marketplace-topnav').waitFor({state:'attached'});await page.evaluate(()=>navigate('approvals',null));await page.locator('[data-approval-brief]').waitFor();
   assert.ok((await page.locator('[data-approval-brief]').innerText()).includes('Tampa'));assert.ok((await page.locator('[data-approval-brief]').innerText()).includes('proof of a completed purchase'));
   assert.equal(await page.locator('[data-approval-review]').getAttribute('open'),null);assert.ok(await page.locator('[data-approval-reviewed]').isDisabled());
   const readBefore=reads;await page.locator('[data-approval-skip]').click();await page.getByRole('button',{name:'Show skipped',exact:true}).waitFor();assert.equal(reads,readBefore,'skip does not fetch or save');assert.equal(await page.locator('.approval-card').count(),0);assert.ok((await page.locator('#wos-approvals').innerText()).includes('still pending'));assert.equal(store.buyers[0].assistant_find.approval,'pending');
   await page.locator('[data-approval-show-skipped]').click();await page.locator('.approval-card').waitFor();assert.ok(await page.locator('[data-approval-reviewed]').isDisabled());
   await page.locator('[data-approval-decision=approve]').click();assert.ok((await page.locator('[data-approval-error]').innerText()).includes('Nothing was saved'));assert.deepEqual(writes,[]);
   await page.locator('[data-approval-skip]').click();store={...store,buyers:store.buyers.map(b=>({...b,assistant_find:{...b.assistant_find,what_they_buy:'Updated source report'}}))};await page.locator('[data-approval-refresh]').click();await page.locator('.approval-card').waitFor();assert.equal(await page.locator('[data-approval-show-skipped]').count(),0,'changed row requires fresh review');
   await page.locator('[data-approval-group=deals]').click();await page.locator('[data-approval-brief]').waitFor();assert.ok((await page.locator('[data-approval-brief]').innerText()).includes('Value after repairs not established'));assert.ok(!(await page.locator('.approval-card header').innerText()).includes(store.reviewed_deals[0].address));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.ok((await page.locator('[data-approval-skip]').boundingBox()).height>=44);await page.mouse.move(0,0);await page.keyboard.press('Escape');
   if(process.argv.includes('--screenshots')){const dir=path.join(__dirname,'../docs/screens/2026-10-18-366-e');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'synthetic-approvals-'+width+'.png')});}
  }
  deny=true;await page.locator('[data-approval-refresh]').click();await page.getByText('Approvals unavailable. Check your login and refresh.',{exact:true}).waitFor({state:'attached'});assert.equal(await page.locator('.approval-card').count(),0);
  assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);fixture.assertUnchanged();console.log('Approval card actual dashboard1366/400/412: visible briefs, source review still required, local skip/show/version reset, unchanged pending records, unknown value/JV privacy, reachable controls, auth clearing and zero writes/external requests passed.');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
prove().catch(e=>{console.error(e);process.exitCode=1;});
