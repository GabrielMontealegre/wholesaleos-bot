'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const deals = require('../modules/deals/reviewed-deals');
const workflow = require('../modules/deals/jv-workflow');
const {registerReviewedDealRoutes} = require('../modules/deals/reviewed-deal-routes');
const {launchChromiumWithResolvedBrowser} = require('../modules/research/playwright-browser-resolver');
const {seed,context} = require('../tests/jv-workflow.test');
const root = path.resolve(__dirname,'..');
async function prove({screenshots=false}={}) {
  let store = seed(); let writes = 0; let stagePosts = 0;
  store.reviewed_deals[0].holder_contact = {name:'Private Synthetic Holder',phone:'555-999-8888',email:'private@example.test',profile_url:''};
  const app = express(); app.use(express.json());
  app.use((req,res,next)=>{if(req.path.endsWith('/jv-stage')&&req.method==='POST')stagePosts++;next();});
  app.use('/dashboard',express.static(path.join(root,'dashboard')));
  app.get('/favicon.ico',(_,res)=>res.status(204).end());
  app.get('/',(_,res)=>res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYNTHETIC JV CONTROLS</title><link rel="stylesheet" href="/dashboard/wos-marketplace.css"><body data-wos-design="marketplace"><p>LOCAL SYNTHETIC DATA - not a real JV action</p><div id="content"></div><script>var APP={page:"todays_deals"};function renderDashboard(){return ""};function navigate(page){APP.page=page;document.getElementById("content").innerHTML=renderTodaysDeals()}</script><script src="/dashboard/wos-jv-workflow.js"></script><script src="/dashboard/wos-todays-deals.js"></script><script>navigate("todays_deals")</script>'));
  registerReviewedDealRoutes(app,{db:{readDBStrict:()=>store,writeDB:value=>{store=value;writes++;}},requireAdmin:(req,res,next)=>{req.currentUser={id:context.operatorId};next();},now:()=>context.now});
  const server = await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
  const base = 'http://127.0.0.1:'+server.address().port; let browser;
  const localActionTime = new Date(Date.parse(context.now)-7*60*60*1000).toISOString().slice(0,16);
  const errors=[]; const external=[]; const measurements=[];
  try {
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
    const session=await browser.newContext();await session.route('**/*',route=>{if(route.request().url().startsWith(base+'/'))return route.continue();external.push(new URL(route.request().url()).hostname);return route.abort();});
    const page=await session.newPage();page.on('pageerror',e=>errors.push(e.message));
    for(const width of [1366,400,412]) {
      await page.setViewportSize({width,height:915});await page.goto(base);await page.locator('[data-deal-open]').click();await page.locator('[data-jv-workspace]').waitFor();
      assert.equal(await page.locator('[data-jv-stage-form]').count(),1);
      assert.equal(await page.locator('[data-deal-action="status"]').count(),0,'JV has one canonical stage-control path');
      assert.equal(await page.locator('.jvw-stages li').count(),9);
      assert.ok(await page.locator('[data-jv-command="full-package"]').isDisabled());
      const before=JSON.stringify(store);await page.locator('[data-jv-stage-form] button[type=submit]').click();
      assert.ok((await page.locator('[data-jv-stage-result]').innerText()).includes('Nothing was saved'));
      assert.equal(stagePosts,0);assert.equal(JSON.stringify(store),before);
      await page.locator('[data-jv-workspace]').scrollIntoViewIfNeeded();
      const bounds=await page.locator('[data-jv-workspace]').evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}));
      assert.equal(bounds.overflow,false);assert.ok(bounds.left>=0&&bounds.right<=width);
      const small=await page.locator('[data-jv-stage-form] input,[data-jv-stage-form] select,[data-jv-stage-form] button').evaluateAll(els=>els.filter(el=>{const r=(el.type==='checkbox'?el.closest('label'):el).getBoundingClientRect();return r.width&&r.height&&(r.height<44||r.width<44);}).length);
      assert.equal(small,0);measurements.push({width,...bounds,small});
      if(screenshots){const output=path.join(root,'docs/screens/2026-10-10-jv-stage-controls');fs.mkdirSync(output,{recursive:true});await page.locator('[data-jv-workspace]').screenshot({path:path.join(output,'synthetic-workspace-'+width+'.png')});}
    }
    const form=page.locator('[data-jv-stage-form]');
    await form.locator('[data-jv-field="happened_at"]').fill(localActionTime);await form.locator('[data-jv-field="source_url"]').fill('https://records.example.test/action');await form.locator('[data-jv-field="evidence_text"]').fill('Synthetic actual action only.');
    await form.locator('button[type=submit]').click();assert.equal(stagePosts,0,'unticked checks make no request');
    await form.locator('[data-jv-check]').check();
    await form.locator('button[type=submit]').click();await page.getByText('Current stage: Holder interested',{exact:true}).waitFor();
    assert.equal(stagePosts,1);assert.equal(writes,1);
    assert.equal(store.reviewed_deals[0].jv_workflow_events[0].operator_id,context.operatorId);
    assert.equal(store.reviewed_deals[0].jv_workflow_events[0].happened_at,context.now,'owner UTC-7 is converted once to UTC');
    const snapshot=JSON.stringify(store);
    await page.locator('[data-jv-preview-buyer]').selectOption(store.buyers[0].id);await page.locator('[data-jv-command="buyer-teaser"]').click();await page.getByText('Preview only - not sent.',{exact:true}).waitFor();
    const preview=await page.locator('[data-jv-preview-result]').innerText();assert.ok(!preview.includes(store.reviewed_deals[0].address));assert.ok(!preview.includes(store.reviewed_deals[0].holder_contact.name));
    assert.equal(JSON.stringify(store),snapshot);assert.equal(writes,1,'preview never records sent');
    await page.locator('[data-jv-stage]').selectOption('dead');assert.ok(await page.locator('[data-jv-next-fields]').isHidden());
    await page.locator('[data-jv-stage]').selectOption('buyer_teaser');assert.ok(await page.locator('[data-jv-next-fields]').isVisible());
    assert.equal(workflow.view(store.reviewed_deals[0],context.now).stage,'holder_interested');
    await page.reload();await page.locator('[data-deal-open]').click();await page.getByText('Current stage: Holder interested',{exact:true}).waitFor();
    await page.locator('[data-jv-terms] summary').click();await page.locator('[data-jv-command="terms"]').click();
    assert.ok((await page.locator('[data-jv-terms-result]').innerText()).includes('Nothing was saved'));assert.equal(writes,1);
    await page.locator('[data-jv-field="terms_source"]').fill('https://records.example.test/changed-terms');await page.locator('[data-jv-field="terms_evidence"]').fill('Synthetic changed contract price.');await page.locator('[data-jv-field="contract_price"]').fill('146000');
    const termsSaved=page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname==='/api/dashboard/todays-deals/deal');
    await page.locator('[data-jv-command="terms"]').click();assert.equal((await termsSaved).status(),200);
    await page.waitForFunction(()=>document.querySelector('[data-jv-field="contract_price"]')?.value==='146000'&&document.querySelector('[data-jv-field="terms_source"]')?.value==='');
    assert.equal(store.reviewed_deals[0].contract_price,146000);assert.equal(writes,2);
    // A stale server rejection keeps the user's entered evidence, not a success message.
    await page.route('**/jv-stage',route=>route.fulfill({status:409,json:{code:'find_deal_jv_transition_invalid'}}));
    await page.locator('[data-jv-field="happened_at"]').fill(localActionTime);await page.locator('[data-jv-field="source_url"]').fill('https://records.example.test/stale');await page.locator('[data-jv-field="evidence_text"]').fill('Evidence must remain after error.');
    await page.locator('[data-jv-check]').check();await page.locator('[data-jv-field="buyer_id"]').selectOption(store.buyers[0].id);await page.locator('[data-jv-stage-form] button[type=submit]').click();
    await page.locator('[data-jv-stage-result]').filter({hasText:'The stage changed'}).waitFor();
    assert.equal(await page.locator('[data-jv-field="evidence_text"]').inputValue(),'Evidence must remain after error.');assert.equal(writes,2);
    await page.unroute('**/jv-stage');
    for (const stage of ['buyer_teaser','buyer_interested','jv_signed','full_package','emd_at_title','assigned','closed']) {
      const activeForm=page.locator('[data-jv-stage-form]');
      assert.equal(await activeForm.locator('[data-jv-stage]').inputValue(),stage);
      await activeForm.locator('[data-jv-field="happened_at"]').fill(localActionTime);
      await activeForm.locator('[data-jv-field="source_url"]').fill('https://records.example.test/'+stage);
      await activeForm.locator('[data-jv-field="evidence_text"]').fill('Synthetic '+stage+' report.');
      for (const checkbox of await activeForm.locator('[data-jv-check]').all()) await checkbox.check();
      if(await activeForm.locator('[data-jv-field="buyer_id"]').count()) await activeForm.locator('[data-jv-field="buyer_id"]').selectOption(store.buyers[0].id);
      if(stage==='buyer_interested') await activeForm.locator('[data-jv-field="buyer_price"]').fill('165000');
      if(stage==='jv_signed') {
        await activeForm.locator('[data-jv-field="signed_date_text"]').fill('October 6, 2026');
        await activeForm.locator('[data-jv-field="contract_source_url"]').fill('https://records.example.test/contract');
        await activeForm.locator('[data-jv-field="agreement_source_url"]').fill('https://records.example.test/agreement');
      }
      await activeForm.locator('button[type=submit]').click();
      await page.getByText('Current stage: '+workflow.LABELS[stage],{exact:true}).waitFor();
      if(stage==='jv_signed') {
        assert.ok(await page.locator('[data-jv-command="full-package"]').isEnabled());
        const snapshot=JSON.stringify(store);await page.locator('[data-jv-preview-buyer]').selectOption(store.buyers[0].id);
        await page.locator('[data-jv-command="full-package"]').click();await page.getByText('Property: '+store.reviewed_deals[0].address,{exact:true}).waitFor();
        assert.equal(JSON.stringify(store),snapshot,'signed package preview remains read-only');
      }
    }
    assert.equal(writes,9);assert.equal(stagePosts,8);assert.equal(store.reviewed_deals[0].jv_workflow_events.length,8);
    assert.equal(await page.locator('[data-jv-stage-form]').count(),0,'closed deals cannot be advanced');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('JV stage UI: canonical stages, explicit guarded save, source-backed terms, blind GET-only preview, reload history, stale error preservation; desktop/400/412:',JSON.stringify(measurements));
  } finally {if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={prove};
if(require.main===module)prove({screenshots:process.argv.includes('--screenshots')}).catch(e=>{console.error(e.stack);process.exitCode=1;});
