'use strict';

const crypto=require('node:crypto'),records=require('../records/record-activity');
const KINDS=Object.freeze({buying_intent:'Buying intent',proof_received:'Proof receipt'});
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const opaque=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function fail(code,status=400){throw Object.assign(Error('buyer_evidence_'+code),{code:'buyer_evidence_'+code,status});}
function text(value,max){if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f<>]/.test(value))fail('invalid');return value.trim();}
function clock(value,now=value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,19)!==value.slice(0,19)||Date.parse(value)>Date.parse(now))fail('date_invalid');return new Date(value).toISOString();}
function day(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('date_invalid');return value;}
function source(value){let u;try{u=new URL(text(value,2048));}catch{fail('source_invalid');}
 if(['drive.google.com','docs.google.com'].includes(u.hostname)&&Array.from(u.searchParams).length===1&&['sharing','drive_link'].includes(u.searchParams.get('usp')))u.search='';
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||!u.hostname.includes('.')||u.hostname.startsWith('[')||/^\d+(?:\.\d+){3}$/.test(u.hostname)||/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)||/\.local$/.test(u.hostname)||/^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname))fail('source_invalid');
 if(u.hash&&!(u.hostname==='mail.google.com'&&/^#(?:inbox|sent|all)\/[a-f0-9]{10,64}$/i.test(u.hash)))fail('source_invalid');return u.href;
}
function input(value,now){
 if(!value||Array.isArray(value)||Object.keys(value).some(k=>!['action','evidence_kind','version','source_url','evidence_text','captured_at','valid_through','reviewed_source','note'].includes(k))||Buffer.byteLength(JSON.stringify(value))>4096||!['record','flag'].includes(value.action)||!Object.hasOwn(KINDS,value.evidence_kind)||!opaque(value.version))fail('invalid');
 if(value.action==='flag'){
  if(Object.keys(value).some(k=>!['action','evidence_kind','version','note'].includes(k)))fail('invalid');
  return {action:'flag',evidence_kind:value.evidence_kind,version:value.version,note:text(value.note,300)};
 }
 if(value.reviewed_source!==true||Object.hasOwn(value,'note'))fail('source_review_required',409);
 const captured_at=clock(value.captured_at,now),valid_through=day(value.valid_through);if(valid_through<captured_at.slice(0,10))fail('date_invalid');
 return {action:'record',evidence_kind:value.evidence_kind,version:value.version,source_url:source(value.source_url),evidence_text:text(value.evidence_text,300),captured_at,valid_through,reviewed_source:true};
}
function identity(buyer){return hash({id:buyer.id,ref:records.reference(buyer),name:buyer.name||'',reported_name:buyer.assistant_find?.name||'',source_url:buyer.source_url||buyer.assistant_find?.source_url||'',classification:buyer.assistant_find?.classification||'',buy_box:buyer.assistant_find?.buy_box||null});}
function journal(store){if(store.buyer_evidence_notes!==undefined&&!Array.isArray(store.buyer_evidence_notes))fail('store_invalid',503);return store.buyer_evidence_notes||[];}
function receipt(row,now){
 if(!row||Array.isArray(row)||Object.keys(row).some(k=>!['id','buyer_id','buyer_ref','buyer_version','input','recorded_at','recorded_by','source_kind'].includes(k)))fail('stored_invalid');
 const {id,...body}=row;if(!opaque(id)||id!==hash(body)||row.source_kind!=='operator_report'||!opaque(row.buyer_version)||text(row.buyer_id,128)!==row.buyer_id||!/^BUY-\d{4}$/.test(row.buyer_ref)||text(row.recorded_by,128)!==row.recorded_by||clock(row.recorded_at,now)!==row.recorded_at)fail('stored_invalid');
 const parsed=input(row.input,row.recorded_at);if(JSON.stringify(parsed)!==JSON.stringify(row.input))fail('stored_invalid');return row;
}
function project(store,{now}){
 now=clock(now);const notes=journal(store),buyers=store.buyers||[],views=new Map(),ids=new Map(),refs=new Map();
 for(const buyer of buyers){ids.set(buyer.id,(ids.get(buyer.id)||0)+1);const ref=records.reference(buyer);refs.set(ref,(refs.get(ref)||0)+1);}
 const grouped=new Map();for(const row of notes){const key=typeof row?.buyer_id==='string'?row.buyer_id:'';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}
 for(const buyer of buyers){
  const ref=records.reference(buyer),raw=grouped.get(buyer.id)||[],currentIdentity=identity(buyer),valid=[],bad=[];
  for(const row of raw){try{receipt(row,now);if(row.buyer_ref!==ref)fail('stored_invalid');if(!valid.some(r=>r.id===row.id))valid.push(row);}catch{bad.push(row);}}
  const unique=ids.get(buyer.id)===1&&refs.get(ref)===1&&/^BUY-\d{4}$/.test(ref),version=hash({buyer:currentIdentity,notes:raw.map(r=>r?.id||hash(r)).sort()});
  const view={source_kind:'derived_workflow',version,can_record:unique&&bad.length===0,buyer_confirmed:false,funds_verified:false,history_count:raw.length,invalid_notes:bad.length,kinds:{}};
  for(const kind of Object.keys(KINDS)){
   const rows=valid.filter(r=>r.input.evidence_kind===kind).sort((a,b)=>b.recorded_at.localeCompare(a.recorded_at)||a.id.localeCompare(b.id)),latest=rows.filter(r=>r.recorded_at===rows[0]?.recorded_at),row=latest[0];
   let state=!unique||bad.length?'unavailable':latest.length>1?'conflicting':!row?'not_recorded':row.buyer_version!==currentIdentity?'stale':row.input.action==='flag'?'flagged':row.input.valid_through<now.slice(0,10)?'expired':'reported';
   const labels={unavailable:'Evidence history needs review',conflicting:'Conflicting notes - review required',not_recorded:'Not recorded',stale:'Buyer details changed - review source again',flagged:'Flagged for correction',expired:'Recorded validity date passed',reported:kind==='proof_received'?'Proof receipt reported - funds not verified':'Buying intent reported - not a deal commitment'};
   view.kinds[kind]={state,label:labels[state],source_kind:row?.source_kind||null,recorded_at:row?.recorded_at||null,note:row?.input.action==='flag'?row.input.note:'',source_url:state==='reported'?row.input.source_url:null,evidence_text:state==='reported'?row.input.evidence_text:'',captured_at:state==='reported'?row.input.captured_at:null,valid_through:state==='reported'?row.input.valid_through:null,can_flag:unique&&!bad.length&&!!row&&latest.length===1&&row.input.action==='record'};
  }
  views.set(buyer.id,view);
 }
 return views;
}
function record(store,id,value,{now,operatorId}){
 const at=clock(now),actor=text(operatorId,128),rows=(store.buyers||[]).filter(b=>b.id===id);if(rows.length!==1)fail('buyer_missing',404);
 const buyer=rows[0],view=project(store,{now:at}).get(id),parsed=input(value,at);if(!view.can_record)fail('history_unavailable',409);
 const duplicate=journal(store).find(r=>{try{return receipt(r,at)&&r.buyer_id===id&&r.buyer_version===identity(buyer)&&r.recorded_by===actor&&JSON.stringify(r.input)===JSON.stringify(parsed);}catch{return false;}});
 if(duplicate&&view.kinds[parsed.evidence_kind].recorded_at===duplicate.recorded_at)return store;
 if(view.version!==parsed.version)fail('changed',409);if(parsed.action==='flag'&&!view.kinds[parsed.evidence_kind].can_flag)fail('nothing_to_flag',409);
 const previous=journal(store).filter(r=>r.buyer_id===id&&r.input.evidence_kind===parsed.evidence_kind);if(previous.some(r=>r.recorded_at>=at))fail('changed',409);
 const body={buyer_id:id,buyer_ref:records.reference(buyer),buyer_version:identity(buyer),input:parsed,recorded_at:at,recorded_by:actor,source_kind:'operator_report'};
 return records.append({...store,buyer_evidence_notes:journal(store).concat({id:hash(body),...body})},{type:'document_added',buyer_ref:body.buyer_ref,summary:parsed.action==='flag'?'Buyer evidence note flagged; matching and funds unchanged.':'Buyer evidence note recorded; not bank verification or a deal commitment.',attribution:'operator_report'},{now:at,operatorId:actor});
}
function register(app,{db,requireAdmin,now=()=>new Date().toISOString()}){
 function failure(res,e){const known=/^buyer_evidence_(invalid|date_invalid|source_invalid|source_review_required|buyer_missing|history_unavailable|changed|nothing_to_flag)$/.test(e.code||'');res.status(known?e.status||400:503).json({code:known?e.code:'buyer_evidence_unavailable'});}
 app.get('/api/dashboard/buyers-found/:id/evidence',requireAdmin,(req,res)=>{res.set('Cache-Control','no-store');try{const view=project(db.readDBStrict(),{now:now()}).get(req.params.id);if(!view)fail('buyer_missing',404);res.json(view);}catch(e){failure(res,e);}});
 app.post('/api/dashboard/buyers-found/:id/evidence',requireAdmin,(req,res)=>{res.set('Cache-Control','no-store');try{const before=db.readDBStrict(),at=now(),after=record(before,req.params.id,req.body,{now:at,operatorId:req.currentUser.id});if(after!==before)db.writeDB(after);res.json({ok:true,duplicate:after===before});}catch(e){failure(res,e);}});
}
module.exports={project,record,register,KINDS};
