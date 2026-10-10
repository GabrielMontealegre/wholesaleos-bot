'use strict';
const crypto = require('crypto');
const records = require('./record-activity');
const { dayAt } = require('./calendar-day');
const STATUSES = ['hot', 'to_send', 'follow_up', 'waiting_on_deal', 'closed'];
const CHANNELS = ['facebook', 'email', 'phone', 'manual'];
function fail(code, status=400) { const e=new Error(code);e.code=code;e.status=status;throw e; }
function text(v,max) { if(v==null)return '';if(typeof v!=='string'||v.length>max||/[\x00-\x1f]/.test(v))fail('find_conversation_invalid');return v.trim(); }
function timestamp(v,now) {
  const s=text(v,40);if(!s)return '';
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)||!Number.isFinite(Date.parse(s))||Date.parse(s)>Date.parse(now)||new Date(s).toISOString().slice(0,10)!==s.slice(0,10))fail('find_conversation_date_invalid');
  return new Date(s).toISOString();
}
function link(v) {
  if(!v)return '';let u;try{u=new URL(v);}catch{fail('find_conversation_link_invalid');}
  if(u.protocol!=='https:'||u.username||u.password||!['www.facebook.com','facebook.com','www.messenger.com','messenger.com','mail.google.com'].includes(u.hostname))fail('find_conversation_link_invalid');
  return u.href;
}
function validate(input,now) {
  const allowed=['kind','person','role','refs','channels','last_in','last_out','what_they_said','next_step','due_date','status','ready_message','thread_url','captured_at','email_message_ids'];
  if(!input||Array.isArray(input)||input.kind!=='conversation'||Object.keys(input).some(k=>!allowed.includes(k))||Buffer.byteLength(JSON.stringify(input))>8192)fail('find_conversation_invalid');
  const person=text(input.person,120);const refs=input.refs||[],channels=input.channels||[];
  if(!person||!['holder','buyer','partner'].includes(input.role)||!Array.isArray(refs)||refs.length>10||!Array.isArray(channels)||!channels.length||channels.length>4||channels.some(c=>!CHANNELS.includes(c))||!STATUSES.includes(input.status))fail('find_conversation_invalid');
  const captured_at=timestamp(input.captured_at,now);if(!captured_at)fail('find_conversation_date_invalid');
  const due_date=text(input.due_date,10);if(due_date&&(!/^\d{4}-\d{2}-\d{2}$/.test(due_date)||!Number.isFinite(Date.parse(due_date))||new Date(due_date).toISOString().slice(0,10)!==due_date))fail('find_conversation_date_invalid');
  const canonicalRefs=[...new Set(refs.map(r=>records.ref(r)))].sort();if(canonicalRefs.some(r=>!r))fail('find_conversation_invalid');
  const extra={};
  if(input.email_message_ids!==undefined){
    if(!channels.includes('email')||!Array.isArray(input.email_message_ids)||input.email_message_ids.length>10||input.email_message_ids.some(v=>typeof v!=='string'||v.length>254||!/^<[^<>\s@]+@[^<>\s@]+>$/.test(v)))fail('find_conversation_email_anchor_invalid');
    extra.email_message_ids=[...new Set(input.email_message_ids)].sort();
  }
  return {kind:'conversation',person,role:input.role,refs:canonicalRefs,channels:[...new Set(channels)].sort(),last_in:timestamp(input.last_in,now),last_out:timestamp(input.last_out,now),what_they_said:text(input.what_they_said,1000),next_step:text(input.next_step,1000),due_date,status:input.status,ready_message:text(input.ready_message,4000),thread_url:link(input.thread_url),captured_at,...extra};
}
function key(person,refs) { return crypto.createHash('sha256').update(JSON.stringify([person.trim().toLowerCase(),refs])).digest('hex'); }
function upsert(store,input,context) {
  const item=validate(input,context.now);const known=['leads','buyers','reviewed_deals','record_matches'].flatMap(k=>(store[k]||[]).map(records.reference));
  if(item.refs.some(r=>known.filter(v=>v===r).length!==1))fail('find_conversation_ref_unknown',409);
  const id=key(item.person,item.refs);const rows=(store.conversations||[]).slice();const index=rows.findIndex(r=>r.id===id);const previous=rows[index];
  if(previous&&Date.parse(previous.captured_at)>=Date.parse(item.captured_at)) {
    if(previous.captured_at===item.captured_at&&JSON.stringify(previous.report)!==JSON.stringify(item))fail('find_conversation_conflict',409);
    return {store,results:[{id,result:'duplicate'}]};
  }
  const row={id,...item,source_kind:'imported_report',recorded_at:context.now,recorded_by:context.operatorId,report:item,history:(previous?.history||[]).concat({report:item,recorded_at:context.now,operator_id:context.operatorId})};
  if(index<0)rows.push(row);else rows[index]=row;
  const updated=records.append({...store,conversations:rows},{type:'conversation_updated',summary:'Conversation report imported; not an independently verified outreach action.'},context);
  return {store:updated,results:[{id,result:previous?'updated':'created'}]};
}
function addDays(day,n) { return new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10); }
function list(store,{now,timeZone='America/Mazatlan',limit=50}={}) {
  if(!Number.isFinite(Date.parse(now)))fail('find_conversation_date_invalid');const today=dayAt(now,timeZone);
  const closed=new Set([...(store.reviewed_deals||[]).filter(r=>['closed','dead'].includes(r.status)),...(store.buyers||[]).filter(r=>r.assistant_find?.status==='not_a_fit')].map(records.reference));
  const rows=new Map((store.conversations||[]).map(r=>[key(r.person,r.refs),{...r,channels:[...r.channels],events:[]}]));
  for(const a of store.activities||[]) {
    const at=a.ts||a.created_at;const direction=a.direction||({reply_received:'in',email_sent:'out',message_sent:'out'})[a.type];const ref=a.deal_ref||a.buyer_ref||a.match_ref;
    if(!['in','out'].includes(direction)||!CHANNELS.includes(a.channel)||!Number.isFinite(Date.parse(at))||Date.parse(at)>Date.parse(now)||!ref)continue;
    const person=String(a.with||'').trim();const candidates=[...rows.values()].filter(r=>r.refs.includes(ref)&&r.channels.includes(a.channel)&&person&&r.person.toLowerCase()===person.toLowerCase());
    if([...rows.values()].some(r=>r.status==='closed'&&r.refs.includes(ref)&&person&&r.person.toLowerCase()===person.toLowerCase()))continue;
    if(candidates.length>1)continue;let row=candidates[0];
    if(!row){const id=key(person||'Reported thread: '+a.channel,[ref]);row=rows.get(id);if(!row){row={id,person:person||'Contact not named',role:'not_recorded',refs:[ref],channels:[a.channel],status:'follow_up',what_they_said:'',next_step:'',ready_message:'',thread_url:'',source_kind:'reported_interaction',events:[]};rows.set(id,row);}}
    row.events.push({at,direction,summary:a.summary||'',id:a.import_digest||a.activity_id||JSON.stringify([at,direction,a.channel,a.summary])});
  }
  const items=[];
  for(const row of rows.values()) {
    if(row.status==='closed'||row.refs.some(r=>closed.has(r)))continue;
    const events=[...new Map(row.events.map(e=>[e.id,e])).values()];
    const ins=events.filter(e=>e.direction==='in').sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    const outs=events.filter(e=>e.direction==='out').sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    const last_in=[row.last_in,...ins.map(e=>e.at)].filter(v=>v&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=Date.parse(now)).sort().at(-1)||'';
    const last_out=[row.last_out,...outs.map(e=>e.at)].filter(v=>v&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=Date.parse(now)).sort().at(-1)||'';
    const hot=last_in&&(!last_out||Date.parse(last_in)>Date.parse(last_out));
    // A tied or older reply never invents a new waiting-on-us state.
    const status=hot?'hot':row.status==='hot'?'follow_up':row.status;
    const afterReply=outs.filter(e=>!last_in||Date.parse(e.at)>Date.parse(last_in));
    const sent=afterReply.length|| (last_out?1:0);const anchor=afterReply[0]?.at||last_out;
    const offset=sent===1?2:sent===2?5:5+7*(sent-2);
    const due_date=hot?today:row.due_date||(anchor?addDays(dayAt(anchor,timeZone),offset):'');
    const latestSummary=ins[0]&&(!row.last_in||Date.parse(ins[0].at)>Date.parse(row.last_in))?ins[0].summary:row.what_they_said;
    items.push({id:row.id,person:row.person,role:row.role,refs:row.refs,channels:row.channels,last_in,last_out,what_they_said:latestSummary||'',next_step:row.next_step||'',ready_message:row.ready_message||'',thread_url:link(row.thread_url),status,due_date,overdue:!!due_date&&due_date<today,source_kind:row.source_kind,source_url:row.thread_url||null,evidence_text:latestSummary||'',captured_at:row.captured_at||[last_in,last_out].filter(Boolean).sort().at(-1)||null});
  }
  items.sort((a,b)=>(b.status==='hot')-(a.status==='hot')||Number(b.overdue)-Number(a.overdue)||(a.due_date||'9999').localeCompare(b.due_date||'9999')||a.id.localeCompare(b.id));
  return {today,total:items.length,waiting_count:items.filter(r=>r.status==='hot'||r.status==='to_send'||r.due_date&&r.due_date<=today).length,incoming_count:items.filter(r=>r.status==='hot').length,followup_count:items.filter(r=>r.status!=='hot'&&r.due_date&&r.due_date<=today).length,unlinked_count:items.filter(r=>!r.refs.length).length,items:items.slice(0,Math.min(100,Math.max(1,Number(limit)||50)))};
}
module.exports={validate,upsert,list,STATUSES};
