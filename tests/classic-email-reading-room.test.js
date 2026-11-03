'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
async function prove(){
 const fixture=createFixtureApp(),server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
 const shared={source_kind:'connected_mailbox',from:'Synthetic Agent <agent@example.test>',sender_name:'Synthetic Agent',subject:'Questions about a reported property and the next review',date:'2026-11-02T16:00:00Z',direction:'in',link_status:'linked',conversation:{role:'agent',status:'follow_up'},thread_key:'a'.repeat(64)};
 const rows=[{...shared,id:'earlier',date:'2026-11-01T16:00:00Z'},{...shared,id:'latest',unread:true},{...shared,id:'ambiguous',thread_key:'b'.repeat(64),conversation:null,link_status:'ambiguous'},{...shared,id:'unknown',thread_key:'c'.repeat(64),conversation:null,link_status:'unlinked'}];
 const body=id=>({...rows.find(r=>r.id===id),body:id==='earlier'?'Earlier synthetic message.':'Hello,\n\nHere is the recorded reply for your review.\n\n'+('Synthetic source paragraph. No business action was taken.\n\n'.repeat(30))+'FINAL SYNTHETIC LINE <img src=x onerror=attack()>'});
 let browser;const writes=[],external=[],errors=[];let reads=0;
 try{
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
  for(const width of [1366,400,412]){
   const height=width===1366?768:915,page=await browser.newPage({viewport:{width,height}});
   page.on('pageerror',e=>errors.push(e.name));
   await page.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(r.method()!=='GET'){writes.push(u.pathname);return route.abort();}if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});if(u.pathname==='/helper/status')return route.fulfill({json:{paired:false}});if(u.origin!==base){external.push(u.hostname);return route.abort();}
    if(u.pathname==='/api/gmail/messages')return route.fulfill({json:{ok:true,status:'Connected (synthetic)',messages:rows}});
    if(u.pathname==='/api/gmail/thread'){reads++;return route.fulfill({json:{messages:['latest','earlier'].map(body)}});}
    if(u.pathname.startsWith('/api/gmail/message/')){reads++;return route.fulfill({json:body(decodeURIComponent(u.pathname.split('/').pop()))});}
    return route.continue();});
   await page.goto(base+'/dashboard/?workspace=gmail');await page.waitForFunction(()=>APP.currentUser);await page.evaluate(()=>navigate('gmail',null));await page.locator('.email-thread-row').first().waitFor();
   assert.equal(await page.locator('.email-thread-row').count(),3);
   assert(await page.locator('.email-row-state').allTextContents().then(values=>values.includes('Recorded: Follow up / 2 messages')&&values.includes('Link needs review')&&values.includes('Not linked')));
   const before=reads;await page.getByLabel('Conversation role',{exact:true}).selectOption('agent');assert.equal(reads,before,'role filter never reads bodies');
   assert(await page.getByLabel('Conversation role',{exact:true}).evaluate(el=>el.getBoundingClientRect().width>=150&&getComputedStyle(el).paddingLeft==='4px'),'selected role label fits beside the native chooser arrow');
   if(process.env.WOS_EMAIL_READING_PROOF){fs.mkdirSync(process.env.WOS_EMAIL_READING_PROOF,{recursive:true});await page.mouse.move(0,0);await page.screenshot({path:path.join(process.env.WOS_EMAIL_READING_PROOF,'list-'+width+'.png')});}
   await page.locator('[data-email-message="latest"]').click();await page.locator('[data-email-body]').waitFor();
   assert.equal(reads,before+1,'one explicit open reads one thread');
   assert.equal(await page.locator('.email-thread-list').isVisible(),false);assert.equal(await page.locator('.email-folders').isVisible(),false);assert.equal(await page.locator('.email-composer').count(),0);
   assert.equal(await page.locator('.email-earlier[open]').count(),0);assert.equal(await page.locator('.email-body img').count(),0);
   assert((await page.locator('.email-reader-toolbar').innerText()).includes('Agents'));assert.equal(await page.locator('.email-recorded-state').innerText(),'Recorded: Follow up');
   const geometry=await page.locator('.email-messages').evaluate(el=>({height:el.clientHeight,width:el.parentElement.clientWidth,parent:el.closest('.email-panes').clientWidth,scroll:getComputedStyle(el).overflowY,bodyScroll:getComputedStyle(el.querySelector('.email-body')).overflowY,bodyTop:el.querySelector('[data-email-body]').getBoundingClientRect().top}));
   assert(geometry.height>=(width===1366?300:420),JSON.stringify(geometry));assert(geometry.width>=geometry.parent-1);assert.equal(geometry.scroll,'auto');assert(!['auto','scroll'].includes(geometry.bodyScroll));assert(geometry.bodyTop<height-250);
   if(process.env.WOS_EMAIL_READING_PROOF){await page.mouse.move(0,0);await page.screenshot({path:path.join(process.env.WOS_EMAIL_READING_PROOF,'reading-'+width+'.png')});}
   await page.locator('[data-email-compose-open]').click();await page.locator('[data-email-reply]').fill('Synthetic local draft');assert(await page.locator('[data-email-send]').isDisabled());
   await page.locator('[data-email-compose-close]').click();assert.equal(await page.locator('.email-composer').count(),0);assert(await page.locator('[data-email-compose-open]').evaluate(el=>el===document.activeElement));
   await page.locator('[data-email-compose-open]').click();assert.equal(await page.locator('[data-email-reply]').inputValue(),'Synthetic local draft');await page.keyboard.press('Escape');assert.equal(await page.locator('.email-composer').count(),0);
   await page.locator('.email-earlier summary').click();assert(await page.getByText('Earlier synthetic message.',{exact:true}).isVisible());
   await page.locator('[data-email-back]').click();assert.equal(await page.getByLabel('Conversation role',{exact:true}).inputValue(),'agent');assert(await page.locator('[data-email-message="latest"]').evaluate(el=>el===document.activeElement));assert.equal(reads,before+1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.close();
  }
  assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);fixture.assertUnchanged();
  console.log('classic-email-reading-room:1366/400/412 full-width reader, one scroll surface, latest-first visibility, explicit reply/draft/close/Escape, recorded/ambiguous/unknown status, exact GET/no writes passed');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
prove().catch(e=>{console.error(e.stack);process.exitCode=1;});
