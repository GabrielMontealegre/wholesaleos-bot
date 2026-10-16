'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('./verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
async function prove({screenshots=false}={}){
  const fixture=createFixtureApp({todayProof:true,seedLead:true});
  const server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port,errors=[],writes=[],external=[];
  let browser;
  try{
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
    const context=await browser.newContext();
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(!['GET','HEAD'].includes(req.method())){writes.push(req.method());return route.abort();}
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
      if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
      if(url.origin!==base){external.push(url.hostname);return route.abort();}
      if(url.pathname==='/api/leads'){
        const response=await route.fetch(),data=await response.json();
        data.leads=Array.from({length:60},(_,i)=>({...data.leads[0],id:'synthetic-lead-'+i}));data.totalAll=60;data.totalFiltered=60;
        return route.fulfill({response,json:data});
      }
      return route.continue();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    async function shot(name,width){if(screenshots){const dir=path.join(__dirname,'../docs/screens/2026-10-15-366-a');fs.mkdirSync(dir,{recursive:true});await page.mouse.move(0,0);await page.screenshot({path:path.join(dir,'synthetic-'+name+'-'+width+'.png')});}}
    async function menu(){if(await page.getByRole('button',{name:'Open navigation menu',exact:true}).isVisible()&&!await page.locator('.sidebar').isVisible())await page.getByRole('button',{name:'Open navigation menu',exact:true}).click();}
    for(const width of [1366,1920,400,412]){
      await page.setViewportSize({width,height:width===1366?768:width===1920?1080:915});await page.goto(base+'/dashboard/');
      await page.locator('[data-today-action^="conversation:"]').first().waitFor();
      await page.locator('[data-today-action^="conversation:"]').first().click();
      const dialog=page.locator('#today-conversation-dialog');await dialog.locator('[data-panel-dismiss]').waitFor();
      assert.equal(await dialog.locator('[data-panel-dismiss]').innerText(),'\u00d7');
      const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);assert.ok(Math.abs(bounds.x-(width-bounds.width)/2)<=2,'dialog centered despite global margin reset');
      await shot('conversation-close',width);
      await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
      await menu();await page.getByRole('button',{name:'More tools',exact:true}).click();
      const more=await page.locator('.desk-more-items').evaluate(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight};});
      assert.equal(more.top,8);assert.ok(Math.abs(more.bottom-more.height+8)<=1);
      const hit=await page.locator('.desk-more>summary').boundingBox();assert.ok(hit.width>=180&&hit.height>=44);
      await shot('more-tools',width);
      await page.getByRole('button',{name:'Close more tools',exact:true}).click();assert.equal(await page.locator('.desk-more').evaluate(e=>e.open),false);
      await page.getByRole('button',{name:'User menu',exact:true}).click();await page.getByRole('button',{name:'Close account menu',exact:true}).click();assert.equal(await page.locator('.desk-user-menu').evaluate(e=>e.open),false);
      await page.locator('.sidebar .nav-item[onclick="navigate(\'leads\',this)"]').click();
      await page.locator('#lead-queue-table-shell tbody tr').nth(30).waitFor({state:'attached'});
      assert.equal(await page.locator('#wosFilterToggleBar').evaluate(e=>getComputedStyle(e).position),'static');
      const before=await page.locator('#lead-queue-table-shell').evaluate(e=>({top:e.getBoundingClientRect().top,head:e.querySelector('th').getBoundingClientRect().top,scroll:e.scrollHeight>e.clientHeight,overflow:getComputedStyle(e).overflowY}));assert.ok(before.scroll);assert.equal(before.overflow,'auto');
      await page.locator('#lead-queue-table-shell').evaluate(e=>{e.scrollTop=220;});
      const after=await page.locator('#lead-queue-table-shell').evaluate(e=>({top:e.getBoundingClientRect().top,head:e.querySelector('th').getBoundingClientRect().top,scroll:e.scrollTop}));assert.ok(after.scroll>0);assert.equal(before.top,after.top);assert.ok(Math.abs(before.head-after.head)<=2,'column header stays inside the scrolling list');
      await page.locator('#lead-queue-table-shell tbody tr').first().locator('td').nth(1).click();
      await page.locator('#modal-overlay').waitFor({state:'visible'});await page.getByRole('button',{name:'Close lead',exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Close lead',exact:true}).innerText(),'\u00d7');
      assert.equal(await page.getByRole('button',{name:'Close lead',exact:true}).getAttribute('onclick'),'closeModal()','existing owner close hook retained');
      await page.keyboard.press('Escape');await page.locator('#modal-overlay').waitFor({state:'hidden'});
      // Each legacy overlay uses the same presentation-only close registry. No source, send or paid tool is invoked.
      for(const id of ['in-system-email-modal','in-system-sms-modal','buyer-detail-modal','search-results-modal','buyer-gen-modal','addr-val-modal','wg-modal','plModal']){
        await page.evaluate(id=>{document.getElementById(id)?.remove();const e=document.createElement('div');e.id=id;e.style.cssText='position:fixed;inset:0;z-index:10000;display:flex';e.innerHTML='<div><h2>SYNTHETIC TOOL</h2><input value="unsaved synthetic text"></div>';document.body.append(e);},id);
        await page.locator('#'+id+' [data-panel-dismiss]').click();assert.equal(await page.locator('#'+id).isVisible(),false);
      }
      // A later, higher overlay closes alone; Escape never dismisses login or writes a form.
      await page.evaluate(()=>{for(const [id,z] of [['wg-modal',9999],['addr-val-modal',10000]]){const e=document.createElement('div');e.id=id;e.style.cssText='position:fixed;inset:0;display:flex;z-index:'+z;e.innerHTML='<div><h2>SYNTHETIC NESTED</h2></div>';document.body.append(e);}});
      await page.locator('#addr-val-modal [data-panel-dismiss]').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('#addr-val-modal').count(),0);assert.equal(await page.locator('#wg-modal').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('#wg-modal').count(),0);
      await page.evaluate(()=>navigate('dashboard',null));await page.locator('[data-today-action]').first().waitFor();
      if(screenshots){const dir=path.join(__dirname,'../docs/screens/2026-10-15-366-a');fs.mkdirSync(dir,{recursive:true});await page.mouse.move(0,0);await page.screenshot({path:path.join(dir,'synthetic-panels-'+width+'.png')});}
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.evaluate(()=>{document.getElementById('pin-screen').style.display='flex';});await page.keyboard.press('Escape');
      assert.equal(await page.locator('#pin-screen').isVisible(),true,'Escape never dismisses authentication');
      await page.evaluate(()=>{document.getElementById('pin-screen').style.display='none';});
    }
    fixture.assertUnchanged();assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(external,[]);
    console.log('366A full dashboard1366/1920/400/412: X/Esc real conversation/lead and eight legacy shells, top-only Escape, full-height More/account, bounded row scroll/header, zero writes/external calls.');
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={prove};if(require.main===module)prove({screenshots:process.argv.includes('--screenshots')}).catch(e=>{console.error(e.stack);process.exitCode=1;});
