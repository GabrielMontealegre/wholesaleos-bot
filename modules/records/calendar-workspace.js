'use strict';

const crypto = require('node:crypto');
const activity = require('./record-activity');
const conversations = require('./conversations');
const { dayAt } = require('./calendar-day');
const { savedReplies } = require('./mailbox-reply-evidence');
const { normalizeSourceDate } = require('../research/normalize-source-date');
const { resolveSourceSaleDate } = require('../research/resolve-source-sale-date');
const origins = require('../research/sale-date-origin');
const jv = require('../deals/jv-workflow');
const eligibility = require('../research/operational-lead-eligibility');

const TYPES = Object.freeze({ email_in:'Email received',email_out:'Email sent',call:'Call report',offer:'Offer report',deadline:'Deadline',closing:'Closing date',followup:'Follow-up',approval:'Approval',note:'Note' });
function text(v, max=1000) { return typeof v === 'string' ? v.replace(/[\x00-\x1f]/g,' ').trim().slice(0,max) : ''; }
function date(v) { return normalizeSourceDate(v).iso || ''; }
function instant(v, now) {
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v))return '';
  const n=Date.parse(v);return Number.isFinite(n)&&n<=now&&new Date(n).toISOString().slice(0,19)===v.slice(0,19)?new Date(n).toISOString():'';
}
function url(v) { try { const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null; } catch { return null; } }
function digest(v) { return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); }
function buildCalendarWorkspace(store,{now,timeZone='America/Mazatlan'}={}) {
  const clock=instant(now,Infinity);if(!clock)throw Error('calendar_clock_invalid');
  const today=dayAt(now,timeZone), yesterday=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  const targets=[], refs=new Map();
  for(const [collection,kind] of [['buyers','buyer'],['reviewed_deals','deal'],['leads','lead'],['record_matches','match']])for(const row of store[collection]||[]){
    const ref=activity.reference(row),target={kind,id:text(row.id,128),ref:text(ref,30),assistant_find:!!row.assistant_find,row};
    targets.push(target);if(ref)refs.set(ref,refs.has(ref)?null:target);
  }
  function forActivity(a) {
    const found=[];
    for(const [kind,field] of [['buyer','buyer_id'],['deal','deal_id'],['lead','lead_id'],['match','match_id']])if(a[field]){
      const candidates=targets.filter(t=>t.kind===kind&&t.id===a[field]);if(candidates.length!==1)return null;found.push(candidates[0]);
    }
    for(const field of ['deal_ref','buyer_ref','match_ref'])if(a[field]){const t=refs.get(a[field]);if(!t)return null;found.push(t);}
    // A multi-record receipt can open the deal; conflicting id/ref pairs cannot.
    for(const kind of ['buyer','deal','lead','match'])if(new Set(found.filter(t=>t.kind===kind).map(t=>t.id)).size>1)return null;
    return found.find(t=>t.kind==='deal')||found.find(t=>t.kind==='lead')||found[0]||null;
  }
  function display(target) {
    if(!target)return {label:'Record not linked',target:null,private:false};
    const r=target.row,hidden=r.deal_kind==='jv'&&!jv.view(r,now).full_package_evidence_ready;
    const label=target.kind==='buyer'?text(r.name,160):target.kind==='match'?'Buyer criteria match':hidden?[r.city,r.state,r.zip].filter(Boolean).join(', '):target.kind==='lead'&&!eligibility.verifiedPropertyAddress(r)?'Property address needs source proof':text(r.address||r.normalized_address,200);
    return {label:label||'Property not named',target:{kind:target.kind,id:target.id,ref:target.ref,assistant_find:target.assistant_find,...(target.kind==='match'?{deal_id:text(r.deal_id,128)}:{})},private:hidden};
  }
  const events=[],seen=new Set(),counts={invalid_dates:0,unlinked_activity:0,duplicate_activity_rows:0};
  function add(key,event,target) {
    if(seen.has(key))return;seen.add(key);const d=display(target);
    events.push({key,...event,label:d.label,target:d.target,summary:d.private?'Recorded deal activity. Open the deal for permitted details.':text(event.summary),person:d.private?'':text(event.person,160),source_url:d.private?null:url(event.source_url)});
  }
  const actions=store.activities||[], idCounts=new Map();
  for(const a of actions)if(a.activity_id||a.id){const id=a.activity_id||a.id;idCounts.set(id,(idCounts.get(id)||0)+1);}
  for(const a of actions){
    if((a.activity_id||a.id)&&idCounts.get(a.activity_id||a.id)>1){counts.duplicate_activity_rows++;continue;}
    const at=instant(a.ts||a.created_at,Date.parse(now));if(!at){counts.invalid_dates++;continue;}
    const direction=a.direction||({email_sent:'out',message_sent:'out',reply_received:'in'})[a.type];
    const type=a.channel==='email'&&['in','out'].includes(direction)?'email_'+direction:a.type==='call_note'||a.channel==='phone'?'call':a.type==='offer_sent'?'offer':['approved','rejected'].includes(a.type)?'approval':'note';
    const target=forActivity(a);if(!target)counts.unlinked_activity++;
    add('activity:'+digest([a.activity_id||a.id||'',at,a.type,a.deal_ref,a.buyer_ref,a.match_ref,a.summary]),{type,at,day:dayAt(at,timeZone),state:'recorded',title:TYPES[type],summary:a.summary||a.note,person:a.with,source_kind:a.attribution==='imported_report'?'imported_report':'recorded_activity',source_field:'activities',captured_at:instant(a.recorded_at||a.created_at||at,Date.parse(now)),reported:true},target);
  }
  const validConversations=(store.conversations||[]).filter(c=>!c.captured_at||!!instant(c.captured_at,Date.parse(now)));
  const projected=conversations.project({...store,conversations:validConversations},{now,timeZone});
  for(const c of validConversations){
    const target=(c.refs||[]).map(r=>refs.get(r)).find(Boolean)||null;
    for(const [field,direction] of [['last_in','in'],['last_out','out']]){
      const at=instant(c[field],Date.parse(now));if(!at)continue;
      if(events.some(e=>e.at===at&&e.person===c.person&&e.target?.ref&&(c.refs||[]).includes(e.target.ref)))continue;
      const type=(c.channels||[]).includes('email')?'email_'+direction:(c.channels||[]).includes('phone')?'call':'note';
      add('conversation:'+digest([c.id,field,at]),{type,at,day:dayAt(at,timeZone),state:'recorded',title:TYPES[type],person:c.person,summary:direction==='in'?c.what_they_said:'Outgoing conversation reported',source_kind:'imported_report',source_field:'conversations.'+field,source_url:c.thread_url,captured_at:instant(c.captured_at,Date.parse(now)),reported:true,conversation_id:c.id},target);
    }
    for(const m of savedReplies(c,now)){
      const at=new Date(m.date).toISOString();
      if(events.some(e=>e.at===at&&e.type==='email_in'&&e.person===c.person))continue;
      add('mailbox:'+digest([c.id,m.key]),{type:'email_in',at,day:dayAt(at,timeZone),state:'recorded',title:'Email received',person:c.person,summary:'Saved linked mailbox receipt; open the conversation to read it.',source_kind:'connected_mailbox',source_field:'conversations.mailbox_replies',captured_at:m.captured_at,reported:false,conversation_id:c.id},target);
    }
  }
  for(const c of projected.items){
    if(!date(c.due_date))continue;
    const target=(c.refs||[]).map(r=>refs.get(r)).find(Boolean)||null;
    add('followup:'+digest(c.id),{type:'followup',day:c.due_date,at:null,state:'due',title:c.status==='hot'?'Reply waiting':'Follow-up due',person:c.person,summary:c.next_step||'Review the recorded conversation before following up.',source_kind:'derived_workflow',source_field:'conversations.project.due_date',source_url:c.source_url,captured_at:c.captured_at,conversation_id:c.id,derived:true,reminder_basis:(store.conversations||[]).find(r=>r.id===c.id)?.due_date?'Reported due date':'Existing conversation reminder rule'},target);
  }
  for(const event of events)if(event.source_field==='activities'&&event.person&&event.target?.ref){
    const matches=projected.items.filter(c=>c.person.toLowerCase()===event.person.toLowerCase()&&c.refs.includes(event.target.ref));
    if(matches.length===1)event.conversation_id=matches[0].id;
  }
  for(const t of targets){
    const r=t.row;
    if(t.kind==='deal')for(const [field,type] of [['closing_date','closing'],['auction_date','deadline']]){
      const day=date(r[field]);if(!day)continue;
      add('deal:'+digest([t.id,field]),{type,day,at:null,state:['closed','dead'].includes(r.status)?'historical':'scheduled',title:type==='closing'?'Reported closing date':'Reported auction date',summary:'Reported date; not proof that the event happened.',source_kind:'imported_report',source_field:field,source_url:r.source_url,captured_at:instant(r.captured_at,Date.parse(now)),reported:true},t);
    }
    if(t.kind==='lead'){
      const field=[...origins.GENERIC_DATE_FIELDS,...origins.SALE_DATE_ORIGINS].find(f=>text(r[f])&&origins.isSaleDateOrigin(f==='event_date'?r.event_date_origin||r.sale_date_or_event_date_origin:f==='sale_date_or_event_date'?r.sale_date_or_event_date_origin:f,r.source_adapter_id||r.source_id));
      if(field){const raw=r[field],day=date(raw)||resolveSourceSaleDate({raw_text:raw,raw_field:field,source_adapter_id:r.source_adapter_id||r.source_id,source_url:r.source_document_url||r.source_url,document_text:r.source_proof_text,index_sale_date_text:r.index_sale_date_text}).resolved_iso;
        if(day&&url(r.source_document_url||r.source_url))add('lead:'+digest([t.id,field]),{type:'deadline',day,at:null,state:'scheduled',title:'Source-reported sale date',summary:'Check the source for cancellation or a changed sale status.',source_kind:'source_record',source_field:field,source_url:r.source_document_url||r.source_url,captured_at:instant(r.captured_at||r.last_checked_at,Date.parse(now)),reported:true},t);
      }
    }
    const pending=t.kind==='buyer'?r.assistant_find?.approval==='pending':t.kind==='deal'&&r.approval==='pending';
    if(pending){const at=instant(r.assistant_find?.first_seen_at||r.first_seen_at||r.captured_at,Date.parse(now));if(at)add('approval:'+digest([t.kind,t.id]),{type:'approval',at,day:dayAt(at,timeZone),state:'pending',title:'Approval waiting',summary:'Review the record before approving it.',source_kind:'derived_workflow',source_field:'approval',captured_at:at,derived:true},t);}
  }
  for(const e of store.calendar||[]){const day=date(e.date);if(!day)continue;const type=({call:'call',close:'closing',follow:'followup',offer:'offer',deadline:'deadline'})[e.type]||'note';add('manual:'+digest(e.id||e),{type,day,at:null,state:'scheduled',title:text(e.title,160)||'Manual event',summary:e.notes,source_id:text(e.id,128),source_kind:'operator_calendar',source_field:'calendar',captured_at:null,reported:true},null);}
  events.sort((a,b)=>a.day.localeCompare(b.day)||(a.at||'').localeCompare(b.at||'')||a.key.localeCompare(b.key));
  return {now,today,yesterday,time_zone:timeZone,source_kind:'derived_workflow',types:TYPES,total:events.length,events,conversations:projected.items,coverage:{email:'Saved linked receipts and recorded reports only; no mailbox fetched',reminders:'Existing conversation rules; no reminders saved or messages sent',...counts},brief:{yesterday_done:events.filter(e=>e.day===yesterday&&e.state==='recorded').length,today_due:events.filter(e=>e.type==='followup'&&e.state==='due'&&e.day<=today).length}};
}
function registerCalendarWorkspace(app,{db,requireAdmin,now=()=>new Date().toISOString()}){
  app.get('/api/dashboard/calendar-workspace',requireAdmin,(req,res)=>{res.set('Cache-Control','no-store');try{res.json(buildCalendarWorkspace(db.readDBStrict(),{now:now()}));}catch{res.status(503).json({code:'calendar_workspace_unavailable'});}});
}
module.exports={buildCalendarWorkspace,registerCalendarWorkspace,TYPES};
