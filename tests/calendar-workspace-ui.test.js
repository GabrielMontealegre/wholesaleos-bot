'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const {buildCalendarWorkspace}=require('../modules/records/calendar-workspace');
const conversations=require('../modules/records/conversations');
const now='2026-10-18T12:00:00Z';
async function prove(){
 let store={buyers:[{id:'fixture-buyer',record_ref:'BUY-0001',name:'LOCAL TEST BUYER',assistant_find:{approval:'approved'}}],reviewed_deals:[],activities:[],calendar:[]};
 store=conversations.upsert(store,{kind:'conversation',person:'LOCAL TEST CONTACT',role:'buyer',refs:['BUY-0001'],channels:['manual'],last_in:'2026-10-17T11:00:00Z',last_out:'2026-10-17T12:00:00Z',what_they_said:'LOCAL TEST <script>not code</script>',next_step:'Review the synthetic reply',due_date:'2026-10-18',status:'follow_up',captured_at:'2026-10-17T12:01:00Z',thread_url:'https://www.messenger.com/t/123'},{now,operatorId:'fixture-admin'}).store;
 for(let i=0;i<50;i++)store.activities.push({activity_id:'local-'+i,type:i%3===0?'call_note':i%3===1?'email_sent':'reply_received',channel:i%3===0?'phone':'email',buyer_ref:'BUY-0001',with:'LOCAL TEST CONTACT',ts:'2026-10-18T10:'+String(i).padStart(2,'0')+':00Z',summary:'LOCAL TEST REPORT '+i});
 store.calendar=[{id:'future-local',type:'close',date:'2026-11-10',title:'LOCAL TEST CLOSING'}];
 const data=buildCalendarWorkspace(store,{now}),fixture=createFixtureApp(),server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;let browser,deny=false,empty=false,todayFlag=true;const writes=[],external=[],errors=[];
 try{
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;const context=await browser.newContext();
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(!['GET','HEAD'].includes(req.method())){writes.push(req.method());return route.abort();}
   if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
   if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
   if(url.origin!==base){external.push(url.hostname);return route.abort();}
   if(url.pathname==='/api/dashboard/error-tracking-config')return route.fulfill({json:{enabled:false,dsn:''}});
   if(url.pathname==='/dashboard/wos-feature-flags.js'&&!todayFlag)return route.fulfill({contentType:'application/javascript',body:'window.wosDashboardFeatures={todayActionCenter:false};'});
   if(url.pathname==='/api/dashboard/calendar-workspace'){
    if(deny)return route.fulfill({status:401,json:{code:'dashboard_login_required'}});
    return route.fulfill({json:empty?{...data,total:0,events:[],conversations:[],brief:{yesterday_done:0,today_due:0}}:data});
   }return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1366,400,412]){
   await page.setViewportSize({width,height:width===1366?768:915});await page.goto(base+'/dashboard/');await page.locator('.marketplace-topnav').waitFor({state:'attached'});await page.evaluate(()=>navigate('calendar',null));
   await page.locator('[data-cal-event]').first().waitFor();assert.equal(await page.locator('.calendar-event').count()>30,true);
   const heading=await page.locator('.calendar-head').boundingBox();await page.locator('[data-cal-event]').last().scrollIntoViewIfNeeded();
   assert.equal(Math.round((await page.locator('.calendar-head').boundingBox()).y),Math.round(heading.y),'only the event list scrolls');
   assert.equal(await page.locator('.calendar-content').evaluate(el=>el.scrollTop>0),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(width<=412){assert.ok((await page.locator('[data-cal-type]').boundingBox()).width>=150);assert.ok((await page.locator('[data-cal-day]').boundingBox()).width>=150);}
   await page.locator('[data-cal-mode="all"]').click();await page.locator('[data-cal-event]').filter({hasText:'Follow-up due'}).click();await page.locator('#calendar-event-dialog').waitFor();
   assert.ok((await page.locator('#calendar-event-dialog').innerText()).includes('Review the synthetic reply'));assert.equal(await page.locator('#calendar-event-dialog script').count(),0);
   await page.locator('[data-cal-conversation]').click();await page.locator('#today-conversation-dialog').waitFor();await page.locator('[data-today-close]').click();await page.locator('#today-conversation-dialog').waitFor({state:'detached',timeout:3000});
   // Native dialog close events remove the node asynchronously after X/Escape.
   await page.locator('[data-cal-event]').filter({hasText:'Follow-up due'}).click();await page.locator('[data-cal-followup]').click();await page.locator('#today-conversation-dialog').waitFor();await page.keyboard.press('Escape');await page.locator('#today-conversation-dialog').waitFor({state:'detached',timeout:3000});assert.equal(await page.locator('#today-conversation-dialog').count(),0);
   await page.locator('[data-cal-event]').filter({hasText:'Follow-up due'}).click();await page.getByRole('button',{name:'Close calendar event',exact:true}).click();await page.locator('#calendar-event-dialog').waitFor({state:'detached',timeout:3000});assert.equal(await page.locator('#calendar-event-dialog').count(),0);
   await page.locator('[data-cal-event]').filter({hasText:'Follow-up due'}).click();await page.keyboard.press('Escape');await page.locator('#calendar-event-dialog').waitFor({state:'detached',timeout:3000});assert.equal(await page.locator('#calendar-event-dialog').count(),0);
   await page.locator('[data-cal-event]').filter({hasText:'Follow-up due'}).click();await page.locator('[data-cal-record]').click();await page.getByRole('tab',{name:'Buy box',exact:true}).waitFor();await page.evaluate(()=>navigate('calendar',null));await page.locator('[data-cal-event]').first().waitFor();
   await page.locator('[data-cal-yesterday]').click();assert.ok((await page.locator('.calendar-content').innerText()).includes('Oct 17, 2026'));
   await page.locator('[data-cal-type]').selectOption('email_in');assert.equal(await page.locator('[data-cal-event]').count(),0,'manual conversation is not an email');
   await page.locator('[data-cal-type]').selectOption('');await page.locator('[data-cal-mode="month"]').click();await page.locator('[data-cal-shift="1"]').click();assert.ok((await page.locator('.calendar-month-head').innerText()).includes('November 2026'));
   await page.locator('[data-cal-date="2026-11-10"]').click();await page.locator('[data-cal-event]').filter({hasText:'LOCAL TEST CLOSING'}).waitFor();
   await page.locator('[data-cal-add]').click();await page.locator('#me-title').waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();
   await page.locator('[data-cal-today]').click();await page.locator('[data-cal-type]').selectOption('call');assert.ok(await page.locator('[data-cal-event]').count()>0);
   const colors=await page.locator('.calendar-type').first().evaluate(el=>({color:getComputedStyle(el).color,width:getComputedStyle(el).borderLeftWidth,style:getComputedStyle(el).borderLeftStyle}));assert.equal(colors.color,'rgb(176, 140, 239)');assert.equal(colors.width,'3px');assert.equal(colors.style,'solid');
   await page.mouse.move(0,0);await page.keyboard.press('Escape');
   if(process.argv.includes('--screenshots')){const dir=path.join(__dirname,'../docs/screens/2026-10-18-366-b');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'synthetic-calendar-'+width+'.png')});}
  }
  todayFlag=false;await page.reload();await page.locator('.marketplace-topnav').waitFor({state:'attached'});await page.evaluate(()=>navigate('calendar',null));await page.locator('[data-cal-event]').filter({hasText:'Follow-up due'}).waitFor();await page.locator('[data-cal-event]').filter({hasText:'Follow-up due'}).click();await page.locator('[data-cal-conversation]').click();await page.locator('#calendar-event-dialog').filter({hasText:'Recorded conversation'}).waitFor();await page.keyboard.press('Escape');await page.locator('#calendar-event-dialog').waitFor({state:'detached',timeout:3000});assert.equal(await page.locator('#calendar-event-dialog').count(),0,'Calendar works with Today flag disabled');
  empty=true;await page.locator('[data-cal-refresh]').click();await page.locator('#wos-calendar-workspace').filter({hasText:'No recorded work in this view.'}).waitFor();assert.equal(await page.locator('[data-cal-event]').count(),0);
  empty=false;await page.locator('[data-cal-refresh]').click();await page.locator('[data-cal-event]').first().waitFor();
  deny=true;await page.locator('[data-cal-refresh]').click();await page.locator('#wos-calendar-workspace').filter({hasText:'Calendar unavailable.'}).waitFor({state:'attached'});assert.equal(await page.locator('[data-cal-event]').count(),0,'auth failure clears cached private rows even when the global session gate hides the app');
  assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);fixture.assertUnchanged();
  console.log('Calendar actual dashboard1366/400/412: activity/due dates, fixed header and scrolling list, month/day/type, conversation/prepare-follow-up, X/Escape, manual Add cancel, empty/auth loss, escaped reports and zero writes/external requests passed.');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
prove().catch(e=>{console.error(e);process.exitCode=1;});
