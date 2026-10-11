'use strict';

const crypto = require('node:crypto');
const dates = require('../research/normalize-source-date');
const activity = require('../records/record-activity');
const STAGES = Object.freeze(['found', 'holder_interested', 'buyer_teaser', 'buyer_interested', 'jv_signed', 'full_package', 'emd_at_title', 'assigned', 'closed']);
const LABELS = Object.freeze({ found:'Found', holder_interested:'Holder interested', buyer_teaser:'Buyer teaser', buyer_interested:'Buyer interested', jv_signed:'JV signed', full_package:'Full package', emd_at_title:'Earnest money at title', assigned:'Assigned', closed:'Closed', dead:'Dead' });
const CHECKS = Object.freeze({ holder_interested:['holder_agreed'], buyer_teaser:['teaser_sent'], buyer_interested:['buyer_agreed'],
  jv_signed:['signed','contract_copy_verified','seller_signature','assignable','owner_record_matches','contract_interest','title_pays_fees','non_circumvention','non_solicitation','protection_24_months','disbursement_letter'],
  full_package:['package_sent'], emd_at_title:['emd_received'], assigned:['assignment_signed'], closed:['title_closed'] });
const TERMS = Object.freeze(['contract_price','closing_date','title_company','jv_split','holder_fee','emd']);
function fail(code, status=409) { const e=new Error('find_deal_'+code);e.code=e.message;e.status=status;throw e; }
function text(value,max=600) { if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f<>]/.test(value))fail('jv_evidence_required',400);return value.trim(); }
function source(value) { let u;try{u=new URL(text(value,2048));}catch(_){fail('jv_source_invalid',400);}if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname))fail('jv_source_invalid',400);return u.href; }
function time(value,now) { text(value,40);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value.slice(0,10)||Date.parse(value)>Date.parse(now))fail('jv_event_date_invalid',400);return new Date(value).toISOString(); }
function positive(value) { return typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=1e9; }
function termsKey(deal) { return crypto.createHash('sha256').update(JSON.stringify(TERMS.map(k=>[k,deal[k]??null]))).digest('hex'); }
function events(deal,now) {
  let prior='found', previous='';const out=[];
  if(deal.jv_workflow_events!=null&&!Array.isArray(deal.jv_workflow_events))return out;
  for(const event of deal.jv_workflow_events||[]) {
    try {
      if(event.source_kind!=='operator_input'||!event.operator_id||!event.evidence_text||!event.source_url)break;
      const at=time(event.happened_at,now);time(event.recorded_at,now);source(event.source_url);
      if(Date.parse(at)>Date.parse(event.recorded_at)||previous&&at<previous||event.from!==prior||event.to!=='dead'&&STAGES.indexOf(event.to)!==STAGES.indexOf(prior)+1||['closed','dead'].includes(prior))break;
      const required=CHECKS[event.to]||[];
      if(required.some(k=>event.checks?.[k]!==true))break;
      prior=event.to;previous=at;out.push(event);
    } catch(_) { break; }
  }
  return out;
}
function signature(deal,now) {
  const history=events(deal,now);
  if(!Array.isArray(deal.jv_workflow_events)||history.length!==deal.jv_workflow_events.length)return null;
  const event=history.find(e=>e.to==='jv_signed');
  if(!event||event.terms_key!==termsKey(deal))return null;
  const signed=dates.normalizeSourceDate(event.signed_date_text).iso;
  if(!signed||signed>event.happened_at.slice(0,10)||signed>now.slice(0,10)||event.contract_copy_verified!==true)return null;
  try{source(event.contract_source_url);source(event.agreement_source_url);}catch(_){return null;}
  return {...event,signed_date:signed};
}
function view(deal,now) {
  const history=events(deal,now);const current=['dead','closed'].includes(deal.status)?deal.status:history.at(-1)?.to||'found';
  const signed=signature(deal,now);const terminal=['dead','closed'].includes(current);
  return {stage:current,label:LABELS[current],next_stage:terminal?null:STAGES[STAGES.indexOf(current)+1]||null,
    stages:STAGES.map(stage=>({stage,label:LABELS[stage],recorded:stage==='found'||history.some(e=>e.to===stage)})),
    events:history,history_invalid:deal.jv_workflow_events!=null&&(!Array.isArray(deal.jv_workflow_events)||history.length!==deal.jv_workflow_events.length),legacy_status:deal.status||null,signed_date:signed?.signed_date||null,contract_copy_verified:!!signed,
    full_package_evidence_ready:!!signed&&!terminal,active:history.length>0&&!terminal,
    blocking_reason:signed?'':history.some(e=>e.to==='jv_signed')?'Signed evidence or holder terms changed; review required.':'A signing date and verified contract copy are required before sharing the full package.'};
}
function buyer(evaluation,id) { const found=(evaluation.matches||[]).filter(b=>b.id===id);if(found.length!==1)fail('jv_buyer_not_matched');return found[0]; }
function teaser(deal,evaluation,buyerId) {
  buyer(evaluation,buyerId);
  if(deal.approval!=='approved'||!evaluation.jv_eligible)fail('jv_teaser_not_ready');
  if(!/^[A-Z]{2}$/.test(deal.state)||!/^\d{5}$/.test(deal.zip))fail('jv_teaser_location_invalid');
  // Whitelist numeric facts and coarse geography; never copy notes, URLs or contact text.
  const facts={reference:activity.ref(activity.reference(deal)),state:deal.state,zip:deal.zip,beds:deal.beds,baths:deal.baths,sqft:deal.sqft,year_built:deal.year_built,
    asking_price:evaluation.asking,value_range:evaluation.value.range,value_tier:evaluation.value.tier,comp_count:evaluation.value.comps.length,closing_date:deal.closing_date||null};
  for(const key of ['beds','baths','sqft','year_built'])if(typeof facts[key]!=='number'||!Number.isFinite(facts[key]))facts[key]=null;
  const body=['Blind deal teaser',facts.reference||'Reference pending','Area: '+facts.state+' '+facts.zip,
    ...['beds','baths','sqft','year_built'].filter(k=>facts[k]!=null).map(k=>k.replace('_',' ')+': '+facts[k]),
    'Asking: '+facts.asking_price,'Value: '+facts.value_tier+' '+JSON.stringify(facts.value_range)+' ('+facts.comp_count+' reviewed comps)',
    'Closing: '+(facts.closing_date||'Not supplied'),'Condition: not recorded'].join('\n');
  const privateValues=[deal.address,deal.holder_contact?.name,deal.holder_contact?.phone,deal.holder_contact?.email].filter(v=>typeof v==='string'&&v.trim());
  if(privateValues.some(v=>body.toLowerCase().includes(v.trim().toLowerCase())))fail('jv_teaser_private_data');
  return {buyer_id:buyerId,source_kind:'derived_workflow',facts,body,sent:false};
}
function fullPackage(deal,evaluation,buyerId,now) {
  buyer(evaluation,buyerId);const state=view(deal,now);
  const interest=state.events.find(e=>e.to==='buyer_interested');
  if(!state.full_package_evidence_ready||interest?.buyer_id!==buyerId||deal.approval!=='approved'||!evaluation.value.range||['expired','dead','closed'].includes(evaluation.status))fail('jv_full_package_locked');
  return {buyer_id:buyerId,address:deal.address,holder_contact:{...deal.holder_contact},source_url:deal.source_url,
    contract_source_url:signature(deal,now).contract_source_url,agreement_source_url:signature(deal,now).agreement_source_url,
    signed_date:state.signed_date,title_company:deal.title_company||null,closing_date:deal.closing_date||null,
    asking_price:evaluation.asking,value:evaluation.value,sent:false,source_kind:'derived_workflow'};
}
function record(store,id,input,context,evaluation) {
  const allowed=['action','stage','happened_at','source_url','evidence_text','checks','buyer_id','buyer_price','signed_date_text','contract_source_url','agreement_source_url'];
  if(!input||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k))||input.action!=='jv_stage')fail('jv_request_invalid',400);
  const index=(store.reviewed_deals||[]).findIndex(d=>d.id===id);const original=store.reviewed_deals?.[index];
  if(!original||original.deal_kind!=='jv')fail('not_found',404);
  text(context.operatorId,128);const at=time(input.happened_at,context.now);const state=view(original,context.now);
  if(state.history_invalid)fail('jv_history_invalid');
  if(['closed','dead'].includes(state.stage)||['closed','dead'].includes(evaluation.status)||evaluation.status==='expired'&&!['dead','closed'].includes(input.stage))fail('jv_terminal');
  if(input.stage!=='dead'&&input.stage!==state.next_stage)fail('jv_transition_invalid');
  if(state.events.at(-1)&&at<state.events.at(-1).happened_at)fail('jv_event_stale');
  const evidence={source_kind:'operator_input',source_url:source(input.source_url),evidence_text:text(input.evidence_text),happened_at:at,recorded_at:context.now,operator_id:context.operatorId};
  const required=CHECKS[input.stage]||[];
  if(!input.checks||typeof input.checks!=='object'||Array.isArray(input.checks)||Object.keys(input.checks).some(k=>!required.includes(k))||required.some(k=>input.checks[k]!==true))fail('jv_checks_required');
  if(input.stage!=='dead'&&original.approval!=='approved')fail('approval_required');
  const event={...evidence,from:state.stage,to:input.stage,checks:{...input.checks}};
  if(input.stage==='holder_interested') {
    if(!positive(original.contract_price)||!original.closing_date||!original.title_company||!(positive(original.holder_fee)||original.jv_split>0&&original.jv_split<=1)||original.emd==null)fail('jv_holder_terms_required');
    event.holder_terms=Object.fromEntries(TERMS.map(k=>[k,original[k]??null]));
  }
  const selected=state.events.find(e=>e.to==='buyer_interested')?.buyer_id;
  if(['buyer_teaser','buyer_interested','full_package','emd_at_title','assigned','closed'].includes(input.stage)) {
    buyer(evaluation,input.buyer_id);if(selected&&selected!==input.buyer_id)fail('jv_buyer_changed');event.buyer_id=input.buyer_id;
  } else if(Object.hasOwn(input,'buyer_id'))fail('jv_request_invalid',400);
  if(input.stage==='buyer_teaser')teaser(original,evaluation,input.buyer_id);
  if(input.stage==='buyer_interested') {if(!positive(input.buyer_price))fail('jv_buyer_price_required');event.buyer_price=input.buyer_price;}
  else if(Object.hasOwn(input,'buyer_price'))fail('jv_request_invalid',400);
  if(input.stage==='jv_signed') {
    const signed=dates.normalizeSourceDate(input.signed_date_text).iso;if(!signed||signed>at.slice(0,10))fail('jv_signed_date_unproven');
    event.signed_date_text=text(input.signed_date_text,80);event.contract_copy_verified=true;
    event.contract_source_url=source(input.contract_source_url);event.agreement_source_url=source(input.agreement_source_url);event.terms_key=termsKey(original);
  } else if(['signed_date_text','contract_source_url','agreement_source_url'].some(k=>Object.hasOwn(input,k)))fail('jv_request_invalid',400);
  if(['full_package','emd_at_title','assigned'].includes(input.stage))fullPackage(original,evaluation,input.buyer_id,context.now);
  if(input.stage==='closed'&&!signature(original,context.now))fail('jv_full_package_locked');
  const deal={...original,jv_workflow_events:(original.jv_workflow_events||[]).concat(event)};
  // Keep old status and its history verbatim; the new pipeline is an explicit event stream.
  const rows=store.reviewed_deals.slice();rows[index]=deal;
  return activity.recordEvent({...store,reviewed_deals:rows},'deal',id,'status_change','Operator recorded JV stage: '+LABELS[input.stage]+'.',context,
    {attribution:'operator_report',jv_stage:input.stage,happened_at:at,source_kind:'operator_input',source_url:evidence.source_url});
}
module.exports={STAGES,LABELS,CHECKS,view,record,teaser,fullPackage};
