'use strict';
const reports=require('./pipeline-reports'),approvals=require('./approval-workspace'),conversations=require('./conversations'),activity=require('./record-activity');
const jv=require('../deals/jv-workflow'),money=require('../deals/pipeline-money');
const reportReviews=require('./pipeline-report-review');
const deals=require('../deals/reviewed-deals');
function readOptions(req){
 const q=req.query||{},group=q.group||'all',offset=q.offset===undefined?'0':q.offset,limit=q.limit===undefined?'50':q.limit;
 if(Object.keys(q).some(k=>!['group','offset','limit'].includes(k))||typeof group!=='string'||group!=='all'&&!Object.hasOwn(reports.LABELS,group)||typeof offset!=='string'||!/^\d{1,6}$/.test(offset)||typeof limit!=='string'||!/^\d{1,2}$/.test(limit)||Number(limit)<1||Number(limit)>50)throw Object.assign(Error('pipeline_query_invalid'),{code:'pipeline_query_invalid'});
 return {group,offset:Number(offset),limit:Number(limit)};
}
function build(store,{now,timeZone='America/Mazatlan',group='all',offset=0,limit=50}={}){
 const recorded=reports.project(store,{now,timeZone}),reviews=reportReviews.project(store,{now,items:recorded.items}),pending=approvals.pendingRecords(store,now),threads=conversations.project(store,{now,timeZone});
 const refs=new Map();for(const [key,kind] of [['leads','lead'],['reviewed_deals','deal'],['buyers','buyer'],['record_matches','match']])for(const row of store[key]||[]){const ref=activity.reference(row);if(ref)refs.set(ref,refs.has(ref)?null:{kind,row});}
 const criteriaCache=new Map();
 function buyerCriteria(report){
  if(!report.buyer)return null;
  const record=refs.get(report.target.ref),buyer=refs.get(report.buyer.ref),key=JSON.stringify([report.target.ref,report.buyer.ref]);
  if(criteriaCache.has(key))return criteriaCache.get(key);
  const currentSource=row=>{const stamp=row?.assistant_find?.captured_at||row?.captured_at;if(stamp==null)return true;return typeof stamp==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(stamp)&&Number.isFinite(Date.parse(stamp))&&Date.parse(stamp)<=Date.parse(now)&&new Date(stamp).toISOString().slice(0,19)===stamp.slice(0,19);};
  let match=null;
  if(!report.address_withheld&&record?.kind==='deal'&&record.row.id===report.target.id&&buyer?.kind==='buyer'&&buyer.row.id===report.buyer.id&&currentSource(record.row)&&currentSource(buyer.row)){const evaluation=deals.evaluate(record.row,[buyer.row],now);if(!['STALE','NO'].includes(evaluation.verdict)&&!['dead','closed','expired'].includes(evaluation.status))match=evaluation.matches.find(m=>m.id===buyer.row.id);}
  let source=null;try{const u=new URL(match?.source_url);if(u.protocol==='https:'&&!u.username&&!u.password)source=u.href;}catch{}
  const maximum=source&&typeof match.max_price==='number'&&Number.isFinite(match.max_price)&&match.max_price>0?match.max_price:null;
  const result={maximum,source_kind:'derived_workflow',source_url:maximum!==null?source:null,captured_at:now,evidence_text:'Existing approved buyer criteria and current reviewed-deal comps and repairs; not an agreed price or proof of funds.',label:'Derived buyer criteria ceiling; not an agreed price',buyer_status:'Not confirmed; proof of funds not established'};
  criteriaCache.set(key,result);return result;
 }
 const target=row=>{const t=refs.get(activity.reference(row));return t&&t.row===row&&typeof row.id==='string'?{kind:t.kind,id:row.id,ref:activity.reference(row),assistant_find:!!row.assistant_find}:null;};
 const heading=row=>row.deal_kind==='jv'&&!jv.view(row,now).full_package_evidence_ready?[row.city,row.state,row.zip].filter(Boolean).join(', ')||'Property details withheld':row.address||'Property address not recorded';
 const blankMoney=()=>money.calculate({});let unlinked=0;
 const items=recorded.items.map(r=>({...r,report_review:reviews.reviews.get(r.id),key:'report:'+r.id,kind:'pipeline_report',source_kind:'imported_report',label:reports.LABELS[r.group],date_basis:r.group==='no_reply'?'Derived from reported offer date':'Reported next date'}));
 for(const buyer of pending.buyers){const t=target(buyer);if(!t){unlinked++;continue;}items.push({key:'approval:buyer:'+buyer.id,kind:'approval',group:'gabriel',reason_code:'buyer_approval',name:buyer.name||'Buyer name not recorded',label:'Buyer approval needed',target:t,due_date:null,date_basis:'Next review date not recorded',next_action:'Review the buyer source before deciding.',money:blankMoney(),provenance:{source_kind:'derived_workflow',source_url:null,captured_at:now,evidence_text:'Current canonical pending-buyer review'},verified:false});}
 for(const {d:deal} of pending.reviewed){const t=target(deal);if(!t){unlinked++;continue;}items.push({key:'approval:deal:'+deal.id,kind:'approval',group:'gabriel',reason_code:'deal_approval',name:heading(deal),label:'Deal approval needed',target:t,due_date:null,date_basis:'Next review date not recorded',next_action:'Review the deal evidence before deciding.',money:blankMoney(),provenance:{source_kind:'derived_workflow',source_url:null,captured_at:now,evidence_text:'Current canonical pending-deal review'},verified:false});}
 for(const c of threads.items){
  const waiting=c.status!=='hot'&&c.status!=='to_send'&&c.last_out&&(!c.last_in||c.last_out>c.last_in)&&c.due_date&&c.due_date>recorded.today;
  const group=waiting&&['seller','holder','agent'].includes(c.role)?'seller_agent':waiting&&c.role==='buyer'?'buyer':'gabriel';
  const code=c.status==='hot'?'reply_review':c.status==='to_send'?'draft_approval':waiting?'recorded_reply_pending':c.due_date&&c.due_date<=recorded.today?'followup_review':'decision_needed';
  items.push({key:'conversation:'+c.id,kind:'conversation',group,reason_code:code,name:c.person||'Contact not named',label:code==='reply_review'?'Reply needs review':code==='recorded_reply_pending'?'Waiting on a recorded conversation reply':'Conversation needs review',
   conversation_id:c.id,conversation:c,target:null,due_date:c.due_date||null,date_basis:c.due_date?'Existing conversation reminder rule':'Next date not recorded',next_action:c.next_step||'Review the recorded conversation.',money:blankMoney(),provenance:{source_kind:c.source_kind,source_url:c.source_url,captured_at:c.captured_at,evidence_text:'Recorded conversation; not an offer or funds proof'},verified:false});
 }
 items.sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')||a.key.localeCompare(b.key));
 const counts=Object.fromEntries(Object.keys(reports.LABELS).map(k=>[k,items.filter(r=>r.group===k).length]));
 const open=items.filter(r=>r.group!=='closed'),selected=group==='all'?open:items.filter(r=>r.group===group);
 return {source_kind:'derived_workflow',view_kind:'pipeline_workspace',read_only:true,now,today:recorded.today,groups:reports.LABELS,counts,
  summary:{open:open.length,due:open.filter(r=>r.due_date&&r.due_date<=recorded.today).length,pending_reports:recorded.items.filter(r=>r.group!=='closed').length},
  group,offset,limit,total:selected.length,items:selected.slice(offset,offset+limit).map(r=>r.kind==='pipeline_report'?{...r,buyer_criteria:buyerCriteria(r)}:r),next_offset:offset+limit<selected.length?offset+limit:null,
  coverage:{...recorded.coverage,...reviews.coverage,unlinked_tasks:unlinked,conversations:'Existing recorded open conversations',approvals:'Existing canonical pending-review rules',funds:'No approval, match or report proves funds',offers:'Conversation messages are not inferred offers',money:'No agreed buyer price or total costs inferred from a match ceiling'}};
}
module.exports={build,readOptions};
