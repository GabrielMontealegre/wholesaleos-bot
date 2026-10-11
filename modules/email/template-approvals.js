'use strict';
const crypto=require('node:crypto');
const activity=require('../records/record-activity');
const KINDS=Object.freeze({holder_jv_reply:'Holder JV reply',buyer_buy_box:'Buyer buy box',buyer_teaser:'Buyer teaser',follow_up:'Follow-up'});
function fail(code,status=400){const error=new Error('email_template_'+code);error.code=error.message;error.status=status;throw error;}
function text(value,max,multiline=false){if(typeof value!=='string'||!value.trim()||value.length>max||(multiline?/[\x00-\x08\x0b\x0c\x0e-\x1f]/:/[\x00-\x1f]/).test(value))fail('text_invalid');return value.trim();}
function time(value,now){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.parse(now)&&new Date(value).toISOString().slice(0,10)===value.slice(0,10);}
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function history(store){if(store.email_template_history!=null&&!Array.isArray(store.email_template_history))fail('store_invalid',503);return store.email_template_history||[];}
function validTemplate(row,now){try{return !!(row&&Object.hasOwn(KINDS,row.kind)&&row.source_kind==='operator_input'&&row.reviewed===true&&time(row.recorded_at,now)&&text(row.operator_id,128)&&text(row.subject,240)&&text(row.body,4000,true)&&row.digest===hash([row.kind,row.subject,row.body]));}catch(_){return false;}}
function version(store,kind){return hash(history(store).filter(row=>row.kind===kind));}
function policy(store,kind,now){
  if(!Object.hasOwn(KINDS,kind)||!time(now,now))fail('clock_or_kind_invalid');
  if(store.email_draft_approvals!=null&&!Array.isArray(store.email_draft_approvals)||store.email_delivery_receipts!=null&&!Array.isArray(store.email_delivery_receipts))fail('store_invalid',503);
  const approvals=Array.isArray(store.email_draft_approvals)?store.email_draft_approvals:[];
  const receipts=Array.isArray(store.email_delivery_receipts)?store.email_delivery_receipts:[];
  const byApproval=new Map();for(const row of approvals){if(!row?.id)continue;byApproval.set(row.id,(byApproval.get(row.id)||[]).concat(row));}
  const valid=new Set(),identities=new Map();
  for(const receipt of receipts){
    if(!receipt||!Object.hasOwn(KINDS,receipt.kind))continue;
    const matches=byApproval.get(receipt.approval_id)||[];const approval=matches.length===1?matches[0]:null;
    if(!approval||approval.source_kind!=='operator_input'||approval.reviewed!==true||approval.kind!==receipt.kind||typeof approval.operator_id!=='string'||!approval.operator_id.trim()||!time(approval.approved_at,now)||
      receipt.source_kind!=='smtp_delivery'||receipt.status!=='accepted'||!time(receipt.sent_at,now)||Date.parse(receipt.sent_at)<Date.parse(approval.approved_at)||
      !/^[a-f0-9]{64}$/.test(approval.message_digest||'')||receipt.message_digest!==approval.message_digest||typeof receipt.message_id!=='string'||!/^<[^<>\s@]+@[^<>\s@]+>$/.test(receipt.message_id))continue;
    valid.add(receipt);if(!identities.has(receipt.message_id))identities.set(receipt.message_id,new Set());identities.get(receipt.message_id).add(receipt.kind+'|'+receipt.message_digest);
  }
  const messages=new Set();let ignored=0;
  for(const receipt of receipts.filter(row=>row?.kind===kind)){
    if(!valid.has(receipt)||identities.get(receipt.message_id).size!==1){ignored++;continue;}
    messages.add(receipt.message_id);
  }
  return {approved_send_count:messages.size,approvals_remaining:Math.max(0,20-messages.size),full_preview_required:messages.size<20,ignored_receipts:ignored,
    explicit_send_required:true,automatic_send_allowed:false};
}
function list(store,{now}){
  if(!time(now,now))fail('clock_invalid');
  return {source_kind:'derived_workflow',items:Object.entries(KINDS).map(([kind,label])=>{
    const rows=history(store).filter(row=>row.kind===kind);const latest=rows.at(-1);const valid=!latest||validTemplate(latest,now);
    return {kind,label,version:version(store,kind),history_count:rows.length,invalid_history:!valid,template:latest&&valid?{subject:latest.subject,body:latest.body,source_kind:latest.source_kind,source_url:null,evidence_text:latest.body,captured_at:latest.recorded_at,recorded_at:latest.recorded_at,operator_id:latest.operator_id}:null,...policy(store,kind,now)};
  })};
}
function save(store,input,{now,operatorId}){
  if(!input||Array.isArray(input)||Object.keys(input).some(key=>!['kind','subject','body','version','reviewed'].includes(key))||!Object.hasOwn(KINDS,input.kind)||input.reviewed!==true)fail('review_required');
  text(operatorId,128);if(!time(now,now))fail('clock_invalid');
  const rows=history(store);const prior=rows.filter(row=>row.kind===input.kind).at(-1);
  if(prior&&!validTemplate(prior,now))fail('history_invalid',409);
  if(input.version!==version(store,input.kind))fail('changed',409);
  const subject=text(input.subject,240),body=text(input.body,4000,true);
  const digest=hash([input.kind,subject,body]);if(prior?.digest===digest)return {store,saved:false,status:'Already saved. No email sent.'};
  const record={kind:input.kind,subject,body,digest,reviewed:true,source_kind:'operator_input',operator_id:operatorId,recorded_at:now,previous_version:input.version};
  const updated=activity.append({...store,email_template_history:rows.concat(record)},{type:'approved',summary:'Operator reviewed '+KINDS[input.kind]+' message template; not a sent email.',email_kind:input.kind,template_digest:digest},{now,operatorId});
  return {store:updated,saved:true,status:'Reviewed template saved. No email sent.'};
}
function registerRoutes(app,{db,requireAdmin,now=()=>new Date().toISOString()}){
  app.get('/api/dashboard/email-templates',requireAdmin,(req,res)=>{
    try{res.set('Cache-Control','no-store').json(list(db.readDBStrict(),{now:now()}));}catch(_){res.status(503).json({code:'email_template_store_unavailable'});}
  });
  app.post('/api/dashboard/email-templates',requireAdmin,(req,res)=>{
    try{
      res.set('Cache-Control','no-store');if(Buffer.byteLength(JSON.stringify(req.body||{}))>8192)return res.status(413).json({code:'email_template_too_large'});
      const before=db.readDBStrict();const result=save(before,req.body,{now:now(),operatorId:req.currentUser.id});if(result.store!==before)db.writeDB(result.store);
      res.json({ok:true,saved:result.saved,status:result.status});
    }catch(error){const known=/^email_template_[a-z_]+$/.test(error.code||'');res.status(known?error.status||400:503).json({code:known?error.code:'email_template_save_unavailable'});}
  });
}
module.exports={KINDS,list,save,policy,registerRoutes};
