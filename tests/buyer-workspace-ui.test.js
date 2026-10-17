'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createFixtureApp} = require('../scripts/verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser} = require('../modules/research/playwright-browser-resolver');
const fixtureBuyer = {id:'example-buyer',name:'LOCAL TEST DATA - Example Investor',record_ref:'BUY-1234',email:'buyer@example.test',phone:'555-010-1234',
  states:['FL'],areas:['Example City'],buy_box:{types:['house'],price_max:200000,beds_min:2,baths_min:1,pct_arv:'60-70%',rehab_tolerance:'Light repairs',exclusions:['Review roof']},
  buyer_type:'institutional',buyer_type_view:{kind:'institutional',verify_purchase:true},classification:'end_buyer',approval:'approved',status:'new',
  first_seen_at:'2026-10-17T12:00:00Z',captured_at:'2026-10-17T12:00:00Z',drafted_message:'Local fixture draft only.',source_url:'https://records.example.test/buyer',
  profile_url:'https://records.example.test/profile',group_name:'Example source',deal_type:'house',fits:{count:0},
  deal_fit:{count:2,matches:[1,2].map(n=>({id:'deal-'+n,ref:'WOS-FL-'+(1040+n),city:'Example City',state:'FL',zip:'33000',asking:150000,buyer_max:170000,teaser_ready:true})),near_misses:[]}};
async function prove() {
  const fixture=createFixtureApp({seedLead:true});
  const server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port;
  let browser,page;const requests=[],external=[],errors=[];
  try {
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
    const context=await browser.newContext();
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
      if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
      if(url.origin!==base){external.push(url.hostname);return route.abort();}
      if(url.pathname==='/api/dashboard/error-tracking-config')return route.fulfill({json:{enabled:false,dsn:''}});
      if(url.pathname==='/api/dashboard/buyers-found')return route.fulfill({json:{items:[fixtureBuyer,{...fixtureBuyer,id:'missing-email',name:'LOCAL TEST DATA - No email',email:'',phone:'',buyer_type_view:{kind:'unknown',verify_purchase:false},deal_fit:{count:0,matches:[],near_misses:[]}}],counts:{total:2,new_today:2,messaged_this_week:0},capabilities:{can_import:true},last_import_at:'2026-10-17T12:00:00Z'}});
      if(url.pathname==='/api/dashboard/buyers-found/example-buyer/email'){
        await new Promise(resolve=>setTimeout(resolve,75));
        return route.fulfill({json:{configured:true,messages:[]}});
      }
      if(req.method()!=='GET'&&req.method()!=='HEAD'){
        requests.push({path:url.pathname,body:req.postDataJSON()});
        if(url.pathname.endsWith('/email/preview'))return route.fulfill({json:{...req.postDataJSON(),to:'buyer@example.test',subject:'Synthetic preview',body:'Example City FL 33000\nAsking: 150000\nValue: Preliminary [240000,250000] (2 reviewed comps)',version:'fixture-version',configured:true}});
        if(url.pathname.endsWith('/email/draft'))return route.fulfill({json:{id:'fixture-draft',status:'draft'}});
        if(url.pathname.endsWith('/email/send'))return route.fulfill({json:{status:'accepted'}});
        return route.abort();
      }
      return route.continue();
    });
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    for(const width of [1366,400,412]){
      requests.length=0;
      await page.setViewportSize({width,height:width===1366?768:915});await page.goto(base+'/dashboard/');
      await page.waitForFunction(()=>APP.currentUser);
      await page.evaluate(()=>navigate('buyers_found',null));
      await page.getByRole('button',{name:'Open buyer',exact:true}).first().waitFor();
      assert.equal(requests.length,0,'loading and card hydration never send or save');
      assert.ok(await page.getByText('Email missing',{exact:true}).isVisible());
      assert.ok(await page.getByText('Verify they close',{exact:true}).isVisible());
      await page.locator('[data-filter="buyer_type"]').selectOption('institutional');
      assert.equal(await page.locator('.bf-compact').count(),1);
      assert.ok((await page.locator('.bf-compact').innerText()).includes('buyer@example.test'));
      assert.ok((await page.locator('.bf-compact').innerText()).includes('555-010-1234'));
      if(process.argv.includes('--screenshots')){
        const dir=path.join(__dirname,'../docs/screens/2026-10-17-366-c');fs.mkdirSync(dir,{recursive:true});
        await page.mouse.move(0,0);await page.screenshot({path:path.join(dir,'synthetic-list-'+width+'.png')});
      }
      await page.getByRole('button',{name:'2 deals match',exact:true}).click();
      assert.equal(await page.getByRole('tab',{name:'Matching deals',exact:true}).getAttribute('aria-selected'),'true');
      assert.ok(!await page.locator('[data-edit-buyer-type]').isVisible(),'buy box is not a long scroll above matches');
      await page.locator('[data-buyer-email-deal="deal-1"]').check();await page.locator('[data-buyer-email-deal="deal-2"]').check();
      await page.getByRole('button',{name:'Preview selected deals in one email',exact:true}).click();
      await page.getByRole('heading',{name:'Synthetic preview',exact:true}).waitFor();
      assert.deepEqual(requests[0].body.deal_ids,['deal-1','deal-2']);
      assert.equal(requests.length,1,'one preview for two deals, not one per deal');
      assert.ok(!(await page.getByRole('button',{name:'Send email',exact:true}).isEnabled()));
      await page.getByRole('button',{name:'Save reviewed draft',exact:true}).click();
      assert.ok(await page.getByText('Review the entire email and tick the review box first.',{exact:true}).isVisible());
      assert.equal(requests.length,1);
      await page.locator('[data-email-reviewed]').check();await page.getByRole('button',{name:'Save reviewed draft',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('[data-buyer-email="send"]')?.disabled===false);
      assert.equal(requests.length,2);assert.equal(requests[1].path.endsWith('/email/draft'),true);
      await page.locator('[data-email-reviewed]').check();await page.getByRole('button',{name:'Send email',exact:true}).click();
      await page.getByText('Accepted by mail server. Delivery is not confirmed.',{exact:true}).waitFor();
      assert.equal(requests.filter(r=>r.path.endsWith('/send')).length,1,'only the explicit click requests send');
      await page.getByRole('tab',{name:'Buy box',exact:true}).click();
      assert.equal(await page.locator('[data-edit-buyer-type]').inputValue(),'institutional');
      assert.equal(requests.length,3);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(process.argv.includes('--screenshots')){
        const dir=path.join(__dirname,'../docs/screens/2026-10-17-366-c');fs.mkdirSync(dir,{recursive:true});
        await page.mouse.move(0,0);
        await page.screenshot({path:path.join(dir,'synthetic-buyer-'+width+'.png')});
      }
    }
    fixture.assertUnchanged();assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
    console.log('Buyer workspace real dashboard1366/400/412: published contacts, type filter, match badge/sections, two-deal single preview, review requirement and explicit draft/send clicks passed; local synthetic HTTP only.');
  }catch(error){
    if(page){console.error('Synthetic UI state:',JSON.stringify(await page.evaluate(()=>({width:innerWidth,section:document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
      selected:[...document.querySelectorAll('[data-buyer-email-deal]')].map(e=>({id:e.dataset.buyerEmailDeal,checked:e.checked,disabled:e.disabled})),
      dialogs:document.querySelectorAll('[role="dialog"]').length})).catch(()=>({}))),errors);
      const dir=path.join(__dirname,'../docs/screens/2026-10-17-366-c');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'synthetic-failure.png')}).catch(()=>{});}
    throw error;
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
prove().catch(error=>{console.error(error);process.exitCode=1;});
