'use strict';
const {buildOperatorBrief}=require('./operator-brief');
const REF=/^(?:WOS-[A-Z]{2}|BUY|M)-\d{4}$/;
function createOwnerTelegram({env=process.env,fetchImpl=(...args)=>global.fetch(...args),clock=()=>Date.now(),log=()=>{}}={}){
 let windowStart=0,attempts=0;
 const configured=()=>!!(env.TELEGRAM_BOT_TOKEN&&env.BOT_OWNER_ID);
 function status(){return {configured:configured(),status:configured()?'Telegram configured - delivery not tested':'Telegram not connected',limit_per_hour:30,attempts_this_hour:clock()-windowStart<3600000?attempts:0};}
 async function send(text,ref=''){
  if(typeof text!=='string'||!text.trim()||text.length>3500||typeof ref!=='string'||ref&&!REF.test(ref))return {sent:false,code:'telegram_input_invalid'};
  if(!configured())return {sent:false,code:'telegram_not_connected'};
  const now=clock();if(now-windowStart>=3600000){windowStart=now;attempts=0;}if(attempts>=30)return {sent:false,code:'telegram_rate_limited'};attempts++;
  let sent=false;try{const response=await fetchImpl('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.BOT_OWNER_ID,text,disable_web_page_preview:true}),signal:AbortSignal.timeout(10000)});if(response.ok){const data=await response.json();sent=data.ok===true;}}catch{}
  try{log({result:sent?'sent':'failed',ref});}catch{}
  return {sent,code:sent?'telegram_sent':'telegram_send_failed'};
 }
 async function incoming(activities){for(const a of activities||[]){if(a.direction?a.direction!=='in':a.type!=='reply_received')continue;const ref=a.buyer_ref||a.deal_ref||a.match_ref||'';if(!REF.test(ref))continue;await send('Reported reply received for '+ref+'. Review Activity in the dashboard.',ref);}}
 async function daily(store,context){return send(buildOperatorBrief(store,context).text);}
 return {status,send,incoming,daily};
}
function registerOwnerTelegram(app,{db,requireAdmin,service,now=()=>new Date().toISOString(),backgroundEnabled=false}){
 const status=(req,res)=>res.set('Cache-Control','no-store').json({...service.status(),schedule:{enabled:backgroundEnabled&&service.status().configured,hour:7,time_zone:'America/Mazatlan'}});
 const brief=(req,res)=>{try{res.set('Cache-Control','no-store').json(buildOperatorBrief(db.readDBStrict(),{now:now()}));}catch{res.status(503).json({code:'telegram_brief_unavailable'});}};
 app.get('/api/notify/telegram/status',requireAdmin,status);
 app.get('/api/notify/telegram/brief',requireAdmin,brief);
 app.get('/api/dashboard/operator-channel-status',requireAdmin,status);
 app.get('/api/dashboard/operator-brief',requireAdmin,brief);
 app.post('/api/notify/telegram',requireAdmin,async(req,res)=>{const b=req.body;if(!b||Array.isArray(b)||Object.keys(b).some(k=>!['text','ref'].includes(k)))return res.status(400).json({code:'telegram_input_invalid'});const result=await service.send(b.text,b.ref||'');res.status(result.code==='telegram_input_invalid'?400:result.code==='telegram_rate_limited'?429:result.code==='telegram_send_failed'?503:200).json(result);});
 app.post('/api/daily-summary',requireAdmin,async(req,res)=>{try{const result=await service.daily(db.readDBStrict(),{now:now()});res.json({success:result.sent,...result});}catch{res.status(503).json({code:'telegram_brief_unavailable'});}});
}
module.exports={createOwnerTelegram,registerOwnerTelegram};
