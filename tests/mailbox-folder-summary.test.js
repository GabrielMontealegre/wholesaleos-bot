'use strict';
const assert=require('node:assert/strict');
const {createMailboxReader,registerMailboxReads}=require('../modules/email/mailbox-reader');
const now=()=> '2026-10-25T23:00:00Z';
const env={GMAIL_USER:'operator@example.test',GMAIL_APP_PASSWORD:'synthetic-only'};
let calls=[],raw={path:'INBOX',uidValidity:7n,messages:200,unseen:12},hold=null,stage=null;
class Client {
  constructor(options){assert.equal(options.logger,false);assert.equal(options.emitLogs,false);assert.equal(options.tls.rejectUnauthorized,true);this.mailbox={uidValidity:7n,exists:999,unseen:99};}
  on(){} async connect(){calls.push('connect');if(stage==='connect')await hold;}
  close(){calls.push('close');} async logout(){calls.push('logout');}
  async list(){calls.push('folders');return [{path:'Localized sent',specialUse:'\\Sent'}];}
  async getMailboxLock(box,options){calls.push('lock:'+box);assert.deepEqual(options,{readOnly:true});if(stage==='lock')await hold;return {release(){calls.push('release');}};}
  async status(box,query){calls.push('status:'+box);assert.deepEqual(query,{messages:true,unseen:true,uidValidity:true});if(stage==='status')await hold;return raw;}
  async *fetch(){calls.push('metadata');}
}
const reader=createMailboxReader({env,Client,now});
const oauthEnv={GMAIL_USER:'operator@example.test',GMAIL_CLIENT_ID:'synthetic',GMAIL_CLIENT_SECRET:'synthetic',GMAIL_REFRESH_TOKEN:'synthetic'};
let label={id:'INBOX',messagesTotal:15,messagesUnread:2},failure=null,googleCalls=[],hangGoogle=false;
function requestOptions(options){assert.equal(options.timeout,12000);assert.equal(options.retry,false);assert.equal(options.signal.aborted,false);}
const googleImpl={auth:{OAuth2:class{constructor(){this.transporter={request:async()=>{throw Error('Unexpected transport');}};}setCredentials(){}}},gmail(){return {users:{labels:{
  async list(query,options){googleCalls.push('labels');requestOptions(options);return {data:{labels:[{name:'WOS/Buyers',id:'Label_7'}]}};},
  async get(query,options){googleCalls.push(query.id);requestOptions(options);if(failure)throw failure;if(hangGoogle)await new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('synthetic abort')),{once:true}));return {data:label};}
}}};}};
async function main(){
  let result=await reader.folderSummary('inbox');
  assert.equal(result.summary.total_messages,200);assert.equal(result.summary.unread_messages,12);assert.equal(result.summary.captured_at,now());
  assert.deepEqual(calls,['connect','lock:INBOX','status:INBOX','release','close']);
  assert.ok(!JSON.stringify(result).includes(env.GMAIL_APP_PASSWORD));
  raw={path:'Localized sent',uidValidity:7n,messages:0,unseen:0};calls=[];
  assert.equal((await reader.folderSummary('sent')).summary.total_messages,0);
  assert.deepEqual(calls,['connect','folders','lock:Localized sent','status:Localized sent','release','close']);
  for(const patch of [{path:'Other'},{uidValidity:8n},{messages:undefined},{messages:'200'},{unseen:201}]){
    raw={path:'INBOX',uidValidity:7n,messages:200,unseen:12,...patch};
    await assert.rejects(reader.folderSummary('inbox'),error=>error.code==='email_folder_summary_unavailable');
  }
  calls=[];for(const folder of ['unknown','INBOX','../inbox',{},['inbox']])await assert.rejects(reader.folderSummary(folder),error=>error.status===400);
  assert.deepEqual(calls,[]);
  const oauth=createMailboxReader({env:oauthEnv,googleImpl,now});
  assert.equal((await oauth.folderSummary('inbox')).summary.total_messages,15);assert.deepEqual(googleCalls,['INBOX']);
  label={id:'Label_7',messagesTotal:3,messagesUnread:null};googleCalls=[];
  assert.equal((await oauth.folderSummary('buyers')).summary.unread_messages,null);assert.deepEqual(googleCalls,['labels','Label_7']);
  label={id:'Wrong',messagesTotal:1};await assert.rejects(oauth.folderSummary('inbox'),/summary_unavailable/);
  for(const status of [401,403,429,500]){failure={response:{status},message:'never return synthetic secret'};googleCalls=[];
    await assert.rejects(oauth.folderSummary('inbox'),error=>error.status===(status===429?429:503));assert.deepEqual(googleCalls,['INBOX']);}
  failure=null;
  // Accelerate only the summary's fixed deadline; no provider or real timers
  // are retried. Resolving a late stage must not start the next command.
  const original=setTimeout;let finish;
  global.setTimeout=(fn,ms,...args)=>original(fn,ms===12000?15:ms,...args);
  try {
    for(const pendingStage of ['connect','lock','status']){
      stage=pendingStage;calls=[];hold=new Promise(resolve=>{finish=resolve;});
      const pending=reader.folderSummary('inbox');
      await assert.rejects(reader.folderSummary('inbox'),error=>error.status===429);
      await assert.rejects(pending,error=>error.status===504);
      const commands=calls.filter(x=>x.startsWith('status:')).length;finish();await new Promise(resolve=>original(resolve,1));
      assert.equal(calls.filter(x=>x.startsWith('status:')).length,commands);assert.ok(calls.includes('close'));
    }
    hangGoogle=true;googleCalls=[];await assert.rejects(oauth.folderSummary('inbox'),error=>error.status===504);assert.deepEqual(googleCalls,['INBOX']);hangGoogle=false;
  } finally {global.setTimeout=original;stage=null;hold=null;}
  raw={path:'INBOX',uidValidity:7n,messages:1,unseen:0};assert.equal((await reader.folderSummary('inbox')).summary.total_messages,1,'Timeout releases the summary slot');
  label={id:'INBOX',messagesTotal:1,messagesUnread:0};assert.equal((await oauth.folderSummary('inbox')).summary.total_messages,1);
  const broken=createMailboxReader({env,now,Client:class{constructor(){throw Error('synthetic constructor failure');}}});
  for(let i=0;i<3;i++)await assert.rejects(broken.folderSummary('inbox'),error=>error.status===503);
  // Two interactive connections reserve the remaining IMAP slot for a third
  // explicit read, not an optional background count.
  stage='connect';hold=new Promise(resolve=>{finish=resolve;});
  const one=reader.list('inbox'),two=reader.list('inbox');
  await assert.rejects(reader.folderSummary('inbox'),error=>error.status===429);stage=null;finish();await Promise.all([one,two]);
  const routes=new Map(),guard=()=>{};
  registerMailboxReads({get(path,...handlers){assert.equal(handlers[0],guard);routes.set(path,handlers.at(-1));}},{reader,requireAdmin:guard});
  const response=()=>({statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}});
  const summaryRoute=routes.get('/api/gmail/folder-summary');
  let res=response();await summaryRoute({query:{folder:'inbox'}},res);assert.equal(res.statusCode,200);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.body.summary.total_messages,1);
  for(const query of [{},{folder:['inbox']},{folder:'inbox',path:'Other'},{folder:'unknown'}]){res=response();await summaryRoute({query},res);assert.equal(res.statusCode,400);assert.equal(res.headers['Cache-Control'],'no-store');}
  const oldRoutes=new Map();registerMailboxReads({get(path,...handlers){oldRoutes.set(path,handlers.at(-1));}},{reader:{list:async()=>({ok:true,messages:[]})},requireAdmin:guard});
  res=response();await oldRoutes.get('/api/gmail/messages')({query:{folder:'inbox'}},res);assert.equal(res.body.folder_summary_available,false);
  res=response();await oldRoutes.get('/api/gmail/folder-summary')({query:{folder:'inbox'}},res);assert.equal(res.statusCode,503);assert.equal(res.headers['Cache-Control'],'no-store');
  const express=require('express'),app=express();let admitted=0;
  registerMailboxReads(app,{reader:{folderSummary:async()=>{admitted++;return {ok:true,summary:{}};}},requireAdmin:(req,res,next)=>req.headers['x-fixture-role']==='admin'?next():res.status(req.headers['x-fixture-role']?403:401).json({ok:false})});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
    const url='http://127.0.0.1:'+server.address().port+'/api/gmail/folder-summary?folder=inbox';
    assert.equal((await fetch(url,{headers:{'x-user-id':'admin'}})).status,401);
    assert.equal((await fetch(url,{headers:{'x-fixture-role':'user'}})).status,403);assert.equal(admitted,0);
    const accepted=await fetch(url,{headers:{'x-fixture-role':'admin'}});assert.equal(accepted.status,200);assert.equal(accepted.headers.get('cache-control'),'no-store');assert.equal(admitted,1);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  assert.ok(calls.every(call=>!['send','append','flagsAdd','delete','body'].includes(call)));
  console.log('mailbox-folder-summary: explicit STATUS/label reads, scope/UID/count negatives, deadline/late completion, reserved concurrency, no retries, guarded no-store route and legacy unknown support passed; no release claimed');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
