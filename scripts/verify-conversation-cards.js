'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('./verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
async function prove({screenshots=false}={}) {
 const fixture=createFixtureApp(),server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;let browser;
 const rows=[{id:'later',person:'SYNTHETIC LATER',role:'title',due_date:'2026-10-15',status:'follow_up',refs:[]},
 {id:'today',person:'SYNTHETIC TODAY',role:'buyer',due_date:'2026-10-12',status:'follow_up',refs:[],thread_url:'https://www.messenger.com/t/123'},
 {id:'overdue',person:'SYNTHETIC OVERDUE',role:'partner',due_date:'2026-10-08',last_in:'2026-10-08T19:27:00Z',status:'follow_up',refs:['WOS-FL-1030'],linked_deals:[{id:'fixture-deal',ref:'WOS-FL-1030'}]}].map(row=>({...row,source_kind:'imported_report',ready_message:'',what_they_said:'',next_step:''}));
 const payload={today:'2026-10-12',total:3,waiting_count:2,items:rows};const writes=[],external=[],errors=[];
 try{browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;const context=await browser.newContext();
  await context.route('**/*',route=>{const request=route.request(),url=request.url();if(!['GET','HEAD'].includes(request.method())){writes.push(request.method());return route.abort();}
   if(url.startsWith(base+'/api/dashboard/conversations'))return route.fulfill({json:payload});
   if(url.startsWith('https://fonts.googleapis.com/'))return route.fulfill({contentType:'text/css',body:''});
   if(new URL(url).pathname==='/helper/status')return route.fulfill({json:{paired:false}});
   if(url.startsWith(base+'/'))return route.continue();external.push(new URL(url).hostname);return route.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1366,400,412]){await page.setViewportSize({width,height:915});await page.goto(base+'/dashboard/');await page.locator('[data-conversation-id=overdue]').waitFor();
   assert.deepEqual(await page.locator('.cv-row').evaluateAll(els=>els.map(el=>el.dataset.conversationId)),['overdue','today','later']);
   const text=await page.locator('#wos-conversations').innerText();assert.ok(text.includes('Oct 8, 12:27 PM'));assert.ok(!text.includes('2026-10-08'));assert.ok(!text.includes('Draft message not supplied'));assert.ok(!text.includes('Reported conversation'));
   assert.equal(await page.locator('[data-conversation-id=overdue] .cv-primary').count(),1);assert.equal(await page.locator('[data-conversation-id=today] .cv-primary').count(),1);assert.equal(await page.locator('[data-conversation-id=later] .cv-primary').count(),0);
   assert.equal(await page.locator('[data-recorded-role=partner]').count(),1);assert.equal(await page.locator('[data-conversation-id=overdue]').evaluate(el=>getComputedStyle(el).borderLeftColor),'rgb(167, 139, 250)');
   const geometry=await page.locator('#wos-conversations').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,overflow:el.scrollWidth>el.clientWidth+1};});assert.ok(geometry.left>=0&&geometry.right<=width&&!geometry.overflow);
   if(screenshots){await page.mouse.move(0,0);await page.keyboard.press('Escape');const dir=path.join(__dirname,'../docs/screens/2026-10-12-conversation-cards');fs.mkdirSync(dir,{recursive:true});await page.locator('#wos-conversations').screenshot({path:path.join(dir,'synthetic-conversations-'+width+'.png')});}
  }
  fixture.assertUnchanged();assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('Waiting cards full-index1366/400/412:overdue/today/rest order,human times,stored role colors,no empty filler,one primary action when sourced,zero writes/external calls passed.');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={prove};if(require.main===module)prove({screenshots:process.argv.includes('--screenshots')}).catch(e=>{console.error(e.stack);process.exitCode=1;});
