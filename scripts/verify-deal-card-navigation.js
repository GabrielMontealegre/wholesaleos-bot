'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('./verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const deals=require('../modules/deals/reviewed-deals');
const {fixture,now}=require('../tests/reviewed-deals.test');
function payload(patch={},approved=true,buyerApproved=true){
 const buyer={id:'fixture-buyer',name:'Fixture Investor',assistant_find:{approval:buyerApproved?'approved':'pending',classification:'end_buyer',states:['FL'],areas:['Tampa'],buy_box:{types:['house'],pct_arv:'75%',price_max:200000}}};
 let store=deals.ingest({buyers:[buyer],leads:[]},[deals.validate({...fixture(),holder_contact:{name:'SYNTHETIC HOLDER'},...patch},now)],{now,operatorId:'fixture-admin',createId:()=> 'fixture-deal'}).store;
 if(approved)store=deals.update(store,'fixture-deal',{action:'approve',reviewed_comps:true},{now,operatorId:'fixture-admin'});
 return deals.list(store,{now,hidden:true});
}
async function prove({screenshots=false}={}){
 const app=createFixtureApp();const server=await new Promise(resolve=>{const s=app.app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port;let browser,current;const writes=[],external=[],errors=[];
 try{
  current=payload();assert.equal(current.items[0].evaluation.matches[0].estimated_spread.low,6625);
  assert.throws(()=>payload({holder_contact:{name:'<script>SYNTHETIC HOLDER</script>'}}),/find_deal_field_invalid/,'The real writer rejects HTML before storage');
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;const context=await browser.newContext();
  await context.route('**/*',route=>{const req=route.request(),url=req.url();if(!['GET','HEAD'].includes(req.method())){writes.push(req.method());return route.abort();}if(url.startsWith('https://fonts.googleapis.com/'))return route.fulfill({contentType:'text/css',body:''});if(new URL(url).pathname==='/helper/status')return route.fulfill({json:{paired:false}});if(url.startsWith(base+'/api/dashboard/todays-deals'))return route.fulfill({json:current});if(url.startsWith(base+'/'))return route.continue();external.push(new URL(url).hostname);return route.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const dir=path.join(__dirname,'../docs/screens/2026-10-13-deal-navigation');if(screenshots)fs.mkdirSync(dir,{recursive:true});
  async function openList(){await page.goto(base+'/dashboard/');await page.evaluate(()=>navigate('todays_deals',null));await page.locator('.td-summary').waitFor();}
  async function back(){await page.locator('[data-deal-back]').click();await page.locator('.td-summary').waitFor();}
  for(const width of [1366,1920,400,412]){
   current=payload();await page.setViewportSize({width,height:width===1366?768:width===1920?1080:915});await openList();
   const summary=page.locator('.td-summary');const text=await summary.innerText();
   assert.ok(!text.includes('not supplied'));assert.ok(!text.includes(fixture().address));assert.ok(!(await summary.getAttribute('aria-label')).includes(fixture().address));
   assert.equal(await summary.locator('.td-heading h3').innerText(),'Tampa, FL, 33602');assert.equal(await summary.locator('.td-holder').innerText(),'Holder: SYNTHETIC HOLDER');assert.equal(await summary.locator('script').count(),0);
   assert.equal(await summary.locator('.td-compact-math div:last-child dd').innerText(),'$6,625');assert.ok(text.includes('after the recorded JV split'));assert.equal(await summary.locator('[data-deal-matches]').innerText(),'1 buyer matches');
   assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(text));assert.equal(await page.locator('.td-property-media').count(),0);
   const bounds=await page.locator('.td-card').evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,overflow:el.scrollWidth>el.clientWidth+1}));assert.ok(bounds.left>=0&&bounds.right<=width&&!bounds.overflow);
   assert.ok(await page.locator('#wos-todays-deals').evaluate(el=>el.classList.contains('wos-kit')&&!!el.querySelector('.td-card.card.card-body')));
   if(screenshots)await page.screenshot({path:path.join(dir,'synthetic-deals-'+width+'.png')});
   await summary.locator('h3').click();await page.locator('.td-open-view').waitFor();assert.equal(await page.locator('[data-review-comps]').isChecked(),false);await back();
   for(const key of ['Enter','Space']){await page.locator('[data-deal-card-open]').focus();await page.keyboard.press(key);await page.locator('.td-open-view').waitFor();assert.equal(await page.locator('[data-review-comps]').isChecked(),false);await back();}
   await page.locator('[data-deal-matches]').click();await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-matched-buyers'));assert.ok((await page.locator('.td-open-view').innerText()).includes('Fixture Investor'));assert.equal(await page.locator('[data-review-comps]').isChecked(),false);
   if(screenshots)await page.screenshot({path:path.join(dir,'synthetic-deal-matches-'+width+'.png')});await back();
  }
  current=payload();current.items[0].holder_contact.name='<script>SYNTHETIC HOLDER</script>';current.items[0].platform=null;await openList();assert.equal(await page.locator('.td-summary .td-holder').innerText(),'Holder: <script>SYNTHETIC HOLDER</script>');assert.equal(await page.locator('.td-card script').count(),0);assert.ok((await page.locator('.td-source').innerText()).includes('Source not established'));
  current=payload({comps:[],beds:null,baths:0,sqft:null,year_built:null,asking_price:0,holder_contact:{}},false,false);await openList();
  assert.equal(current.items[0].evaluation.asking,null,'The unchanged evaluator treats zero asking as unestablished');assert.equal(await page.locator('.td-asking').innerText(),'Not established');assert.equal(await page.locator('.td-holder').count(),0);assert.equal(await page.locator('[data-deal-matches]').innerText(),'0 buyers match');
  assert.ok((await page.locator('.td-fact-chips').innerText()).includes('0 baths'));assert.ok((await page.locator('.td-fact-chips').innerText()).includes('Value not established'));assert.ok(!/Beds unknown|Size unknown|Year unknown/.test(await page.locator('.td-fact-chips').innerText()));assert.equal(await page.locator('.td-compact-math div:last-child dd').innerText(),'Not established');
  await page.locator('[data-deal-matches]').click();await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-matched-buyers'));assert.ok((await page.locator('.td-open-view').innerText()).includes('No approved buyer'));
  current=payload({jv_split:null});await openList();assert.equal(await page.locator('.td-compact-math div:last-child dd').innerText(),'Not established','Missing split never falls back to inflated gross room');
  current=payload({deal_kind:'own',platform:'own-lead'});await openList();assert.equal(await page.locator('.td-summary h3').innerText(),fixture().address);assert.equal(await page.locator('.td-compact-math div:last-child dd').innerText(),'$13,250');
  app.assertUnchanged();assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('Deal cards1366/1920/400/412:address/holder first,canonical JV share,missing facts versus zero,unknown split/value,escaped holder,unsigned JV privacy,whole-card/keyboard/matches/back,no automatic reviews,zero writes/external calls passed.');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={prove};if(require.main===module)prove({screenshots:process.argv.includes('--screenshots')}).catch(e=>{console.error(e.stack);process.exitCode=1;});
