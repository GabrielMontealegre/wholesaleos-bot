'use strict';
const assert=require('node:assert/strict');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
async function run(){
  const fixture=createFixtureApp({seedLead:true,todayProof:true,actualDealRoutes:true});
  const server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
    for(const width of [1366,400,412]){
      const page=await browser.newPage({viewport:{width,height:width===1366?768:915}});
      const writes=[],external=[],errors=[],reads=[];
      let holdRecord=false,resumeRecord=null,holdList=false,resumeList=null;
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>{
        const request=route.request(),url=new URL(request.url());
        if(request.method()!=='GET'){writes.push(url.pathname);return route.abort();}
        if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
        if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
        if(url.origin!==base){external.push(url.hostname);return route.abort();}
        if(url.pathname==='/api/dashboard/todays-deals'){
          reads.push(Object.fromEntries(url.searchParams));
          if(holdRecord&&url.searchParams.get('record_id'))return new Promise(resolve=>{resumeRecord=async()=>{await route.continue();resolve();};});
          if(holdList&&!url.searchParams.get('record_id'))return new Promise(resolve=>{resumeList=async()=>{await route.continue();resolve();};});
        }
        return route.continue();
      });
      await page.goto(base+'/dashboard/?workspace=deals');
      await page.locator('.td-card').first().waitFor();
      const before=await page.locator('.td-card').count();assert(before>=1);
      const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/dashboard/todays-deals'&&!!new URL(r.url()).searchParams.get('record_id'));
      await page.getByRole('button',{name:'Open deal',exact:true}).first().click();await (await response).finished();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.locator('.td-open-view').waitFor();
      assert.equal(await page.locator('.td-open-view').count(),1);
      assert.equal(await page.locator('.td-card').count(),1,'Actual registered route honors record_id,unlike a raw query spread fixture');
      const firstBack=reads.length;
      await page.getByRole('button',{name:'Back to results',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.td-open-view'),{},{timeout:5000});
      await page.waitForFunction(expected=>document.querySelectorAll('.td-card').length===expected,before,{timeout:5000});
      assert.equal(await page.getByRole('button',{name:'Open deal',exact:true}).count(),before);
      assert.equal(reads.slice(firstBack).filter(query=>!query.record_id).length,1,'One list read per explicit Back');
      holdRecord=true;
      const pending=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/dashboard/todays-deals'&&!!new URL(r.url()).searchParams.get('record_id'));
      await page.getByRole('button',{name:'Open deal',exact:true}).first().click();await pending;
      await page.locator('.td-open-view').waitFor();
      const raceBack=reads.length;
      holdList=true;
      const nextList=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/dashboard/todays-deals'&&!new URL(r.url()).searchParams.get('record_id'));
      await page.getByRole('button',{name:'Back to results',exact:true}).click();
      await nextList;
      await page.getByText('Loading deals...',{exact:true}).waitFor();
      assert.equal(await page.locator('.td-card').count(),0,'Pending list does not pretend to be empty or retain the single-record DTO');
      const late=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/dashboard/todays-deals'&&!!new URL(r.url()).searchParams.get('record_id'));
      holdRecord=false;await resumeRecord();await (await late).finished();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert(await page.getByText('Loading deals...',{exact:true}).isVisible(),'Obsolete record response cannot clear the current loading state');
      const fullList=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/dashboard/todays-deals'&&!new URL(r.url()).searchParams.get('record_id'));
      holdList=false;await resumeList();await (await fullList).finished();
      await page.waitForFunction(expected=>!document.querySelector('.td-open-view')&&document.querySelectorAll('.td-card').length===expected,before,{timeout:5000});
      assert.equal(reads.slice(raceBack).filter(query=>!query.record_id).length,1,'Late record completion cannot trigger duplicate list reads');
      const filters=page.locator('.td-filter-bar');
      if(await filters.getAttribute('open')===null)await filters.locator('summary').click();
      await page.locator('[data-deal-filter="price_min"]').fill('1000');
      await page.locator('[data-deal-filter="hidden"]').check();
      await page.getByRole('button',{name:'Apply filters',exact:true}).click();
      await page.waitForFunction(()=>document.querySelectorAll('.td-card').length===2);
      const filteredResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/dashboard/todays-deals'&&!!new URL(r.url()).searchParams.get('record_id'));
      await page.getByRole('button',{name:'Open deal',exact:true}).first().click();await (await filteredResponse).finished();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.getByRole('button',{name:'Back to results',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.td-open-view')&&document.querySelectorAll('.td-card').length===2);
      assert.equal(await page.locator('[data-deal-filter="price_min"]').inputValue(),'1000');
      assert(await page.locator('[data-deal-filter="hidden"]').isChecked());
      assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
      console.log(JSON.stringify({synthetic_only:true,width,before,after:await page.locator('.td-card').count(),read_requests:reads.length}));
      await page.close();
    }
    fixture.assertUnchanged();
    console.log('classic-deal-back-ui: actual registered route Open deal->Back1366/400/412,late record refusal and hidden/price filter preservation;no unrelated navigation,writes or external requests;candidate only,live451 not verified');
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
