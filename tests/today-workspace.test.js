'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {buildTodayWorkspace,registerTodayWorkspace}=require('../modules/agents/today-workspace');
const conversations=require('../modules/records/conversations');
const deals=require('../modules/deals/reviewed-deals');
const samples=require('./reviewed-deals.test');
const ui=require('../dashboard/wos-today-workspace');
const clock=require('../dashboard/wos-card-clock');
const {dayAt}=require('../modules/records/calendar-day');
const now=samples.now;
const today=dayAt(now,'America/Mazatlan');
const shiftDay=(day,n)=>new Date(Date.parse(day+'T18:00:00Z')+n*86400000).toISOString().slice(0,10);
const store={buyers:[{id:'buyer-pending',record_ref:'BUY-0010',assistant_find:{approval:'pending'}}],reviewed_deals:[],activities:[
 {activity_id:'log1',ts:now,type:'email_sent',buyer_ref:'BUY-0010',summary:'PRIVATE MAIL BODY'},
 {activity_id:'log1',ts:now,type:'email_sent',buyer_ref:'BUY-0010'},
 {ts:'2026-10-08T12:00:00Z',type:'reply_received'},
 {ts:'2026-02-30T12:00:00Z',type:'found'}],conversations:Array.from({length:125},(_,i)=>({id:'conversation-'+i,person:'SYNTHETIC '+i,role:'not_recorded',refs:['BUY-'+String(i+1).padStart(4,'0')],channels:['manual'],last_in:now,status:'hot',thread_url:'',source_kind:'imported_report'}))};
const frozen=JSON.stringify(store),view=buildTodayWorkspace(store,{now});
assert.equal(view.counts.replies,125);assert.equal(view.actions.filter(a=>a.kind==='conversation').length,125,'no internal 100-row cap can hide replies');assert.equal(view.counts.approvals,1);assert.equal(view.actions.length,126);
const waitingStore={buyers:[],reviewed_deals:[],activities:[],conversations:[
 {id:'waiting',person:'Synthetic waiting contact',role:'seller',refs:[],channels:['manual'],last_in:shiftDay(today,-5)+'T18:00:00Z',last_out:shiftDay(today,-1)+'T18:00:00Z',status:'waiting_on_deal',captured_at:shiftDay(today,-1)+'T18:00:00Z'},
 {id:'reply',person:'Synthetic reply contact',role:'seller',refs:[],channels:['manual'],last_in:now,status:'follow_up',captured_at:now},
 {id:'due',person:'Synthetic due contact',role:'seller',refs:[],channels:['manual'],status:'to_send',due_date:today,captured_at:now},
 {id:'overdue',person:'Synthetic overdue contact',role:'seller',refs:[],channels:['manual'],status:'follow_up',due_date:shiftDay(today,-1),captured_at:now}
]};
const urgencyView=buildTodayWorkspace(waitingStore,{now});
assert.equal(urgencyView.actions.find(a=>a.heading==='Synthetic waiting contact').urgency,'waiting');assert.equal(urgencyView.actions.find(a=>a.heading==='Synthetic waiting contact').waiting_days,1,'waiting duration uses the recorded outgoing date');
assert.equal(urgencyView.actions.find(a=>a.heading==='Synthetic reply contact').urgency,'due_today','a reply with no recorded due date uses the canonical same-day due date');
assert.equal(urgencyView.actions.find(a=>a.heading==='Synthetic due contact').urgency,'due_today');assert.equal(urgencyView.actions.find(a=>a.heading==='Synthetic overdue contact').urgency,'overdue');
assert.equal(conversations.list(store,{now,limit:999}).items.length,100,'public conversation cap unchanged');
assert.equal(conversations.project(store,{now}).items.length,125);
assert.equal(view.last_24h.length,1);assert.equal(view.last_24h[0].label,'Outgoing email reported');assert.equal(view.coverage.email,'recorded_reports_only');assert.ok(!JSON.stringify(view.last_24h).includes('PRIVATE MAIL BODY'));assert.equal(JSON.stringify(store),frozen);
let valued=deals.ingest({buyers:[samples.buyer]},[deals.validate(samples.fixture(),now)],{now,operatorId:'fixture',createId:()=> 'deal1'}).store;
valued=deals.update(valued,'deal1',{action:'approve',reviewed_comps:true},{now,operatorId:'fixture'});
valued={...valued,reviewed_deals:valued.reviewed_deals.map(d=>({...d,closing_date:'2026-10-10'}))};
let good=buildTodayWorkspace(valued,{now});assert.equal(good.best_deals.length,1);assert.equal(good.counts.deadlines,1);assert.equal(good.best_deals[0].spread,deals.evaluate(valued.reviewed_deals[0],valued.buyers,now).matches[0].estimated_spread.low);assert.equal(good.grade_status,'interim_rules');assert.equal(good.best_deals[0].grade,'Gold');assert.deepEqual(good.best_deals[0].missing,['room']);assert.equal(good.best_deals[0].spread,6625,'fixture canonical room is below10000; do not inflate it for a grade');
for(const patch of [{approval:'pending'},{approval:'rejected'},{status:'closed'},{status:'dead'},{evidence_reviewed_at:''},{closing_date:'2026-10-01'},{closing_date:''},{comps:[],claimed_arv:9999999}])assert.equal(buildTodayWorkspace({...valued,reviewed_deals:[{...valued.reviewed_deals[0],...patch}]},{now}).best_deals.length,0,'forged, unreviewed, stale, closed or undated value cannot rank');
const closed=buildTodayWorkspace({...store,conversations:[{...store.conversations[0],status:'closed'}],activities:[]},{now});assert.equal(closed.counts.replies,0);
const boundary=buildTodayWorkspace({activities:[{ts:'2026-10-06T12:00:00Z',type:'found'},{ts:'2026-10-06T11:59:59Z',type:'found'}]},{now,releases:[{pr:343,at:now,source_url:'https://evil.example/343'},{pr:342,at:now,source_url:'https://github.com/GabrielMontealegre/wholesaleos-bot/pull/342'}]});assert.equal(boundary.last_24h.length,2,'24-hour boundary inclusive; wrong-origin release excluded');
const kinds=buildTodayWorkspace({buyers:[{id:'buyer1',record_ref:'BUY-0001'}],reviewed_deals:[],activities:[{ts:now,type:'found',buyer_ref:'BUY-0001'},{ts:now,type:'found',buyer_ref:'BUY-0002'}]},{now});assert.deepEqual(kinds.last_24h.map(e=>e.label).sort(),['Buyer found','Record found'],'record kinds come from exact records, never a guessed reference prefix');
assert.equal(buildTodayWorkspace({buyers:[{record_ref:'BUY-0001'},{record_ref:'BUY-0001'}],activities:[{ts:now,type:'found',buyer_ref:'BUY-0001'}]},{now}).last_24h[0].label,'Record found','ambiguous references cannot assign a kind');
const saved={fetch:global.fetch,clock:Date.now,write:fs.writeFileSync};let effects=0;
try{const deny=()=>{effects++;throw Error('side effect');};global.fetch=deny;Date.now=deny;fs.writeFileSync=deny;buildTodayWorkspace(store,{now});}finally{global.fetch=saved.fetch;Date.now=saved.clock;fs.writeFileSync=saved.write;}assert.equal(effects,0);
assert.throws(()=>buildTodayWorkspace({},{}),/today_clock_invalid/);
const html=ui.markup({...view,actions:[{...view.actions[0],label:'<script>attack</script>'}],best_deals:[],last_24h:[]},{clock});assert.ok(!html.includes('<script>attack</script>'));assert.ok(html.includes('&lt;script&gt;attack'));assert.ok(!html.includes('2026-10-07T12:00'));assert.ok(!html.includes('can_value YES'));
const routes={},admin=()=>{},db={readDBStrict:()=>store,writeDB:()=>{throw Error('write forbidden');}};
registerTodayWorkspace({get:(path,guard,handler)=>{assert.equal(guard,admin);routes[path]=handler;}},{db,requireAdmin:admin,now:()=>now});
const res={statusCode:200,set(){return this;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};
routes['/api/dashboard/today-workspace']({},res);assert.equal(res.body.counts.replies,125);
assert.equal(res.body.capabilities,undefined,'Standalone/old registrars do not invent an upload capability');
registerTodayWorkspace({get:(path,guard,handler)=>{routes[path]=handler;}},{db,requireAdmin:admin,now:()=>now,assistantSnapshotImport:true});
routes['/api/dashboard/today-workspace']({},res);assert.equal(res.body.capabilities.assistant_snapshot_import,true);
db.readDBStrict=()=>{throw Error('PRIVATE TOKEN');};routes['/api/dashboard/today-workspace']({},res);assert.equal(res.statusCode,503);assert.deepEqual(res.body,{code:'today_store_unavailable'});
console.log('Today workspace: uncapped canonical conversations, exact approvals/deadlines, unchanged value gates, no invented grades, 24h report truth, wrong-origin/future/missing/stale negatives, pure/no mutation, admin GET/error privacy and escaped human-time markup passed.');
