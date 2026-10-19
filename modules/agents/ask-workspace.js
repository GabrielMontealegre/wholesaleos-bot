'use strict';
const today=require('./today-workspace'),calendar=require('../records/calendar-workspace');
const deals=require('../deals/reviewed-deals'),buyers=require('../buyers/assistant-finds');
const {dayAt}=require('../records/calendar-day');
function firstSeenDay(value,now){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,19)===value.slice(0,19)&&Date.parse(value)<=Date.parse(now)?dayAt(value,'America/Mazatlan'):null;}
function build(store,{now}){
  // Canonical projections decide stages, matches, dates and value; this is a read model only.
  const t=today.buildTodayWorkspace(store,{now}),c=calendar.buildCalendarWorkspace(store,{now});
  const d=deals.list(store,{now,includeHidden:true}),b=buyers.listFinds(store,{now});
  const people=b.items.slice(0,250).map(row=>({kind:'buyer',id:row.id,ref:row.record_ref||'',name:row.name||'Buyer name not recorded',
    approval:row.approval,areas:row.areas||[],states:row.states||[],criteria:row.what_they_buy||'',source_kind:'derived_workflow',captured_at:row.captured_at||null,
    next_step:row.approval==='approved'?'Review the buyer and confirm current buying criteria.':'Review the source before approving this buyer.',
    proof_of_funds:'Not established by this read-only view'}));
  const records=d.items.map(row=>{
    const e=row.evaluation,w=row.jv_workflow,location=[row.city,row.state,row.zip].filter(Boolean).join(', ');
    const restricted=row.deal_kind==='jv'&&!w?.full_package_evidence_ready;
    return {kind:'deal',id:row.id,ref:row.record_ref||'',name:restricted?location||'Property details withheld':row.address||location||'Property details not recorded',
      address_withheld:restricted,stage:w?.label||d.status_labels[e.status]||'Stage not recorded',
      stages:w?w.stages.map(s=>({label:s.label,recorded:s.recorded})):[],status:e.status,status_label:d.status_labels[e.status]||'Status not recorded',approval:row.approval,
      asking:e.asking,value_range:e.value.range,value_tier:e.value.tier,comp_count:e.value.comps.length,
      repair_estimate:row.repair_estimate??null,deadline:e.deadline,next_step:e.next_action,why:e.verdict_reason,
      match_total:e.matches.length,matches:e.matches.slice(0,50).map(m=>({buyer_id:m.id,name:m.name||'Buyer name not recorded',max_price:m.max_price??null,spread:m.estimated_spread||null})),
      first_seen_day:firstSeenDay(row.first_seen_at,now),
      source_kind:'derived_workflow',captured_at:row.captured_at||null};
  });
  const references=new Set(records.concat(people).map(row=>row.ref).filter(Boolean));
  const linked=c.conversations.filter(row=>(row.refs||[]).some(ref=>references.has(ref)));
  const conversations=linked.slice(0,250).map(row=>({id:row.id,person:row.person,refs:(row.refs||[]).filter(ref=>references.has(ref)),
    next_step:row.next_step,due_date:row.due_date,last_in:row.last_in,last_out:row.last_out,what_they_said:row.what_they_said,source_kind:row.source_kind}));
  return {source_kind:'derived_workflow',read_only:true,feed_incomplete:true,now,today:t.today,yesterday:c.yesterday,
    counts:t.counts,actions:t.actions.slice(0,100).map(a=>({key:a.key,kind:a.kind,id:a.record_id,name:a.heading,ref:a.ref,label:a.label,due_date:a.due_date||null})),
    best_deals:t.best_deals,records,people,conversations,events:c.events.slice(-250),brief:c.brief,
    coverage:{today:t.coverage,calendar:c.coverage,deal_total:d.counts.total,deals_returned:records.length,buyer_total:b.counts.total,buyers_returned:people.length,
      action_total:t.actions.length,actions_returned:Math.min(100,t.actions.length),event_total:c.total,events_returned:Math.min(250,c.events.length),linked_conversation_total:linked.length,conversations_returned:conversations.length}};
}
function register(app,{db,requireAdmin,now=()=>new Date().toISOString()}){
  app.get('/api/dashboard/ask-workspace',requireAdmin,(req,res)=>{
    res.set('Cache-Control','no-store');
    try{res.json(build(db.readDBStrict(),{now:now()}));}
    catch{res.status(503).json({code:'ask_workspace_unavailable'});}
  });
}
module.exports={build,register};
