'use strict';
const conversations=require('./conversations');
function registerConversationRoutes(app,{db,requireAdmin,now=()=>new Date().toISOString(),mailboxReader}) {
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
      if(!preview.hasAnchors(store))return res.json({...conversations.list(store,{now:at}),email_preview:{status:'No exact email thread or message anchors recorded. Nothing was fetched.',scanned_messages:0,matched_messages:0,unlinked_messages:0,preview_only:true}});
      const reader=mailboxReader||require('../email/mailbox-reader').createMailboxReader();
      const inbox=await reader.list('inbox',30);
      if(inbox.ok!==true||!Array.isArray(inbox.messages))throw Error();
      return res.json(preview.preview(store,inbox.messages,{now:at}));
    }catch{return res.status(503).json({code:'conversation_email_preview_unavailable'});}
    finally{reading=false;}
  });
}
module.exports={registerConversationRoutes};
