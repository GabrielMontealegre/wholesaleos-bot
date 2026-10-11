'use strict';
function messageId(v){return typeof v==='string'&&v.length<=254&&/^<[^<>\s@]+@[^<>\s@]+>$/.test(v)?v:'';}
function threadId(v){return typeof v==='string'&&/^[a-f0-9]{8,32}$/.test(v)?v:'';}
function receivedTime(v){
  if(typeof v!=='string')return NaN;const t=Date.parse(v);if(!Number.isFinite(t))return NaN;
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v))return new Date(t).toISOString().slice(0,10)===v.slice(0,10)?t:NaN;
  return /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(v)&&/\d{2}:\d{2}/.test(v)?t:NaN;
}
function savedReplies(row,now){
  return (Array.isArray(row.mailbox_replies)?row.mailbox_replies:[]).filter(m=>m.source_kind==='connected_mailbox'&&m.direction==='in'&&typeof m.linked_by==='string'&&m.linked_by&&typeof m.key==='string'&&typeof m.message_id==='string'&&m.message_id&&Number.isFinite(receivedTime(m.date))&&receivedTime(m.date)<=Date.parse(now)&&Number.isFinite(receivedTime(m.captured_at))&&receivedTime(m.captured_at)<=Date.parse(now));
}
module.exports={messageId,threadId,savedReplies,receivedTime};
