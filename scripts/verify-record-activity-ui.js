'use strict';
const assert=require('assert');const express=require('express');const fs=require('fs');const path=require('path');
const finds=require('../modules/buyers/assistant-finds');const deals=require('../modules/deals/reviewed-deals');const records=require('../modules/records/record-activity');
const {registerAssistantFindRoutes}=require('../modules/buyers/assistant-find-routes');const {registerReviewedDealRoutes}=require('../modules/deals/reviewed-deal-routes');const {registerRecordActivityRoutes}=require('../modules/records/record-activity-routes');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');const {fixture,now}=require('../tests/reviewed-deals.test');
async function prove({screenshots=false}={}) {
  const root=path.resolve(__dirname,'..');const context={now,operatorId:'fixture-admin'};
  let store={users:[{id:'fixture-admin',name:'Fixture operator'}],leads:[],buyers:[],activities:[]};let writes=0;
  const buyer=finds.validateItems({items:[{name:'Fixture buyer',platform:'manual',source_url:'https://records.example.test/buyer/1',profile_url:'https://records.example.test/buyer/1',what_they_buy:'Fixture houses',deal_type:'house',states:['FL'],areas:['Tampa'],classification:'end_buyer',captured_at:now,buy_box:{types:['house'],pct_arv:'75%',price_max:200000}}]},now)[0];
  store=finds.ingest(store,[buyer],{...context,createId:()=> 'buyer1'}).store;store=finds.update(store,'buyer1',{approval:'approved'},context);
  store=deals.ingest(store,[deals.validate(fixture(),now)],{...context,createId:()=> 'deal1'}).store;
  for(const input of [{action:'approve',reviewed_comps:true},{action:'status',status:'vetted'},{action:'status',status:'holder_confirmed',evidence_url:fixture().source_url,checks:{still_available:true}}])store=deals.update(store,'deal1',input,context);
  store=records.importInteraction(store,records.validateInteraction({kind:'interaction',ts:now,who:'Assistant',channel:'manual',dir:'note',with:'Private fixture party',ref:'BUY-0001',summary:'Fixture reported interaction; no contact or confirmation.'},now),context).store;
  const original=JSON.stringify(store);const app=express();app.use(express.json());
  app.use((req,res,next)=>{if(!['GET','HEAD'].includes(req.method)){writes++;return res.status(405).json({code:'fixture_read_only'});}next();});
  app.get('/api/auth/session',(_,res)=>res.json({authenticated:true,role:'admin'}));app.get('/api/leads',(_,res)=>res.json({leads:[],totalAll:0,totalFiltered:0}));app.get('/api/buyers',(_,res)=>res.json({buyers:store.buyers}));
  const deps={db:{readDBStrict:()=>store,writeDB:()=>{writes++;throw Error('write forbidden');}},requireAdmin:(req,res,next)=>{req.currentUser={id:'fixture-admin'};next();},now:()=>now};
  registerAssistantFindRoutes(app,deps);registerReviewedDealRoutes(app,deps);registerRecordActivityRoutes(app,deps);
  app.get('/api/dashboard/research-queue/current',(_,res)=>res.json({ok:true,market:{city:'Fixture City',county:'Fixture County',state:'FL'},rows:[],batches:[],auto_run:{enabled:false}}));
  app.get('/api/*',(_,res)=>res.json([]));app.get('/favicon.ico',(_,res)=>res.status(204).end());app.use('/dashboard',express.static(path.join(root,'dashboard')));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port;let browser;
  try {
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;const browserContext=await browser.newContext();
    await browserContext.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base+'/'))return route.continue();if(new URL(u).pathname==='/helper/status')return route.fulfill({json:{paired:false}});return route.abort();});
    const page=await browserContext.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const output=path.join(root,'docs/screens/record-activity-local');if(screenshots)fs.mkdirSync(output,{recursive:true});
    for(const width of [1366,400,412]) {
      await page.setViewportSize({width,height:width===412?915:900});await page.goto(base+'/dashboard/');await page.locator('.td-card').waitFor();
      assert.ok((await page.locator('.td-card').innerText()).includes('WOS-FL-1031'));
      await page.evaluate(()=>navigate('todays_deals',null));await page.getByRole('button',{name:'Open deal',exact:true}).click();
      const deal=page.locator('.td-card');assert.ok((await deal.innerText()).includes('WOS-FL-1031'));assert.ok((await deal.innerText()).includes('[WOS-FL-1031] Deal enquiry'));
      await deal.locator('details[data-record-timeline] summary').click();await deal.getByText('Operator recorded vetted.',{exact:true}).waitFor();
      await page.getByText('Open buyer: Fixture buyer - $168,250',{exact:true}).click();assert.ok((await deal.innerText()).includes('M-0001'));assert.ok((await deal.innerText()).includes('BUY-0001'));
      if(screenshots)await page.screenshot({path:path.join(output,'synthetic-deal-'+width+'.png'),fullPage:true});
      await page.evaluate(()=>navigate('record_activity',null));await page.getByText(/Showing \d+ of \d+ events/).waitFor();
      await page.getByText('Record references',{exact:true}).click();
      assert.strictEqual(await page.locator('[data-reference-assign]').innerText(),'Assign buyer, deal and match references');
      assert.ok((await page.locator('[data-reference-reserve]').innerText()).includes('minimum 1030'));
      await page.locator('[data-activity-filter="ref"]').fill('BUY-0001');await page.locator('[data-activity-filter="ref"]').dispatchEvent('change');await page.getByRole('button',{name:'Apply filters',exact:true}).click();
      await page.getByText('Fixture reported interaction; no contact or confirmation.',{exact:true}).waitFor();assert.ok(!await page.getByText('Private fixture party',{exact:true}).count());
      assert.strictEqual(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if(screenshots && !await page.locator('[data-reference-assign]').isVisible())await page.getByText('Record references',{exact:true}).click();
      if(screenshots)await page.locator('[data-reference-reserve]').scrollIntoViewIfNeeded();
      if(screenshots)await page.screenshot({path:path.join(output,'synthetic-activity-'+width+'.png'),fullPage:true});
      if(width<901)await page.getByRole('button',{name:'Search references, cities and ZIP codes',exact:true}).click();
      await page.locator('#global-search').fill('BUY-0001');await page.locator('#modal-content [data-search-record]').waitFor();
      await page.locator('#modal-content [data-search-record]').click();await page.locator('.bf-card').waitFor();assert.strictEqual(await page.locator('.bf-card').count(),1);
      await page.locator('.bf-card details[data-record-timeline] summary').click();await page.getByText('Fixture reported interaction; no contact or confirmation.',{exact:true}).waitFor();
      if(screenshots)await page.screenshot({path:path.join(output,'synthetic-buyer-'+width+'.png'),fullPage:true});
      const parsed=await page.evaluate(()=>parseRecordImport('{"ts":"2026-10-07T12:00:00Z","who":"Assistant","channel":"manual","dir":"note","with":"Fixture","ref":"BUY-0001","summary":"Reported note"}\n{"ts":"2026-10-07T12:00:01Z","who":"Assistant","channel":"manual","dir":"note","with":"Fixture","ref":"BUY-0001","summary":"Second reported note"}'));
      assert.strictEqual(parsed.items.length,2);assert.ok(parsed.items.every(i=>i.kind==='interaction'));
      await page.evaluate(()=>navigate('dashboard',null));await page.waitForTimeout(3200);
      assert.strictEqual(await page.locator('#content').evaluate(e=>e.firstElementChild.id),'wos-conversations','D-050 reminders precede Today');
      assert.strictEqual(await page.locator('#content').evaluate(e=>e.children[1].id),'wos-todays-deals','Today remains immediately after reminders');
    }
    assert.deepStrictEqual(errors,[]);assert.strictEqual(writes,0);assert.strictEqual(JSON.stringify(store),original);
    console.log('Full-page record UI: references, card timelines, Activity filters, shared search and JSONL at 1366/400/412; no writes, external sources or page errors.');
  } finally {if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={prove};if(require.main===module)prove({screenshots:true}).catch(e=>{console.error(e.stack);process.exitCode=1;});
