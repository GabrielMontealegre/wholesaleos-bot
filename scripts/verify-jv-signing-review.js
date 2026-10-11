'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const express=require('express');
const {changedSeed,reviewInput}=require('../tests/jv-signing-review.test');const {context}=require('../tests/jv-workflow.test');
const workflow=require('../modules/deals/jv-workflow');const {registerReviewedDealRoutes}=require('../modules/deals/reviewed-deal-routes');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');const root=path.resolve(__dirname,'..');
async function prove({screenshots=false}={}) {
  let store=changedSeed();let writes=0;let allow=true;const app=express();app.use(express.json());
  app.use('/dashboard',express.static(path.join(root,'dashboard')));app.get('/favicon.ico',(_,res)=>res.status(204).end());
  app.get('/',(_,res)=>res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>LOCAL SYNTHETIC SIGNING REVIEW</title><link rel="stylesheet" href="/dashboard/wos-marketplace.css"><body data-wos-design="marketplace"><p>LOCAL SYNTHETIC DATA - not a real signing review</p><div id="app"><main id="content"></main></div><script>var APP={page:"todays_deals"};function renderDashboard(){return ""};function navigate(page){APP.page=page;document.getElementById("content").innerHTML=renderTodaysDeals()}</script><script src="/dashboard/wos-jv-workflow.js"></script><script src="/dashboard/wos-todays-deals.js"></script><script>navigate("todays_deals")</script>'));
  registerReviewedDealRoutes(app,{db:{readDBStrict:()=>store,writeDB:value=>{store=value;writes++;}},requireAdmin:(req,res,next)=>{if(!allow)return res.status(401).json({code:'admin_required'});req.currentUser={id:context.operatorId};next();},now:()=>context.now});
  const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});const base='http://127.0.0.1:'+server.address().port;let browser;
  const errors=[];const external=[];
  try {
    const post=body=>fetch(base+'/api/dashboard/todays-deals/deal/jv-signature-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    allow=false;assert.equal((await post(reviewInput(store))).status,401);assert.equal(writes,0);allow=true;
    assert.equal((await post({...reviewInput(store),review_version:'old'})).status,409);assert.equal(writes,0);
    assert.equal((await post({...reviewInput(store),operator_id:'forged'})).status,400);assert.equal(writes,0);
    assert.equal((await post({payload:'x'.repeat(9000)})).status,413);assert.equal(writes,0);
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
    const session=await browser.newContext();await session.route('**/*',route=>{if(route.request().url().startsWith(base+'/'))return route.continue();external.push(new URL(route.request().url()).hostname);return route.abort();});
    const page=await session.newPage();page.on('pageerror',error=>errors.push(error.message));
    for(const width of [1366,400,412]) {
      await page.setViewportSize({width,height:915});await page.goto(base);await page.locator('[data-deal-open]').click();await page.locator('[data-jv-review-form]').waitFor();
      assert.ok(await page.locator('[data-jv-command="full-package"]').isDisabled());
      assert.equal(await page.locator('[data-jv-review-form] [data-jv-check]').count(),workflow.CHECKS.jv_signed.length);
      assert.equal(await page.locator('[data-jv-review-form] input:checked').count(),0);
      assert.equal(await page.locator('[data-jv-review-form] legend').evaluate(el=>getComputedStyle(el).color),'rgb(23, 23, 23)','checklist heading must remain readable on the current light card');
      await page.locator('[data-jv-review-form] button[type=submit]').click();assert.equal(writes,0);
      assert.ok((await page.locator('[data-jv-review-form] [role=status]').innerText()).includes('Nothing was saved'));
      const size=await page.locator('[data-jv-review-form]').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,small:Array.from(el.querySelectorAll('input,button')).filter(el=>{const r=(el.type==='checkbox'?el.closest('label'):el).getBoundingClientRect();return r.height<44||r.width<44;}).length};});
      assert.ok(size.left>=0&&size.right<=width);assert.equal(size.overflow,false);assert.equal(size.small,0);
      if(screenshots){const dir=path.join(root,'docs/screens/2026-10-11-jv-signing-review');fs.mkdirSync(dir,{recursive:true});await page.locator('[data-jv-review-form]').screenshot({path:path.join(dir,'synthetic-review-'+width+'.png')});}
    }
    const before=JSON.stringify(store.reviewed_deals[0].jv_workflow_events);const body=reviewInput(store);const form=page.locator('[data-jv-review-form]');
    for(const key of ['signed_date_text','contract_source_url','agreement_source_url','source_url','evidence_text'])await form.locator('[data-jv-field="'+key+'"]').fill(body[key]);
    await form.locator('[data-jv-field="happened_at"]').fill(new Date(Date.parse(context.now)-7*3600000).toISOString().slice(0,16));
    await form.locator('button[type=submit]').click();assert.equal(writes,0,'unchecked signing reviews make no write');
    for(const checkbox of await form.locator('[data-jv-check]').all())await checkbox.check();
    const response=page.waitForResponse(r=>r.url().endsWith('/jv-signature-review')&&r.request().method()==='POST');await form.locator('button[type=submit]').click();assert.equal((await response).status(),200);
    await page.locator('[data-jv-review-form]').waitFor({state:'detached'});assert.ok(await page.locator('[data-jv-command="full-package"]').isEnabled());
    assert.equal(writes,1);assert.equal(store.reviewed_deals[0].jv_signature_reviews.length,1);assert.equal(JSON.stringify(store.reviewed_deals[0].jv_workflow_events),before);
    assert.equal(workflow.view(store.reviewed_deals[0],context.now).stage,'jv_signed');
    await page.reload();await page.locator('[data-deal-open]').click();assert.equal(await page.locator('[data-jv-review-form]').count(),0);assert.ok(await page.locator('[data-jv-command="full-package"]').isEnabled());
    const prior=JSON.stringify(store);assert.equal((await post(body)).status,409);assert.equal(JSON.stringify(store),prior);assert.equal(writes,1);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('Signing review real routes/UI: admin401, stale409, forged400, cap413; desktop1366/400/412,44px/no overflow, explicit one append, unchanged stage/history, reload and locked-to-ready evidence passed.');
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={prove};if(require.main===module)prove({screenshots:process.argv.includes('--screenshots')}).catch(error=>{console.error(error.stack);process.exitCode=1;});
