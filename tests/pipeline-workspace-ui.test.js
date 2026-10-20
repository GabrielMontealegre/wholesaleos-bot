'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {probeProcessSpawn}=require('./helpers/process-capability');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui'),{launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const workspace=require('../modules/records/pipeline-workspace'),reports=require('../modules/records/pipeline-reports'),conversations=require('../modules/records/conversations');
const {fixture,report,now}=require('./pipeline-workspace.test');
async function prove(){
 if(!(await probeProcessSpawn()).available){console.log('SKIPPED: Pipeline browser proof requires process spawn');return;}
 const app=createFixtureApp({todayProof:true}),server=await new Promise(resolve=>{const s=app.app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
 let store=fixture();store.buyers[0].id='fixture-buyer';store.reviewed_deals[0].id='fixture-deal';store.buyers[0].assistant_find.approval='approved';
 for(const [group,reasons] of Object.entries(reports.REASONS))store=reports.upsert(store,report({report_id:'ui-'+group,waiting_on:group,reason_code:reasons[0],...(group==='no_reply'?{offer_sent_at:'2026-10-19T12:00:00Z',followup_count:0,next_date:''}:{}),contract_price:{low:150000,high:150000},buyer_price:{low:190000,high:200000},costs:{low:1000,high:2000},our_share:.5,path:'assignment'}),{now,operatorId:'fixture-admin'}).store;
 for(let n=0;n<51;n++)store=reports.upsert(store,report({report_id:'ui-more-'+n}),{now,operatorId:'fixture-admin'}).store;
 store=conversations.upsert(store,{kind:'conversation',person:'SYNTHETIC BUYER',role:'buyer',refs:['BUY-0001'],channels:['manual'],status:'follow_up',last_out:'2026-10-19T12:00:00Z',due_date:'2026-10-23',next_step:'Review the recorded reply.',captured_at:now},{now,operatorId:'fixture-admin'}).store;
 const errors=[],external=[],writes=[];let browser,reads=0,mode='valid';
 try{
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;const context=await browser.newContext();
  await context.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url());if(!['GET','HEAD'].includes(req.method())){writes.push(u.pathname);return route.abort();}
   if(u.host==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});if(u.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
   if(req.url().startsWith(base+'/')){
    if(u.pathname==='/api/dashboard/pipeline-workspace'){reads++;if(mode==='denied')return route.fulfill({status:401,json:{code:'dashboard_login_required'}});if(mode==='failure')return route.fulfill({status:503,json:{code:'pipeline_store_unavailable'}});if(mode==='forged')return route.fulfill({json:{...workspace.build(store,{now}),source_kind:'verified_public_record'}});return route.fulfill({json:workspace.build(store,{now,...workspace.readOptions({query:Object.fromEntries(u.searchParams)})})});}
    return route.continue();
   }external.push(u.hostname);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const size of [{width:1366,height:768},{width:400,height:915},{width:412,height:915}]){
   await page.setViewportSize(size);await page.goto(base+'/dashboard/');await page.locator('[data-today-pipeline]').waitFor();await page.locator('[data-today-pipeline]').click();await page.locator('.pipeline-row').first().waitFor();await page.waitForTimeout(900);
   assert.equal(await page.locator('#content').evaluate(e=>e.firstElementChild.id),'wos-pipeline-workspace','legacy mount cannot replace the Pipeline');assert.equal(await page.locator('[role=tab]').count(),7);assert.equal(await page.locator('.pipeline-row').count(),50);assert.ok((await page.locator('#wos-pipeline-workspace').innerText()).includes('Potential, no confirmed buyer'));assert.equal(await page.locator('#wos-pipeline-workspace').getByRole('button',{name:/^(Send|Approve|Confirm)$/}).count(),0);
   await page.locator('[data-pipe-page=next]').click();await page.getByRole('status').filter({hasText:'Showing 7 of 57'}).waitFor();assert.equal(await page.locator('.pipeline-row').count(),7);await page.locator('[data-pipe-page=previous]').click();await page.locator('.pipeline-row').nth(49).waitFor();
   for(const group of Object.keys(reports.LABELS)){await page.locator('[data-pipe-group="'+group+'"]').click();await page.waitForFunction(g=>document.querySelector('[data-pipe-group="'+g+'"][aria-selected=true]')&&!document.querySelector('[data-pipe-refresh]').disabled,group);assert.ok(await page.locator('.pipeline-row').count()>0);}
   await page.locator('[data-pipe-group=buyer]').click();await page.getByRole('button',{name:'Open conversation',exact:true}).click();await page.getByRole('heading',{name:'Recorded conversation',exact:true}).waitFor();await page.getByRole('button',{name:'Close conversation',exact:true}).press('Escape');await page.locator('#today-conversation-dialog').waitFor({state:'detached'});
   await page.locator('[data-pipe-group=proof_of_funds]').click();await page.locator('.pipeline-row').nth(49).waitFor();
   const bounds=await page.evaluate(()=>{const root=document.querySelector('#wos-pipeline-workspace'),list=root.querySelector('.pipeline-rows'),h=root.querySelector('.pipeline-heading').getBoundingClientRect();list.scrollTop=200;const h2=root.querySelector('.pipeline-heading').getBoundingClientRect();return {viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,list:list.clientHeight,scroll:list.scrollHeight,headerFixed:h.top===h2.top,rootBottom:root.getBoundingClientRect().bottom,height:innerHeight,buttons:[...root.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height).map(e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,height:r.height};})};});assert.equal(bounds.overflow,false);assert.ok(bounds.list>100&&bounds.scroll>bounds.list&&bounds.headerFixed);assert.ok(bounds.rootBottom<=bounds.height+2,JSON.stringify(bounds));assert.ok(bounds.buttons.every(b=>b.left>=0&&b.right<=bounds.viewport+1&&b.height>=44));
   const contrast=await page.locator('.pipeline-heading h2').evaluate(e=>{const lum=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);let b=e;while(getComputedStyle(b).backgroundColor==='rgba(0, 0, 0, 0)'&&b.parentElement)b=b.parentElement;const a=lum(getComputedStyle(e).color),z=lum(getComputedStyle(b).backgroundColor);return(Math.max(a,z)+.05)/(Math.min(a,z)+.05);});assert.ok(contrast>=4.5);
   await page.evaluate(()=>document.querySelector('.pipeline-rows').scrollTop=0);
   await page.locator('[data-pipe-open]').first().click();await page.locator('.td-open-view').waitFor();await page.locator('[data-deal-back]').click();await page.evaluate(()=>navigate('pipeline',null));await page.locator('.pipeline-row').first().waitFor();
   await page.locator('[data-pipe-buyer]').first().click();await page.locator('.bf-card[data-id="fixture-buyer"]').waitFor();await page.evaluate(()=>navigate('pipeline',null));await page.locator('.pipeline-row').first().waitFor();
   const before=reads;await page.locator('[data-pipe-refresh]').click();await page.waitForFunction(()=>!document.querySelector('[data-pipe-refresh]').disabled);assert.ok(reads>before);
   assert.ok(await page.locator('.pipeline-heading button').evaluate(e=>e.scrollWidth<=e.clientWidth));assert.ok(await page.locator('.pipeline-groups strong').evaluateAll(rows=>rows.every(e=>e.getClientRects().length===1&&getComputedStyle(e).whiteSpace==='nowrap')));
   if(process.argv.includes('--screenshots')){await page.locator('[data-pipe-group=seller_agent]').click();await page.waitForFunction(()=>!document.querySelector('[data-pipe-refresh]').disabled);await page.mouse.move(1,1);const dir=path.join(__dirname,'../docs/screens/2026-10-20-pipeline-screen');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'synthetic-pipeline-'+size.width+'.png')});}
   await page.locator('[data-pipe-calendar]').click();await page.getByRole('heading',{name:'Calendar',exact:true}).waitFor();
  }
  await page.evaluate(()=>navigate('pipeline',null));await page.locator('.pipeline-row').first().waitFor();mode='forged';await page.locator('[data-pipe-refresh]').click();await page.getByText('Pipeline unavailable. Check your login, then refresh. Nothing was changed.',{exact:true}).waitFor();assert.equal(await page.locator('.pipeline-row').count(),0);
  mode='failure';await page.locator('[data-pipe-refresh]').click();await page.getByText('Pipeline unavailable. Check your login, then refresh. Nothing was changed.',{exact:true}).waitFor();assert.equal(await page.locator('.pipeline-row').count(),0);
  mode='valid';await page.locator('[data-pipe-refresh]').click();await page.locator('.pipeline-row').first().waitFor();mode='denied';await page.locator('[data-pipe-refresh]').click();await page.waitForFunction(()=>!document.querySelector('.pipeline-row'));assert.equal(await page.locator('.pipeline-row').count(),0,'authentication failure clears private Pipeline rows');
  app.assertUnchanged();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);
  console.log('Pipeline actual dashboard1366/400/412: Today entry,7 groups,paged totals,existing deal/buyer opens,Calendar,GET refresh,no legacy overwrite,44px/contrast/list-only scrolling,no stale wrong-origin/error content,zero writes/external/errors passed.');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
prove().catch(e=>{console.error(e.stack);process.exitCode=1;});
