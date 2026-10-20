'use strict';
const conversations=require('./conversations');
function registerConversationRoutes(app,{db,requireAdmin,now=()=>new Date().toISOString(),mailboxReader}) {
  require('./calendar-workspace').registerCalendarWorkspace(app,{db,requireAdmin,now});
  const pipeline=require('./pipeline-workspace');
  require('./pipeline-reports').register(app,{db,requireAdmin,now,buildView:pipeline.build,readOptions:pipeline.readOptions});
  require('./pipeline-report-review').register(app,{db,requireAdmin,now});
  require('./approval-workspace').registerApprovalWorkspace(app,{db,requireAdmin,now});
  require('../agents/today-workspace').registerTodayWorkspace(app,{db,requireAdmin,now,releases:require('../agents/verified-ui-releases.json')});
  require('../email/template-approvals').registerRoutes(app,{db,requireAdmin,now});
  const reader=()=>mailboxReader||require('../email/mailbox-reader').createMailboxReader();
  app.get('/api/dashboard/conversations',requireAdmin,(req,res)=>{
    try{res.set('Cache-Control','no-store').json(conversations.list(db.readDBStrict(),{now:now()}));}
    catch{res.status(503).json({code:'conversation_store_unavailable'});}
  });
  let reading=false;
  app.get('/api/dashboard/conversations/email-preview',requireAdmin,async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(reading)return res.status(429).json({code:'conversation_email_preview_busy'});
    reading=true;
    try{
      const store=db.readDBStrict(),at=now();
      const preview=require('./mailbox-conversation-preview');
      if(!preview.hasAnchors(store,at))return res.json({...conversations.list(store,{now:at}),email_preview:{status:'No exact email thread or message anchors recorded. Nothing was fetched.',scanned_messages:0,matched_messages:0,unlinked_messages:0,preview_only:true}});
      const inbox=await reader().list('inbox',30);
      if(inbox.ok!==true||!Array.isArray(inbox.messages))throw Error();
      return res.json(preview.preview(store,inbox.messages,{now:at}));
    }catch{return res.status(503).json({code:'conversation_email_preview_unavailable'});}
    finally{reading=false;}
  });
  function writeError(res,e){return res.status(e.status||503).json({code:/^(?:conversation_email|find_conversation|find_ref|find_activity)_[a-z_]+$/.test(e.code||'')?e.code:'conversation_email_save_unavailable'});}
  function save(res,result){if(result.store!==result.before)db.writeDB(result.store);return res.json({ok:true,...result.summary});}
  app.post('/api/dashboard/conversations/email-sync',requireAdmin,async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!req.body||Array.isArray(req.body)||typeof req.body!=='object'||Object.keys(req.body).length)return res.status(400).json({code:'conversation_email_sync_invalid'});
    if(reading)return res.status(429).json({code:'conversation_email_preview_busy'});
    reading=true;
    try{
      const initial=db.readDBStrict();
      if(!require('./mailbox-conversation-preview').hasAnchors(initial,now()))return res.json({ok:true,saved_messages:0,status:'No exact email anchors recorded. Nothing was fetched or saved.'});
      const inbox=await reader().list('inbox',30);
      if(inbox.ok!==true||!Array.isArray(inbox.messages))throw Error();
      // Re-read after the network await so concurrent imports/closures survive.
      const before=db.readDBStrict();
      return save(res,{before,...require('./mailbox-conversation-sync').persist(before,inbox.messages,{now:now(),operatorId:req.currentUser.id})});
    }catch(e){return writeError(res,e);}finally{reading=false;}
  });
  app.post('/api/dashboard/conversations/email-link',requireAdmin,async(req,res)=>{
    res.set('Cache-Control','no-store');
    const b=req.body;
    if(!b||Array.isArray(b)||typeof b!=='object'||Object.keys(b).some(k=>!['message_id','person','role','refs','next_step'].includes(k))||typeof b.message_id!=='string'||!b.message_id||b.message_id.length>1000||Buffer.byteLength(JSON.stringify(b))>8192)return res.status(400).json({code:'conversation_email_link_invalid'});
    if(reading)return res.status(429).json({code:'conversation_email_preview_busy'});
    reading=true;
    try{
      const message=await reader().message(b.message_id);
      const before=db.readDBStrict();
      return save(res,{before,...require('./mailbox-conversation-sync').link(before,b,message,{now:now(),operatorId:req.currentUser.id})});
    }catch(e){return writeError(res,e);}finally{reading=false;}
  });
}
module.exports={registerConversationRoutes};
