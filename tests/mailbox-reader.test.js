'use strict';
const assert=require('node:assert/strict');
const {createMailboxReader,registerMailboxReads}=require('../modules/email/mailbox-reader');
const events=[];let validity=7;let size=70;let secret='fixture-password-not-real';
class MockClient {
  constructor(options){assert.equal(options.host,'imap.gmail.com');assert.equal(options.secure,true);assert.equal(options.tls.rejectUnauthorized,true);assert.equal(options.logger,false);assert.equal(options.emitLogs,false);this.mailbox={exists:1,uidValidity:validity};}
  on(){}async connect(){events.push('connect');}async logout(){events.push('logout');}close(){}
  async list(){return [{path:'Localized sent',specialUse:'\\Sent'},{path:'Localized drafts',specialUse:'\\Drafts'}];}
  async getMailboxLock(box,opts){assert.equal(opts.readOnly,true);events.push(box);return {release(){events.push('release');}};}
  async *fetch(range,opts){assert.equal(opts.uid,true);assert.equal(opts.envelope,true);yield {uid:4,size,flags:new Set(),envelope:{subject:'Fixture reply <img src=x onerror=alert(1)>',from:[{name:'Fixture',address:'fixture@example.test'}],date:new Date('2026-10-08T12:00:00Z')}};}
  async fetchOne(uid,fields,opts){assert.equal(uid,4);assert.equal(opts.uid,true);if(fields.source){events.push('source');return {source:Buffer.from('From: fixture@example.test\r\nSubject: Fixture reply\r\nIn-Reply-To: <fixture-old@example.test>\r\nContent-Type: text/plain\r\n\r\nA real-shaped fixture reply.')}}return {uid:4,size,flags:new Set(),envelope:{subject:'Fixture reply',from:[],date:new Date('2026-10-08')}};}
}
async function main(){
 const env={GMAIL_USER:'fixture@example.test',GMAIL_APP_PASSWORD:secret,GMAIL_CLIENT_ID:'unused',GMAIL_CLIENT_SECRET:'unused',GMAIL_REFRESH_TOKEN:'unused'};
 const reader=createMailboxReader({env,Client:MockClient,googleImpl:{auth:{OAuth2(){throw Error('must not try expired OAuth when App Password exists');}}}});
 assert.equal((await reader.test()).status,'Connected (App Password)');
 const inbox=await reader.list('inbox');assert.equal(inbox.messages.length,1);assert.equal(inbox.messages[0].unread,true);
 const sent=await reader.list('sent');assert.ok(events.includes('Localized sent'));assert.equal(sent.messages.length,1);
 const message=await reader.message(inbox.messages[0].id);assert.equal(message.body,'A real-shaped fixture reply.');assert.equal(message.in_reply_to,'<fixture-old@example.test>');
 assert.ok(!JSON.stringify([inbox,sent,message]).includes(secret));
 await assert.rejects(reader.list('unknown'),/folder_invalid/);await assert.rejects(reader.list('buyers'),/folder_unavailable/);
 await assert.rejects(reader.message('imap:not-json'),/message_invalid/);
 validity=8;await assert.rejects(reader.message(inbox.messages[0].id),/message_stale/);validity=7;
 size=3*1024*1024;const count=events.filter(x=>x==='source').length;await assert.rejects(reader.message(inbox.messages[0].id),/too_large/);assert.equal(events.filter(x=>x==='source').length,count);
 await assert.rejects(createMailboxReader({env:{}}).test(),/not_configured/);
 const broken=createMailboxReader({env,Client:class{constructor(){throw Error('constructor fixture failure');}}});for(let i=0;i<4;i++)await assert.rejects(broken.test(),/constructor fixture failure/);
 const express=require('express');const app=express();registerMailboxReads(app,{reader,requireAdmin:(req,res,next)=>req.headers['x-fixture-admin']==='yes'?next():res.status(401).json({code:'admin_required'})});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{const base='http://127.0.0.1:'+server.address().port;assert.equal((await fetch(base+'/api/gmail/test')).status,401);const res=await fetch(base+'/api/gmail/test',{headers:{'x-fixture-admin':'yes'}});assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');const failReader={test:async()=>{throw Error(secret);}};const fake={get(path,...args){if(path.endsWith('/test'))this.test=args.at(-1);}};registerMailboxReads(fake,{reader:failReader,requireAdmin(){}});let output;await fake.test({}, {status(){return this;},json(value){output=value;}});assert.ok(!JSON.stringify(output).includes(secret));assert.equal(output.code,'email_connection_failed');}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 assert.ok(events.every(x=>!['send','append','flagsAdd','delete','copy'].includes(x)));
 console.log('Mailbox: App Password preference, localized folders, read-only locks, UID validity, MIME reply, size bounds, admin/no-store and secret-safe errors passed.');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
