'use strict';
const crypto=require('node:crypto'),reports=require('./pipeline-reports'),activity=require('./record-activity');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const opaque=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function fail(code,status=400){throw Object.assign(Error('pipeline_review_'+code),{code:'pipeline_review_'+code,status});}
function text(value,max){if(typeof value!=='string'||value.length>max||/[\x00-\x1f<>]/.test(value))fail('invalid');return value.trim();}
function clock(value,now=value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,19)!==value.slice(0,19)||Date.parse(value)>Date.parse(now))fail('clock_invalid');return new Date(value).toISOString();}
function contentVersion(store,item){
 const rows=store[item.target.kind==='deal'?'reviewed_deals':'leads']||[],target=rows.filter(r=>r.id===item.target.id),buyer=item.buyer?(store.buyers||[]).filter(r=>r.id===item.buyer.id):[];
 if(target.length!==1||activity.reference(target[0])!==item.target.ref||item.buyer&&(buyer.length!==1||activity.reference(buyer[0])!==item.buyer.ref))fail('changed',409);
 return hash({revision_id:item.id,target:target[0],buyer:buyer[0]||null});
}
function validReceipt(row,now){
 if(!row||Array.isArray(row)||Object.keys(row).some(k=>!['id','revision_id','content_version','action_version','decision','note','reviewed_source','recorded_at','operator_id','source_kind'].includes(k)))fail('receipt_invalid');
 const {id,...body}=row;
 if(!opaque(id)||id!==hash(body)||!opaque(row.revision_id)||!opaque(row.content_version)||!opaque(row.action_version)||row.source_kind!=='operator_workflow'||!['reviewed','flagged'].includes(row.decision)||typeof row.reviewed_source!=='boolean'||row.decision==='reviewed'&&row.reviewed_source!==true)fail('receipt_invalid');
 if(text(row.operator_id,128)!==row.operator_id||!row.operator_id||text(row.note,300)!==row.note||row.decision==='flagged'&&!row.note||clock(row.recorded_at,now)!==row.recorded_at)fail('receipt_invalid');return row;
}
function project(store,{now,items=reports.project(store,{now}).items}={}){
 clock(now);if(store.pipeline_report_reviews!==undefined&&!Array.isArray(store.pipeline_report_reviews))fail('store_invalid',503);
 const coverage={invalid_reviews:0,stale_reviews:0,historical_reviews:0,conflicting_reviews:0},current=new Map(items.map(item=>[item.id,{item,content:contentVersion(store,item),receipts:[]} ]));
 for(const row of store.pipeline_report_reviews||[]){try{validReceipt(row,now);const target=current.get(row.revision_id);if(!target){coverage.historical_reviews++;continue;}if(target.content!==row.content_version){coverage.stale_reviews++;continue;}if(!target.receipts.some(r=>r.id===row.id))target.receipts.push(row);}catch{coverage.invalid_reviews++;}}
 const reviews=new Map();
 for(const [id,entry] of current){const ordered=entry.receipts.sort((a,b)=>b.recorded_at.localeCompare(a.recorded_at)||a.id.localeCompare(b.id)),latest=ordered.filter(r=>r.recorded_at===ordered[0]?.recorded_at),conflict=latest.length>1;
  if(conflict)coverage.conflicting_reviews++;
  const receipt=conflict?null:latest[0],hidden=entry.item.address_withheld;
  reviews.set(id,{state:receipt?.decision||'not_reviewed',version:hash({content:entry.content,receipts:latest.map(r=>r.id).sort()}),recorded_at:receipt?.recorded_at||null,note:hidden?'':receipt?.note||'',source_kind:receipt?'operator_workflow':null,can_review:!hidden&&!!entry.item.provenance.source_url,conflict});
 }
 return {reviews,coverage};
}
function decide(store,input,{now,operatorId}){
 const at=clock(now),actor=text(operatorId,128);if(!actor)fail('actor_required',403);
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['revision_id','version','decision','note','reviewed_source'].includes(k))||Buffer.byteLength(JSON.stringify(input))>2048||!opaque(input.revision_id)||!opaque(input.version)||!['reviewed','flagged'].includes(input.decision)||input.reviewed_source!==undefined&&typeof input.reviewed_source!=='boolean')fail('invalid');
 const note=text(input.note??'',300),reviewed_source=input.reviewed_source===true;
 if(input.decision==='flagged'&&!note)fail('note_required');if(input.decision==='reviewed'&&!reviewed_source)fail('source_review_required',409);
 const items=reports.project(store,{now:at}).items,item=items.find(r=>r.id===input.revision_id);if(!item)fail('changed',409);
 const view=project(store,{now:at,items}),review=view.reviews.get(item.id),content=contentVersion(store,item);if(!review.can_review)fail('source_unavailable',409);
 // A repeated successful request is quiet, but changed facts or review decisions are not overwritten.
 const duplicate=(store.pipeline_report_reviews||[]).find(r=>{try{return validReceipt(r,at)&&r.revision_id===item.id&&r.content_version===content&&r.action_version===input.version&&r.operator_id===actor&&r.decision===input.decision&&r.note===note&&r.reviewed_source===reviewed_source;}catch{return false;}});
 if(duplicate&&review.state===input.decision&&review.recorded_at===duplicate.recorded_at)return store;
 if(review.version!==input.version||review.recorded_at&&review.recorded_at>=at)fail('changed',409);
 const body={revision_id:item.id,content_version:content,action_version:input.version,decision:input.decision,note,reviewed_source,recorded_at:at,operator_id:actor,source_kind:'operator_workflow'};
 const updated={...store,pipeline_report_reviews:(store.pipeline_report_reviews||[]).concat({id:hash(body),...body})};
 return activity.append(updated,{type:'document_added',deal_ref:item.target.ref,buyer_ref:item.buyer?.ref||'',summary:input.decision==='reviewed'?'Pipeline report reviewed; facts remain reported, not verified funds.':'Pipeline report flagged for correction; business status unchanged.',attribution:'operator_workflow'},{now:at,operatorId:actor});
}
function register(app,{db,requireAdmin,now=()=>new Date().toISOString()}){
 app.post('/api/dashboard/pipeline-report-reviews',requireAdmin,(req,res)=>{res.set('Cache-Control','no-store');try{const before=db.readDBStrict(),after=decide(before,req.body,{now:now(),operatorId:req.currentUser.id});if(after!==before)db.writeDB(after);res.json({ok:true,duplicate:after===before});}catch(e){const known=/^pipeline_review_(invalid|clock_invalid|actor_required|changed|source_unavailable|note_required|source_review_required)$/.test(e.code||'');res.status(known?e.status||400:503).json({code:known?e.code:'pipeline_review_store_unavailable'});}});
}
module.exports={project,decide,register};
