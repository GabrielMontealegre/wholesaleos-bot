'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {project,markup}=require('../dashboard/wos-notification-workspace');
const now='2026-10-13T21:00:00Z',work={source_kind:'derived_workflow',now,actions:[{key:'conversation:1',label:'Reply waiting',ref:'BUY-0001'}]};
const response={notifications:[{id:'N1',title:'<script>attack</script>',message:'PRIVATE FIXTURE BODY',read:false,created:now},{id:'N2',title:'Read alert',read:true}],unread:999};
const before=JSON.stringify(response),view=project(response,work);
assert.equal(view.unread,1,'count derives from unique validated stored alert IDs, not a forged summary');assert.equal(view.items.length,2);assert.equal(JSON.stringify(response),before);
const html=markup(view,{clock:{formatTime:()=> 'Tue 2:00 PM'}});assert.ok(html.includes('&lt;script&gt;attack'));assert.ok(!html.includes('<script>attack'));assert.ok(!html.includes('onclick='));assert.ok(html.includes('Recorded notification'));assert.ok(!html.includes('2026-10-13T21:00'));
assert.throws(()=>project([],work),/read_invalid/);assert.throws(()=>project(response,{...work,source_kind:'invented'}),/read_invalid/);
assert.throws(()=>project({notifications:[response.notifications[0],response.notifications[0]]},work),/read_invalid/,'ambiguous IDs must not silently discard an alert or mark two different alerts read');
assert.throws(()=>project({notifications:[{id:"N3' onclick='attack"}]},work),/read_invalid/);assert.throws(()=>project(response,{...work,actions:[null]}),/read_invalid/);
const smsId='00000000-0000-4000-8000-000000000002';assert.equal(project({notifications:[{id:smsId,title:'Reply received',type:'sms',read:false}]},work).unread,1,'the actual SMS writer UUID format must remain visible');
let effects=0;const fetchBefore=global.fetch,clockBefore=Date.now,writeBefore=fs.writeFileSync;
try{const deny=()=>{effects++;throw Error('side effect');};global.fetch=Date.now=fs.writeFileSync=deny;project(response,work);markup(view);}finally{global.fetch=fetchBefore;Date.now=clockBefore;fs.writeFileSync=writeBefore;}assert.equal(effects,0);
const source=fs.readFileSync(path.resolve(__dirname,'../dashboard/wos-notification-workspace.js'),'utf8');
function context(fetch){let originalSignout=0;const panel={innerHTML:'',dataset:{},classList:{add(){},toggle(){}},setAttribute(){}},badge={textContent:'',style:{}},bell={setAttribute(){},focus(){}};const window={signOutDashboard(){originalSignout++;},wosCardClock:{formatTime:()=> 'Tue 2:00 PM'}};const document={documentElement:{dataset:{wosScheme:'dark'}},getElementById:id=>id==='notif-panel'?panel:id==='notif-count-badge'?badge:id==='notif-bell-btn'?bell:null,addEventListener(){}};vm.runInNewContext(source,{window,document,fetch});return {window,panel,badge,signouts:()=>originalSignout};}
async function main(){
  const calls=[];let mode='good';const c=context(async(url,options)=>{calls.push({url,options});if(mode==='expired')return {ok:false,status:401,json:async()=>({})};if(url.endsWith('/read'))return {ok:mode!=='failed',status:mode==='failed'?503:200,json:async()=>({ok:true})};return {ok:true,json:async()=>url==='/api/notifications'?response:work};});
  await c.window.loadNotifications();assert.equal(calls.length,2);assert.ok(calls.every(x=>!x.options?.method),'loading never marks read');assert.equal(c.badge.textContent,'1');
  await c.window.readNotification('N999');assert.equal(calls.length,2,'forged or unloaded ID cannot post');
  mode='failed';await c.window.readNotification('N1');assert.equal(c.badge.textContent,'1','failed save cannot optimistically mark read');assert.ok(c.panel.innerHTML.includes('could not be saved'));
  mode='good';await c.window.readNotification('N1');assert.deepEqual(JSON.parse(calls.at(-1).options.body),{ids:['N1']});assert.equal(c.badge.textContent,'0');const after=calls.length;await c.window.markAllRead();assert.equal(calls.length,after,'zero unread never sends dangerous empty IDs/all request');
  mode='expired';await c.window.loadNotifications();assert.ok(!c.panel.innerHTML.includes('PRIVATE FIXTURE BODY'));assert.equal(c.badge.textContent,'');
  mode='good';await c.window.loadNotifications();mode='expired';await c.window.readNotification('N1');assert.ok(!c.panel.innerHTML.includes('PRIVATE FIXTURE BODY'));assert.equal(c.badge.textContent,'','expired explicit save clears cached private alerts');
  const smsCalls=[],sms=context(async(url,options)=>{smsCalls.push({url,options});return {ok:true,json:async()=>url.endsWith('/read')?{ok:true}:url==='/api/notifications'?{notifications:[{id:smsId,read:false}]}:work};});await sms.window.loadNotifications();await sms.window.markAllRead();assert.deepEqual(JSON.parse(smsCalls.at(-1).options.body),{ids:[smsId]});assert.equal(sms.badge.textContent,'0');
  let release;const deferred=new Promise(resolve=>{release=resolve;});const pending=context(async()=>{await deferred;return {ok:true,json:async()=>response};});const loading=pending.window.loadNotifications();pending.window.signOutDashboard();release();await loading;assert.equal(pending.signouts(),1);assert.ok(!pending.panel.innerHTML.includes('PRIVATE FIXTURE BODY'),'old session response cannot repaint');assert.equal(pending.badge.textContent,'');
  console.log('Bell: unique stored alert counts, forged IDs/summary, escaped text, pure projections, GET-only load, explicit bounded mark-read, failed-save truth, no empty-ID post,401 clearing and cancelled-session response passed.');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
