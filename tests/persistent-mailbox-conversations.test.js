'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),https=require('node:https');
const conversations=require('../modules/records/conversations');
const {persist,link}=require('../modules/records/mailbox-conversation-sync');
const {preview}=require('../modules/records/mailbox-conversation-preview');
const {registerConversationRoutes}=require('../modules/records/conversation-routes');
const {buildOperatorBrief}=require('../modules/agents/operator-brief');
const now='2026-10-10T20:00:00Z',context={now,operatorId:'fixture-admin'};
const source={users:[],leads:[{id:'preserve',normalized_address:'PRIVATE FIXTURE ADDRESS',contact_workflow_complete:false}],buyers:[{record_ref:'BUY-0001'}],reviewed_deals:[{id:'keep',value:'unchanged'}],activities:[]};
const mail={id:'imap:fixture',message_id:'<fixture-reply@example.test>',in_reply_to:'<first@example.test>',date:'2026-10-10T18:00:00Z',direction:'in',subject:'PRIVATE SYNTHETIC SUBJECT',body:'PRIVATE BODY NEVER STORED',from:'PRIVATE SENDER NOT STORED'};
const report={kind:'conversation',person:'PRIVATE SYNTHETIC PERSON',role:'partner',refs:['BUY-0001'],channels:['email'],status:'follow_up',captured_at:'2026-10-09T12:00:00Z',last_out:'2026-10-09T10:00:00Z',ready_message:'Old draft',email_message_ids:['<first@example.test>']};
let store=conversations.upsert(source,report,context).store;
function core(){
  const frozen=JSON.stringify(store),result=persist(store,[mail],context);assert.equal(JSON.stringify(store),frozen);
  assert.equal(result.summary.saved_messages,1);assert.equal(result.store.leads,store.leads);assert.equal(result.store.buyers,store.buyers);assert.equal(result.store.reviewed_deals,store.reviewed_deals);
  const entry=result.store.conversations[0].mailbox_replies[0];assert.equal(entry.linked_by,context.operatorId);assert.equal(entry.source_kind,'connected_mailbox');assert.equal(entry.message_id,mail.id);assert.equal(entry.evidence_text,'Email subject: '+mail.subject);assert.equal(entry.captured_at,now);assert.ok(!JSON.stringify(entry).includes(mail.body));assert.ok(!JSON.stringify(entry).includes(mail.from));
  const reopened=JSON.parse(JSON.stringify(result.store));const view=conversations.list(reopened,{now});assert.equal(view.items[0].status,'hot');assert.equal(view.items[0].ready_message,'');assert.equal(view.items[0].email_subject,mail.subject);assert.equal(view.items[0].email_evidence.persisted,true);
  const again=persist(result.store,[mail],context);assert.equal(again.store,result.store);assert.equal(again.summary.saved_messages,0);assert.equal(again.summary.duplicate_messages,1);assert.equal(again.store.activities.length,result.store.activities.length,'duplicates do not add activity');
  assert.throws(()=>persist(result.store,[{...mail,subject:'Changed under same identity'}],context),/identity_conflict/);
  const later={...mail,id:'imap:later',message_id:'<later@example.test>',in_reply_to:mail.message_id,date:'2026-10-10T19:00:00Z'};
  const laterResult=persist(reopened,[later],context);assert.equal(laterResult.summary.saved_messages,1,'saved header IDs seed later exact replies');assert.equal(laterResult.store.conversations[0].mailbox_replies.length,2);
  const imported=conversations.upsert(laterResult.store,{...report,captured_at:now},context).store;assert.equal(imported.conversations[0].mailbox_replies.length,2,'later assistant reports preserve receipt history');
  assert.equal(conversations.list({...imported,conversations:imported.conversations.map(r=>({...r,status:'closed'}))},{now}).total,0);
  const older=persist(store,[{...mail,date:'2026-10-08T10:00:00Z'}],context);assert.notEqual(conversations.list(older.store,{now}).items[0].status,'hot');
  for(const extra of [{direction:'out'},{direction:'unknown'},{date:'2026-10-11T00:00:00Z'},{date:'10/06/2026'},{date:'2026-02-30T12:00:00Z'},{in_reply_to:'<someone-else@example.test>',message_id:'<unrelated@example.test>'}])assert.equal(persist(store,[{...mail,...extra}],context).store,store);
  for(const forged of [{source_kind:'paid_api'},{linked_by:''},{captured_at:'2026-10-11T12:00:00Z'}])assert.equal(conversations.list({...store,conversations:store.conversations.map(r=>({...r,mailbox_replies:[{...entry,...forged}]}))},{now}).items[0].email_evidence,undefined,'forged/wrong-origin stored receipts do not create a waiting-on-you fact');
  const ambiguous={...store,conversations:store.conversations.concat({...store.conversations[0],id:'other',person:'OTHER',refs:[]})};assert.equal(persist(ambiguous,[mail],context).summary.ambiguous_messages,1);assert.equal(persist(ambiguous,[mail],context).store,ambiguous);
  const linked=link(source,{message_id:mail.id,person:report.person,role:report.role,refs:report.refs},mail,context);assert.equal(linked.summary.saved_messages,1);assert.equal(linked.store.conversations.length,1);assert.equal(linked.store.leads,source.leads);assert.equal(linked.store.conversations[0].source_kind,'operator_input','operator linkage is never mislabeled as an assistant import');
  assert.equal(linked.store.conversations[0].thread_url,'','never invent a browser account-0 permalink');
  assert.throws(()=>link(source,{message_id:mail.id,person:'P',role:'partner'},{...mail,message_id:'',threadId:'123456789abcdef0'},context),/anchor_missing/,'a first link requires an exact source Message-ID, not a guessed browser URL');
  assert.equal(link(linked.store,{message_id:mail.id,person:report.person,role:report.role,refs:report.refs},mail,context).store,linked.store);
  for(const input of [{message_id:'wrong',person:'P',role:'partner'},{message_id:mail.id,person:'P',role:'partner',auto_confirm:true},{message_id:mail.id,person:'P',role:'partner',refs:['BUY-9999']}])assert.throws(()=>link(source,input,mail,context));
  assert.throws(()=>link(linked.store,{message_id:mail.id,person:'Different Person',role:'partner',refs:[]},mail,context),/ambiguous/);
  assert.throws(()=>link({...linked.store,conversations:linked.store.conversations.map(r=>({...r,status:'closed'}))},{message_id:mail.id,person:report.person,role:report.role,refs:report.refs},mail,context),/closed/);
  assert.throws(()=>link(source,{message_id:mail.id,person:'P',role:'partner'}, {...mail,direction:'out'},context),/not_incoming/);
  const brief=JSON.stringify(buildOperatorBrief(result.store,{now}));for(const privateText of [mail.subject,mail.body,mail.from,report.person,source.leads[0].normalized_address])assert.ok(!brief.includes(privateText),'brief stays aggregate/private-safe');
  const oldFetch=global.fetch,oldClock=Date.now,oldWrite=fs.writeFileSync,originals=[];
  global.fetch=Date.now=fs.writeFileSync=()=>{throw Error('side effect forbidden');};for(const mod of [http,https])for(const k of ['get','request']){originals.push([mod,k,mod[k]]);mod[k]=()=>{throw Error('network forbidden');};}
  try{persist(store,[mail],context);link(source,{message_id:mail.id,person:'P',role:'partner'},mail,context);conversations.list(reopened,{now});}finally{global.fetch=oldFetch;Date.now=oldClock;fs.writeFileSync=oldWrite;for(const[m,k,v]of originals)m[k]=v;}
  assert.equal(JSON.stringify(store),frozen);
}
async function routes(){
  const handlers={};let current=store,writes=0,network=0;
  const app={get(p,...h){handlers['GET '+p]=h;},post(p,...h){handlers['POST '+p]=h;}};
  const reader={async list(folder,limit){network++;assert.equal(folder,'inbox');assert.equal(limit,30);current={...current,concurrent_sentinel:'must survive'};return {ok:true,messages:[mail]};},async message(id){network++;assert.equal(id,mail.id);return mail;}};
  const admin=(req,res,next)=>req.currentUser?.role==='admin'?next():res.status(403).json({code:'admin_required'});
  registerConversationRoutes(app,{db:{readDBStrict:()=>current,writeDB:value=>{writes++;current=value;}},requireAdmin:admin,now:()=>now,mailboxReader:reader});
  const response=()=>({statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}});
  const sync=handlers['POST /api/dashboard/conversations/email-sync'];const linkRoute=handlers['POST /api/dashboard/conversations/email-link'];assert.equal(sync[0],admin);assert.equal(linkRoute[0],admin);
  let res=response(),ran=false;sync[0]({},res,()=>{ran=true;});assert.equal(res.statusCode,403);assert.equal(ran,false);assert.equal(network,0);
  const req={body:{},currentUser:{id:'fixture-admin',role:'admin'}};res=response();await sync[1](req,res);assert.equal(res.statusCode,200);assert.equal(res.body.saved_messages,1);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(current.concurrent_sentinel,'must survive');assert.equal(writes,1);
  res=response();await sync[1](req,res);assert.equal(res.body.saved_messages,0);assert.equal(writes,1);
  res=response();await sync[1]({...req,body:{messages:[mail]}},res);assert.equal(res.statusCode,400);assert.equal(writes,1,'client cannot submit mail evidence');
  const before=network;current={...source,conversations:[]};res=response();await sync[1](req,res);assert.equal(network,before);assert.equal(writes,1,'no anchors is quiet');
  res=response();await linkRoute[1]({...req,body:{message_id:mail.id,person:'EXPLICIT FIXTURE PERSON',role:'partner',refs:[]}},res);assert.equal(res.body.saved_messages,1);assert.equal(writes,2);
  reader.message=async()=>{throw Error('private-token-and-person');};res=response();await linkRoute[1]({...req,body:{message_id:mail.id,person:'P',role:'partner'}},res);assert.equal(res.statusCode,503);assert.ok(!JSON.stringify(res.body).includes('private-token'));assert.equal(writes,2);
  let release;reader.list=()=>new Promise(r=>{release=r;});const pending=sync[1](req,response());res=response();await sync[1](req,res);assert.equal(res.statusCode,429);release({ok:true,messages:[]});await pending;
  current=store;reader.list=async()=>{current={...current,conversations:current.conversations.map(r=>({...r,status:'closed'}))};return {ok:true,messages:[mail]};};res=response();await sync[1](req,res);assert.equal(res.body.saved_messages,0);assert.equal(writes,2,'a concurrent closure is not overwritten or resurrected');
}
async function readerProof(){
  const {createMailboxReader}=require('../modules/email/mailbox-reader');
  let sender='other@example.test';
  const googleImpl={auth:{OAuth2:class{setCredentials(){}}},gmail:()=>({users:{messages:{get:async()=>({data:{id:'fixture-id',threadId:'123456789abcdef0',raw:Buffer.from('From: '+sender+'\r\nDate: Sat, 10 Oct 2026 18:00:00 +0000\r\nMessage-ID: <fixture-reader@example.test>\r\nSubject: Synthetic reader proof\r\n\r\nSynthetic body').toString('base64url')}})}}})};
  const reader=createMailboxReader({env:{GMAIL_USER:'owner@example.test',GMAIL_CLIENT_ID:'fixture',GMAIL_CLIENT_SECRET:'fixture',GMAIL_REFRESH_TOKEN:'fixture'},googleImpl});
  const m=await reader.message('fixture-id');assert.equal(m.message_id,'<fixture-reader@example.test>');assert.equal(m.direction,'in');assert.equal(m.date,'2026-10-10T18:00:00.000Z');
  sender='owner@example.test';assert.equal((await reader.message('fixture-id')).direction,'out','OAuth raw self-sent mail cannot be linked as an incoming reply');
}
(async()=>{core();await routes();await readerProof();console.log('Persistent mailbox links: explicit identity, exact reply graph, append-only/idempotent receipts, reload/import survival, closed/stale/self/future/forged rejection, fresh-store commit, guarded admin routes, no send/fact mutation and privacy/purity passed.');})().catch(e=>{console.error(e.stack);process.exitCode=1;});
