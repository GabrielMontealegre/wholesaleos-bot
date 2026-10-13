'use strict';
const crypto=require('node:crypto');
const finds=require('../buyers/assistant-finds');
const deals=require('../deals/reviewed-deals');
const activity=require('./record-activity');
const jv=require('../deals/jv-workflow');
function fail(code,status=400){const e=Error('approval_'+code);e.code=e.message;e.status=status;throw e;}
function clock(now){if(typeof now!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(now)||!Number.isFinite(Date.parse(now))||new Date(now).toISOString().slice(0,19)!==now.slice(0,19))fail('clock_invalid');}
function version(row){return crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');}
function pendingRecords(store,now){
  clock(now);
  const buyers=(store.buyers||[]).filter(b=>b.assistant_find?.approval==='pending'&&b.assistant_find.status!=='not_a_fit');
  const reviewed=(store.reviewed_deals||[]).filter(d=>d.approval==='pending').map(d=>({d,e:deals.evaluate(d,store.buyers||[],now)})).filter(({e})=>!['STALE','NO'].includes(e.verdict)&&!['closed','dead','expired'].includes(e.status));
  return {buyers,reviewed};
}
function build(store,{now}){
  const pending=pendingRecords(store,now);
  return {source_kind:'derived_workflow',now,counts:{buyers:pending.buyers.length,deals:pending.reviewed.length,email_drafts:null,records_requests:null},
    buyers:pending.buyers.map(b=>({...b.assistant_find,id:b.id,record_ref:activity.reference(b),version:version(b)})),
    deals:pending.reviewed.map(({d,e})=>({...d,version:version(d),evaluation:e,jv_workflow:d.deal_kind==='jv'?jv.view(d,now):null})),
    unavailable:['email_drafts','records_requests']};
}
function decide(store,input,{now,operatorId}){
  clock(now);
  if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>!['kind','id','version','decision','reviewed_comps','reviewed_source','reason'].includes(k))||!['buyer','deal'].includes(input.kind)||!['approve','reject'].includes(input.decision)||typeof input.id!=='string'||!input.id||input.id.length>128||typeof input.version!=='string'||!/^[a-f0-9]{64}$/.test(input.version)||typeof operatorId!=='string'||!operatorId)fail('request_invalid');
  if(input.reviewed_comps!==undefined&&typeof input.reviewed_comps!=='boolean')fail('request_invalid');
  if(input.reviewed_source!==undefined&&typeof input.reviewed_source!=='boolean')fail('request_invalid');
  if(input.reason!==undefined&&(typeof input.reason!=='string'||input.reason.length>300||/[\x00-\x1f<>]/.test(input.reason)))fail('request_invalid');
  const reason=(input.reason||'').trim();if(input.decision==='reject'&&!reason)fail('reason_required');
  const rows=store[input.kind==='buyer'?'buyers':'reviewed_deals']||[],matches=rows.filter(r=>r.id===input.id);
  if(!matches.length)fail('record_not_found',404);if(matches.length!==1||version(matches[0])!==input.version)fail('changed',409);
  const pending=pendingRecords(store,now),eligible=input.kind==='buyer'?pending.buyers.some(r=>r.id===input.id):pending.reviewed.some(({d})=>d.id===input.id);
  if(!eligible)fail('changed',409);
  if(input.kind==='deal'&&input.decision==='approve'&&input.reviewed_comps!==true)fail('review_required',409);
  if(input.kind==='buyer'&&input.decision==='approve'&&input.reviewed_source!==true)fail('review_required',409);
  return input.kind==='buyer'?deals.synchronizeMatchReferences(finds.update(store,input.id,{approval:input.decision==='approve'?'approved':'rejected',reason},{now,operatorId}),{now,operatorId}):deals.update(store,input.id,{action:input.decision,reason,reviewed_comps:input.reviewed_comps},{now,operatorId});
}
function registerApprovalWorkspace(app,{db,requireAdmin,now=()=>new Date().toISOString()}){
  function error(res,e){const known=/^(?:approval|find_deal|find)_[a-z_]+$/.test(e.code||'');return res.status(known?e.status||400:503).json({code:known?e.code:'approval_store_unavailable'});}
  app.get('/api/dashboard/approvals/counts',requireAdmin,(req,res)=>{res.set('Cache-Control','no-store');try{const p=pendingRecords(db.readDBStrict(),now());res.json({buyers:p.buyers.length,deals:p.reviewed.length});}catch(e){error(res,e);}});
  app.get('/api/dashboard/approvals',requireAdmin,(req,res)=>{res.set('Cache-Control','no-store');try{res.json(build(db.readDBStrict(),{now:now()}));}catch(e){error(res,e);}});
  app.post('/api/dashboard/approvals',requireAdmin,(req,res)=>{res.set('Cache-Control','no-store');try{if(Buffer.byteLength(JSON.stringify(req.body||{}))>8192)return res.status(413).json({code:'approval_request_too_large'});const before=db.readDBStrict(),after=decide(before,req.body,{now:now(),operatorId:req.currentUser.id});db.writeDB(after);res.json({ok:true});}catch(e){error(res,e);}});
}
module.exports={pendingRecords,build,decide,version,registerApprovalWorkspace};
