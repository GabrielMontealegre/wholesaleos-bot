'use strict';
const assert=require('node:assert/strict');
const {createMailboxReader,registerMailboxReads}=require('../modules/email/mailbox-reader');
async function run(){
 let connections=0,locks=0,sources=0,validity=7,size=100;const imapId=uid=>'imap:'+Buffer.from(JSON.stringify({box:'INBOX',uid,validity:'7'})).toString('base64url');
 class Client{
  constructor(options){assert.equal(options.logger,false);assert.equal(options.tls.rejectUnauthorized,true);this.mailbox={uidValidity:validity};}
  on(){}async connect(){connections++;}async logout(){}close(){}async list(){return [];}
  async getMailboxLock(box,options){assert.equal(box,'INBOX');assert.equal(options.readOnly,true);locks++;return {release(){}};}
  async fetchOne(uid,fields,options){assert.equal(options.uid,true);if(fields.source){sources++;return {source:Buffer.from('From: reader@example.test\r\nMessage-ID: <m'+uid+'@example.test>\r\n\r\nFixture body '+uid)};}return {uid,size,envelope:{from:[{address:'reader@example.test'}],date:new Date('2026-10-10T12:00:00Z')},flags:new Set()};}
 }
 const reader=createMailboxReader({env:{GMAIL_USER:'operator@example.test',GMAIL_APP_PASSWORD:'fixture-not-real'},Client});
 const output=await reader.messages([imapId(1),imapId(2)]);assert.equal(output.length,2);assert.equal(connections,1);assert.equal(locks,1);assert.equal(sources,2);assert.ok(output.every(m=>m.unread));
 await assert.rejects(reader.messages(Array(31).fill(imapId(1))),/thread_invalid/);await assert.rejects(reader.messages([imapId(1),imapId(1)]),/thread_invalid/);
 validity=8;const before=sources;await assert.rejects(reader.messages([imapId(1)]),/message_stale/);assert.equal(sources,before);validity=7;
 size=3*1024*1024;await assert.rejects(reader.messages([imapId(1)]),/message_too_large/);assert.equal(sources,before);size=100;
 const large=createMailboxReader({env:{GMAIL_USER:'operator@example.test',GMAIL_APP_PASSWORD:'fixture-not-real'},Client,parse:async()=>({text:'x'.repeat(2*1024*1024)})});
 await assert.rejects(large.messages([1,2,3,4,5].map(imapId)),/thread_too_large/);
 const express=require('express'),app=express();let reads=0,writes=0;
 registerMailboxReads(app,{requireAdmin:(req,res,next)=>req.headers['x-fixture-admin']==='yes'?next():res.status(401).json({code:'admin_required'}),reader:{messages:async ids=>{reads++;return output;}},db:{readDBStrict:()=>({}),writeDB:()=>{writes++;}},now:()=> '2026-10-12T12:00:00Z'});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{const base='http://127.0.0.1:'+server.address().port;assert.equal((await fetch(base+'/api/gmail/thread?ids='+encodeURIComponent(JSON.stringify([imapId(1)])))).status,401);assert.equal(reads,0);
  const result=await fetch(base+'/api/gmail/thread?ids='+encodeURIComponent(JSON.stringify([imapId(1)])),{headers:{'x-fixture-admin':'yes'}});assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(reads,1);
  for(const query of ['x','[]','[1]',JSON.stringify([imapId(1),imapId(1)])])assert.equal((await fetch(base+'/api/gmail/thread?ids='+encodeURIComponent(query),{headers:{'x-fixture-admin':'yes'}})).status,400);
  assert.equal(reads,1);assert.equal(writes,0);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 console.log('Inbox thread read: one read-only IMAP connection/lock, sequential bounded sources, UID-stale refusal,30 cap/dedupe,admin401/input400,no-store,zero writes passed.');
}
if(require.main===module)run().catch(error=>{console.error(error.stack);process.exitCode=1;});module.exports={run};
