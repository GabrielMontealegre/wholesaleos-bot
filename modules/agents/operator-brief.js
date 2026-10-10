'use strict';
const reviewedDeals=require('../deals/reviewed-deals');
const conversations=require('../records/conversations');
const {dayAt}=require('../records/calendar-day');
const REF=/^(?:WOS-[A-Z]{2}|BUY|M)-\d{4}$/;
function buildOperatorBrief(store,{now,timeZone='America/Mazatlan'}={}){
 const current=Date.parse(now);if(!Number.isFinite(current))throw Error('brief_timestamp_invalid');const today=dayAt(now,timeZone);
 const latest=new Map();
 const closedRefs=new Set([...(store.reviewed_deals||[]).filter(d=>['closed','dead'].includes(d.status)),...(store.buyers||[]).filter(b=>b.assistant_find?.status==='not_a_fit')].map(r=>r.record_ref).filter(Boolean));
 for(const a of store.activities||[]){const ref=a.buyer_ref||a.deal_ref||a.match_ref;const at=Date.parse(a.ts||a.created_at||'');if(!REF.test(ref||'')||!Number.isFinite(at)||at>current)continue;
  const direction=a.direction||({'reply_received':'in','message_sent':'out','email_sent':'out'})[a.type];if(!['in','out'].includes(direction)||closedRefs.has(ref))continue;
  const channel=['facebook','email','phone','manual','telegram','dashboard','assistant_dropbox'].includes(a.channel)?a.channel:'unknown';
  const key=ref+'|'+channel;const previous=latest.get(key);if(!previous||previous.at<at)latest.set(key,{ref,channel,direction,at});else if(previous.at===at&&previous.direction!==direction)latest.set(key,{...previous,direction:'ambiguous'});
 }
 const allIncoming=[...latest.values()].filter(a=>a.direction==='in').sort((a,b)=>b.at-a.at);
 let incoming=allIncoming.slice(0,10);
 const localAge=a=>(Date.parse(today+'T00:00:00Z')-Date.parse(dayAt(a.at,timeZone)+'T00:00:00Z'))/86400000;
 let followups=[...latest.values()].filter(a=>a.direction==='out'&&localAge(a)>=2).map(a=>({ref:a.ref,channel:a.channel}));
 const shared=(store.conversations||[]).length?conversations.list(store,{now,timeZone,limit:100}):null;
 const redact=row=>({ref:row.refs.find(ref=>REF.test(ref))||'',channel:row.channels.filter(c=>['facebook','email','phone','manual'].includes(c)).join(', ')||'unknown'});
 if(shared){incoming=shared.items.filter(r=>r.status==='hot').slice(0,10).map(redact);followups=shared.items.filter(r=>r.status!=='hot'&&r.due_date&&r.due_date<=today).map(redact);}
 const incomingCount=shared?shared.incoming_count:allIncoming.length;
 const followupCount=shared?shared.followup_count:followups.length;
 const listed=(store.reviewed_deals||[]).map(d=>({...d,evaluation:reviewedDeals.evaluate(d,store.buyers||[],now)}));
 const eligible=listed.filter(d=>d.approval==='approved'&&d.evidence_reviewed_at&&d.evidence_reviewed_by&&d.evaluation.value.range&&d.evaluation.matches.some(m=>m.max_price!=null)&&!['STALE','NO'].includes(d.evaluation.verdict));
 const candidates=eligible.slice(0,5).map(d=>{
  const e=d.evaluation;const buyer=e.matches.find(m=>m.max_price!=null);return {ref:d.record_ref,city:d.city,state:d.state,zip:d.zip,asking:e.asking,arv:e.value.range,tier:e.value.tier,comp_count:e.value.comps.length,buyer_max:buyer.max_price,room:e.asking==null?null:buyer.max_price-e.asking,verdict:e.verdict,url:REF.test(d.record_ref||'')?'https://wholesaleos-bot-production.up.railway.app/dashboard/?record_ref='+encodeURIComponent(d.record_ref):null};
 });
 const pending={buyers:(store.buyers||[]).filter(b=>b.assistant_find?.approval==='pending').length,deals:listed.filter(d=>d.approval==='pending'&&!['STALE','NO'].includes(d.evaluation.verdict)).length};
 const money=n=>n==null?'Not established':'$'+Math.round(n).toLocaleString('en-US');
 const text=['WholesaleOS briefing - '+today,...(shared?['Open reported conversations: '+shared.total+'; waiting or due: '+shared.waiting_count+'; unlinked: '+shared.unlinked_count]:[]),'Reported incoming threads: '+incomingCount+' (showing '+(shared?'':'latest ')+incoming.length+')',...incoming.map(a=>(a.ref||'Unlinked conversation')+' ('+a.channel+') - review '+(shared?'Dashboard':'Activity')),'Follow-ups due or overdue: '+followupCount,'Pending review: '+pending.buyers+' buyers, '+pending.deals+' deals','Reviewed deals with a calculated buyer ceiling: '+eligible.length+' (showing '+candidates.length+')',...candidates.map(d=>[d.ref,[d.city,d.state,d.zip].filter(Boolean).join(', '),d.verdict,'Asking '+money(d.asking),'Value '+money(d.arv.low)+' to '+money(d.arv.high)+' ('+d.tier+', '+d.comp_count+' comps)','Buyer max '+money(d.buyer_max),'Gross room '+money(d.room)+' before fees/split',d.url||'Record link not assigned'].join(' | ')),'Reported interactions are not independently verified contact outcomes.','Dashboard: https://wholesaleos-bot-production.up.railway.app/dashboard/'].join('\n');
 return {today,time_zone:timeZone,incoming_count:incomingCount,followup_count:followupCount,conversation_summary:shared?{total:shared.total,waiting_count:shared.waiting_count,unlinked_count:shared.unlinked_count}:null,reviewed_deal_count:eligible.length,incoming:incoming.map(a=>({ref:a.ref,channel:a.channel})),followups,pending,candidates,text};
}
module.exports={dayAt,buildOperatorBrief};
