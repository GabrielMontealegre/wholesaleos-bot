'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express');
const {registerLeadTriageRoutes}=require('../modules/leads/triage-routes');
const {seed,today}=require('../tests/lead-triage.test');
const {createFixtureApp}=require('./verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const root=path.resolve(__dirname,'..');
async function prove({screenshots=false}={}){
  let allowed=true,broken=false,reads=0;const bytes=JSON.stringify(seed);const fixture=createFixtureApp();const app=express();
  registerLeadTriageRoutes(app,{db:{readDBStrict:()=>{reads++;if(broken)throw Error('PRIVATE DATABASE SENTINEL');return seed;}},requireAdmin:(_,res,next)=>allowed?next():res.status(401).json({code:'admin_required'}),now:()=>today+'T12:00:00.000Z'});
  app.use(fixture.app);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port;let browser;const errors=[],external=[],writes=[];
  try{
    allowed=false;assert.equal((await fetch(base+'/api/dashboard/lead-triage')).status,401);assert.equal((await fetch(base+'/api/leads/needs-comps')).status,401);assert.equal(reads,0);allowed=true;
    for(const limit of ['0','21','1.5','-1','x'])assert.equal((await fetch(base+'/api/leads/needs-comps?limit='+limit)).status,400);
    const response=await fetch(base+'/api/leads/needs-comps?limit=1');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual((await response.json()).items,[{id:'LEAD-1'}]);
    broken=true;const unavailable=await fetch(base+'/api/dashboard/lead-triage');assert.equal(unavailable.status,503);assert.deepEqual(await unavailable.json(),{code:'lead_triage_unavailable'});broken=false;
    assert.equal((await fetch(base+'/api/dashboard/lead-triage',{method:'POST'})).status,405);
    const serverSource=fs.readFileSync(path.join(root,'server.js'),'utf8');assert.ok(serverSource.indexOf('registerLeadTriageRoutes(app')<serverSource.indexOf("app.get('/api/leads/:id'"),'named list route must precede generic lead id');
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;const context=await browser.newContext();
    await context.route('**/*',route=>{const req=route.request(),url=req.url();if(url.startsWith('https://fonts.googleapis.com/'))return route.fulfill({contentType:'text/css',body:''});if(new URL(url).pathname==='/helper/status')return route.fulfill({json:{paired:false}});if(!url.startsWith(base+'/')){external.push(new URL(url).hostname);return route.abort();}if(!['GET','HEAD'].includes(req.method()))writes.push(req.method());return route.continue();});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    for(const width of [1366,400,412]){
      await page.setViewportSize({width,height:915});await page.goto(base+'/dashboard/');await page.locator('.marketplace-topnav').waitFor({state:'attached'});
      await page.evaluate(()=>navigate('leads',null));await page.locator('#lead-triage-diagnostic').waitFor();const before=reads;
      await page.waitForTimeout(100);assert.equal(reads,before,'opening Leads does not run triage');
      await page.locator('[data-triage-read]').click();await page.locator('.lt-counts').waitFor();assert.deepEqual(await page.locator('.lt-counts dd').allTextContents(),['2','2','3']);
      assert.ok((await page.locator('#lead-triage-diagnostic').innerText()).includes('proposed new archives: 2'));assert.equal(await page.locator('#lead-triage-diagnostic button:not(.wos-help-button)').count(),1,'only diagnostic action; help buttons are read-only');
      const geometry=await page.locator('#lead-triage-diagnostic').evaluate(el=>{const r=el.getBoundingClientRect(),b=el.querySelector('button').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,tap:b.height};});assert.ok(geometry.left>=0&&geometry.right<=width);assert.ok(geometry.tap>=44);
      if(screenshots){const dir=path.join(root,'docs/screens/2026-10-12-lead-triage');fs.mkdirSync(dir,{recursive:true});await page.locator('#lead-triage-diagnostic').screenshot({path:path.join(dir,'synthetic-triage-'+width+'.png')});}
    }
    allowed=false;await page.locator('[data-triage-read]').click();await page.getByText('Triage unavailable. Check your admin session.',{exact:true}).waitFor({state:'attached'});assert.equal(await page.locator('.lt-counts').count(),0,'expired auth cannot show stale success');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);assert.equal(JSON.stringify(seed),bytes);
    // The only rejected write was our explicit negative POST, not the browser.
    console.log('Triage actual admin routes/full dashboard:401/400/503/no-store, IDs only, no implicit reads, reconciled 2/2/3,1366/400/412,44px,expired auth clears counts,zero browser writes/external calls,store unchanged passed.');
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={prove};if(require.main===module)prove({screenshots:process.argv.includes('--screenshots')}).catch(e=>{console.error(e.stack);process.exitCode=1;});
