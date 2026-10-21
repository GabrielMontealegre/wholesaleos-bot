'use strict';
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { google } = require('googleapis');
const FOLDERS = { inbox:'INBOX',sent:'\\Sent',drafts:'\\Drafts',starred:'\\Flagged',buyers:'WOS/Buyers',jv_deals:'WOS/JV Deals',lead_alerts:'WOS/Lead Alerts',title:'WOS/Title',templates:'WOS/Templates',bounced:'WOS/Bounced',billing:'WOS/Billing' };
const MAX_BYTES = 2 * 1024 * 1024;
function senderName(values) {
  return Array.isArray(values) ? values.map(value => typeof value?.name === 'string' &&
    value.name.length <= 200 && !/[\x00-\x1f]/.test(value.name) ? value.name.trim() : '').filter(Boolean).join(', ') : '';
}
function participantFields({ from = [], to = [], cc = [] } = {}) {
  const values = list => Array.isArray(list) ? list.flatMap(item => typeof item?.address === 'string' && item.address ? [item.address] : []) : [];
  return { from_addresses: values(from), to_addresses: values(to), cc_addresses: values(cc) };
}
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
  function metadata(m,box,validity){const from=m.envelope?.from||[];const own=from.some(a=>typeof a.address==='string'&&a.address.toLowerCase()===String(env.GMAIL_USER).toLowerCase());return {id:id(box,m.uid,validity),threadId:'',message_id:m.envelope?.messageId||'',in_reply_to:m.envelope?.inReplyTo||'',direction:own?'out':from.some(a=>a.address)?'in':'unknown',from:addresses(from),sender_name:senderName(from),to:addresses(m.envelope?.to),cc:addresses(m.envelope?.cc),...participantFields(m.envelope),subject:m.envelope?.subject||'(No subject)',date:m.envelope?.date?.toISOString()||'',read:m.flags?.has('\\Seen')||false,unread:!m.flags?.has('\\Seen'),snippet:'',source_kind:'connected_mailbox'};}
  async function test() {const mode=provider();if(mode==='app_password')return imap(async c=>{await c.list();return {ok:true,mode,status:'Connected (App Password)'};});await oauth().users.getProfile({userId:'me'});return {ok:true,mode,status:'Connected (Google login)'};}
  async function list(folder='inbox',limit=30) {
    if(!Object.hasOwn(FOLDERS,folder))fail('email_folder_invalid',400);limit=Math.min(50,Math.max(1,Number.isInteger(Number(limit))?Number(limit):30));const mode=provider();
    if(mode==='app_password')return imap(async c=>{const box=await boxPath(c,folder);const lock=await c.getMailboxLock(box,{readOnly:true});try{const messages=[];const total=c.mailbox.exists;if(total)for await(const m of c.fetch(Math.max(1,total-limit+1)+':'+total,{uid:true,envelope:true,flags:true,size:true}))messages.push(metadata(m,box,c.mailbox.uidValidity));return {ok:true,mode,status:'Connected (App Password)',messages:messages.reverse()};}finally{lock.release();}});
    const gmail=oauth();const labels={inbox:'INBOX',sent:'SENT',drafts:'DRAFT',starred:'STARRED'};let label=labels[folder];
    if(!label){const data=await gmail.users.labels.list({userId:'me'});label=(data.data.labels||[]).find(l=>l.name===FOLDERS[folder])?.id;if(!label)fail('email_folder_unavailable',404);}
    const rows=await gmail.users.messages.list({userId:'me',maxResults:limit,labelIds:[label]});const messages=[];
    for(const row of rows.data.messages||[]){const msg=(await gmail.users.messages.get({userId:'me',id:row.id,format:'metadata',metadataHeaders:['From','To','Cc','Subject','Date','Message-ID','In-Reply-To']})).data;const get=k=>(msg.payload?.headers||[]).find(h=>h.name.toLowerCase()===k.toLowerCase())?.value||'';messages.push({source_kind:'connected_mailbox',id:msg.id,threadId:msg.threadId,message_id:get('Message-ID'),in_reply_to:get('In-Reply-To'),direction:(msg.labelIds||[]).includes('SENT')?'out':get('From')?'in':'unknown',from:get('From'),to:get('To'),cc:get('Cc'),subject:get('Subject'),date:get('Date'),snippet:msg.snippet||'',read:!(msg.labelIds||[]).includes('UNREAD')});}
    for(const message of messages){
      Object.assign(message, participantFields());
      if([message.from,message.to,message.cc].every(value=>typeof value==='string'&&value.length<=4096&&!/[\r\n]/.test(value))){
        try {
          const headers=await parse(Buffer.from('From: '+message.from+'\r\nTo: '+message.to+'\r\nCc: '+message.cc+'\r\n\r\n'),{skipImageLinks:true,skipTextToHtml:true});
          message.sender_name=senderName(headers?.from?.value);
          Object.assign(message, participantFields({from:headers?.from?.value,to:headers?.to?.value,cc:headers?.cc?.value}));
        } catch (_) { message.sender_name=''; }
      }else message.sender_name='';
    }
    return {ok:true,mode,status:'Connected (Google login)',messages};
  }
  async function message(value) {
    const mode=provider();
    if(mode==='app_password')return (await messages([value]))[0];
    if(!/^[a-zA-Z0-9_-]{1,200}$/.test(value))fail('email_message_invalid',400);const m=(await oauth().users.messages.get({userId:'me',id:value,format:'raw'})).data;const raw=Buffer.from(m.raw||'','base64url');if(raw.length>MAX_BYTES)fail('email_message_too_large',413);const parsed=await parse(raw,{skipImageLinks:true,skipTextToHtml:true,maxHtmlLengthToParse:MAX_BYTES});const own=(parsed.from?.value||[]).some(a=>String(a.address).toLowerCase()===String(env.GMAIL_USER).toLowerCase());return {source_kind:'connected_mailbox',id:m.id,threadId:m.threadId,message_id:parsed.messageId||'',direction:own||(m.labelIds||[]).includes('SENT')?'out':parsed.from?.value?.length?'in':'unknown',from:parsed.from?.text||'',to:parsed.to?.text||'',cc:parsed.cc?.text||'',...participantFields({from:parsed.from?.value,to:parsed.to?.value,cc:parsed.cc?.value}),subject:parsed.subject||'',date:parsed.date?.toISOString()||'',body:parsed.text||'(No readable text)',in_reply_to:parsed.inReplyTo||'',mode};
  }
  async function messages(values) {
    if(!Array.isArray(values)||!values.length||values.length>30||values.some(v=>typeof v!=='string'||!v||v.length>1000)||new Set(values).size!==values.length)fail('email_thread_invalid',400);
    const mode=provider();let bytes=0;const output=[];
    function keep(row){bytes+=Buffer.byteLength(row.body||'');if(bytes>8*1024*1024)fail('email_thread_too_large',413);output.push(row);}
    if(mode==='app_password')return imap(async c=>{
      const parsed=values.map(decode),first=parsed[0];
      if(parsed.some(p=>p.box!==first.box||p.validity!==first.validity))fail('email_thread_invalid',400);
      const allowed=await c.list();if(first.box!=='INBOX'&&!allowed.some(b=>b.path===first.box&&(Object.values(FOLDERS).includes(b.path)||Object.values(FOLDERS).includes(b.specialUse))))fail('email_message_invalid',400);
      const lock=await c.getMailboxLock(first.box,{readOnly:true});
      try{
        if(String(c.mailbox.uidValidity)!==first.validity)fail('email_message_stale',409);
        for(const p of parsed){
          const header=await c.fetchOne(p.uid,{uid:true,envelope:true,size:true,flags:true},{uid:true});
          if(!header)fail('email_message_missing',404);if(header.size>MAX_BYTES)fail('email_message_too_large',413);
          const m=await c.fetchOne(p.uid,{source:true},{uid:true});if(!m?.source||m.source.length>MAX_BYTES)fail('email_message_too_large',413);
          const content=await parse(m.source,{skipImageLinks:true,skipTextToHtml:true,maxHtmlLengthToParse:MAX_BYTES});
          keep({...metadata(header,p.box,p.validity),body:String(content.text||'(No readable text)').slice(0,MAX_BYTES),in_reply_to:content.inReplyTo||'',mode});
        }
        return output;
      }finally{lock.release();}
    });
    for(const value of values)keep(await message(value));return output;
  }
  return {test,list,message,messages};
}
function registerMailboxReads(app,{requireAdmin,reader=createMailboxReader(),db,now=()=>new Date().toISOString()}) {
  const safeError=(res,e)=>{if(typeof res.set==='function')res.set('Cache-Control','no-store');return res.status(e.status||503).json({ok:false,code:/^email_[a-z_]+$/.test(e.code||'')?e.code:'email_connection_failed',error:'Email unavailable. Check the connection in Settings.',messages:[]});};
  const view=messages=>require('./thread-view').annotate(messages,db?db.readDBStrict():{},{now:now()});
  app.get('/api/gmail/test',requireAdmin,async(req,res)=>{try{res.set('Cache-Control','no-store').json(await reader.test());}catch(e){safeError(res,e);}});
  for(const route of ['/api/gmail/inbox','/api/gmail/messages'])app.get(route,requireAdmin,async(req,res)=>{try{const result=await reader.list(route.endsWith('inbox')?'inbox':req.query.folder,req.query.limit);res.set('Cache-Control','no-store').json({...result,messages:view(result.messages)});}catch(e){safeError(res,e);}});
  app.get('/api/gmail/message/:id',requireAdmin,async(req,res)=>{try{res.set('Cache-Control','no-store').json(view([await reader.message(req.params.id)])[0]);}catch(e){safeError(res,e);}});
  app.get('/api/gmail/thread',requireAdmin,async(req,res)=>{
    res.set('Cache-Control','no-store');
    try{const raw=req.query.ids;if(typeof raw!=='string'||raw.length>16000)fail('email_thread_invalid',400);let ids;try{ids=JSON.parse(raw);}catch{fail('email_thread_invalid',400);}if(!Array.isArray(ids)||!ids.length||ids.length>30||ids.some(v=>typeof v!=='string'||!v||v.length>1000)||new Set(ids).size!==ids.length)fail('email_thread_invalid',400);res.json({ok:true,messages:view(await reader.messages(ids))});}catch(e){safeError(res,e);}
  });
}
module.exports={createMailboxReader,registerMailboxReads};
