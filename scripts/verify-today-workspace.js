'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('./verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
async function prove({screenshots=false}={}){
  const fixture=createFixtureApp({todayProof:true,seedLead:true}),root=path.resolve(__dirname,'..');
  const server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
  let browser;const errors=[],external=[];let reads=0;
  try{
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
    const context=await browser.newContext();await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith('https://fonts.googleapis.com/'))return route.fulfill({contentType:'text/css',body:''});if(new URL(u).pathname==='/helper/status')return route.fulfill({json:{paired:false}});if(u.startsWith(base+'/')){if(new URL(u).pathname==='/api/dashboard/today-workspace')reads++;return route.continue();}external.push(new URL(u).hostname);return route.abort();});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    for(const size of [{width:1366,height:768},{width:1920,height:1080},{width:400,height:915},{width:412,height:915}]){
      await page.setViewportSize(size);await page.goto(base+'/dashboard/');await page.locator('[data-today-action]').first().waitFor();
      assert.equal(await page.locator('#content').evaluate(e=>e.firstElementChild.id),'wos-today-workspace');assert.equal(await page.getByRole('heading',{name:'Today',exact:true}).count(),1);assert.equal(await page.locator('.today-kpis button').count(),4);assert.equal(await page.locator('[data-today-action]').count(),5);assert.equal(await page.locator('[data-today-deal]').count(),1);assert.equal(await page.locator('#wos-todays-deals').count(),0);
      for(const key of ['replies','approvals','followups','deadlines']){const b=page.locator('[data-today-filter="'+key+'"]');await b.click();assert.equal(await b.getAttribute('aria-pressed'),'true');await b.click();assert.equal(await b.getAttribute('aria-pressed'),'false');}
      const before=reads;await page.locator('[data-today-refresh]').click();await page.waitForFunction(()=>!document.querySelector('[data-today-refresh]')?.disabled);assert.ok(reads>before,'Refresh makes only a read');
      await page.locator('[data-today-action^="conversation:"]').click();await page.getByRole('heading',{name:'Recorded conversation',exact:true}).waitFor();assert.ok((await page.locator('#today-conversation-dialog').innerText()).includes('Fixture reply'));await page.getByRole('button',{name:'Close conversation',exact:true}).click();await page.locator('#today-conversation-dialog').waitFor({state:'detached'});assert.equal(await page.locator('#today-conversation-dialog').count(),0);
      await page.locator('[data-today-action^="buyer:"]').click();await page.locator('.bf-card[data-id="fixture-pending-buyer"]').waitFor();assert.ok((await page.locator('#content').innerText()).includes('BUY-0020'));await page.evaluate(()=>navigate('dashboard',null));await page.locator('[data-today-action]').first().waitFor();
      const targets=await page.locator('[data-today-action]').evaluateAll(rows=>rows.filter(b=>!b.dataset.todayAction.startsWith('conversation:')&&!b.dataset.todayAction.startsWith('buyer:')).map(b=>b.dataset.todayAction));
      for(const target of targets){await page.locator('[data-today-action="'+target+'"]').click();await page.locator('.td-open-view').waitFor();await page.locator('[data-deal-back]').click();await page.evaluate(()=>navigate('dashboard',null));await page.locator('[data-today-action]').first().waitFor();}
      await page.locator('[data-today-deal]').click();await page.locator('.td-open-view').waitFor();await page.locator('[data-deal-back]').click();await page.evaluate(()=>navigate('dashboard',null));await page.locator('[data-today-action]').first().waitFor();
      const body=await page.locator('#wos-today-workspace').innerText();assert.ok(!/\d{4}-\d{2}-\d{2}T|not supplied|undefined|NaN/.test(body));assert.ok(!body.includes('Ready to offer: YES'));assert.equal(await page.locator('#wos-today-workspace script').count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const buttons=await page.locator('#wos-today-workspace button').evaluateAll(rows=>rows.map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,width:innerWidth};}));for(const b of buttons){assert.ok(b.left>=0&&b.right<=b.width&&b.height>=44);}
      if(screenshots){await page.evaluate(()=>{scrollTo(0,0);document.querySelector('.main')?.scrollTo(0,0);document.getElementById('content')?.scrollTo(0,0);});const dir=path.join(root,'docs/screens/2026-10-13-today-workspace');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'synthetic-today-'+size.width+'.png')});}
      await page.locator('[data-today-history]').first().click();await page.getByRole('heading',{name:'Activity',exact:true}).waitFor();
      await page.evaluate(()=>navigate('dashboard',null));await page.locator('[data-today-action]').first().waitFor();await page.evaluate(()=>render());await page.locator('[data-today-action]').first().waitFor();await page.waitForTimeout(3200);assert.equal(await page.locator('#wos-today-workspace').count(),1,'hydration/mount timer cannot duplicate Today');assert.equal(await page.locator('#content').evaluate(e=>e.firstElementChild.id),'wos-today-workspace');
    }
    await context.route('**/api/dashboard/today-workspace',route=>route.fulfill({status:503,json:{code:'today_store_unavailable'}}));await page.locator('[data-today-refresh]').click();await page.getByText('Today is unavailable. Check your login, then refresh.',{exact:true}).waitFor();assert.equal(await page.locator('[data-today-action]').count(),0,'failed read cannot present cached work as current');
    fixture.assertUnchanged();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('Today full dashboard: five real fixture actions, buyer/deal/conversation openings, four filters/GET refresh/activity, retained source desk, mount stability, error truth, human times,1366x768/1920x1080/400/412x915,44px/no overflow,zero writes/external calls/errors passed.');
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={prove};if(require.main===module)prove({screenshots:process.argv.includes('--screenshots')}).catch(e=>{console.error(e.stack);process.exitCode=1;});
