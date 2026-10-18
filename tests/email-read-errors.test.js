'use strict';
const assert=require('node:assert/strict');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const {registerMailboxReads}=require('../modules/email/mailbox-reader');

async function run(){
  const routes=new Map();
  const privateDetail='PRIVATE PROVIDER DETAIL <img src=x onerror=alert(1)> secret@example.test';
  let code='email_message_too_large';
  registerMailboxReads({get(path,...handlers){routes.set(path,handlers.at(-1));}},{requireAdmin(){},reader:{message:async()=>{const e=Error(privateDetail);e.code=code;e.status=413;throw e;}}});
  for(const value of ['email_message_too_large','email_message_stale','EPRIVATE']){
    code=value;let output,status,cache;
    await routes.get('/api/gmail/message/:id')({params:{id:'synthetic'}},{set(k,v){cache=v;return this;},status(v){status=v;return this;},json(v){output=v;return this;}});
    assert.equal(status,413);assert.equal(cache,'no-store');
    assert.equal(output.code,value==='EPRIVATE'?'email_connection_failed':value);
    assert.ok(!JSON.stringify(output).includes(privateDetail));
  }
  const fixture=createFixtureApp();
  const server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port;
  let browser,failure={status:413,code:'email_message_too_large'},reads=0;
  const writes=[],external=[],errors=[];
  const messages=[{id:'synthetic',sender_name:'LOCAL TEST DATA',subject:'Synthetic message',date:'2026-10-18T12:00:00Z',source_kind:'connected_mailbox'}];
  try{
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
    const context=await browser.newContext();
    await context.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());
      if(!['GET','HEAD'].includes(request.method())){writes.push(request.method());return route.abort();}
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
      if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
      if(url.origin!==base){external.push(url.hostname);return route.abort();}
      if(url.pathname==='/api/dashboard/error-tracking-config')return route.fulfill({json:{enabled:false,dsn:''}});
      if(url.pathname==='/api/gmail/messages')return route.fulfill({json:{ok:true,status:'Connected (local test)',messages}});
      if(url.pathname.startsWith('/api/gmail/message/')){
        reads++;
        return failure?route.fulfill({status:failure.status,json:{ok:false,code:failure.code,error:privateDetail}}):route.fulfill({json:{...messages[0],body:'Synthetic readable body'}});
      }
      return route.continue();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    for(const width of [1366,400,412]){
      await page.setViewportSize({width,height:width===1366?768:915});
      await page.goto(base+'/dashboard/');await page.waitForFunction(()=>APP.currentUser);
      await page.evaluate(()=>navigate('gmail',null));await page.locator('.email-thread-row').waitFor();
      for(const [status,code,text] of [
        [413,'email_message_too_large','message exceeds'],[413,'email_thread_too_large','conversation is too large'],
        [409,'email_message_stale','out of date'],[404,'email_message_missing','no longer available'],
        [400,'email_message_invalid','reference cannot'],[400,'email_thread_invalid','reference cannot'],
        [429,'email_busy','busy with other reads'],[503,'email_connection_failed','could not be read'],
        [503,privateDetail,'could not be read'],[503,'__proto__','could not be read'],[503,'toString','could not be read']
      ]){
        failure={status,code};const before=reads;
        await page.locator('.email-thread-row').click();
        await page.locator('[role="alert"]').filter({hasText:text}).waitFor();
        assert.equal(reads,before+1,'one click makes exactly one read, no automatic retry');
        assert.equal(await page.locator('.email-thread-row').count(),1,'a read failure keeps Inbox');
        assert.equal(await page.locator('[data-email-status]').textContent(),'Connected (local test)','failed body read does not assert broken authentication');
        assert.ok(!(await page.locator('#email-reader').textContent()).includes(privateDetail));
        assert.equal(await page.locator('[data-email-body]').count(),0);
      }
      if(process.argv.includes('--screenshots')){
        const fs=require('node:fs'),path=require('node:path'),dir=path.join(__dirname,'../docs/screens/2026-10-18-388-email');
        await page.mouse.move(0,0);await page.keyboard.press('Escape');
        fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'synthetic-read-error-'+width+'.png')});
      }
      failure=null;await page.locator('.email-thread-row').click();await page.locator('[data-email-body]').waitFor();
      assert.equal(await page.locator('[data-email-send]').isDisabled(),true);
      await page.locator('[data-email-back]').click();
      failure={status:401,code:'admin_required'};await page.locator('.email-thread-row').click();
      // The shared auth gate hides dashboard content after401; still clear its private DOM.
      await page.getByText('Sign in to the dashboard to read email.',{exact:true}).waitFor({state:'attached'});
      assert.equal(await page.locator('.email-thread-row').count(),0,'expired login clears private list');
      assert.equal(await page.locator('[data-email-body]').count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);fixture.assertUnchanged();
    console.log('Email failures1366/400/412: safe size/stale/missing/invalid/busy reasons, unknown/provider detail hidden, list preserved, one read/no retry, success recovery, expired login clears list, inert Send, no writes passed.');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(e=>{console.error(e.stack);process.exitCode=1;});
