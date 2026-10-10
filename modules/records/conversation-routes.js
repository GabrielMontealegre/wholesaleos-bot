'use strict';
const conversations=require('./conversations');
function registerConversationRoutes(app,{db,requireAdmin,now=()=>new Date().toISOString()}) {
  app.get('/api/dashboard/conversations',requireAdmin,(req,res)=>{
    try{res.set('Cache-Control','no-store').json(conversations.list(db.readDBStrict(),{now:now()}));}
    catch{res.status(503).json({code:'conversation_store_unavailable'});}
  });
}
module.exports={registerConversationRoutes};
