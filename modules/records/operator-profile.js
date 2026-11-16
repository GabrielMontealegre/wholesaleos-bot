'use strict';
const crypto=require('node:crypto');
const FIELDS=Object.freeze(['legal_name','llc','email','phone','mailing_address','typed_signature','signature_image']);
const MAX_IMAGE_BYTES=64*1024;
function fail(code,status=400){throw Object.assign(Error('operator_profile_'+code),{code:'operator_profile_'+code,status});}
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function time(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,19)===value.slice(0,19);}
function text(value,max,{required=false,multiline=false}={}){
  if(typeof value!=='string'||value.length>max||/[<>]/.test(value)||(multiline?/[\x00-\x08\x0b\x0c\x0e-\x1f]/:/[\x00-\x1f]/).test(value)||required&&!value.trim())fail('field_invalid');
  return value.trim();
}
function image(value){
  if(value==='')return '';
  if(typeof value!=='string'||value.length>90000)fail('signature_image_invalid');
  const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match)fail('signature_image_invalid');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length<16||bytes.length>MAX_IMAGE_BYTES||bytes.toString('base64')!==match[2])fail('signature_image_invalid');
  const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(!valid)fail('signature_image_invalid');return value;
}
function validate(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!FIELDS.includes(k))||FIELDS.some(k=>!Object.hasOwn(input,k)))fail('fields_invalid');
  const value={legal_name:text(input.legal_name,160,{required:true}),llc:text(input.llc,160),email:text(input.email,254),phone:text(input.phone,40),
    mailing_address:text(input.mailing_address,500,{multiline:true}),typed_signature:text(input.typed_signature,160),signature_image:image(input.signature_image)};
  if(value.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)||value.phone&&(!/^[+\d().\-\s]{7,40}$/.test(value.phone)||value.phone.replace(/\D/g,'').length<7))fail('contact_invalid');
  return value;
}
function entries(store,operatorId){
  text(operatorId,128,{required:true});
  if(store.operator_profile_history!=null&&!Array.isArray(store.operator_profile_history))fail('store_invalid',503);
  return (store.operator_profile_history||[]).filter(row=>row?.operator_id===operatorId);
}
function read(store,operatorId,{now}){
  if(!time(now))fail('clock_invalid');
  const rows=entries(store,operatorId),latest=rows.at(-1),version=hash(rows);
  if(!latest)return {version,profile:null,source_kind:'operator_input',signature_is_evidence:false};
  try{
    if(latest.reviewed!==true||latest.source_kind!=='operator_input'||!time(latest.recorded_at)||Date.parse(latest.recorded_at)>Date.parse(now)||latest.digest!==hash(latest.profile))fail('store_invalid',503);
    const profile=validate(latest.profile);
    return {version,profile,source_kind:'operator_input',source_url:null,captured_at:latest.recorded_at,signature_is_evidence:false};
  }catch{fail('store_invalid',503);}
}
function save(store,input,{now,operatorId}){
  if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['profile','version','reviewed'].includes(k))||input.reviewed!==true)fail('review_required');
  const previous=read(store,operatorId,{now});
  if(input.version!==previous.version)fail('changed',409);
  const profile=validate(input.profile);
  if(previous.profile&&hash(previous.profile)===hash(profile))return {store,saved:false};
  const row={operator_id:operatorId,recorded_at:now,source_kind:'operator_input',reviewed:true,profile,digest:hash(profile),previous_version:previous.version};
  return {store:{...store,operator_profile_history:(store.operator_profile_history||[]).concat(row)},saved:true};
}
function draft(store,operatorId,{now}){
  if(!operatorId)return {version:null,profile:null,signature_block:''};
  const view=read(store,operatorId,{now}),p=view.profile;
  return {...view,signature_block:p?[p.typed_signature||p.legal_name,p.llc,p.email,p.phone].filter(Boolean).join('\n'):''};
}
function fill(template,context){
  const p=context.profile;
  const values={operator_legal_name:p?.legal_name,operator_llc:p?.llc,operator_email:p?.email,operator_phone:p?.phone,operator_mailing_address:p?.mailing_address,operator_signature:context.signature_block};
  return String(template).replace(/\{\{(operator_[a-z_]+)\}\}/g,(token,key)=>Object.hasOwn(values,key)?values[key]||'[Not supplied]':token);
}
function noStore(req,res,next){res.set('Cache-Control','no-store');next();}
function requireProfilePayload(req,res,next){
  if(!['GET','POST'].includes(req.method))return res.status(405).json({code:'operator_profile_method_invalid'});
  if(req.method==='GET'){
    if(req.headers['transfer-encoding']||Number(req.headers['content-length']||0)>0)return res.status(400).json({code:'operator_profile_request_invalid'});
    return next();
  }
  if(!req.is('application/json'))return res.status(415).json({code:'operator_profile_json_required'});
  require('express').json({strict:true,limit:96*1024})(req,res,error=>{
    if(error)return res.status(error.type==='entity.too.large'?413:400).json({code:'operator_profile_request_invalid'});
    next();
  });
}
function registerRoutes(app,{db,requireAdmin,now=()=>new Date().toISOString()}){
  const error=(res,e)=>res.status(/^operator_profile_[a-z_]+$/.test(e?.code||'')?e.status||400:503).json({code:/^operator_profile_[a-z_]+$/.test(e?.code||'')?e.code:'operator_profile_unavailable'});
  app.get('/api/dashboard/operator-profile',requireAdmin,(req,res)=>{
    res.set('Cache-Control','no-store');try{res.json(read(db.readDBStrict(),req.currentUser.id,{now:now()}));}catch(e){error(res,e);}
  });
  app.post('/api/dashboard/operator-profile',requireAdmin,(req,res)=>{
    res.set('Cache-Control','no-store');try{
      if(Buffer.byteLength(JSON.stringify(req.body||{}))>96*1024)fail('request_too_large',413);
      const at=now(),before=db.readDBStrict(),result=save(before,req.body,{now:at,operatorId:req.currentUser.id});
      if(result.store!==before)db.writeDB(result.store);
      res.json({ok:true,saved:result.saved,...read(result.store,req.currentUser.id,{now:at})});
    }catch(e){error(res,e);}
  });
}
module.exports={FIELDS,MAX_IMAGE_BYTES,validate,read,save,draft,fill,noStore,requireProfilePayload,registerRoutes};
