'use strict';

const crypto = require('node:crypto');
const activity = require('./record-activity');
const {dayAt} = require('./calendar-day');
const jv = require('../deals/jv-workflow');
const money = require('../deals/pipeline-money');
const REASONS = Object.freeze({
  proof_of_funds:Object.freeze(['funds_requested','funds_review_needed']),
  seller_agent:Object.freeze(['seller_response_pending','agent_response_pending']),
  buyer:Object.freeze(['buyer_needed','buyer_reply_pending']),
  gabriel:Object.freeze(['draft_approval','call_needed','decision_needed','followup_review','close_review']),
  no_reply:Object.freeze(['offer_no_reply']),
  closed:Object.freeze(['price','other_offer','short_sale_lender','no_funds','not_interested','dead','no_reply'])
});
const LABELS = Object.freeze({proof_of_funds:'Waiting on proof of funds',seller_agent:'Waiting on seller / agent',buyer:'Waiting on a buyer',gabriel:'Waiting on Gabriel',no_reply:'No reply',closed:'Closed reports'});
const AMOUNTS = Object.freeze(['contract_price','buyer_price','costs','last_offer','seller_price','walk_away']);
const FIELDS = new Set(['kind','report_id','record_ref','buyer_ref','conversation_id','waiting_on','reason_code','next_date','asked_at','offer_sent_at','followup_count','last_answer','next_step','path','our_share','source_url','evidence_text','captured_at',...AMOUNTS]);
function fail(code,status=400){throw Object.assign(new Error('find_pipeline_'+code),{code:'find_pipeline_'+code,status});}
function text(value,max,required=false){if(value==null&&!required)return '';if(typeof value!=='string'||value.length>max||/[\x00-\x1f<>]/.test(value)||required&&!value.trim())fail('invalid');return value.trim();}
function instant(value,now,required=false){const v=text(value,40,required);if(!v)return '';if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,19)!==v.slice(0,19)||Date.parse(v)>Date.parse(now))fail('date_invalid');return new Date(v).toISOString();}
function day(value){const v=text(value,10);if(v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))fail('date_invalid');return v;}
function url(value){let u;try{u=new URL(text(value,2048,true));}catch{fail('source_invalid');}if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!u.hostname.includes('.')||/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname))fail('source_invalid');return u.href;}
function validate(input,now){
  instant(now,now,true);
  if(!input||Array.isArray(input)||input.kind!=='pipeline_item'||Object.keys(input).some(k=>!FIELDS.has(k))||Buffer.byteLength(JSON.stringify(input))>8192)fail('invalid');
  const report_id=text(input.report_id,80,true);if(!/^[a-z0-9][a-z0-9_-]*$/i.test(report_id))fail('invalid');
  if(!Object.hasOwn(REASONS,input.waiting_on)||!REASONS[input.waiting_on].includes(input.reason_code))fail('reason_invalid');
  const record_ref=activity.ref(input.record_ref),buyer_ref=activity.ref(input.buyer_ref);
  if(!/^WOS-[A-Z]{2}-\d{4}$/.test(record_ref)||buyer_ref&&!/^BUY-\d{4}$/.test(buyer_ref))fail('ref_invalid');
  if(input.waiting_on==='proof_of_funds'&&!buyer_ref)fail('buyer_required');
  const captured_at=instant(input.captured_at,now,true),asked_at=instant(input.asked_at,captured_at),offer_sent_at=instant(input.offer_sent_at,captured_at),next_date=day(input.next_date);
  if(input.waiting_on==='proof_of_funds'&&!asked_at)fail('asked_date_required');
  if(input.waiting_on==='no_reply'&&(!offer_sent_at||!Number.isInteger(input.followup_count)||input.followup_count<0||input.followup_count>2))fail('offer_history_required');
  if(!['no_reply','closed'].includes(input.waiting_on)&&!next_date)fail('next_date_required');
  if(input.waiting_on!=='no_reply'&&(input.followup_count!=null||offer_sent_at)||input.waiting_on==='no_reply'&&next_date)fail('offer_history_invalid');
  if(input.path!=null&&!['assignment','double_close'].includes(input.path)||input.our_share!=null&&!(typeof input.our_share==='number'&&input.our_share>0&&input.our_share<=1))fail('money_invalid');
  const amounts={};for(const key of AMOUNTS){if(input[key]==null){amounts[key]=null;continue;}const v=input[key];if(Object.keys(v).some(k=>!['low','high'].includes(k))||!money.range(v)||key!=='costs'&&v.low<=0)fail('money_invalid');amounts[key]=money.range(v);}
  return {kind:'pipeline_item',report_id,record_ref,buyer_ref,conversation_id:text(input.conversation_id,128),waiting_on:input.waiting_on,reason_code:input.reason_code,next_date,asked_at,offer_sent_at,
    followup_count:input.waiting_on==='no_reply'?input.followup_count:null,last_answer:text(input.last_answer,1000),next_step:text(input.next_step,600,true),path:input.path||null,our_share:input.our_share??null,
    source_url:url(input.source_url),evidence_text:text(input.evidence_text,1000,true),captured_at,...amounts};
}
function targets(store,item){
  const all=[['reviewed_deals','deal'],['leads','lead'],['buyers','buyer'],['record_matches','match']].flatMap(([key,kind])=>(store[key]||[]).map(row=>({kind,row})));
  const exact=ref=>all.filter(t=>activity.reference(t.row)===ref);
  const records=exact(item.record_ref),buyers=item.buyer_ref?exact(item.buyer_ref):[];
  if(records.length!==1||!['deal','lead'].includes(records[0].kind)||!records[0].row.id||item.buyer_ref&&(buyers.length!==1||buyers[0].kind!=='buyer'||!buyers[0].row.id))fail('ref_unknown',409);
  if(item.conversation_id){const c=(store.conversations||[]).filter(c=>c.id===item.conversation_id);if(c.length!==1||!c[0].refs?.includes(item.record_ref)||item.buyer_ref&&!c[0].refs.includes(item.buyer_ref))fail('conversation_unknown',409);}
  return {record:records[0],buyer:buyers[0]||null};
}
function digest(item){return crypto.createHash('sha256').update(JSON.stringify(item)).digest('hex');}
function upsert(store,input,context){
  const item=validate(input,context.now);targets(store,item);
  const operator_id=text(context.operatorId,128,true),rows=store.pipeline_reports||[];
  if(!Array.isArray(rows))fail('store_invalid',503);
  const prior=rows.filter(r=>r.report?.report_id===item.report_id).sort((a,b)=>b.report.captured_at.localeCompare(a.report.captured_at))[0];
  const id=digest(item);
  if(prior){if(prior.id===id)return {store,results:[{id,result:'duplicate'}]};if(prior.report.record_ref!==item.record_ref||prior.report.buyer_ref!==item.buyer_ref)fail('identity_changed',409);if(prior.report.captured_at===item.captured_at)fail('conflict',409);if(prior.report.captured_at>item.captured_at)fail('stale',409);}
  const row={id,report:item,source_kind:'imported_report',review_status:'pending',recorded_at:context.now,recorded_by:operator_id};
  const updated=activity.append({...store,pipeline_reports:rows.concat(row)},{type:'document_added',deal_ref:item.record_ref,buyer_ref:item.buyer_ref,summary:'Pipeline report received; pending operator review, not verified facts.',attribution:'imported_report'},context);
  return {store:updated,results:[{id,result:'created'}]};
}
function project(store,{now,timeZone='America/Mazatlan',policies={}}={}){
  instant(now,now,true);const today=dayAt(now,timeZone),latest=new Map(),conflicts=new Set(),coverage={invalid_reports:0,unlinked_reports:0};
  if(store.pipeline_reports!==undefined&&!Array.isArray(store.pipeline_reports))fail('store_invalid',503);
  for(const row of store.pipeline_reports||[]){try{const item=validate(row.report,now);if(row.source_kind!=='imported_report'||row.review_status!=='pending'||!row.recorded_by||instant(row.recorded_at,now,true)<item.captured_at||row.id!==digest(item))fail('stored_report_invalid');const prior=latest.get(item.report_id);if(prior&&(prior.report.record_ref!==item.record_ref||prior.report.buyer_ref!==item.buyer_ref||item.captured_at===prior.report.captured_at&&row.id!==prior.id)){conflicts.add(item.report_id);fail('conflict');}if(!prior||item.captured_at>prior.report.captured_at)latest.set(item.report_id,{...row,report:item});}catch{coverage.invalid_reports++;}}
  const items=[];
  for(const row of latest.values()){
    const r=row.report;if(conflicts.has(r.report_id))continue;let linked;try{linked=targets(store,r);}catch{coverage.unlinked_reports++;continue;}
    const record=linked.record.row,hidden=linked.record.kind==='deal'&&record.deal_kind==='jv'&&!jv.view(record,now).full_package_evidence_ready;
    const due=r.waiting_on==='no_reply'?new Date(Date.parse(dayAt(r.offer_sent_at,timeZone)+'T00:00:00Z')+(r.followup_count===0?2:5)*86400000).toISOString().slice(0,10):r.next_date||null;
    const provenance={source_kind:'imported_report',source_url:hidden?null:r.source_url,captured_at:r.captured_at,evidence_text:hidden?'':r.evidence_text};
    items.push({id:row.id,report_id:hidden?null:r.report_id,group:r.waiting_on,reason_code:r.reason_code,review_status:'pending',reported:true,verified:false,
      name:hidden?[record.city,record.state,record.zip].filter(Boolean).join(', ')||'Property details withheld':record.address||record.normalized_address||'Property address not recorded',address_withheld:hidden,
      target:{kind:linked.record.kind,id:record.id,ref:r.record_ref},buyer:linked.buyer?{id:linked.buyer.row.id,ref:r.buyer_ref,name:linked.buyer.row.name||'Buyer name not recorded'}:null,
      conversation_id:r.conversation_id||null,due_date:due,overdue:!!due&&due<today,asked_at:r.asked_at||null,offer_sent_at:r.offer_sent_at||null,followup_count:r.followup_count,
      next_step:hidden?'Open the deal to review the pending report.':r.next_step,next_action:r.waiting_on==='no_reply'?(r.followup_count===2?'Review closure; no outcome recorded automatically':'Review follow-up '+(r.followup_count+1)):hidden?'Open the deal to review the pending report.':r.next_step,
      last_answer:hidden?'':r.last_answer,last_offer:r.last_offer,seller_price:r.seller_price,walk_away:r.walk_away,
      money:money.calculate({...r,state:record.state},policies),provenance,field_provenance:Object.fromEntries(AMOUNTS.filter(k=>r[k]!==null).map(k=>[k,{...provenance}]))});
  }
  items.sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')||a.id.localeCompare(b.id));
  return {source_kind:'derived_workflow',read_only:true,now,today,reported_only:true,groups:LABELS,items,counts:Object.fromEntries(Object.keys(REASONS).map(k=>[k,items.filter(r=>r.group===k).length])),coverage:{...coverage,conflicting_report_ids:conflicts.size,total_revisions:(store.pipeline_reports||[]).length,projected_reports:items.length,funds:'No proof-of-funds verification contract; reports never establish confirmed funding'}};
}
function register(app,{db,requireAdmin,now=()=>new Date().toISOString()}){
  app.get('/api/dashboard/pipeline-workspace',requireAdmin,(req,res)=>{res.set('Cache-Control','no-store');try{res.json(project(db.readDBStrict(),{now:now()}));}catch{res.status(503).json({code:'pipeline_workspace_unavailable'});}});
}
module.exports={validate,upsert,project,register,REASONS,LABELS,AMOUNTS};
