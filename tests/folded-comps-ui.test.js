'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const sample=require('./helpers/folded-comps-fixture');
async function prove(){
 const fixture=createFixtureApp(),server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
 const dir=process.env.WOS_FOLDED_COMPS_PROOF_DIR;if(dir)fs.mkdirSync(dir,{recursive:true});let browser;
 try{browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
  for(const width of [1366,400,412]){
   const page=await browser.newPage({viewport:{width,height:width===1366?768:915}}),writes=[],errors=[],external=[];let payload=sample.build(),frozen=JSON.stringify(payload),reads=0;
   page.on('pageerror',e=>errors.push(e.name));
   await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(req.method()==='GET'&&u.origin==='http://127.0.0.1:8797'&&u.pathname==='/helper/status')return route.fulfill({json:{paired:false}});if(u.origin!==base){if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});external.push(u.hostname+':'+u.port+u.pathname);return route.abort();}if(req.method()!=='GET'){writes.push({method:req.method(),path:u.pathname,body:req.postDataJSON()});return route.fulfill({status:409,json:{error:'find_deal_comp_changed'}});}if(u.pathname==='/helper/status')return route.fulfill({json:{paired:false}});if(u.pathname==='/api/dashboard/todays-deals'){reads++;return route.fulfill({json:payload});}return route.continue();});
   await page.goto(base+'/dashboard/');await page.evaluate(()=>navigate('todays_deals',null));await page.locator('[data-deal-open]').click();await page.waitForFunction(()=>document.querySelector('.td-open-view')&&!document.querySelector('#wos-todays-deals[aria-busy="true"]'));
   const fold=page.locator('.td-open-view .td-comps'),rows=fold.locator('[data-comp-review-row]');
   assert.equal(await fold.getAttribute('open'),null);assert.equal(await fold.locator('tbody tr').count(),3);assert.equal(await rows.count(),3);assert.equal(await fold.locator('input:visible').count(),0);assert.equal(await page.locator('[data-review-comps]').isChecked(),false);
   if(dir)await page.screenshot({path:path.join(dir,'folded-'+width+'.png')});
   const before=reads;await fold.locator(':scope > summary').focus();await page.keyboard.press('Enter');assert(await fold.locator('table').isVisible());assert.equal(await fold.locator('[data-comp-exclusion-form]:visible').count(),0);
   const row=rows.first(),trigger=row.locator('[data-comp-exclusion-open]'),input=row.locator('input');await trigger.click();assert.equal(await trigger.getAttribute('aria-expanded'),'true');assert(await input.isVisible());assert(await input.evaluate(el=>el===document.activeElement));assert.equal(await rows.nth(1).locator('input').isVisible(),false);
   await row.getByRole('button',{name:'Confirm exclusion',exact:true}).click();assert((await page.locator('[data-deal-error]').innerText()).includes('written reason'));assert.equal(writes.length,0);
   await input.fill('Synthetic reason <img src=x>');await row.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await input.inputValue(),'');assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert(await trigger.evaluate(el=>el===document.activeElement));assert.equal(await input.isVisible(),false);assert.equal(reads,before);assert.equal(writes.length,0);
   await trigger.click();assert.equal(await input.inputValue(),'');await input.fill('Synthetic recorded exclusion reason.');
   assert.equal(await trigger.evaluate(el=>el.getBoundingClientRect().height>=44),true);assert.equal(await row.getByRole('button',{name:'Confirm exclusion',exact:true}).evaluate(el=>el.getBoundingClientRect().height>=44),true);
   if(dir){await fold.locator(':scope > summary').scrollIntoViewIfNeeded();await page.mouse.move(0,0);await page.screenshot({path:path.join(dir,'expanded-'+width+'.png')});}
   await row.getByRole('button',{name:'Confirm exclusion',exact:true}).click();await page.getByRole('alert').filter({hasText:'Not saved.'}).waitFor();
   assert.deepEqual(writes,[{method:'PATCH',path:'/api/dashboard/todays-deals/fixture-deal',body:{action:'exclude_comp',reason:'Synthetic recorded exclusion reason.',evidence_url:payload.items[0].source_url,comp_index:0,comp_key:payload.items[0].comp_review_keys[0]}}]);assert.equal(reads,before,'a rejected save never refetches or retries');
   assert.equal(JSON.stringify(payload),frozen);
   for(const scenario of ['missing-key','recorded-exclusion','empty']){
    payload=sample.build();const d=payload.items[0];
    if(scenario==='missing-key')d.comp_review_keys=[];
    if(scenario==='recorded-exclusion')d.comp_exclusions=[{comp_key:d.comp_review_keys[0],reason:'Synthetic recorded reason <img src=x>'}];
    if(scenario==='empty'){d.comps=[];d.comp_review_keys=[];}
    const beforeCase=JSON.stringify(payload);await page.goto(base+'/dashboard/');await page.evaluate(()=>navigate('todays_deals',null));await page.locator('[data-deal-open]').click();await page.waitForFunction(()=>document.querySelector('.td-open-view')&&!document.querySelector('#wos-todays-deals[aria-busy="true"]'));await page.locator('.td-comps > summary').click();
    if(scenario==='missing-key'){assert.equal(await page.locator('[data-comp-exclusion-open]:disabled').count(),3);assert.equal(await page.locator('[data-comp-exclusion-form]:visible').count(),0);}
    if(scenario==='recorded-exclusion'){assert.equal(await page.locator('[data-comp-review-row]').first().locator('input,button').count(),0);assert((await page.locator('[data-comp-review-row]').first().innerText()).includes('Excluded: Synthetic recorded reason <img src=x>'));assert.equal(await page.locator('img[src=x]').count(),0);}
    if(scenario==='empty'){assert.equal(await page.locator('.td-comps tbody tr').count(),0);assert.equal(await page.locator('[data-comp-review-row]').count(),0);assert.equal(await page.locator('.td-comps > summary').innerText(),'Our comps (0)');}
    assert.equal(JSON.stringify(payload),beforeCase);assert.equal(writes.length,1);assert.equal(await page.locator('[data-review-comps]').isChecked(),false);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
  }
  fixture.assertUnchanged();console.log('Folded comps actual1366/400/412: default folded/source rows intact/explicit row-only reason/cancel-clear-focus/44px/blank no-write/exact existing PATCH/stale failure terminal/no extra reads/immutable/no errors or overflow passed');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
prove().catch(e=>{console.error(e.stack);process.exitCode=1;});
