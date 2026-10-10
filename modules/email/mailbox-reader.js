'use strict';
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { google } = require('googleapis');
const FOLDERS = { inbox:'INBOX',sent:'\\Sent',drafts:'\\Drafts',starred:'\\Flagged',buyers:'WOS/Buyers',jv_deals:'WOS/JV Deals',lead_alerts:'WOS/Lead Alerts',title:'WOS/Title',templates:'WOS/Templates',bounced:'WOS/Bounced',billing:'WOS/Billing' };
const MAX_BYTES = 2 * 1024 * 1024;
function fail(code,status=503) { const e=new Error(code);e.code=code;e.status=status;throw e; }
function createMailboxReader({env=process.env,Client=ImapFlow,parse=simpleParser,googleImpl=google}={}) {
  let active=0;
  function provider() { if(env.GMAIL_USER&&env.GMAIL_APP_PASSWORD)return 'app_password';if(env.GMAIL_USER&&env.GMAIL_CLIENT_ID&&env.GMAIL_CLIENT_SECRET&&env.GMAIL_REFRESH_TOKEN)return 'google_login';fail('email_not_configured'); }
  async function imap(fn) {
    if(active>=3)fail('email_busy',429);active++;
    let client;
    try {client=new Client({host:'imap.gmail.com',port:993,secure:true,auth:{user:env.GMAIL_USER,pass:env.GMAIL_APP_PASSWORD.replace(/\s/g,'')},logger:false,emitLogs:false,connectionTimeout:15000,greetingTimeout:10000,socketTimeout:20000,tls:{rejectUnauthorized:true}});client.on('error',()=>{});await client.connect();return await fn(client);} finally {try{if(client)await client.logout();}catch{try{client.close();}catch{}}active--;}
  }
  function oauth() {const auth=new googleImpl.auth.OAuth2(env.GMAIL_CLIENT_ID,env.GMAIL_CLIENT_SECRET);auth.setCredentials({refresh_token:env.GMAIL_REFRESH_TOKEN});return googleImpl.gmail({version:'v1',auth});}
  async function boxPath(client,folder) {
    if(!Object.hasOwn(FOLDERS,folder))fail('email_folder_invalid',400);
    if(folder==='inbox')return 'INBOX';
    const boxes=await client.list();const wanted=FOLDERS[folder];
    const box=boxes.find(b=>b.path===wanted||b.specialUse===wanted);if(!box)fail('email_folder_unavailable',404);return box.path;
  }
  function id(box,uid,validity){return 'imap:'+Buffer.from(JSON.stringify({box,uid,validity:String(validity)})).toString('base64url');}
  function decode(value) {try {if(value.length>1000||!value.startsWith('imap:'))throw Error();const p=JSON.parse(Buffer.from(value.slice(5),'base64url').toString());if(typeof p.box!=='string'||p.box.length>200||!Number.isSafeInteger(p.uid)||p.uid<1||!/^\d+$/.test(p.validity))throw Error();return p;}catch{fail('email_message_invalid',400);}}
  function addresses(values){return (values||[]).map(a=>[a.name,a.address&&'<'+a.address+'>'].filter(Boolean).join(' ')).join(', ');}
  function metadata(m,box,validity){const from=m.envelope?.from||[];const own=from.some(a=>typeof a.address==='string'&&a.address.toLowerCase()===String(env.GMAIL_USER).toLowerCase());return {id:id(box,m.uid,validity),threadId:'',message_id:m.envelope?.messageId||'',in_reply_to:m.envelope?.inReplyTo||'',direction:own?'out':from.some(a=>a.address)?'in':'unknown',from:addresses(from),to:addresses(m.envelope?.to),subject:m.envelope?.subject||'(No subject)',date:m.envelope?.date?.toISOString()||'',read:m.flags?.has('\\Seen')||false,unread:!m.flags?.has('\\Seen'),snippet:'',source_kind:'connected_mailbox'};}
  async function test() {const mode=provider();if(mode==='app_password')return imap(async c=>{await c.list();return {ok:true,mode,status:'Connected (App Password)'};});await oauth().users.getProfile({userId:'me'});return {ok:true,mode,status:'Connected (Google login)'};}
  async function list(folder='inbox',limit=30) {
    if(!Object.hasOwn(FOLDERS,folder))fail('email_folder_invalid',400);limit=Math.min(50,Math.max(1,Number.isInteger(Number(limit))?Number(limit):30));const mode=provider();
    if(mode==='app_password')return imap(async c=>{const box=await boxPath(c,folder);const lock=await c.getMailboxLock(box,{readOnly:true});try{const messages=[];const total=c.mailbox.exists;if(total)for await(const m of c.fetch(Math.max(1,total-limit+1)+':'+total,{uid:true,envelope:true,flags:true,size:true}))messages.push(metadata(m,box,c.mailbox.uidValidity));return {ok:true,mode,status:'Connected (App Password)',messages:messages.reverse()};}finally{lock.release();}});
    const gmail=oauth();const labels={inbox:'INBOX',sent:'SENT',drafts:'DRAFT',starred:'STARRED'};let label=labels[folder];
    if(!label){const data=await gmail.users.labels.list({userId:'me'});label=(data.data.labels||[]).find(l=>l.name===FOLDERS[folder])?.id;if(!label)fail('email_folder_unavailable',404);}
    const rows=await gmail.users.messages.list({userId:'me',maxResults:limit,labelIds:[label]});const messages=[];
    for(const row of rows.data.messages||[]){const msg=(await gmail.users.messages.get({userId:'me',id:row.id,format:'metadata',metadataHeaders:['From','To','Subject','Date','Message-ID','In-Reply-To']})).data;const get=k=>(msg.payload?.headers||[]).find(h=>h.name.toLowerCase()===k.toLowerCase())?.value||'';messages.push({id:msg.id,threadId:msg.threadId,message_id:get('Message-ID'),in_reply_to:get('In-Reply-To'),direction:(msg.labelIds||[]).includes('SENT')?'out':get('From')?'in':'unknown',from:get('From'),to:get('To'),subject:get('Subject'),date:get('Date'),snippet:msg.snippet||'',read:!(msg.labelIds||[]).includes('UNREAD')});}
    return {ok:true,mode,status:'Connected (Google login)',messages};
  }
  async function message(value) {
    const mode=provider();
    if(mode==='app_password')return imap(async c=>{const p=decode(value);const allowed=await c.list();if(p.box!=='INBOX'&&!allowed.some(b=>b.path===p.box&&(Object.values(FOLDERS).includes(b.path)||Object.values(FOLDERS).includes(b.specialUse))))fail('email_message_invalid',400);const lock=await c.getMailboxLock(p.box,{readOnly:true});try{if(String(c.mailbox.uidValidity)!==p.validity)fail('email_message_stale',409);const header=await c.fetchOne(p.uid,{uid:true,envelope:true,size:true,flags:true},{uid:true});if(!header)fail('email_message_missing',404);if(header.size>MAX_BYTES)fail('email_message_too_large',413);const m=await c.fetchOne(p.uid,{source:true},{uid:true});if(!m?.source||m.source.length>MAX_BYTES)fail('email_message_too_large',413);const parsed=await parse(m.source,{skipImageLinks:true,skipTextToHtml:true,maxHtmlLengthToParse:MAX_BYTES});return {...metadata(header,p.box,p.validity),body:String(parsed.text||'(No readable text)').slice(0,MAX_BYTES),in_reply_to:parsed.inReplyTo||'',mode};}finally{lock.release();}});
    if(!/^[a-zA-Z0-9_-]{1,200}$/.test(value))fail('email_message_invalid',400);const m=(await oauth().users.messages.get({userId:'me',id:value,format:'raw'})).data;const raw=Buffer.from(m.raw||'','base64url');if(raw.length>MAX_BYTES)fail('email_message_too_large',413);const parsed=await parse(raw,{skipImageLinks:true,skipTextToHtml:true,maxHtmlLengthToParse:MAX_BYTES});return {id:m.id,threadId:m.threadId,from:parsed.from?.text||'',to:parsed.to?.text||'',subject:parsed.subject||'',date:parsed.date?.toISOString()||'',body:parsed.text||'(No readable text)',in_reply_to:parsed.inReplyTo||'',mode};
  }
  return {test,list,message};
}
function registerMailboxReads(app,{requireAdmin,reader=createMailboxReader()}) {
  const safeError=(res,e)=>res.status(e.status||503).json({ok:false,code:/^email_[a-z_]+$/.test(e.code||'')?e.code:'email_connection_failed',error:'Email unavailable. Check the connection in Settings.',messages:[]});
  app.get('/api/gmail/test',requireAdmin,async(req,res)=>{try{res.set('Cache-Control','no-store').json(await reader.test());}catch(e){safeError(res,e);}});
  for(const route of ['/api/gmail/inbox','/api/gmail/messages'])app.get(route,requireAdmin,async(req,res)=>{try{res.set('Cache-Control','no-store').json(await reader.list(route.endsWith('inbox')?'inbox':req.query.folder,req.query.limit));}catch(e){safeError(res,e);}});
  app.get('/api/gmail/message/:id',requireAdmin,async(req,res)=>{try{res.set('Cache-Control','no-store').json(await reader.message(req.params.id));}catch(e){safeError(res,e);}});
}
module.exports={createMailboxReader,registerMailboxReads};
