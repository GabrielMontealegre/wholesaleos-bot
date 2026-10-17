'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const {createMailboxReader}=require('../modules/email/mailbox-reader');
async function prove(){
  class Client{
    constructor(){this.mailbox={exists:1,uidValidity:1};}on(){}async connect(){}async logout(){}async getMailboxLock(){return{release(){}};}
    async *fetch(){yield{uid:1,envelope:{from:[{name:'Header Name',address:'public@example.test'}],date:new Date('2026-10-17T10:00:00Z')},flags:new Set()};}
  }
  const imap=await createMailboxReader({env:{GMAIL_USER:'operator@example.test',GMAIL_APP_PASSWORD:'LOCAL FIXTURE'},Client}).list();
  assert.equal(imap.messages[0].sender_name,'Header Name');
  const googleImpl={auth:{OAuth2:class{setCredentials(){}}},gmail:()=>({users:{messages:{list:async()=>({data:{messages:[{id:'header'}]}}),get:async()=>({data:{id:'header',payload:{headers:[{name:'From',value:'"Source Header" <public@example.test>'}]}}})}}})};
  const google=await createMailboxReader({env:{GMAIL_USER:'operator@example.test',GMAIL_CLIENT_ID:'LOCAL',GMAIL_CLIENT_SECRET:'LOCAL',GMAIL_REFRESH_TOKEN:'LOCAL'},googleImpl}).list();
  assert.equal(google.messages[0].sender_name,'Source Header');
  const malformed=await createMailboxReader({env:{GMAIL_USER:'operator@example.test',GMAIL_CLIENT_ID:'LOCAL',GMAIL_CLIENT_SECRET:'LOCAL',GMAIL_REFRESH_TOKEN:'LOCAL'},googleImpl,
    parse:async()=>{throw Error('PRIVATE PARSER DETAIL');}}).list();
  assert.equal(malformed.messages[0].sender_name,'');assert.ok(!JSON.stringify(malformed).includes('PRIVATE PARSER'));
  const fixture=createFixtureApp();const server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port;let browser;const writes=[],external=[],errors=[];
  const messages=Array.from({length:30},(_,i)=>({id:'layout-'+i,source_kind:'connected_mailbox',sender_name:i===1?'':'LOCAL TEST DATA - A very long source header sender name '+i,
    from:i===1?'only-address@example.test':'Source Header <source@example.test>',subject:'Synthetic subject '+i+' with a long title that must not push time off-screen',
    snippet:'Synthetic snippet only. '.repeat(5),date:'2026-10-17T10:00:00Z',direction:'in',unread:i===0,thread_key:String(i).padStart(64,'0'),conversation:i%2===0?{role:'buyer'}:null}));
  try{
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;const context=await browser.newContext();
    await context.route('**/*',route=>{
      const req=route.request(),url=new URL(req.url());if(!['GET','HEAD'].includes(req.method())){writes.push(req.method());return route.abort();}
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
      if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
      if(url.origin!==base){external.push(url.hostname);return route.abort();}
      if(url.pathname==='/api/dashboard/error-tracking-config')return route.fulfill({json:{enabled:false,dsn:''}});
      if(url.pathname==='/api/gmail/messages')return route.fulfill({json:{ok:true,status:'Connected (local test)',messages}});
      if(url.pathname.startsWith('/api/gmail/message/'))return route.fulfill({json:{...messages[0],body:'LOCAL TEST DATA\n'+('Long synthetic body\n'.repeat(100))}});
      return route.continue();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    for(const width of [1366,400,412]){
      const height=width===1366?768:915;await page.setViewportSize({width,height});await page.goto(base+'/dashboard/');
      await page.waitForFunction(()=>APP.currentUser);await page.evaluate(()=>navigate('gmail',null));await page.locator('.email-thread-row').first().waitFor();
      assert.equal(await page.locator('.email-thread-row').count(),30);
      assert.equal(await page.locator('.email-thread-row').filter({hasText:'Link to a person'}).count(),0);
      assert.equal(await page.locator('.email-sender').filter({hasText:'Sender name not supplied'}).count(),1,'an email local part is not a person name');
      const before=await page.evaluate(()=>{const nav=document.querySelector('.email-folders'),list=document.querySelector('.email-thread-scroll'),last=document.querySelector('[data-email-extra-folder]');return{navTop:nav.getBoundingClientRect().top,lastBottom:last.getBoundingClientRect().bottom,listHeight:list.clientHeight,listScrollHeight:list.scrollHeight};});
      assert.ok(before.lastBottom<=height&&before.listHeight>100&&before.listScrollHeight>before.listHeight,JSON.stringify(before));
      assert.equal(await page.locator('[data-email-extra-folder]').evaluate(el=>getComputedStyle(el).paddingLeft),'4px','native chooser leaves room for its label, not the kit arrow gutter');
      await page.locator('.email-thread-row').last().scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.email-folders').evaluate(el=>el.getBoundingClientRect().top),before.navTop,'only message list scrolls');
      assert.equal(await page.locator('.email-thread-scroll').evaluate(el=>el.scrollTop>0),true);
      const sender=page.locator('.email-sender').first();assert.equal(await sender.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
      await page.locator('.email-thread-row').first().click();await page.locator('[data-email-body]').waitFor();
      assert.ok(await page.locator('[data-email-send]').isDisabled());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.locator('[data-email-back]').click();await page.locator('.email-thread-row').first().waitFor();
      await page.mouse.move(0,0);await page.keyboard.press('Escape');
      if(process.argv.includes('--screenshots')){const dir=path.join(__dirname,'../docs/screens/2026-10-17-366-f');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'synthetic-inbox-'+width+'.png')});}
    }
    assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);fixture.assertUnchanged();
    console.log('Inbox layout1366/400/412: source sender names, no inferred identity/role, fixed reachable folders, independent list scrolling, long-name fit, thread/back and zero writes passed.');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
prove().catch(error=>{console.error(error);process.exitCode=1;});
