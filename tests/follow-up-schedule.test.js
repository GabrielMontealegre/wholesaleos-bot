'use strict';
const assert=require('node:assert/strict');
const {scheduleFollowUps}=require('../modules/deals/follow-up-schedule');
const today='2026-10-31',rows=[],log=[],expected=[];
function row(index,patch={}){return {ref:'synthetic-ref-'+index,agent_id:'synthetic-agent-'+index,priority:index+1,contacted:null,answered:null,follow_up_on:null,...patch};}
function event(r,id,kind,at,step=null){return {id,ref:r.ref,agent_id:r.agent_id,kind,at,step,source_kind:'recorded_interaction'};}
for(let i=0;i<20;i++){
 const r=row(i);rows.push(r);
 const phase=i%5;
 log.push(event(r,'q-'+i,'questions','2026-10-01'));
 if(phase>=1)log.push(event(r,'f1-'+i,'follow_up','2026-10-02','F1'));
 if(phase>=2)log.push(event(r,'f2-'+i,'follow_up','2026-10-04','F2'));
 if(phase>=3)log.push(event(r,'f3-'+i,'follow_up','2026-10-07','F3'));
 if(phase>=4)log.push(event(r,'f4-'+i,'follow_up','2026-10-14','F4'));
 expected.push(phase===4?null:'F'+(phase+1));
}
const before=JSON.stringify({rows,log});
const result=scheduleFollowUps(rows,log,{today});assert.equal(result.length,20);
assert.deepEqual(result.map(r=>r.next_step),expected);assert.equal(result.filter(r=>r.status==='parked').length,4);
assert.deepEqual(result.slice(0,5).map(r=>r.due_on),['2026-10-02','2026-10-04','2026-10-07','2026-10-14',null]);
assert.equal(JSON.stringify({rows,log}),before);assert(result.every(r=>r.source_kind==='derived_follow_up_schedule'));
const one=row(0),q=event(one,'q','questions','2026-10-30');
assert.equal(scheduleFollowUps([one],[q],{today})[0].next_step,'F1');
assert.equal(scheduleFollowUps([one],[{...q,at:today}],{today})[0].status,'daily_limit');
assert.equal(scheduleFollowUps([one],[q,event(one,'f1','follow_up',today,'F1')],{today})[0].status,'daily_limit');
assert.equal(scheduleFollowUps([one],[q,event(one,'reply','reply',today)],{today})[0].status,'answered_needs_decision');
assert.equal(scheduleFollowUps([one],[{...q,at:today},event(one,'same-day-reply','reply',today)],{today})[0].status,'answered_needs_decision','Day precision cannot falsely reject a reply after questions on the same day');
assert.equal(scheduleFollowUps([{...one,answered:true}],[q],{today})[0].status,'answered_needs_decision');
assert.equal(scheduleFollowUps([one],[],{today})[0].status,'awaiting_questions');
assert.equal(scheduleFollowUps([{...one,agent_id:null}],[],{today})[0].status,'missing_agent');
assert.equal(scheduleFollowUps([one],[q],{today:'2026-10-30'})[0].status,'daily_limit');
assert.equal(scheduleFollowUps([one],[event(one,'q','questions','2026-10-29'),event(one,'f1','follow_up','2026-10-30','F1')],{today})[0].status,'waiting');
const another={...row(1),agent_id:one.agent_id};
const shared=[q,event(another,'other-q','questions','2026-10-29')];
assert.equal(scheduleFollowUps([another,one],shared,{today}).length,1,'One recommendation per agent, not per property');
assert.equal(scheduleFollowUps([another,one],shared,{today})[0].ref,one.ref,'Priority breaks equal due decisions deterministically');
assert.equal(scheduleFollowUps([another,one],[...shared,event(another,'other-reply','reply',today)],{today})[0].status,'answered_needs_decision','Any agent reply stops all property sequences');
for(const bad of [
 [{...q,agent_id:'forged'}], [{...q,ref:'missing'}], [{...q,at:'2026-11-01'}], [{...q,at:'2026-02-30'}], [q,q],
 [q,{...q,id:'different'}], [q,event(one,'f2','follow_up',today,'F2')], [q,event(one,'f1','follow_up','2026-10-29','F1')],
 [q,event(one,'f1','follow_up','2026-10-30','F1')], [{...q,price:100}], [{...q,source_kind:'assistant_guess'}]
])assert.throws(()=>scheduleFollowUps([one],bad,{today}),/follow_up_schedule_invalid/);
assert.throws(()=>scheduleFollowUps([one,one],[],{today}),/follow_up_schedule_invalid/);
assert.throws(()=>scheduleFollowUps([one],undefined,{today}),/follow_up_schedule_invalid/);
assert.throws(()=>scheduleFollowUps([one],[],{}),/follow_up_schedule_invalid/);
assert.throws(()=>scheduleFollowUps([one],[q,event(one,'reply','reply','2026-10-30'),event(one,'f1','follow_up',today,'F1')],{today}),/follow_up_schedule_invalid/);
const sequence=[event(one,'q','questions','2026-10-01'),event(one,'f1','follow_up','2026-10-02','F1'),event(one,'f2','follow_up','2026-10-04','F2'),event(one,'f3','follow_up','2026-10-07','F3')];
assert.equal(scheduleFollowUps([one],sequence,{today:'2026-10-13'})[0].status,'waiting');assert.equal(scheduleFollowUps([one],sequence,{today:'2026-10-14'})[0].next_step,'F4');
assert.deepEqual(scheduleFollowUps(rows.slice().reverse(),log.slice().reverse(),{today}),result,'Input order does not change stable schedule');
let calls=0;const forged={...q};Object.defineProperty(forged,'at',{get(){calls++;return today;}});assert.throws(()=>scheduleFollowUps([one],[forged],{today}),/follow_up_schedule_invalid/);assert.equal(calls,0);
const fs=require('node:fs'),http=require('node:http'),https=require('node:https'),restore=[],effects=[];
try{for(const [object,names] of [[Date,['now']],[fs,['readFileSync','writeFileSync']],[http,['request','get']],[https,['request','get']]])for(const name of names){const old=object[name];restore.push(()=>{object[name]=old;});object[name]=()=>{effects.push(name);throw Error('forbidden');};}assert.deepEqual(scheduleFollowUps(rows,log,{today}),result);assert.deepEqual(effects,[]);}finally{restore.reverse().forEach(fn=>fn());}
assert(!JSON.stringify(result).includes('price'));assert(!JSON.stringify(result).includes('message'),'Engine returns schedule identifiers, not sendable drafts');
console.log('follow-up-schedule: 20-row F1/F2/F3/F4/park batch,reply stop,agent daily cap,identity/date/sequence negatives and purity passed');
