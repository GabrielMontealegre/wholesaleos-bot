'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const https=require('node:https');
const conversations=require('../modules/records/conversations');
const {preview,hasAnchors}=require('../modules/records/mailbox-conversation-preview');
const {registerConversationRoutes}=require('../modules/records/conversation-routes');
const {createMailboxReader}=require('../modules/email/mailbox-reader');
const now='2026-10-10T20:00:00Z';
const input={kind:'conversation',person:'SYNTHETIC CONTACT',role:'partner',refs:[],channels:['email'],status:'follow_up',captured_at:'2026-10-09T12:00:00Z',last_out:'2026-10-09T11:00:00Z',ready_message:'An old synthetic draft',what_they_said:'Reported words, not mail subject',email_message_ids:['<anchor@example.test>']};
const store=conversations.upsert({conversations:[],activities:[],buyers:[],leads:[]},input,{now,operatorId:'fixture-admin'}).store;
const mail={id:'imap:fixture',message_id:'<reply@example.test>',in_reply_to:'<anchor@example.test>',direction:'in',subject:'A synthetic subject <script>',date:'2026-10-10T12:00:00Z'};
function testProjection(){
  const before=JSON.stringify(store);
  let result=preview(store,[mail],{now});
  assert.equal(result.items[0].status,'hot');assert.equal(result.items[0].last_in,mail.date.replace('Z','.000Z'));
  assert.equal(result.items[0].what_they_said,input.what_they_said,'subject is never presented as message body');
  assert.equal(result.items[0].email_subject,mail.subject);assert.equal(result.items[0].ready_message,'');
  assert.equal(result.items[0].email_evidence.message_id,mail.id);assert.equal(result.items[0].email_evidence.captured_at,now);
  assert.equal(result.email_preview.matched_messages,1);assert.equal(JSON.stringify(store),before);
  const chained={...mail,id:'imap:second',message_id:'<second@example.test>',in_reply_to:mail.message_id,date:'2026-10-10T13:00:00Z'};
  result=preview(store,[chained,mail],{now});assert.equal(result.email_preview.matched_messages,2);assert.equal(result.items[0].last_in,'2026-10-10T13:00:00.000Z');
  assert.deepEqual(result,preview(store,[mail,chained],{now}),'header graph is order independent');
  const competing={...store,conversations:store.conversations.concat({...store.conversations[0],id:'other',person:'OTHER SYNTHETIC CONTACT',email_message_ids:[chained.message_id]})};
  result=preview(competing,[chained,mail],{now});assert.equal(result.email_preview.ambiguous_messages,2);assert.equal(result.email_preview.matched_messages,0);assert.ok(result.items.every(r=>!r.email_evidence));
  for(const wrong of [{...mail,in_reply_to:'<unknown@example.test>'},{...mail,in_reply_to:'',subject:input.person+' BUY-0001'},{...mail,in_reply_to:'',from:input.person},{...mail,in_reply_to:'anchor@example.test'}]) {
    result=preview(store,[wrong],{now});assert.equal(result.email_preview.matched_messages,0,'no identity/subject guesses');
  }
  for(const date of ['not a date','2026-10-11T00:00:00Z']) {result=preview(store,[{...mail,date}],{now});assert.equal(result.email_preview.invalid_messages,1);assert.equal(result.items[0].last_in,'');}
  for(const direction of ['out','unknown',undefined]){result=preview(store,[{...mail,direction}],{now});assert.equal(result.email_preview.matched_messages,0);assert.equal(result.items[0].status,'follow_up','self-sent/unknown mail never marks an incoming reply');}
  result=preview(store,[{...mail,date:'2026-10-08T12:00:00Z'}],{now});assert.notEqual(result.items[0].status,'hot','older than outgoing stays non-hot');
  const newerReport={...store,conversations:[{...store.conversations[0],last_in:'2026-10-10T14:00:00Z'}]};
  assert.equal(preview(newerReport,[mail],{now}).items[0].email_evidence,undefined,'older inbox evidence cannot replace newer report');
  assert.equal(preview({...store,conversations:[{...store.conversations[0],status:'closed'}]},[mail],{now}).total,0);
  assert.equal(preview(store,Array.from({length:40},(_,i)=>({...mail,id:'imap:'+i})),{now}).email_preview.scanned_messages,30);
  const threadStore={...store,conversations:[{...store.conversations[0],email_message_ids:[],thread_url:'https://mail.google.com/mail/u/0/#inbox/123456789abcdef0'}]};
  assert.equal(preview(threadStore,[{...mail,in_reply_to:'',threadId:'123456789abcdef0'}],{now}).email_preview.matched_messages,1);
  for(const url of ['https://mail.google.com@evil.test/#inbox/123456789abcdef0','https://evil.test/#inbox/123456789abcdef0','https://mail.google.com/mail/u/0/#inbox/FMfcgxOpaque'])assert.equal(hasAnchors({...threadStore,conversations:[{...threadStore.conversations[0],thread_url:url}]}),false);
  assert.equal(hasAnchors(store),true);assert.equal(hasAnchors({conversations:[]}),false);
  for(const email_message_ids of [['not an id'],['<a@example.test>\r\nInjected: value'],Array(11).fill('<a@example.test>')])assert.throws(()=>conversations.validate({...input,email_message_ids},now),/email_anchor_invalid/);
  assert.throws(()=>conversations.validate({...input,channels:['manual']},now),/email_anchor_invalid/);
  const updated=conversations.upsert(store,{...input,captured_at:now}, {now,operatorId:'fixture-admin'}).store;
  assert.deepEqual(updated.conversations[0].email_message_ids,input.email_message_ids);assert.equal(updated.conversations[0].history.length,2);
  const oldFetch=global.fetch,oldWrite=fs.writeFileSync,oldDate=Date.now,originals=[];
  global.fetch=fs.writeFileSync=Date.now=()=>{throw Error('side effect forbidden');};
  for(const mod of [http,https])for(const key of ['get','request']){originals.push([mod,key,mod[key]]);mod[key]=()=>{throw Error('network forbidden');};}
  try{preview(store,[mail],{now});hasAnchors(store);}finally{global.fetch=oldFetch;fs.writeFileSync=oldWrite;Date.now=oldDate;for(const [mod,key,fn]of originals)mod[key]=fn;}
}
async function testRoutes(){
  const handlers={};const app={get(path,...args){handlers[path]=args;}};let reads=0,writes=0,calls=0;
  const db={readDBStrict(){reads++;return store;},writeDB(){writes++;throw Error('write forbidden');}};
  const reader={async list(folder,limit){calls++;assert.equal(folder,'inbox');assert.equal(limit,30);return {ok:true,messages:[mail]};}};
  const admin=()=>{};registerConversationRoutes(app,{db,requireAdmin:admin,now:()=>now,mailboxReader:reader});
  const route=handlers['/api/dashboard/conversations/email-preview'];assert.equal(route[0],admin);
  function response(){return {headers:{},statusCode:200,set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
  const res=response();await route[1]({},res);assert.equal(res.statusCode,200);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.body.email_preview.matched_messages,1);assert.equal(calls,1);assert.equal(writes,0);
  const noAnchor={};registerConversationRoutes({get(p,...h){noAnchor[p]=h.at(-1);}},{db:{readDBStrict:()=>({conversations:[]})},requireAdmin:admin,now:()=>now,mailboxReader:{list(){throw Error('must not fetch');}}});
  const empty=response();await noAnchor['/api/dashboard/conversations/email-preview']({},empty);assert.equal(empty.statusCode,200);assert.equal(empty.body.email_preview.scanned_messages,0);assert.ok(empty.body.email_preview.status.includes('Nothing was fetched'));
  reader.list=async()=>{throw Error('private-secret@example.test');};const failed=response();await route[1]({},failed);assert.equal(failed.statusCode,503);assert.ok(!JSON.stringify(failed.body).includes('private-secret'));
  let release;reader.list=()=>new Promise(resolve=>{release=resolve;});const pending=route[1]({},response());const busy=response();await route[1]({},busy);assert.equal(busy.statusCode,429);release({ok:true,messages:[]});await pending;
  assert.equal(writes,0);assert.ok(reads>0);
}
async function testEnvelope(){
  let sender='other@example.test';
  class Client{constructor(){this.mailbox={exists:1,uidValidity:1};}on(){}async connect(){}async logout(){}async getMailboxLock(box,opts){assert.equal(opts.readOnly,true);return {release(){}};}async *fetch(range,fields){assert.equal(fields.envelope,true);yield {uid:1,envelope:{messageId:mail.message_id,inReplyTo:mail.in_reply_to,date:new Date(mail.date),from:[{address:sender}]}};}}
  const reader=createMailboxReader({env:{GMAIL_USER:'fixture@example.test',GMAIL_APP_PASSWORD:'synthetic'},Client});
  const inbox=await reader.list('inbox',30);assert.equal(inbox.messages[0].message_id,mail.message_id);assert.equal(inbox.messages[0].in_reply_to,mail.in_reply_to);assert.equal(inbox.messages[0].direction,'in');
  sender='FIXTURE@example.test';assert.equal((await reader.list('inbox',30)).messages[0].direction,'out');
}
(async()=>{testProjection();await testRoutes();await testEnvelope();console.log('Mailbox conversations: exact headers/thread only, transitive/ambiguous matching, stale/future/closed guards, capped read-only/admin routes, no-anchor quiet path, redaction, persistence and pure spies passed.');})().catch(e=>{console.error(e.stack);process.exitCode=1;});
