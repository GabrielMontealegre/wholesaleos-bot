'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui'),{launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver'),sample=require('./helpers/buyer-match-card-words-fixture');
async function prove(){
 const fixture=createFixtureApp(),server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port,frozen=JSON.stringify(sample);let browser;
 const dir=process.env.WOS_BUYER_MATCH_WORDS_PROOF_DIR;if(dir)fs.mkdirSync(dir,{recursive:true});
 try{browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
  for(const width of [1366,400,412]){const page=await browser.newPage({viewport:{width,height:width===1366?768:915}}),writes=[],errors=[],external=[];page.on('pageerror',e=>errors.push(e.name));
   await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(req.method()!=='GET'){writes.push(u.pathname);return route.abort();}if(u.pathname==='/helper/status')return route.fulfill({json:{paired:false}});if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});if(u.origin!==base){external.push(u.hostname);return route.abort();}if(u.pathname==='/api/dashboard/buyers-found')return route.fulfill({json:sample.payload});if(u.pathname==='/api/dashboard/buyers-found/fixture-buyer/email')return route.fulfill({json:{configured:false,messages:[]}});return route.continue();});
   await page.goto(base+'/dashboard/?workspace=buyers');await page.getByRole('button',{name:'Open buyer',exact:true}).click();await page.getByRole('tab',{name:'Matching deals',exact:true}).click();await page.locator('.bf-deal-row').nth(2).waitFor();
   const buttons=page.locator('[data-buyer-deal]');assert.deepEqual(await buttons.allTextContents(),['Open deal - Example City, FL, 33000','Open deal','Open deal - Example City, FL, 33000']);
   assert.deepEqual(await buttons.evaluateAll(els=>els.map(e=>e.dataset.buyerDeal)),['fixture-deal','unready-deal','near-deal']);
   const rows=await page.locator('.bf-deal-row').allTextContents();assert(rows.every(text=>!['WOS-FL-1031','WOS-FL-1032','WOS-FL-1033'].some(ref=>text.includes(ref))));assert(rows[0].includes('Source note mentions BUY-7654 <img src=x>'));assert.equal(await page.locator('img[src=x]').count(),0);
   assert.equal(await page.locator('[data-buyer-email-deal]').count(),2);assert(!(await page.locator('[data-buyer-email-deal="fixture-deal"]').isDisabled()));assert(await page.locator('[data-buyer-email-deal="unready-deal"]').isDisabled());assert.equal(await page.locator('[data-buyer-email-deal]:checked').count(),0);
   assert.equal(await page.locator('.bf-deal-row').nth(2).locator('input').count(),0,'near misses are never email selections');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(dir){await page.mouse.move(0,0);await page.screenshot({path:path.join(dir,'buyer-matches-'+width+'.png')});}
   await page.locator('[data-buyer-deal="fixture-deal"]').click();await page.locator('.td-open-view[data-deal-id="fixture-deal"]').waitFor();assert((await page.locator('.td-open-view .td-detail').innerText()).includes('WOS-FL-1031'),'full record identity retained');await page.getByRole('button',{name:'Back to results',exact:true}).click();
   assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
  }fixture.assertUnchanged();assert.equal(JSON.stringify(sample),frozen);console.log('buyer-match-card-words:actual1366/400/412 plain labels/exactIDs/OpenBack/fullrecordrefs/emptylocation/sourcecodepreservation/escaping/availabilityselectionguards/no writes/external/errors/overflow passed');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}prove().catch(e=>{console.error(e.stack);process.exitCode=1;});
