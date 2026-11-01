'use strict';
const DAY=86400000,STEPS=['F1','F2','F3','F4'],DELAYS=[1,2,3,7];
function invalid(){throw Error('follow_up_schedule_invalid');}
function record(value,required,allowed=required){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();
 const keys=Reflect.ownKeys(value);
 if(required.some(key=>!Object.hasOwn(value,key))||keys.some(key=>!allowed.includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')))invalid();
}
function list(value){if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>10000||Reflect.ownKeys(value).length!==value.length+1)invalid();for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value'))invalid();}return value;}
function id(value){if(typeof value!=='string'||!value.trim()||value.length>300||/[\x00-\x1f\x7f]/.test(value))invalid();return value;}
function day(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))invalid();const at=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(at)||new Date(at).toISOString().slice(0,10)!==value)invalid();return at;}
function scheduleFollowUps(outreach,interactionLog,options){
 record(options,['today']);const today=day(options.today),refs=new Map(),answeredAgents=new Set(),ids=new Set(),semantic=new Set(),outboundDays=new Set(),replyAgents=new Set();
 const allowed=['ref','agent_id','priority','contacted','answered','follow_up_on','address','market','next_step','last_answer_summary'];
 for(const row of list(outreach)){
  record(row,['ref','agent_id','priority','contacted','answered','follow_up_on'],allowed);id(row.ref);
  if(refs.has(row.ref)||row.agent_id!==null&&typeof row.agent_id!=='string'||!Number.isSafeInteger(row.priority)||row.priority<1||![true,false,null].includes(row.contacted)||![true,false,null].includes(row.answered))invalid();
  if(row.agent_id!==null)id(row.agent_id);if(row.follow_up_on!==null)day(row.follow_up_on);
  refs.set(row.ref,{row,events:[]});
  if(row.agent_id!==null&&row.answered===true)answeredAgents.add(row.agent_id);
 }
 for(const event of list(interactionLog)){
  record(event,['id','ref','agent_id','kind','step','at','source_kind']);id(event.id);id(event.ref);id(event.agent_id);
  const target=refs.get(event.ref),at=day(event.at),key=JSON.stringify([event.agent_id,event.ref,event.kind,event.step,event.at]);
  if(!target||target.row.agent_id!==event.agent_id||ids.has(event.id)||semantic.has(key)||at>today||event.source_kind!=='recorded_interaction'||!['questions','follow_up','reply'].includes(event.kind)||
   (event.kind==='follow_up'?!STEPS.includes(event.step):event.step!==null))invalid();
  if(event.kind!=='reply'){const sent=JSON.stringify([event.agent_id,event.at]);if(outboundDays.has(sent))invalid();outboundDays.add(sent);}
  if(event.kind==='reply')replyAgents.add(event.agent_id);
  ids.add(event.id);semantic.add(key);target.events.push({...event,day:at});
 }
 const candidates=[];
 for(const {row,events} of refs.values()){
  const base={agent_id:row.agent_id,ref:row.ref,priority:row.priority,source_kind:'derived_follow_up_schedule'};
  if(row.agent_id===null){candidates.push({...base,status:'missing_agent',next_step:null,due_on:null});continue;}
  const ordered=events.slice().sort((a,b)=>a.day-b.day||(a.kind==='reply'?-1:1));
  let last=null,index=0,replyDay=null;
  for(const event of ordered){
   if(event.kind==='reply'){if(replyDay===null)replyDay=event.day;continue;}
   if(replyDay!==null&&event.day>replyDay)invalid();
   if(event.kind==='questions'){if(last!==null)invalid();last=event.day;continue;}
   if(last===null||event.step!==STEPS[index]||event.day<last+DELAYS[index]*DAY)invalid();
   last=event.day;index++;
  }
  const answered=answeredAgents.has(row.agent_id)||replyAgents.has(row.agent_id);
  if(answered){candidates.push({...base,status:'answered_needs_decision',next_step:null,due_on:null});continue;}
  if(last===null){candidates.push({...base,status:'awaiting_questions',next_step:null,due_on:null});continue;}
  if(index===4){candidates.push({...base,status:'parked',next_step:null,due_on:null});continue;}
  const due=last+DELAYS[index]*DAY,sentToday=outboundDays.has(JSON.stringify([row.agent_id,options.today]));
  const dueOn=new Date(due).toISOString().slice(0,10);day(dueOn);
  candidates.push({...base,status:sentToday?'daily_limit':due<=today?'follow_up_due':'waiting',next_step:!sentToday&&due<=today?STEPS[index]:null,due_on:dueOn});
 }
 // One recommendation per agent, with stable property priority when several rows are due.
 const rank={answered_needs_decision:0,daily_limit:1,follow_up_due:2,waiting:3,awaiting_questions:4,parked:5,missing_agent:6};
 const compare=(a,b)=>a.priority-b.priority||(a.ref<b.ref?-1:a.ref>b.ref?1:0);
 const selected=new Map(),missing=[];
 for(const candidate of candidates){
  if(candidate.agent_id===null){missing.push(candidate);continue;}
  const previous=selected.get(candidate.agent_id);
  if(!previous||rank[candidate.status]<rank[previous.status]||rank[candidate.status]===rank[previous.status]&&compare(candidate,previous)<0)selected.set(candidate.agent_id,candidate);
 }
 return [...selected.values(),...missing].sort(compare);
}
module.exports={scheduleFollowUps};
