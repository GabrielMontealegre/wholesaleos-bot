'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const geography=require('../modules/research/lead-location-facets');
async function prove(){
  const fixture=createFixtureApp({seedLead:true});
  const server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port;
  const writes=[],external=[],errors=[],requests=[];let browser,page;
  const rows=[['FL','Northville'],['FL','Northville'],['FL','Southville'],['TX','Northville']].map(([state,city],i)=>({
    id:'geography-'+i,record_ref:'WOS-'+state+'-'+(1040+i),address:(100+i)+' Example St',city,county:'Example',state,
    source:'manual',source_kind:'operator_input',status:'new',row_state:'LOCKED',contact_state:'LOCKED',address_state:'needs_source_proof',
    preview_only:true,not_a_saved_lead:true,createdAt:'2026-10-06T12:00:00Z'
  }));
  try{
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
    const context=await browser.newContext();
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(!['GET','HEAD'].includes(req.method())){writes.push(req.method());return route.abort();}
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
      if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
      if(url.origin!==base){external.push(url.hostname);return route.abort();}
      if(url.pathname==='/api/dashboard/error-tracking-config')return route.fulfill({json:{enabled:false,dsn:''}});
      if(url.pathname==='/api/dashboard/filter-counties')return route.fulfill({json:{schema_version:1,states:[{code:'FL',name:'Florida'},{code:'TX',name:'Texas'},{code:'WY',name:'Wyoming'}],counties:[{state:'FL',name:'Example'},{state:'TX',name:'Example'}]}});
      if(url.pathname==='/api/leads'){
        const query=Object.fromEntries(url.searchParams);requests.push(query);
        const selected=rows.filter(row=>geography.matches(row,geography.selection(query)));
        const offset=Number(query.offset)||0,limit=Number(query.limit)||2;
        await new Promise(resolve=>setTimeout(resolve,75));
        return route.fulfill({json:{leads:selected.slice(offset,offset+limit),totalAll:4,totalFiltered:selected.length,offset,limit,
          has_more:offset+limit<selected.length,next_offset:offset+limit<selected.length?offset+limit:null,
          prev_offset:offset>0?Math.max(0,offset-limit):null,location_counts:geography.counts(rows)}});
      }
      return route.continue();
    });
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    for(const width of [1366,400,412]){
      await page.setViewportSize({width,height:width===1366?768:915});await page.goto(base+'/dashboard/');
      await page.waitForFunction(()=>APP.currentUser&&APP._leadsTotalFiltered===4&&!APP._leadsLoading);
      await page.evaluate(async()=>{APP._leadApiLimit=2;APP._leadToolbarFilters={};navigate('leads',null);await loadLeadsFromAPI({offset:0,resetPage:true});});
      await page.waitForFunction(()=>APP._leadsTotalFiltered===4&&APP.leads.length===2);
      const state=page.locator('#leadGeography [data-list-filter="state"]');
      const county=page.locator('#leadGeography [data-list-filter="county"]');
      const city=page.locator('#leadGeography [data-list-filter="city"]');
      await state.locator('option[value="TX"]').waitFor({state:'attached'});
      assert.equal(await page.locator('#regionalCommandBar').count(),0);
      assert.equal(await page.locator('#lfState,#lfCounty').count(),0);
      assert.ok(requests.at(-1).geography==='1'&&!requests.at(-1).operational_mode&&!requests.at(-1).metro);
      assert.equal((await page.locator('#lead-queue-table-shell th').allTextContents())[1],'ADDRESS');
      await page.getByRole('button',{name:'Next',exact:true}).click();
      await page.waitForFunction(()=>APP._leadApiOffset===2&&APP.leads.some(row=>row.state==='TX'));
      await state.selectOption('TX');await page.waitForFunction(()=>APP._leadsTotalFiltered===1&&APP.leads[0]?.state==='TX');
      await county.selectOption('Example');
      await page.waitForFunction(()=>!APP._leadsLoading&&getLeadToolbarFilters().county==='Example');
      await county.locator('option[value="Example"][selected]').waitFor({state:'attached'});
      await city.selectOption('Northville');
      await page.waitForFunction(()=>getLeadToolbarFilters().city==='Northville'&&APP._leadsTotalFiltered===1);
      await state.selectOption('FL');await page.waitForFunction(()=>APP._leadsTotalFiltered===3&&getLeadToolbarFilters().county===''&&getLeadToolbarFilters().city==='');
      await county.selectOption('Example');
      await page.waitForFunction(()=>!APP._leadsLoading&&getLeadToolbarFilters().county==='Example');
      await county.locator('option[value="Example"][selected]').waitFor({state:'attached'});
      await city.selectOption('Southville');
      await page.waitForFunction(()=>APP._leadsTotalFiltered===1&&APP.leads[0]?.city==='Southville');
      await state.selectOption('WY');await page.waitForFunction(()=>APP._leadsTotalFiltered===0&&APP.leads.length===0);
      assert.equal(await page.evaluate(()=>APP._leadsTotalAll),4);
      await state.selectOption('');await page.waitForFunction(()=>APP._leadsTotalFiltered===4&&APP.leads.length===2);
      const checkbox=page.locator('#lead-queue-table-shell .lead-cb').first();await checkbox.check();
      assert.ok(await checkbox.isChecked());
      const selectedText=await page.locator('#bulk-toolbar').innerText();
      assert.ok(selectedText.indexOf('100 Example St')<selectedText.indexOf('WOS-FL-1040'),'selected card leads with the address');
      assert.equal(Math.round((await checkbox.boundingBox()).width),18);
      assert.ok((await checkbox.locator('..').boundingBox()).width>=44);
      assert.ok(!await page.getByRole('button',{name:'Close lead',exact:true}).isVisible());
      await page.locator('#lead-queue-table-shell tbody tr').first().locator('td').nth(1).click();
      await page.getByRole('button',{name:'Close lead',exact:true}).waitFor();await page.getByRole('button',{name:'Close lead',exact:true}).click();
      await page.locator('#lead-queue-table-shell .lead-cb').first().uncheck();
      await state.scrollIntoViewIfNeeded();
      await page.mouse.move(0,0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(process.argv.includes('--screenshots')){const dir=path.join(__dirname,'../docs/screens/2026-10-17-366-g');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'synthetic-leads-'+width+'.png')});}
    }
    fixture.assertUnchanged();assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
    console.log('Leads geography real dashboard1366/400/412: All states/server Next, cascade reset, off-page city facets, real zero recovery,18px checkbox/44px target,address-first drawer,zero writes/external requests passed.');
  }catch(error){
    console.error('Geography fixture requests: '+JSON.stringify(requests.slice(-12)));
    if(page)console.error('Geography fixture state: '+JSON.stringify(await page.evaluate(()=>({width:innerWidth,filters:getLeadToolbarFilters(),total:APP._leadsTotalFiltered,loading:APP._leadsLoading,error:APP._leadsError}))));
    throw error;
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
