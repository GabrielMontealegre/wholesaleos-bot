'use strict';
const crypto=require('crypto');
const conversations=require('./conversations');
const records=require('./record-activity');
const {matchMessages}=require('./mailbox-conversation-preview');
const {messageId,threadId,receivedTime}=require('./mailbox-reply-evidence');
function fail(code,status=400){const e=new Error(code);e.code=code;e.status=status;throw e;}
function mailUrl(v){try{const u=new URL(v);return u.protocol==='https:'&&u.hostname==='mail.google.com'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function persist(store,messages,{now,operatorId}){
  if(typeof operatorId!=='string'||!operatorId)fail('conversation_email_actor_required');
  const {rows,matches,counts}=matchMessages(store,messages,{now});let added=0,duplicates=0;
  for(const {row,message:m} of matches){
    const key=crypto.createHash('sha256').update(messageId(m.message_id)?'rfc:'+m.message_id:'mailbox:'+m.id).digest('hex');
    const entry={key,message_id:m.id,rfc_message_id:messageId(m.message_id),in_reply_to:messageId(m.in_reply_to),thread_id:threadId(m.threadId),direction:'in',date:new Date(m.date).toISOString(),subject:typeof m.subject==='string'?m.subject.slice(0,1000):'',source_kind:'connected_mailbox',source_url:mailUrl(row.thread_url),captured_at:now,linked_by:operatorId};
    entry.evidence_text='Email subject: '+entry.subject;
    const previous=(row.mailbox_replies||[]).find(p=>p.key===key);
    if(previous){if(previous.date!==entry.date||previous.subject!==entry.subject)fail('conversation_email_identity_conflict',409);duplicates++;continue;}
    row.mailbox_replies=(row.mailbox_replies||[]).concat(entry);added++;
  }
  const updated=added?records.append({...store,conversations:rows},{type:'conversation_updated',summary:'Linked mailbox replies saved: '+added+'.',channel:'email'},{now,operatorId}):store;
  return {store:updated,summary:{...counts,saved_messages:added,duplicate_messages:duplicates}};
}
function link(store,input,message,{now,operatorId}){
  if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['message_id','person','role','refs','next_step'].includes(k))||typeof input.message_id!=='string'||input.message_id.length>1000||input.message_id!==message?.id)fail('conversation_email_link_invalid');
  if(message.direction!=='in'||!Number.isFinite(receivedTime(message.date))||receivedTime(message.date)>Date.parse(now))fail('conversation_email_not_incoming',409);
  const anchor=messageId(message.message_id);
  if(!anchor)fail('conversation_email_anchor_missing',409);
  const sourceUrl=mailUrl(message.source_url);
  const report=conversations.validate({kind:'conversation',person:input.person,role:input.role,refs:input.refs||[],channels:['email'],status:'follow_up',captured_at:now,next_step:input.next_step||'',...(anchor?{email_message_ids:[anchor]}:{}),...(sourceUrl?{thread_url:sourceUrl}:{})},now);
  const previous=(store.conversations||[]).find(r=>r.person.toLowerCase()===report.person.toLowerCase()&&JSON.stringify(r.refs)===JSON.stringify(report.refs));
  if(previous?.status==='closed')fail('conversation_email_closed',409);
  let updated=store,target;
  if(previous){
    if(previous.role!==report.role)fail('conversation_email_role_conflict',409);
    target={...previous,channels:[...new Set([...previous.channels,'email'])].sort(),email_message_ids:[...new Set([...(previous.email_message_ids||[]),...(report.email_message_ids||[])])].sort(),...(sourceUrl&&!previous.thread_url?{thread_url:report.thread_url}:{})};
    if(target.email_message_ids.length>10)fail('conversation_email_anchor_limit',409);
    const rows=store.conversations.map(r=>r===previous?target:r);
    updated={...store,conversations:rows};
  }else{
    updated=conversations.upsert(store,report,{now,operatorId}).store;
    target=updated.conversations.find(r=>r.person===report.person&&JSON.stringify(r.refs)===JSON.stringify(report.refs));
    target={...target,source_kind:'operator_input'};
    updated={...updated,conversations:updated.conversations.map(r=>r.id===target.id?target:r)};
  }
  // Check the whole store, not just the chosen row: a shared anchor must never
  // silently reassign a message previously associated with another person.
  const matched=matchMessages(updated,[message],{now});
  if(matched.matches.length!==1||matched.matches[0].row.id!==target.id)fail('conversation_email_link_ambiguous',409);
  const result=persist(updated,[message],{now,operatorId});
  if(previous&&result.summary.saved_messages===0){
    const changed=JSON.stringify(previous.channels)!==JSON.stringify(target.channels)||JSON.stringify(previous.email_message_ids)!==JSON.stringify(target.email_message_ids)||previous.thread_url!==target.thread_url;
    return {store:changed?records.append(result.store,{type:'conversation_updated',summary:'Exact mailbox association updated.',channel:'email'},{now,operatorId}):store,summary:result.summary};
  }
  return result;
}
module.exports={persist,link};
