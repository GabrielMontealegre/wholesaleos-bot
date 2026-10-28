'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixture}=require('./helpers/remembered-device-server.cjs');
const {discoverInstalledChromiumExecutables}=require('../modules/research/playwright-browser-resolver');
const playwright=require('playwright');
let markupDifference=null;
async function run(){
 const fixture=await createFixture(),origin='https://shared-login.example.test';let browser;
 const errors=[],external=[],writes=[];let logins=0,holdLogin=false,releaseLogin;
 try{
  await fixture.start();
  const executable=fs.existsSync(playwright.chromium.executablePath())?playwright.chromium.executablePath():discoverInstalledChromiumExecutables()[0];
  browser=await playwright.chromium.launch({executablePath:executable,headless:true});
  const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname==='127.0.0.1'&&['8801','8797'].includes(url.port)&&url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
   if(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.fulfill({contentType:'text/css',body:''});
   if(url.origin!==origin){external.push(url.hostname);return route.abort();}
   if(req.method()==='POST'&&url.pathname==='/api/auth/login'){logins++;if(holdLogin)await new Promise(resolve=>{releaseLogin=resolve;});}
   else if(!['GET','HEAD'].includes(req.method())){writes.push(url.pathname);return route.abort();}
   const headers={...req.headers(),host:new URL(origin).host,'x-forwarded-proto':'https'};delete headers['content-length'];
   const response=await route.fetch({url:fixture.base+url.pathname+url.search,headers,maxRedirects:0});await route.fulfill({response});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.name));
  for(const size of [{width:1366,height:768},{width:400,height:915},{width:412,height:915},{width:1038,height:503}]){
   await page.setViewportSize(size);let canonical;
   for(const entry of ['/dashboard/','/app','/app?preview=1&view=email']){
    await page.goto(origin+entry);await page.locator('#login').waitFor();
    assert.equal(await page.locator('.pin-pad,.pin-btn').count(),0,'No second keypad screen');
    const markup=await page.locator('#login').evaluate(n=>{const copy=n.cloneNode(true);copy.querySelector('#login-error').textContent='';return copy.outerHTML;});if(canonical){if(markup!==canonical){let i=0;while(markup[i]===canonical[i]&&i<markup.length)i++;markupDifference={entry,offset:i,actual:markup.slice(i,i+80),expected:canonical.slice(i,i+80)};}assert.equal(markup,canonical,'Both entries mount exactly the same PIN component,apart from contextual status text');}else canonical=markup;
    assert.equal(await page.locator('#remember-device').isChecked(),false);
    await page.waitForFunction(()=>[...document.querySelectorAll('#login img')].every(x=>x.complete&&x.naturalWidth>0));
    for(const selector of ['#pin','#unlock','.wos-remember-choice']){const r=await page.locator(selector).boundingBox();assert(r&&r.height>=44&&r.x>=0&&r.y>=0&&r.x+r.width<=size.width+1&&r.y+r.height<=size.height+1);}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(process.env.WOS_SHARED_LOGIN_PROOF_DIR){fs.mkdirSync(process.env.WOS_SHARED_LOGIN_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.WOS_SHARED_LOGIN_PROOF_DIR,(entry==='/dashboard/'?'classic':entry==='/app'?'native':'email-login')+'-'+size.width+'.png'),mask:[page.locator('input:not([type=checkbox])')]});}
   }
  }
  await page.goto(origin+'/dashboard/?workspace=settings');await page.locator('#pin').fill(fixture.pin);holdLogin=true;
  await page.locator('#unlock').click();await page.waitForFunction(()=>document.querySelector('#unlock')?.disabled===true);
  await page.locator('#pin').press('Enter');assert.equal(logins,1,'Pending submit has one request');assert.equal(await page.locator('#pin').inputValue(),'');
  holdLogin=false;releaseLogin();await page.waitForFunction(()=>window.APP?.unlocked===true);await page.locator('#remembered-device-settings').waitFor();
  const cookie=(await context.cookies()).find(x=>x.name==='wos_session');assert(cookie&&cookie.httpOnly&&cookie.secure&&cookie.sameSite==='Strict');assert.equal(cookie.expires,-1,'Unchecked shared form preserves the browser-session contract');
  await page.goto(origin+'/app');await page.getByRole('heading',{name:'Your assistant sheet',exact:true}).waitFor();
  assert.equal(await page.locator('#login').count(),0,'Same classic session opens native Today without a second login');assert.equal(logins,1);
  await page.goto(origin+'/app?view=email');await page.locator('.ws-mail-list').waitFor();assert.equal(await page.locator('#login').count(),0);
  await page.goto(origin+'/dashboard/?workspace=settings');await page.locator('#remembered-device-settings').waitFor();assert.equal(logins,1);
  assert.equal((await context.cookies()).find(x=>x.name==='wos_session').value,cookie.value,'Navigation reuses the same signed cookie,not a second identity');
  const anonymous=await browser.newContext({viewport:{width:400,height:915}});const isolated=await anonymous.newPage();
  await isolated.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===origin?route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><div id="host"></div>'}):route.abort();});
  await isolated.goto(origin+'/component');await isolated.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../dashboard/wos-dashboard-login.js'),'utf8')});
  await isolated.evaluate(()=>{window.completed=0;window.WOSDashboardAuth={authenticate:()=>new Promise(resolve=>{window.release=resolve;})};window.destroy=WOSDashboardLogin.mount(document.querySelector('#host'),{message:'<script>unsafe</script>',onAuthenticated:()=>{window.completed++;}});});
  assert.equal(await isolated.locator('#login-error script').count(),0,'Status messages are escaped as text');
  await isolated.locator('#pin').fill('synthetic-component-only');await isolated.locator('#unlock').click();
  await isolated.evaluate(()=>{window.destroy();window.WOSDashboardLogin.mount(document.querySelector('#host'),{message:'New sign-in screen',onAuthenticated:()=>{window.completed++;}});window.release({ok:true,user:{id:'synthetic',role:'admin'}});});
  await isolated.waitForTimeout(50);assert.equal(await isolated.evaluate(()=>window.completed),0,'Disposed form cannot apply a late identity');assert.equal(await isolated.locator('#pin').inputValue(),'');assert.equal(await isolated.locator('#remember-device').isChecked(),false);
  await anonymous.close();assert.deepEqual(external,[]);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);assert(!fixture.logsContain([fixture.pin,fixture.secret,cookie.value]));
  console.log('shared-dashboard-login: identical PIN component3size+shortdesktop/one actual signed login across classic-Today-Email/unchanged cookie+session-only contract/pending+late privacy/escaped errors/no external or unrelated writes passed');
 }finally{if(browser)await browser.close();await fixture.close();}
}
run().catch(error=>{console.error(JSON.stringify({test:'shared-dashboard-login',assertion:error.name==='AssertionError',location:String(error.stack).match(/shared-dashboard-login\.test\.js:\d+:\d+/)?.[0]||null,messageCode:/synthetic_server_start_timeout/.test(error.message)?'fixture_start_timeout':'test_failed',markupDifference}));process.exitCode=1;});
