'use strict';
const conversations = require('./conversations');
const {messageId,threadId,savedReplies,receivedTime}=require('./mailbox-reply-evidence');
function gmailThread(url) {
  try {
    const u = new URL(url);
    if(u.protocol !== 'https:' || u.hostname !== 'mail.google.com' || u.username || u.password) return '';
    return threadId(u.hash.match(/^#(?:inbox|sent|all)\/([a-f0-9]+)$/)?.[1]);
  } catch { return ''; }
}
function matchMessages(store, messages, {now} = {}) {
  if(!Number.isFinite(Date.parse(now))) throw new Error('conversation_preview_date_invalid');
  const rows = (store.conversations || []).map(r => ({...r}));
  const sample = Array.isArray(messages) ? messages.slice(0,30) : [];
  const graph = new Map();
  function connect(nodes) {
    for(const a of nodes) { if(!graph.has(a)) graph.set(a,new Set()); for(const b of nodes) graph.get(a).add(b); }
  }
  const valid = sample.map(m => {
    const nodes = [messageId(m.message_id) && 'm:'+m.message_id, messageId(m.in_reply_to) && 'm:'+m.in_reply_to, threadId(m.threadId) && 't:'+m.threadId].filter(Boolean);
    connect(nodes);
    return {m,nodes};
  });
  // Propagate exact header/thread connections before assigning an owner, so
  // conflicting anchors never silently choose the first conversation.
  const ownerByNode = new Map();
  for(const r of rows) {
    if(!r.channels?.includes('email')) continue;
    const saved=savedReplies(r,now);
    const seeds = [...(r.email_message_ids || []).filter(messageId).map(v=>'m:'+v),...saved.map(m=>messageId(m.rfc_message_id)&&'m:'+m.rfc_message_id),...saved.map(m=>threadId(m.thread_id)&&'t:'+m.thread_id), gmailThread(r.thread_url) && 't:'+gmailThread(r.thread_url)].filter(Boolean);
    const seen = new Set(), stack = seeds.slice();
    while(stack.length) {
      const node = stack.pop(); if(seen.has(node)) continue; seen.add(node);
      if(!ownerByNode.has(node)) ownerByNode.set(node,new Set()); ownerByNode.get(node).add(r);
      for(const next of graph.get(node) || []) stack.push(next);
    }
  }
  let matched = 0, ambiguous = 0, invalid = 0;
  const evidence = new Map(),matches=[];
  for(const {m,nodes} of valid) {
    const owners = new Set(nodes.flatMap(n=>[...(ownerByNode.get(n)||[])]));
    if(owners.size > 1) { ambiguous++; continue; }
    if(!owners.size) continue;
    const row = [...owners][0];
    const at = receivedTime(m.date);
    if(m.direction !== 'in' || !Number.isFinite(at) || at > Date.parse(now) || typeof m.id !== 'string' || !m.id || m.id.length > 1000) {invalid++;continue;}
    if(row.status === 'closed') continue;
    matched++;
    matches.push({row,message:m});
    if(!evidence.has(row) || at > Date.parse(evidence.get(row).date)) evidence.set(row,m);
  }
  return {rows,evidence,matches,counts:{scanned_messages:sample.length,matched_messages:matched,ambiguous_messages:ambiguous,invalid_messages:invalid,unlinked_messages:sample.length-matched-ambiguous-invalid}};
}
function preview(store,messages,{now,limit=50}={}){
  const {rows,evidence,counts}=matchMessages(store,messages,{now});
  for(const [row,m] of evidence) {
    if(row.last_in && Date.parse(row.last_in) >= Date.parse(m.date)) continue;
    row.last_in = new Date(m.date).toISOString();
    // A subject is not a message body, and an old draft is not a reply to new mail.
    row.email_subject = typeof m.subject === 'string' ? m.subject.slice(0,1000) : '';
    row.ready_message = '';
    row.email_evidence = {source_kind:'connected_mailbox',message_id:m.id,source_url:row.thread_url || null,captured_at:now,message_date:row.last_in};
  }
  const result = conversations.list({...store,conversations:rows},{now,limit});
  for(const item of result.items) {
    const row = rows.find(r=>r.id === item.id);
    if(row?.email_evidence) { item.email_subject = row.email_subject; item.email_evidence = row.email_evidence; }
  }
  return {...result,email_preview:{...counts,matched_conversations:result.items.filter(r=>r.email_evidence).length,preview_only:true}};
}
function hasAnchors(store,now='9999-12-31T00:00:00Z') {
  return (store.conversations || []).some(r=>r.status !== 'closed' && r.channels?.includes('email') && (gmailThread(r.thread_url) || (r.email_message_ids || []).some(messageId)||savedReplies(r,now).some(m=>messageId(m.rfc_message_id)||threadId(m.thread_id))));
}
module.exports = {preview,hasAnchors,matchMessages,gmailThread};
