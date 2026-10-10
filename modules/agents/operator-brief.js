'use strict';
const reviewedDeals=require('../deals/reviewed-deals');
const REF=/^(?:WOS-[A-Z]{2}|BUY|M)-\d{4}$/;
function dayAt(instant,timeZone){const date=new Date(instant);if(!Number.isFinite(date.getTime()))throw Error('brief_timestamp_invalid');const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const get=k=>parts.find(p=>p.type===k).value;return get('year')+'-'+get('month')+'-'+get('day');}
function buildOperatorBrief(store,{now,timeZone='America/Mazatlan'}={}){
 const current=Date.parse(now);if(!Number.isFinite(current))throw Error('brief_timestamp_invalid');const today=dayAt(now,timeZone);
 const latest=new Map();
 for(const a of store.activities||[]){const ref=a.buyer_ref||a.deal_ref||a.match_ref;const at=Date.parse(a.ts||a.created_at||'');if(!REF.test(ref||'')||!Number.isFinite(at)||at>current)continue;
  const direction=a.direction||({'reply_received':'in','message_sent':'out','email_sent':'out'})[a.type];if(!['in','out'].includes(direction))continue;
  const key=ref+'|'+(a.channel||'unknown');const previous=latest.get(key);if(!previous||previous.at<at)latest.set(key,{ref,channel:a.channel||'unknown',direction,at});else if(previous.at===at&&previous.direction!==direction)latest.set(key,{...previous,direction:'ambiguous'});
 }
 const incoming=[...latest.values()].filter(a=>a.direction==='in').sort((a,b)=>b.at-a.at).slice(0,10);
 const localAge=a=>(Date.parse(today+'T00:00:00Z')-Date.parse(dayAt(a.at,timeZone)+'T00:00:00Z'))/86400000;
 const followups=[...latest.values()].filter(a=>a.direction==='out'&&localAge(a)>=2).map(a=>({ref:a.ref,channel:a.channel}));
 const listed=(store.reviewed_deals||[]).map(d=>({...d,evaluation:reviewedDeals.evaluate(d,store.buyers||[],now)}));
 const candidates=listed.filter(d=>d.approval==='approved'&&d.evidence_reviewed_at&&d.evidence_reviewed_by&&d.evaluation.value.range&&d.evaluation.matches.some(m=>m.max_price!=null)&&!['STALE','NO'].includes(d.evaluation.verdict)).slice(0,5).map(d=>{
  const e=d.evaluation;const buyer=e.matches.find(m=>m.max_price!=null);return {ref:d.record_ref,city:d.city,state:d.state,zip:d.zip,asking:e.asking,arv:e.value.range,tier:e.value.tier,comp_count:e.value.comps.length,buyer_max:buyer.max_price,room:e.asking==null?null:buyer.max_price-e.asking,verdict:e.verdict};
 });
 const pending={buyers:(store.buyers||[]).filter(b=>b.assistant_find?.approval==='pending').length,deals:listed.filter(d=>d.approval==='pending'&&!['STALE','NO'].includes(d.evaluation.verdict)).length};
 const money=n=>n==null?'Not established':'$'+Math.round(n).toLocaleString('en-US');
 const text=['WholesaleOS briefing - '+today,'Latest reported incoming updates: '+incoming.length,...incoming.map(a=>a.ref+' ('+a.channel+') - review Activity'),'Follow-ups due or overdue: '+followups.length,'Pending review: '+pending.buyers+' buyers, '+pending.deals+' deals','Reviewed deals with a calculated buyer ceiling: '+candidates.length,...candidates.map(d=>[d.ref,[d.city,d.state,d.zip].filter(Boolean).join(', '),d.verdict,'Asking '+money(d.asking),'Value '+money(d.arv.low)+' to '+money(d.arv.high)+' ('+d.tier+', '+d.comp_count+' comps)','Buyer max '+money(d.buyer_max),'Gross room '+money(d.room)+' before fees/split'].join(' | ')),'Reported interactions are not independently verified contact outcomes.','Dashboard: https://wholesaleos-bot-production.up.railway.app/dashboard/'].join('\n');
 return {today,time_zone:timeZone,incoming:incoming.map(a=>({ref:a.ref,channel:a.channel})),followups,pending,candidates,text};
}
module.exports={dayAt,buildOperatorBrief};
