'use strict';
const assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('./verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const {annotate}=require('../modules/email/thread-view');
const example=require('../tests/inbox-thread-view.test');
async function prove({screenshots=false}={}){
 const fixture=createFixtureApp(),app=express();let writes=0,threadReads=0,noteReads=0,folderReads=0;const errors=[],external=[];
 const raw=example.messages.map((m,i)=>({...m,from:'SYNTHETIC SENDER '+(i+1),subject:i?'SYNTHETIC REPLY':'SYNTHETIC SUBJECT',body:'SYNTHETIC BODY '+i+' <script>not executable</script>',snippet:'SYNTHETIC SNIPPET',unread:i===2}));
 raw.push({id:'unlinked',source_kind:'connected_mailbox',message_id:'<unlinked@example.test>',date:example.now,from:'Buyer in name is not a role',subject:'SYNTHETIC UNKNOWN',body:'SYNTHETIC UNKNOWN BODY'});
 const metadata=annotate(raw,example.store,{now:example.now});
 app.use((req,res,next)=>{if(!['GET','HEAD'].includes(req.method)){writes++;return res.status(405).json({code:'fixture_read_only'});}next();});
 app.get('/api/gmail/messages',(req,res)=>{folderReads++;if(req.query.folder==='buyers')return res.status(404).json({ok:false,code:'email_folder_unavailable'});res.json({ok:true,status:'Connected (fixture only)',messages:metadata.map(({body,...m})=>m)});});
 app.get('/api/gmail/thread',(req,res)=>{threadReads++;const ids=JSON.parse(req.query.ids);res.json({ok:true,messages:metadata.filter(m=>ids.includes(m.id))});});
 app.get('/api/gmail/message/:id',(req,res)=>res.json(metadata.find(m=>m.id===req.params.id)));
 app.get('/api/dashboard/conversations',(_,res)=>{noteReads++;res.json({items:[{person:'SYNTHETIC NOTE',role:'buyer',next_step:'SYNTHETIC REPORTED NEXT STEP',captured_at:example.now}]});});
 app.use(fixture.app);const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;const context=await browser.newContext();
  await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith('https://fonts.googleapis.com/'))return route.fulfill({contentType:'text/css',body:''});if(new URL(url).pathname==='/helper/status')return route.fulfill({json:{paired:false}});if(url.startsWith(base+'/'))return route.continue();external.push(new URL(url).hostname);return route.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1366,400,412]){
   await page.setViewportSize({width,height:915});await page.goto(base+'/dashboard/');await page.evaluate(()=>navigate('gmail',null));await page.locator('[data-email-message]').first().waitFor();
   assert.equal(await page.locator('.email-thread-row').count(),2,'three exact-header messages collapse into one thread; unrelated subject stays separate');
   assert.equal(await page.locator('.email-unread').count(),1);assert.equal(await page.locator('.email-thread-row [data-recorded-role=buyer]').count(),1);
   assert.equal(await page.locator('.email-thread-row').filter({hasText:'Buyer in name'}).locator('[data-recorded-role]').count(),0);
   await page.locator('[data-email-role=buyer]').click();assert.equal(await page.locator('.email-thread-row').count(),1);await page.locator('[data-email-message]').click();await page.locator('[data-email-body]').first().waitFor();
   assert.equal(await page.locator('[data-email-body]').count(),3);const bodies=await page.locator('[data-email-body]').allTextContents();assert.ok(bodies[0].includes('BODY 0')&&bodies[2].includes('BODY 2'),'oldest to newest');assert.equal(await page.locator('[data-email-body] script,[data-email-body] img').count(),0);
   assert.ok(await page.locator('[data-email-send]').isDisabled());assert.equal(await page.locator('[data-email-deal="fixture-deal"]').count(),1);
   assert.equal(await page.locator('[data-email-send]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(34, 197, 94)','mockup primary green survives the global theme rules');
   const shape=await page.locator('.email-reading').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,scroll:el.scrollWidth,width:el.clientWidth};});assert.ok(shape.left>=0&&shape.right<=width&&shape.scroll<=shape.width+1,JSON.stringify(shape));
   assert.equal(await page.locator('[data-email-link-form] select').inputValue(),'');
   await page.locator('[data-email-reply]').fill('SYNTHETIC UNSENT DRAFT');await page.locator('[data-email-test]').click();await page.waitForFunction(()=>document.querySelector('[data-email-test]')?.disabled===false);assert.equal(await page.locator('[data-email-reply]').inputValue(),'SYNTHETIC UNSENT DRAFT','connection check does not erase a local unsent reply');
   if(width<900)assert.ok(!await page.locator('.email-thread-list').isVisible(),'phone uses full reading pane');
   await page.mouse.move(0,0);await page.keyboard.press('Escape');
   if(screenshots){const dir=path.join(__dirname,'../docs/screens/2026-10-12-inbox-workspace');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'synthetic-inbox-'+width+'.png')});}
   await page.locator('[data-email-back]').click();await page.locator('.email-folders [data-email-folder=notes]').click();await page.getByText('SYNTHETIC REPORTED NEXT STEP',{exact:true}).waitFor();assert.equal(await page.locator('.email-thread-row').count(),0,'reported notes never pretend to be mailbox messages');
   const before=folderReads;await page.locator('[data-email-role=buyer]').click();assert.equal(folderReads,before,'role filter is local, no mailbox fetch');
   await page.locator('[data-email-folder=inbox]').click();await page.locator('.email-thread-row').first().waitFor();await page.locator('.email-folders details summary').click();await page.locator('[data-email-folder=buyers]').click();await page.getByText('This Gmail label is not present. No label was created.',{exact:true}).waitFor();assert.equal(await page.locator('.email-thread-row').count(),0,'error clears stale mail');
  }
  assert.equal(threadReads,3);assert.ok(noteReads>=3);assert.equal(writes,0);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);fixture.assertUnchanged();
  console.log('Inbox full dashboard1366/400/412:3 panes/mobile reading,exact grouping,unread/explicit role,no guessed role,oldest-first plain text,disabled Send,known deal link,notes separation,local filters,missing-label clearing,zero writes/external calls passed.');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={prove};if(require.main===module)prove({screenshots:process.argv.includes('--screenshots')}).catch(e=>{console.error(e.stack);process.exitCode=1;});
