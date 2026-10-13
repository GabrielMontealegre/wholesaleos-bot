'use strict';
const conversations=require('../records/conversations');
const deals=require('../deals/reviewed-deals');
const activity=require('../records/record-activity');
const {dayAt}=require('../records/calendar-day');
const DAY=86400000;
function instant(value,now) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))return null;
  const n=Date.parse(value);
  return Number.isFinite(n)&&n<=now&&new Date(n).toISOString().slice(0,19)===value.slice(0,19)?n:null;
}
function date(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null;}
function buildTodayWorkspace(store,{now,timeZone='America/Mazatlan',releases=[]}={}) {
  const clock=instant(now,Infinity);if(clock==null)throw Error('today_clock_invalid');
  const today=dayAt(now,timeZone),cutoff=clock-DAY;
  const view=conversations.project(store,{now,timeZone});
  const actions=[],pendingBuyers=(store.buyers||[]).filter(b=>b.assistant_find?.approval==='pending'&&b.assistant_find.status!=='not_a_fit');
  const reviewed=(store.reviewed_deals||[]).map(d=>({d,e:deals.evaluate(d,store.buyers||[],now)}));
  const pendingDeals=reviewed.filter(({d,e})=>d.approval==='pending'&&!['STALE','NO'].includes(e.verdict)&&!['closed','dead','expired'].includes(e.status));
  for(const c of view.items)if(c.status==='hot'||c.status==='to_send'||c.due_date&&c.due_date<=today){
    actions.push({key:'conversation:'+c.id,kind:'conversation',record_id:c.id,ref:c.refs.join(' / '),label:c.status==='hot'?'Reply waiting':c.status==='to_send'?'Draft needs review':'Follow-up due',due_date:date(c.due_date),recorded_at:c.captured_at,source_kind:c.source_kind,action_label:'Open conversation',conversation:c});
  }
  for(const b of pendingBuyers)actions.push({key:'buyer:'+b.id,kind:'buyer',record_id:b.id,ref:activity.reference(b),label:'Buyer needs approval',source_kind:'derived_workflow',action_label:'Review buyer'});
  for(const {d} of pendingDeals)actions.push({key:'approval:'+d.id,kind:'deal',record_id:d.id,ref:activity.reference(d),label:'Deal needs approval',source_kind:'derived_workflow',action_label:'Review deal'});
  const deadlineRows=reviewed.filter(({d,e})=>!['closed','dead','expired'].includes(e.status)&&d.approval!=='rejected'&&date(e.deadline)&&e.deadline>=today&&e.deadline<=new Date(Date.parse(today+'T00:00:00Z')+7*DAY).toISOString().slice(0,10));
  for(const {d,e} of deadlineRows)actions.push({key:'deadline:'+d.id,kind:'deal',record_id:d.id,ref:activity.reference(d),label:'Deadline within seven days',due_date:e.deadline,source_kind:'derived_workflow',action_label:'Open deal'});
  actions.sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')||a.key.localeCompare(b.key));
  // All math and eligibility come from the existing reviewed-deal evaluator.
  const best=reviewed.flatMap(({d,e})=>{
    const spread=e.matches[0]?.estimated_spread?.low;
    return d.approval==='approved'&&d.evidence_reviewed_at&&d.evidence_reviewed_by&&e.value.range&&!['STALE','NO'].includes(e.verdict)&&!['closed','dead','expired'].includes(e.status)&&Number.isFinite(spread)&&spread>0&&date(e.deadline)&&e.deadline>=today?[{id:d.id,ref:activity.reference(d),location:[d.city,d.state,d.zip].filter(Boolean).join(', '),spread,deadline:e.deadline,value_tier:e.value.tier,priority:spread/(1+Math.max(0,(Date.parse(e.deadline)-Date.parse(today))/DAY))}]:[];
  }).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)).slice(0,5).map(({priority,...d})=>d);
  const events=[];
  const referenceKinds=new Map();
  for(const [collection,kind] of [['buyers','Buyer'],['reviewed_deals','Deal'],['leads','Lead'],['record_matches','Match']])for(const row of store[collection]||[]){const ref=activity.reference(row);if(ref)referenceKinds.set(ref,referenceKinds.has(ref)?null:kind);}
  const labels={found:'Record found',imported:'Record imported',approved:'Approval recorded',rejected:'Rejection recorded',status_change:'Stage changed',message_drafted:'Message draft recorded',message_sent:'Outgoing message reported',email_drafted:'Email draft recorded',email_sent:'Outgoing email reported',reply_received:'Incoming reply reported',document_added:'Document added',conversation_updated:'Conversation report updated',source_rechecked:'Source recheck recorded'};
  const seen=new Set();
  for(const a of store.activities||[]){const at=a.ts||a.created_at,time=instant(at,clock);if(time==null||time<cutoff||!Object.hasOwn(labels,a.type))continue;
    const key=a.activity_id||a.id||JSON.stringify([at,a.type,a.deal_ref,a.buyer_ref,a.match_ref]);if(seen.has(key))continue;seen.add(key);
    const ref=a.deal_ref||a.buyer_ref||a.match_ref||'',kind=referenceKinds.get(ref);
    const label=kind&&['found','imported'].includes(a.type)?kind+' '+(a.type==='found'?'found':'imported'):labels[a.type];
    events.push({key:'activity:'+key,at,label,ref,source_kind:'recorded_activity',reported:true});
  }
  for(const r of releases){const time=instant(r.at,clock);if(time==null||time<cutoff||!/^\d+$/.test(String(r.pr))||r.source_url!=='https://github.com/GabrielMontealegre/wholesaleos-bot/pull/'+r.pr)continue;
    events.push({key:'release:'+r.pr,at:r.at,label:'Verified release #'+r.pr,source_kind:'verified_release_record',source_url:r.source_url});
  }
  events.sort((a,b)=>b.at.localeCompare(a.at)||a.key.localeCompare(b.key));
  return {source_kind:'derived_workflow',now,today,actions,counts:{replies:view.incoming_count,approvals:pendingBuyers.length+pendingDeals.length,followups:view.followup_count,deadlines:deadlineRows.length},best_deals:best,grade_status:'not_defined',grade_issue:344,last_24h:events,coverage:{records_requests:'not_connected',routine_results:'not_connected',email:'recorded_reports_only',releases:'verified_release_records_only'}};
}
function registerTodayWorkspace(app,{db,requireAdmin,now=()=>new Date().toISOString(),releases=[]}) {
  app.get('/api/dashboard/today-workspace',requireAdmin,(req,res)=>{
    res.set('Cache-Control','no-store');
    try{res.json(buildTodayWorkspace(db.readDBStrict(),{now:now(),releases}));}
    catch{res.status(503).json({code:'today_store_unavailable'});}
  });
}
module.exports={buildTodayWorkspace,registerTodayWorkspace};
