'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui');
const {registerWorkspacePreview}=require('../modules/ui/workspace-preview');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
async function run(){
 const fixture=createFixtureApp({seedLead:true}),app=express();let authenticated=true,role='admin';
 app.get('/api/auth/session',(_,res)=>res.json({authenticated,role}));
 app.use('/api',(req,res,next)=>authenticated?next():res.status(401).json({code:'SESSION_REQUIRED'}));
 app.get('/api/auth/devices',(_,res)=>res.json({ok:true,devices:[]}));
 app.get('/api/dashboard/assistant-upload-keys',(_,res)=>res.json({ok:true,keys:[]}));
 app.get('/api/dashboard/assistant-snapshots',(_,res)=>res.json({ok:true,capabilities:{can_import:true,schema:'wos-assistant-snapshot',version:1,max_bytes:1048576},viewer_scope:'b'.repeat(64),latest:null}));
 const message={id:'fixture-more-message',source_kind:'connected_mailbox',sender_name:'Synthetic sender',from:'sender@example.test',subject:'Synthetic More navigation',date:'2026-10-20T12:00:00Z',thread_key:'a'.repeat(64),direction:'in',link_status:'unlinked'};
 app.get('/api/gmail/messages',(_,res)=>res.json({ok:true,messages:[message]}));
 app.get('/api/gmail/message/:id',(_,res)=>res.json({...message,body:'Synthetic source stays unchanged while More opens and closes.'}));
 registerWorkspacePreview(app);app.use(fixture.app);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
 let browser;const writes=[],external=[],errors=[],requests=[];
 try{
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
  const context=await browser.newContext();
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());
   if(req.method()!=='GET'){writes.push(url.pathname);return route.abort();}
   if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
   if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
   if(url.origin!==base){external.push(url.hostname);return route.abort();}requests.push(url.pathname);return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.name));
  async function openMore(width){
   if(width<=900)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
   const scope=page.locator(width<=900?'#mobile-nav':'.ws-sidebar');
   assert.equal(await scope.getByRole('button',{name:'More',exact:true}).count(),1);
   await scope.getByRole('button',{name:'More',exact:true}).click();
   await page.locator('#more-tools[open]').waitFor();
   assert.equal(await page.locator('dialog[open]').count(),1,'More never nests inside the mobile dialog');
   assert.equal(await page.locator('#mobile-nav').evaluate(x=>x.open),false);
  }
  const expected=['leads','deals','buyers','calendar','pipeline','approvals','settings'].map((key,i)=>({href:'/dashboard/?workspace='+key,label:['Leads','Deals','Buyers','Calendar','Pipeline','Approvals','Settings'][i]}));
  for(const size of [{width:1366,height:768},{width:400,height:915},{width:412,height:915},{width:1038,height:503}])for(const view of ['today','email']){
   await page.setViewportSize(size);await page.goto(base+'/app?view='+view);
   await page.locator('.ws-topbar').waitFor();
   if(view==='email'){await page.locator('.ws-mail-row').waitFor();await page.locator('.ws-mail-row').click();await page.locator('.ws-mail-body').waitFor();}
   await page.waitForLoadState('networkidle');
   const source=view==='email'?await page.locator('.ws-mail-body').innerText():null;
   const before=requests.length;await openMore(size.width);
   assert.deepEqual(await page.locator('#more-tools nav a').evaluateAll(xs=>xs.map(x=>({href:x.getAttribute('href'),label:x.textContent.trim()}))),expected);
   assert.equal(await page.locator('.ws-sidebar .ws-nav a').count(),2,'Only native Today and Email remain primary links');
   assert.equal(await page.locator('.ws-nav-note').count(),0);
   assert(!/classic view/i.test(await page.locator('#more-tools').innerText()));
   assert.equal(await page.locator('#more-tools').getByRole('button',{name:'Close More',exact:true}).count(),1);
   await page.keyboard.press('Shift+Tab');assert(await page.locator('#more-tools').getByRole('link',{name:'Settings',exact:true}).evaluate(x=>document.activeElement===x));
   await page.keyboard.press('Tab');assert(await page.getByRole('button',{name:'Close More',exact:true}).evaluate(x=>document.activeElement===x));
   await page.waitForFunction(()=>[...document.querySelectorAll('#more-tools img')].every(x=>x.complete&&x.naturalWidth>0));
   for(const control of await page.locator('#more-tools a,#more-tools button').all()){const r=await control.boundingBox();assert(r&&r.height>=44&&r.x>=0&&r.y>=0&&r.x+r.width<=size.width+1&&r.y+r.height<=size.height+1);}
   for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert(await page.locator('#more-tools').evaluate(x=>x.contains(document.activeElement)),'Focus stays within More');}
   if(process.env.WOS_MORE_PROOF_DIR){fs.mkdirSync(process.env.WOS_MORE_PROOF_DIR,{recursive:true});await page.locator('#more-tools').screenshot({path:path.join(process.env.WOS_MORE_PROOF_DIR,'more-'+view+'-'+size.width+'.png')});}
   await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);
   assert(await page.evaluate(mobile=>mobile?document.activeElement.id==='menu-open':document.activeElement.hasAttribute('data-open-more'),size.width<=900),'Focus returns to a visible opener');
   if(source!==null)assert.equal(await page.locator('.ws-mail-body').innerText(),source);
   assert.equal(requests.length,before,'Opening and closing More does not refetch data');
   await openMore(size.width);await page.getByRole('button',{name:'Close More',exact:true}).click();assert.equal(await page.locator('dialog[open]').count(),0);
   await openMore(size.width);await page.mouse.click(1,1);assert.equal(await page.locator('dialog[open]').count(),0,'Backdrop closes only More');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.goto(base+'/app');await page.locator('.ws-topbar').waitFor();await page.waitForLoadState('networkidle');await openMore(1038);
  await page.locator('#more-tools').getByRole('link',{name:'Settings',exact:true}).click();await page.waitForFunction(()=>window.APP?.unlocked===true);assert.equal(new URL(page.url()).searchParams.get('workspace'),'settings');
  await page.goto(base+'/app');await page.locator('.ws-topbar').waitFor();await openMore(1038);authenticated=false;
  await page.evaluate(()=>document.getElementById('refresh').click());await page.getByRole('heading',{name:'Unlock your workspace',exact:true}).waitFor();assert.equal(await page.locator('#more-tools').count(),0,'401 clears the More surface with private content');
  const lockedReads=requests.filter(p=>p.startsWith('/api/dashboard/today-workspace')||p==='/api/gmail/messages').length;
  authenticated=true;role='user';await page.reload();await page.locator('#login').waitFor();assert.equal(await page.locator('[data-open-more]').count(),0);assert.equal(requests.filter(p=>p.startsWith('/api/dashboard/today-workspace')||p==='/api/gmail/messages').length,lockedReads,'Non-admin never reads native business data');
  fixture.assertUnchanged();assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('workspace-more-navigation: Today+Email1366/400/412+shortdesktop/oneMore/exact7destinations/44px/icons/X/Escape/backdrop/focus/no nested modal/no extra reads/source preservation/Settings/401/nonadmin and zero writes/errors passed');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(JSON.stringify({test:'workspace-more-navigation',assertion:error.name==='AssertionError',location:String(error.stack).match(/workspace-more-navigation\.test\.js:\d+:\d+/)?.[0]||null,messageCode:/Timeout/.test(error.name)?'fixture_timeout':'test_failed'}));process.exitCode=1;});
