'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui'),{launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const sample=require('./helpers/workflow-card-metadata-fixture'),approval=require('../dashboard/wos-approvals'),conversation=require('../dashboard/wos-conversation-cards'),pipeline=require('../dashboard/wos-pipeline-workspace'),bell=require('../dashboard/wos-notification-workspace'),clock=require('../dashboard/wos-card-clock');
const frozen=JSON.stringify(sample),codes=/BUY-0042|WOS-FL-1042|M-0042/;
async function prove(){
 const fixture=createFixtureApp({todayProof:true}),server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;let browser;
 const proof=process.env.WOS_WORKFLOW_WORDS_PROOF_DIR;if(proof)fs.mkdirSync(proof,{recursive:true});
 try{
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
  for(const width of [1366,400,412]){
   const page=await browser.newPage({viewport:{width,height:width===1366?768:915}}),errors=[],writes=[],external=[];
   page.on('pageerror',e=>errors.push(e.name));
   await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(req.method()!=='GET'){writes.push(u.pathname);return route.abort();}if(u.pathname==='/helper/status')return route.fulfill({json:{paired:false}});if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});if(u.origin!==base){external.push(u.hostname);return route.abort();}
    const api={'/api/dashboard/approvals':sample.approvals,'/api/dashboard/approvals/counts':sample.approvals.counts,'/api/dashboard/today-workspace':sample.work,'/api/dashboard/pipeline-workspace':sample.pipeline,'/api/dashboard/conversations':{now:sample.now,today:'2026-10-07',total:1,waiting_count:1,items:[sample.conversation]},'/api/notifications':sample.notifications};
    return Object.hasOwn(api,u.pathname)?route.fulfill({json:api[u.pathname]}):route.continue();});
   for(const view of ['approvals','pipeline','conversations','notifications']){
    await page.goto(base+'/dashboard/?workspace='+(view==='approvals'||view==='pipeline'?view:'today'));
    if(view==='conversations')await page.getByText('Conversation tools',{exact:true}).click();
    if(view==='notifications'){await page.getByRole('button',{name:'Notifications',exact:true}).click();await page.locator('[data-bell-view="work"]').click();}
    const selector={approvals:'.approval-card',pipeline:'.pipeline-row',conversations:'.cv-row',notifications:'#notif-panel li'}[view];await page.locator(selector).first().waitFor();
    assert(!codes.test(await page.locator(selector).innerText()),'standalone metadata absent from '+view);
    if(view==='approvals'){assert.equal(await page.locator('.approval-card').getAttribute('data-approval-id'),'workflow-buyer');assert(await page.locator('[data-approval-reviewed]').isDisabled());assert.equal(await page.locator('[data-approval-reviewed]:checked').count(),0);}
    if(view==='pipeline')assert.equal(await page.locator('[data-pipe-open]').getAttribute('data-pipe-open'),'approval:buyer:workflow-buyer');
    if(view==='conversations'){assert.equal(await page.getByRole('link',{name:'Open deal',exact:true}).getAttribute('href'),'/dashboard/?record_ref=WOS-FL-1042');assert((await page.locator('.cv-row').innerText()).includes('Source mentions BUY-7654 <img'));assert.equal(await page.locator('img[src="x"]').count(),0);}
    if(view==='notifications'){assert(await page.locator('[data-bell-read-all]').isDisabled());await page.getByRole('button',{name:'Open Today',exact:true}).click();assert(!(await page.locator('#notif-panel').isVisible()));await page.getByRole('button',{name:'Notifications',exact:true}).click();await page.locator('[data-bell-view="work"]').click();}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(proof){await page.mouse.move(0,0);await page.screenshot({path:path.join(proof,view+'-'+width+'.png')});}
   }
   assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(external,[]);await page.close();
  }
  const missing=conversation.render({...sample.conversation,linked_deals:[],refs:['WOS-FL-1042']},{clock,now:sample.now,today:'2026-10-07'});assert(!missing.includes('cv-primary'),'a reference alone never invents a record link');
  const escaped=approval.markup({...sample.approvals,buyers:[{...sample.buyer,name:'Source BUY-7654 <img src=x>'}]},{clock});assert(escaped.includes('Source BUY-7654 &lt;img'));assert(!escaped.includes('<img src=x>'));
  assert(!pipeline.markup({...sample.pipeline,items:[]},{clock}).includes('BUY-0042'));assert(bell.markup(bell.project(sample.notifications,sample.work),{clock}).includes('Source mentions M-7654 &lt;img'),'source alert text is not censored');
  assert.equal(JSON.stringify(sample),frozen);fixture.assertUnchanged();console.log('workflow-card-metadata:4actualscreens1366/400/412,metadata absence/exactIDs-links/reviewguards/workqueueNoWrites/sourceescape+nocensor/no guessed link/immutability/nooverflow passed');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
prove().catch(e=>{console.error(e.stack);process.exitCode=1;});
