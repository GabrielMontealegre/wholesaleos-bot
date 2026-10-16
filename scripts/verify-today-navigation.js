'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('./verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
async function prove({screenshots=false}={}){
  const fixture=createFixtureApp({todayProof:true,seedLead:true});
  const server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port,errors=[],writes=[],external=[];
  let browser,empty=false;
  try{
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
    const context=await browser.newContext();
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(!['GET','HEAD'].includes(request.method())){writes.push(request.method());return route.abort();}
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
      if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
      if(url.origin!==base){external.push(url.hostname);return route.abort();}
      if(url.pathname==='/api/dashboard/conversations'){
        const response=await route.fetch(),payload=await response.json();
        payload.items=payload.items.map(row=>({...row,id:'fixture-conversation'}));
        return route.fulfill({response,json:payload});
      }
      if(url.pathname==='/api/dashboard/today-workspace'){
        const response=await route.fetch(),payload=await response.json();
        const conversation=payload.actions.find(a=>a.kind==='conversation');
        const old=[1,2].map(n=>({...conversation,key:'conversation:overdue-'+n,record_id:'overdue-'+n,label:'Follow-up due',due_date:'2026-10-06',conversation:{...conversation.conversation,id:'overdue-'+n,status:'follow_up',due_date:'2026-10-06',what_they_said:'SYNTHETIC OVERDUE '+n}}));
        payload.actions=empty?[]:[...old,...payload.actions];
        return route.fulfill({response,json:payload});
      }
      return route.continue();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const dir=path.join(__dirname,'../docs/screens/2026-10-15-366-d');if(screenshots)fs.mkdirSync(dir,{recursive:true});
    async function home(){await page.evaluate(()=>navigate('dashboard',null));await page.locator('[data-today-deal]').first().waitFor();}
    for(const width of [1366,1920,400,412]){
      await page.setViewportSize({width,height:width===1366?768:width===1920?1080:915});
      await page.goto(base+'/dashboard/');await page.locator('.today-overdue').waitFor();
      assert.equal(await page.locator('[data-today-action]').count(),7);
      assert.equal(await page.locator('.today-overdue').evaluate(e=>e.open),false);
      assert.equal(await page.locator('[data-today-overdue-count]').innerText(),'2');
      if(screenshots){await page.mouse.move(0,0);await page.keyboard.press('Escape');await page.screenshot({path:path.join(dir,'synthetic-today-'+width+'.png')});}
      await page.locator('.today-overdue summary').click();
      await page.locator('[data-today-action="conversation:overdue-1"]').click();
      assert.ok((await page.locator('#today-conversation-dialog').innerText()).includes('SYNTHETIC OVERDUE 1'));
      await page.keyboard.press('Escape');await page.locator('#today-conversation-dialog').waitFor({state:'detached'});
      await page.locator('[data-today-refresh]').click();await page.waitForFunction(()=>!document.querySelector('[data-today-refresh]').disabled);
      assert.equal(await page.locator('.today-overdue').evaluate(e=>e.open),true,'User expansion survives refresh');
      await page.locator('[data-today-filter="approvals"]').click();assert.equal(await page.locator('.today-overdue').isVisible(),false);
      await page.locator('[data-today-filter="approvals"]').click();assert.equal(await page.locator('[data-today-overdue-count]').innerText(),'2');
      await page.locator('.today-overdue summary').click();
      await page.evaluate(()=>navigate('todays_deals',null));await page.locator('.td-summary').first().waitFor();
      if(!(await page.locator('.td-filter-bar').evaluate(e=>e.open)))await page.locator('.td-filter-bar summary').click();
      await page.locator('[data-deal-filter="price_min"]').fill('9999999');
      await page.locator('[data-deal-filter="verdict"]').selectOption('NO');
      await page.locator('[data-deal-reload]').click();await page.waitForFunction(()=>document.querySelectorAll('.td-summary').length===0&&!document.querySelector('#wos-todays-deals').textContent.includes('Loading deals...'));
      await home();await page.locator('[data-today-deal]').click();
      await page.locator('.td-open-view[data-deal-id="fixture-deal"]').waitFor();
      assert.equal(await page.locator('#wos-buyers-found').count(),0,'Deal never opens buyer page');
      await page.locator('[data-deal-back]').click();await home();
      const target=page.locator('[data-today-record]').filter({hasText:'Open record'});
      assert.ok(await target.count()>0);
      const dealKey=await page.evaluate(()=>[...document.querySelectorAll('.today-recent li')].find(e=>e.querySelector('strong')?.textContent==='Deal found')?.querySelector('[data-today-record]')?.dataset.todayRecord);
      assert.ok(dealKey,'Real service supplies typed deal activity');
      await page.locator('[data-today-record="'+dealKey+'"]').click();await page.locator('.td-open-view').waitFor();
      assert.equal(await page.locator('#wos-buyers-found').count(),0);
      await page.locator('[data-deal-back]').click();await home();
      await page.locator('.today-tools > summary').click();
      await page.locator('[data-conversation-open]').first().click();await page.getByRole('heading',{name:'Recorded conversation',exact:true}).waitFor();
      await page.getByRole('button',{name:'Close conversation',exact:true}).click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    empty=true;await page.locator('[data-today-refresh]').click();
    await page.getByText('No recorded work needs your action today.',{exact:true}).waitFor();assert.equal(await page.locator('[data-today-action]').count(),0);
    fixture.assertUnchanged();assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(external,[]);
    console.log('366D Today: overdue grouping/count/expand/filter/refresh, both conversation paths, Best/recent deal direct opening under conflicting filters, honest empty queue;1366/1920/400/412;zero writes/external requests.');
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={prove};if(require.main===module)prove({screenshots:process.argv.includes('--screenshots')}).catch(e=>{console.error(e.stack);process.exitCode=1;});
