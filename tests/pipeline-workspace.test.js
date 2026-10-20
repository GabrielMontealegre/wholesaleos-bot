'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),https=require('node:https');
const workspace=require('../modules/records/pipeline-workspace'),reports=require('../modules/records/pipeline-reports'),conversations=require('../modules/records/conversations');
const {buildTodayWorkspace}=require('../modules/agents/today-workspace'),{buildCalendarWorkspace}=require('../modules/records/calendar-workspace');
const {markup}=require('../dashboard/wos-pipeline-workspace');
const now='2026-10-20T12:00:00Z',context={now,operatorId:'fixture-admin'};
function fixture(){return {buyers:[{id:'buyer-one',record_ref:'BUY-0001',name:'SYNTHETIC BUYER',assistant_find:{approval:'pending',status:'new',first_seen_at:now}}],reviewed_deals:[{id:'deal-one',record_ref:'WOS-FL-1031',address:'100 Synthetic St',city:'Fixture City',state:'FL',deal_kind:'own',status:'found',approval:'approved'}],leads:[],activities:[],conversations:[]};}
function report(extra={}){return {kind:'pipeline_item',report_id:'fixture-report',record_ref:'WOS-FL-1031',buyer_ref:'BUY-0001',waiting_on:'proof_of_funds',reason_code:'funds_requested',asked_at:'2026-10-19T12:00:00Z',next_date:'2026-10-21',next_step:'Review reported request.',source_url:'https://records.example.test/request',evidence_text:'Synthetic reported request; not funds proof.',captured_at:now,...extra};}
let store=reports.upsert(fixture(),report(),context).store;
store=conversations.upsert(store,{kind:'conversation',person:'SYNTHETIC BUYER',role:'buyer',refs:['BUY-0001'],channels:['manual'],status:'follow_up',last_out:'2026-10-19T12:00:00Z',due_date:'2026-10-23',next_step:'Review the recorded reply.',captured_at:now},context).store;
const before=JSON.stringify(store),original={fetch:global.fetch,hg:http.get,hr:http.request,sg:https.get,sr:https.request,write:fs.writeFileSync,now:Date.now};let attempts=0;
const denied=()=>{attempts++;throw Error('network/clock/write forbidden');};
try{
 global.fetch=http.get=http.request=https.get=https.request=fs.writeFileSync=Date.now=denied;
 const view=workspace.build(store,{now});
 assert.equal(view.view_kind,'pipeline_workspace');assert.equal(view.read_only,true);assert.equal(view.summary.open,3);assert.equal(view.counts.proof_of_funds,1);assert.equal(view.counts.gabriel,1);assert.equal(view.counts.buyer,1);assert.equal(view.counts.no_reply,0,'an outgoing conversation is not an offer');
 assert.equal(Object.values(view.counts).reduce((a,b)=>a+b,0),3);assert.equal(new Set(view.items.map(r=>r.key)).size,3);
 assert.ok(view.items.every(r=>r.verified===false));assert.ok(view.items.every(r=>r.money.net_fee===null));assert.equal(view.items.find(r=>r.kind==='approval').due_date,null,'a pending approval alone cannot invent a due date');assert.match(view.items.find(r=>r.kind==='approval').date_basis,/not recorded/);
 assert.deepEqual(buildTodayWorkspace(store,{now}).pipeline_summary,view.summary);
 const calendar=buildCalendarWorkspace(store,{now});assert.equal(calendar.events.find(e=>e.source_field==='pipeline_reports').day,view.items.find(r=>r.kind==='pipeline_report').due_date);assert.ok(calendar.events.find(e=>e.source_field==='pipeline_reports').reminder_basis.includes('not confirmed funds'));
 let many=fixture();many.buyers[0].assistant_find.approval='approved';
 for(let n=0;n<55;n++)many=reports.upsert(many,report({report_id:'fixture-'+n}),context).store;
 const page1=workspace.build(many,{now}),page2=workspace.build(many,{now,offset:50});assert.equal(page1.items.length,50);assert.equal(page1.total,55);assert.equal(page1.next_offset,50);assert.equal(page2.items.length,5);assert.equal(page2.next_offset,null);assert.equal(new Set([...page1.items,...page2.items].map(r=>r.key)).size,55);
 const closed=reports.upsert(store,report({report_id:'closed-report',waiting_on:'closed',reason_code:'no_funds',next_date:''}),context).store;
 assert.equal(workspace.build(closed,{now}).counts.closed,1);assert.equal(workspace.build(closed,{now}).total,3);assert.equal(workspace.build(closed,{now,group:'closed'}).items.length,1);assert.equal(buildCalendarWorkspace(closed,{now}).events.filter(e=>e.source_field==='pipeline_reports').length,1);
 const bad={...store,pipeline_reports:[{...store.pipeline_reports[0],source_kind:'verified_public_record'}]};assert.equal(workspace.build(bad,{now}).coverage.invalid_reports,1);assert.equal(workspace.build(bad,{now}).counts.proof_of_funds,0);
 const unknown={...store,buyers:[]};assert.equal(workspace.build(unknown,{now}).coverage.unlinked_reports,1);
 const duplicate={...store,buyers:[...store.buyers,{...store.buyers[0],id:'other-id'}]};const duplicateView=workspace.build(duplicate,{now});assert.equal(duplicateView.coverage.unlinked_tasks,2);assert.equal(duplicateView.counts.proof_of_funds,0);
 const hidden=fixture();hidden.reviewed_deals[0].deal_kind='jv';let protectedStore=reports.upsert(hidden,report({next_step:'100 Synthetic St',evidence_text:'100 Synthetic St',source_url:'https://records.example.test/100-Synthetic-St'}),context).store;
 protectedStore=reports.upsert(protectedStore,report({report_id:'second-hidden',next_step:'100 Synthetic St'}),context).store;
 const protectedView=workspace.build(protectedStore,{now});assert.ok(!JSON.stringify(protectedView).includes('100 Synthetic St'));assert.ok(!JSON.stringify(protectedView).includes('100-Synthetic-St'));assert.equal(buildCalendarWorkspace(protectedStore,{now}).events.filter(e=>e.source_field==='pipeline_reports').length,2,'opaque revision ids keep two unsigned reminders distinct');
 const corrupted={...store,pipeline_reports:{invalid:true}};assert.equal(buildTodayWorkspace(corrupted,{now}).pipeline_summary,null);assert.equal(buildTodayWorkspace(corrupted,{now}).coverage.pipeline,'unavailable');assert.equal(buildCalendarWorkspace(corrupted,{now}).coverage.pipeline_unavailable,1);assert.ok(buildCalendarWorkspace(corrupted,{now}).events.some(e=>e.source_field==='conversations.last_out'));
 for(const query of [{group:['buyer']},{group:'invented'},{offset:'-1'},{offset:'1.2'},{limit:'51'},{limit:'0'},{limit:['1']},{unknown:'true'}])assert.throws(()=>workspace.readOptions({query}),/pipeline_query_invalid/);
 assert.deepEqual(workspace.readOptions({query:{group:'buyer',offset:'50',limit:'25'}}),{group:'buyer',offset:50,limit:25});assert.deepEqual(workspace.readOptions({}),{group:'all',offset:0,limit:50});
 const malicious={...view,items:[{...view.items[0],name:'<img src=x onerror=alert(1)>',next_action:'<script>bad</script>',provenance:{source_url:'javascript:alert(1)'}}]};assert.ok(!markup(malicious).includes('<img'));assert.ok(markup(malicious).includes('&lt;img'));assert.ok(!markup(malicious).includes('href="javascript:'));assert.ok(!markup(view).includes('>Send<'));
 assert.equal(JSON.stringify(store),before);assert.equal(attempts,0);
 console.log('Pipeline workspace: canonical groups, count paging, explicit pending-only facts, no inferred offers/money/funds, exact references, forged/unlinked/unsigned privacy, same Today/Calendar dates, corrupt-store coverage, query negatives, escaping and zero network/clock/writes passed.');
}finally{global.fetch=original.fetch;http.get=original.hg;http.request=original.hr;https.get=original.sg;https.request=original.sr;fs.writeFileSync=original.write;Date.now=original.now;}
module.exports={fixture,report,now};
