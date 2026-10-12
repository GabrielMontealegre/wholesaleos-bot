'use strict';
const crypto=require('node:crypto');
const ops=require('../research/operational-lead-eligibility');
const fit=require('../buyers/buyer-fit');
const dates=require('../research/normalize-source-date');
const numeric=require('../research/resolve-source-sale-date');
const origins=require('../research/sale-date-origin');
const LABELS=Object.freeze({keep:'Keep and comp',park:'Park',archive:'Archive'});
const REASONS=Object.freeze({already_archived:'Already archived; no new move',old_tax:'Source tax year is over three years old with no newer event evidence',address_attempted:'No complete street address after a recorded address-repair attempt',source_conflict:'Property/source conflict needs review',inactive:'Closed or declined workflow; keep the record for history',no_buyers:'No approved buyer market covers this location',address_unknown:'Property address needs source proof',date_unknown:'Distress date needs source evidence',date_old:'No distress event within the last twelve months',keep:'Verified property in an approved buyer market with recent or upcoming distress'});
const DATE_FIELDS=Object.freeze(['sale_date_or_event_date','event_date','sale_date','auction_date','date_of_sale','trustee_sale_date','foreclosure_sale_date','filing_date','violation_date','violationdate','notice_date']);
const TAX_TYPES=new Set(['tax_lien','tax_delinquent','tax_delinquency','tax_sale_notice']);
function clean(value){return typeof value==='string'?value.trim():typeof value==='number'?String(value):'';}
function cutoff(today,months){const [year,month,day]=today.split('-').map(Number);const first=new Date(Date.UTC(year,month-1-months,1));const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();return new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(day,last))).toISOString().slice(0,10);}
function validToday(today){if(!/^\d{4}-\d{2}-\d{2}$/.test(today||'')||dates.normalizeSourceDate(today).iso!==today)throw Object.assign(new Error('lead_triage_date_invalid'),{code:'lead_triage_date_invalid'});}
function sourceRows(row){return [row,row.source_normalized?.raw_payload].filter(value=>value&&typeof value==='object'&&!Array.isArray(value));}
function sourcePresent(row){return /^https?:\/\//.test(ops.sourceUrl(row));}
function events(row,today){
  const resolved=[],possible=[];let unknown=false;
  for(const raw of sourceRows(row))for(const field of DATE_FIELDS){
    const value=clean(raw[field]);if(!value)continue;
    const origin=clean(raw[field+'_origin']);if(/^(created_at|created|ingested_at|captured_at|posted_at|updated_at|recorded_at|last_checked_at|source_published_at|source_event_date|.*_iso)$/.test(origin))continue;
    const normalized=dates.normalizeSourceDate(value);const sale=origins.SALE_DATE_ORIGINS.includes(field)||origins.isSaleDateOrigin(origin,row.source_adapter_id||row.source_id);
    let iso=normalized.iso;
    if(!iso&&normalized.reason==='ambiguous_numeric_order'){
      const proof=numeric.resolveSourceSaleDate({raw_text:value,...(sale?{raw_field:field,source_adapter_id:row.source_adapter_id||row.source_id,source_url:row.source_document_url||row.source_url,document_text:row.source_proof_text,index_sale_date_text:row.index_sale_date_text}:{})});
      iso=proof.resolved_iso;possible.push(...proof.valid_readings_iso);
    }
    if(iso&&(iso<=today||sale&&iso<=cutoff(today,-12)))resolved.push(iso);else unknown=true;
  }
  return {resolved,possible,unknown};
}
function taxYear(row){
  const kind=clean(row.source_details?.source_type||row.source_type||row.source_normalized?.source_type).toLowerCase();
  if(!TAX_TYPES.has(kind)||!sourcePresent(row))return null;
  const candidates=[row.tax_year,row.source_details?.tax_year,row.source_normalized?.raw_payload?.tax_year,row.source_normalized?.raw_payload?.source_details?.tax_year];
  const years=[...new Set(candidates.filter(value=>/^\d{4}$/.test(clean(value))).map(Number))];
  return years.length===1&&years[0]>=1900?years[0]:null;
}
function addressAttempted(row,today,now){
  // Aggregate counters and contact-enrichment attempts are not proof of address work.
  return (Array.isArray(row.enrichment_history)?row.enrichment_history:[]).some(attempt=>attempt&&attempt.lane==='property_address_repair'&&attempt.source_kind==='operator_input'&&
    clean(attempt.operator_id)&&/^https?:\/\//.test(clean(attempt.source_url))&&clean(attempt.evidence_text)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(clean(attempt.attempted_at))&&Number.isFinite(Date.parse(attempt.attempted_at))&&dates.normalizeSourceDate(attempt.attempted_at.slice(0,10)).iso&&
    (now?Date.parse(attempt.attempted_at)<=Date.parse(now):attempt.attempted_at.slice(0,10)<today));
}
function buyerMarkets(buyers){return (buyers||[]).filter(buyer=>ops.buyerEligible(buyer)&&buyer.archived!==true&&!['inactive','closed','not_a_fit'].includes(clean(buyer.assistant_find?.status||buyer.status).toLowerCase())).map(buyer=>{
  const find=buyer.assistant_find||{};const box=find.buy_box||{};
  return {...buyer,assistant_find:{approval:'approved',classification:'end_buyer',states:box.state?[box.state]:find.states||buyer.states||(buyer.state?[buyer.state]:[]),areas:box.areas?.length?box.areas:find.areas||buyer.cities||(buyer.city?[buyer.city]:[]),buy_box:{...(box.state?{state:box.state}:{}),...(box.zips?{zips:box.zips}:{})}}};
});}
function inMarket(row,markets){return markets.some(buyer=>{const result=fit.fitLead(buyer,row);return result.fits&&!result.unknown.length;});}
function classify(row,{today,markets,now}){
  const out=(bucket,reason)=>({bucket,reason,reason_text:REASONS[reason],new_archive:bucket==='archive'&&row.archived!==true});
  if(row.archived===true)return out('archive','already_archived');
  if(ops.sourceConflict(row))return out('park','source_conflict');
  if(row.do_not_contact===true||row.contact_workflow_outcome==='not_interested'||['closed','archived','dead'].includes(clean(row.status).toLowerCase()))return out('park','inactive');
  const event=events(row,today);const year=taxYear(row);const old=cutoff(today,36);const recent=cutoff(today,12);
  const newer=event.resolved.some(date=>date>=old)||event.possible.some(date=>date>=old)||event.unknown;
  if(year&&year+'-12-31'<old&&!newer)return out('archive','old_tax');
  const verified=ops.verifiedPropertyAddress(row);const address=ops.subjectAddress(row);
  if(!require('../research/property-identity').isCompleteAddress(address)&&addressAttempted(row,today,now))return out('archive','address_attempted');
  if(!inMarket(row,markets))return out('park','no_buyers');
  if(!verified)return out('park','address_unknown');
  if(!sourcePresent(row)||!event.resolved.length)return out('park','date_unknown');
  if(!event.resolved.some(date=>date>=recent))return out('park',event.unknown||event.possible.some(date=>date>=recent)?'date_unknown':'date_old');
  return out('keep','keep');
}
function safeId(row){const id=clean(row.id);return /^(?:LEAD-\d[A-Za-z0-9_-]*|L\d[A-Za-z0-9_-]*|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(id)?id:'';}
function plan(store,{today,now}){
  validToday(today);if(!Array.isArray(store.leads)||store.buyers!=null&&!Array.isArray(store.buyers))throw Object.assign(new Error('lead_triage_store_invalid'),{code:'lead_triage_store_invalid'});
  if(now&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(now)||!Number.isFinite(Date.parse(now))||!dates.normalizeSourceDate(now.slice(0,10)).iso))throw Object.assign(new Error('lead_triage_date_invalid'),{code:'lead_triage_date_invalid'});
  const markets=buyerMarkets(store.buyers||[]);const counts={keep:0,park:0,archive:0};const reasons={};const targets=[];let existing=0,proposed=0,unsafeIds=0;
  for(const row of store.leads){if(!row||typeof row!=='object'||Array.isArray(row))throw Object.assign(new Error('lead_triage_store_invalid'),{code:'lead_triage_store_invalid'});
    const state=classify(row,{today,markets,now});counts[state.bucket]++;reasons[state.reason]=(reasons[state.reason]||0)+1;
    if(row.archived===true)existing++;if(state.new_archive)proposed++;
    if(state.bucket==='keep'){const id=safeId(row);if(id)targets.push({id});else unsafeIds++;}
  }
  const within=proposed>=8100&&proposed<=9900&&counts.park>=1395&&counts.park<=1705&&counts.keep<=110;
  return {today,read_only:true,source_kind:'derived_workflow',not_lead_evidence:true,total:store.leads.length,counts,reason_counts:reasons,existing_archived:existing,proposed_new_archive:proposed,
    approved_buyer_count:markets.length,unsafe_target_ids:unsafeIds,top_keep_ids:targets.slice(0,20),move_within_original_bounds:within,
    snapshot_version:crypto.createHash('sha256').update(JSON.stringify([store.leads,store.buyers||[]])).digest('hex'),labels:LABELS,reasons:REASONS};
}
module.exports={plan,classify,buyerMarkets,LABELS,REASONS};
