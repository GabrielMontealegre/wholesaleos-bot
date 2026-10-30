'use strict';
const assert=require('node:assert/strict'),express=require('express');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui');
const {registerWorkspacePreview}=require('../modules/ui/workspace-preview');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const {view}=require('./ask-workspace.test');
(async()=>{
 const fixture=createFixtureApp({seedLead:true}),app=express();let authenticated=true,role='admin';
 app.get('/api/auth/session',(_,res)=>res.json({authenticated,role}));
 app.get('/api/fixture-session-ended',(_,res)=>res.status(401).json({code:'SESSION_REQUIRED'}));
 registerWorkspacePreview(app);app.use(fixture.app);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
 let browser,reads=0,hold=false,release;const writes=[],external=[],errors=[];
 const message={id:'fixture-ask-mail',source_kind:'connected_mailbox',sender_name:'Synthetic Ask sender',from:'ask@example.test',subject:'Synthetic retained conversation',date:'2026-10-20T12:00:00Z',thread_key:'a'.repeat(64),direction:'in',link_status:'unlinked'};
 try{
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
  const context=await browser.newContext();
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(req.method()!=='GET'){writes.push(url.pathname);return route.abort();}
   if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
   if(url.origin!==base){external.push(url.hostname);return route.abort();}
   if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
   if(url.pathname==='/api/dashboard/ask-workspace'){
    reads++;if(hold){hold=false;await new Promise(resolve=>release=resolve);}
    try{return await route.fulfill({json:view});}catch{return;}
   }
   if(url.pathname==='/api/gmail/messages')return route.fulfill({json:{ok:true,messages:[message]}});
   if(url.pathname==='/api/gmail/message/'+message.id)return route.fulfill({json:{...message,body:'Synthetic Email source retained behind Ask.'}});
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.name));
  const loaded=()=>page.locator('[data-ask-status]').filter({hasText:'Recorded snapshot loaded'}).waitFor();
  for(const size of [{width:1366,height:768},{width:400,height:915},{width:412,height:915},{width:1038,height:503}])for(const screen of ['today','email']){
   await page.setViewportSize(size);const before=reads;await page.goto(base+'/app?view='+screen);
   const opener=page.getByRole('button',{name:'Open Ask WholesaleOS',exact:true});await opener.waitFor();await page.waitForLoadState('networkidle');
   assert.equal(reads,before,'No Ask fetch on native load');
   assert.equal(await page.locator('.ws-sidebar .ws-nav a').count(),2,'No native Deals migration');
   assert.equal(await page.locator('.wos-voice-tools').count(),0,'Voice does not attach to native Email');
   const boxes=await page.locator('.ws-topbar button,.ws-mail-search').evaluateAll(xs=>xs.map(x=>{const b=x.getBoundingClientRect();return {id:x.id,x:b.x,y:b.y,right:b.right,bottom:b.bottom,w:b.width,h:b.height};}).filter(b=>b.w&&b.h));
   const b=boxes.find(x=>x.id==='ask-open');assert(b&&b.w>=44&&b.h>=44&&b.x>=0&&b.right<=size.width);
   for(const other of boxes.filter(x=>x.id!=='ask-open'))assert(b.right<=other.x||b.x>=other.right||b.bottom<=other.y||b.y>=other.bottom,'Header actions do not overlap');
   if(screen==='email'){
    await page.locator('#mail-search').fill('Synthetic retained');
    await page.locator('.ws-mail-row').click();await page.locator('#mail-reply').click();
    await page.locator('#mail-draft-body').fill('SYNTHETIC unsent draft');
    assert.equal(await page.locator('#mail-draft-body').inputValue(),'SYNTHETIC unsent draft');
   }
   const url=page.url();await opener.click();await loaded();assert.equal(reads,before+1);
   assert.equal(await page.locator('#workspace-root #wos-ask-panel').count(),0,'Ask is outside native content');
   await page.locator('[data-ask-query]').fill('SYNTHETIC local question');await page.locator('#wos-ask-panel .wos-voice-tools').waitFor();
   await page.keyboard.press('Escape');await page.locator('#wos-ask-panel').waitFor({state:'detached'});
   assert.equal(page.url(),url);assert(await opener.evaluate(x=>x===document.activeElement));
   if(screen==='email'){
    assert.equal(await page.locator('#mail-search').inputValue(),'Synthetic retained');
    assert.equal(await page.locator('#mail-draft-body').inputValue(),'SYNTHETIC unsent draft');
    assert.equal(await page.locator('.ws-mail-body').innerText(),'Synthetic Email source retained behind Ask.');
    assert.equal(await page.locator('.ws-mail-composer .wos-voice-tools').count(),0);
   }
   await opener.click();await loaded();assert.equal(await page.locator('[data-ask-query]').inputValue(),'');
   await page.locator('[data-ask-close]').click();await page.locator('#wos-ask-panel').waitFor({state:'detached'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.goto(base+'/app');await page.locator('#ask-open').click();await loaded();
  const beforeHide=reads;await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  assert.equal(await page.locator('#wos-ask-panel').count(),0);assert.equal(reads,beforeHide);
  await page.locator('#ask-open').click();await loaded();assert.equal(reads,beforeHide+1);
  await page.locator('[data-ask-question="What did we do yesterday"]').click();await page.locator('[data-ask-calendar]').click();
  await page.waitForURL('**/dashboard/?workspace=calendar');await page.locator('#wos-calendar-workspace').waitFor({state:'attached'});
  await page.goto(base+'/app');await page.locator('#ask-open').click();await loaded();
  await page.locator('[data-ask-query]').fill(view.people[0].ref);await page.locator('[data-ask-form] button[type=submit]').click();await page.locator('[data-ask-record]').click();
  await page.waitForURL('**/dashboard/?record_ref='+view.people[0].ref);assert.equal(await page.locator('#wos-ask-panel').count(),0);
  await page.goto(base+'/app');await page.locator('#ask-open').click();await loaded();hold=true;
  await page.getByRole('button',{name:'Reload snapshot',exact:true}).click();await page.locator('[data-ask-status]').filter({hasText:'Loading recorded snapshot'}).waitFor();
  await page.evaluate(()=>fetch('/api/fixture-session-ended'));if(release){release();release=null;}
  await page.locator('#wos-ask-panel').waitFor({state:'detached'});
  await page.locator('#login').waitFor();const expiredReads=reads;await page.evaluate(()=>wosAskDemo.open());assert.equal(reads,expiredReads,'401 locks the native actor as well as clearing the dialog');
  authenticated=false;await page.reload();await page.locator('#login').waitFor();const lockedReads=reads;
  await page.evaluate(()=>wosAskDemo.open());assert.equal(reads,lockedReads);assert.equal(await page.locator('#ask-open').count(),0);
  authenticated=true;role='user';await page.reload();await page.locator('#login').waitFor();await page.evaluate(()=>wosAskDemo.open());
  assert.equal(reads,lockedReads);assert.equal(await page.locator('#wos-ask-panel').count(),0);
  fixture.assertUnchanged();assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('Ask native Today/Email: desktop/phone/short desktop entry44px/no overlap/no load fetch, same-screen return/focus/search preservation, private clearing, canonical Calendar/buyer links, unsigned/nonadmin and zero writes/errors passed');
 }finally{if(release)release();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(JSON.stringify({test:'ask-native-entry-ui',name:e.name,location:String(e.stack).match(/ask-native-entry-ui\.test\.js:\d+:\d+/)?.[0]||null,message:e.name==='AssertionError'?e.message:'fixture_failed'}));process.exitCode=1;});
