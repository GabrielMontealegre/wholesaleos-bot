'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const clock=require('../dashboard/wos-card-clock');
const now='2026-10-28T19:18:00.000Z',recent='2026-10-24T19:18:00.000Z',old='2026-10-20T19:18:00.000Z';
function contract(){
 const source=fs.readFileSync(path.join(__dirname,'../dashboard/wos-card-clock.js'),'utf8');
 class InjectedDate extends Date{constructor(...args){assert(args.length,'No implicit wall clock');super(...args);}static now(){throw Error('No wall clock');}}
 const pure={module:{exports:{}},Date:InjectedDate,Intl,fetch(){throw Error('No network');},require(){throw Error('No filesystem');},Math:Object.assign(Object.create(Math),{random(){throw Error('No entropy');}})};
 vm.runInNewContext(source,pure);const api=pure.module.exports;
 const cases=[[now,'Wed 12:18 PM'],[recent,'Sat 12:18 PM'],['2026-10-21T19:18:00.000Z','Wed 12:18 PM'],['2026-10-21T19:17:59.999Z','Oct 21'],[old,'Oct 20'],['2025-10-24T19:18:00Z','Oct 24, 2025'],['2026-10-28T06:30:00Z','Tue 11:30 PM']];
 for(const [value,label]of cases){assert.equal(api.formatTime(value,now),label);assert.equal(clock.formatTime(value,now),label);}
 const sunday='2026-10-26T07:01:00Z';
 assert.equal(api.formatTime('2026-10-25T06:59:00Z',sunday),'Sat 11:59 PM','Calendar-week rollover must not shorten a recent timestamp');
 for(const bad of [null,undefined,0,{},[],new String(now),'10/24/2026','2026-02-30T12:00:00Z','2026-10-28T19:18:00','2026-10-28T19:18:00+00:00','2026-10-28','2026-10-28T19:18:00.001Z','<script>date</script>'])assert.equal(api.formatTime(bad,now),'Unknown');
 for(const badNow of [null,'10/28/2026','2026-02-30T12:00:00Z',{}])assert.equal(api.formatTime(recent,badNow),'Unknown');
 assert.equal(api.formatDate('2026-10-24'),'Oct 24, 2026','Date-only source meaning/year do not change');
 assert.equal(api.formatDate('10/24/2026'),'Unknown','No ambiguous source-date inference');
 for(const file of ['index.html','workspace/index.html'])assert(fs.readFileSync(path.join(__dirname,'../dashboard',file),'utf8').includes('/dashboard/wos-card-clock.js?v=2'));
}
async function ui(){
 const {browser}=await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true});
 const message=(id,date)=>({id,thread_key:id.repeat(64),source_kind:'connected_mailbox',from:'person@example.test',sender_name:'Fixture person',subject:'Fixture '+id,date,link_status:'unlinked'});
 const messages=[message('a',recent),message('b',old)],today={source_kind:'derived_workflow',now,today:'2026-10-28',counts:{replies:0,approvals:0,followups:0,deadlines:0},actions:[],pending:{drafts:[],waiting:[],bounced:[],reminders:[]},best_deals:[],last_24h:[{key:'fixture-time',label:'Conversation updated (reported)',at:'2026-10-28T18:18:00Z',source_kind:'recorded_activity'}]};
 const unchanged=JSON.stringify({messages,today}),writes=[],external=[],errors=[];
 try{
  for(const width of [1366,400,412]){
   const page=await browser.newPage({viewport:{width,height:width===1366?768:915}});
   await page.addInitScript(value=>{const Original=Date;window.Date=class extends Original{constructor(...args){super(...(args.length?args:[value]));}static now(){return value;}};},Date.parse(now));
   page.on('pageerror',error=>errors.push(error.name));
   await page.route('**/*',route=>{const req=route.request(),url=new URL(req.url());
    if(req.method()!=='GET'){writes.push(url.pathname);return route.abort();}if(url.origin!=='https://fixture.test'){external.push(url.hostname);return route.abort();}
    if(url.pathname==='/api/auth/session')return route.fulfill({json:{authenticated:true,role:'admin'}});
    if(url.pathname==='/api/gmail/messages')return route.fulfill({json:{ok:true,messages}});
    if(url.pathname.startsWith('/api/gmail/message/'))return route.fulfill({json:{...messages.find(m=>m.id===url.pathname.split('/').pop()),body:'Fixture source text remains exact.'}});
    if(url.pathname.endsWith('/thread-replies/status'))return route.fulfill({json:{enabled:false,configured:true}});
    if(url.pathname==='/api/dashboard/today-workspace')return route.fulfill({json:today});
    if(url.pathname==='/api/dashboard/assistant-snapshots')return route.fulfill({json:{ok:true,capabilities:{can_import:true,schema:'wos-assistant-snapshot',version:1,max_bytes:1048576},viewer_scope:'b'.repeat(64),latest:null}});
    const relative=url.pathname==='/app'?'workspace/index.html':url.pathname.startsWith('/dashboard/')?url.pathname.slice(11):null;assert(relative&&!relative.includes('..'));
    return route.fulfill({contentType:relative.endsWith('.html')?'text/html':relative.endsWith('.css')?'text/css':relative.endsWith('.svg')?'image/svg+xml':'text/javascript',body:fs.readFileSync(path.join(__dirname,'../dashboard',relative))});
   });
   await page.goto('https://fixture.test/app?view=email');await page.locator('.ws-mail-row').first().waitFor();
   assert.deepEqual(await page.locator('.ws-mail-row time').allTextContents(),['Sat 12:18 PM','Oct 20']);
   await page.locator('.ws-mail-row').filter({hasText:'Fixture b'}).click();await page.locator('.ws-mail-body').waitFor();assert.equal(await page.locator('.ws-mail-body').innerText(),'Fixture source text remains exact.');
   assert.equal(await page.locator('.ws-mail-message time').first().innerText(),'Oct 20');
   await page.goto('https://fixture.test/app?view=today');await page.locator('.ws-today-activity [data-row]').first().waitFor();
   assert((await page.locator('.ws-today').innerText()).includes('Wed 11:18 AM'));
   assert(!(await page.locator('.ws-today').innerText()).includes('T18:18:00'));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.close();
  }
  assert.equal(JSON.stringify({messages,today}),unchanged);assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
}
contract();ui().then(()=>console.log('plain-card-times: rolling7day/oldyear/UTC7/strictfuture+ambiguous+calendar negatives/purity/cache2 and native Email+Today3size exact source/no writes passed')).catch(error=>{console.error(JSON.stringify({test:'plain-card-times',assertion:error.name==='AssertionError',location:String(error.stack).match(/plain-card-times\.test\.js:\d+:\d+/)?.[0]||null}));process.exitCode=1;});
