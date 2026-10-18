'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createFixtureApp} = require('./verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser} = require('../modules/research/playwright-browser-resolver');
const filter = require('../dashboard/wos-list-filters');
const deals = require('../modules/deals/reviewed-deals');
const {fixture,buyer,now} = require('../tests/reviewed-deals.test');
async function prove({screenshots=false}={}) {
  const fixtureApp=createFixtureApp();
  const server=await new Promise(resolve=>{const s=fixtureApp.app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try {
    let store=deals.ingest({buyers:[buyer]},[deals.validate(fixture(),now)],{now,operatorId:'fixture',createId:()=> 'fixture-one'}).store;
    store=deals.update(store,'fixture-one',{action:'approve',reviewed_comps:true},{now,operatorId:'fixture'});
    const dto=deals.list(store,{now,includeHidden:true}).items[0];
    const rows=[dto,{...dto,id:'fixture-two',county:'Pinellas',city:'Clearwater'},{...dto,id:'fixture-three',state:'TX',county:'Ellis',city:'Ennis'}];
    const writes=[],external=[],errors=[];
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
    const context=await browser.newContext();
    await context.route('**/*',route=>{
      const req=route.request(),url=new URL(req.url());
      if(!['GET','HEAD'].includes(req.method())){writes.push(req.method());return route.abort();}
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
      if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
      if(url.origin!==base){external.push(url.hostname);return route.abort();}
      if(url.pathname==='/api/dashboard/todays-deals'){
        const selection=Object.fromEntries(url.searchParams);
        const items=rows.filter(row=>filter.matches(row,selection));
        return route.fulfill({json:{items,counts:{total:3,shown:items.length},location_counts:rows.map(row=>({state:row.state,county:row.county,city:row.city,count:1})),status_labels:{}}});
      }
      return route.continue();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const dir=path.join(__dirname,'../docs/screens/2026-10-14-location-filters');if(screenshots)fs.mkdirSync(dir,{recursive:true});
    async function ready(count){await page.waitForFunction(n=>document.querySelectorAll('.td-summary').length===n&&!document.querySelector('#wos-todays-deals')?.textContent.includes('Loading deals...'),count);}
    async function choose(field,value,count){await page.locator('[data-list-filter="'+field+'"]').selectOption(value);await ready(count);}
    for(const width of [1366,1920,400,412]){
      await page.setViewportSize({width,height:width===1366?768:width===1920?1080:915});
      await page.goto(base+'/dashboard/');await page.evaluate(()=>navigate('todays_deals',null));await ready(3);
      if(!(await page.locator('.td-filter-bar').evaluate(el=>el.open)))await page.locator('.td-filter-bar summary').click();
      await page.locator('[data-list-filter="state"]:enabled').waitFor();
      assert.equal(await page.locator('[data-list-filter="state"] option').count(),52);
      assert.equal(await page.locator('[data-list-filter="county"]').isDisabled(),true);
      await choose('state','FL',2);await choose('county','Hillsborough County',1);await choose('city','Tampa',1);
      assert.ok((await page.locator('[data-list-filter="county"]').innerText()).includes('Alachua County (0)'));
      assert.ok(!(await page.locator('[data-list-filter="county"]').innerText()).includes('Ellis County'));
      assert.equal(await page.locator('[data-list-filter-remove]').count(),3);
      assert.ok(page.url().includes('filters=todays_deals'));assert.ok(page.url().includes('county=Hillsborough'));
      const bounds=await page.locator('.wos-location-filters').evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,overflow:el.scrollWidth>el.clientWidth+1}));
      assert.ok(bounds.left>=0&&bounds.right<=width&&!bounds.overflow);
      if(screenshots)await page.screenshot({path:path.join(dir,'synthetic-filtered-deals-'+width+'.png')});
      await page.locator('[data-list-filter-remove="county"]').click();await ready(2);assert.equal(await page.locator('[data-list-filter="city"]').isDisabled(),true);
      await page.locator('[data-list-filter-clear]').click();await ready(3);
      await page.locator('.td-filter-bar summary').click();assert.equal(await page.locator('[data-list-filter="state"]').isVisible(),false);
      await page.locator('.td-filter-bar summary').click();
      await choose('state','TX',1);await choose('county','Ellis County',1);
      await page.evaluate(()=>navigate('jv',null));await ready(3);if(!(await page.locator('.td-filter-bar').evaluate(el=>el.open)))await page.locator('.td-filter-bar>summary').click();assert.equal(await page.locator('[data-list-filter="state"]').inputValue(),'');
      await choose('state','FL',2);await choose('county','Pinellas County',1);
      if(screenshots)await page.screenshot({path:path.join(dir,'synthetic-filtered-jv-'+width+'.png')});
      await page.evaluate(()=>navigate('todays_deals',null));await ready(1);if(!(await page.locator('.td-filter-bar').evaluate(el=>el.open)))await page.locator('.td-filter-bar summary').click();assert.equal(await page.locator('[data-list-filter="state"]').inputValue(),'TX');
      await page.goto(base+'/dashboard/#filters=todays_deals&state=TX&county=Ellis+County');await page.reload();await ready(1);if(!(await page.locator('.td-filter-bar').evaluate(el=>el.open)))await page.locator('.td-filter-bar summary').click();assert.equal(await page.locator('[data-list-filter="county"]').inputValue(),'Ellis County');
      await page.locator('[data-list-filter-clear]').click();await ready(3);
      await page.evaluate(()=>navigate('jv',null));await ready(1);if(!(await page.locator('.td-filter-bar').evaluate(el=>el.open)))await page.locator('.td-filter-bar>summary').click();await page.locator('[data-list-filter-clear]').click();await ready(3);
    }
    fixtureApp.assertUnchanged();assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
    console.log('Shared filters1366/1920/400/412:51 states/DC,county/city cascade,zero-record counties,exact rows,chips,clear,collapse,per-tab storage/bookmarks,zero writes/external calls passed.');
  } finally {if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={prove};
if(require.main===module)prove({screenshots:process.argv.includes('--screenshots')}).catch(e=>{console.error(e.stack);process.exitCode=1;});
