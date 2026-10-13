'use strict';
const records=require('../records/record-activity');
const fit=require('./buyer-fit');
const eligibility=require('../research/operational-lead-eligibility');
function build(store,{now}){
  const result=new Map((store.buyers||[]).map(b=>[b.id,{count:0,matches:[],near_misses:[],last_contact_at:null}]));
  for(const buyer of store.buyers||[]){
    const reports=(buyer.assistant_find?.history||[]).filter(e=>e.kind==='outreach'&&['messaged','emailed','commented','replied'].includes(e.to)&&typeof e.operator_id==='string'&&e.operator_id&&typeof e.at==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(e.at)&&Number.isFinite(Date.parse(e.at))&&Date.parse(e.at)<=Date.parse(now));
    result.get(buyer.id).last_contact_at=reports.map(e=>e.at).sort().at(-1)||null;
  }
  // Require on call: reviewed-deals uses assistant-finds' validation constants.
  const evaluate=require('../deals/reviewed-deals').evaluate;
  for(const deal of store.reviewed_deals||[]){
    const evaluation=evaluate(deal,store.buyers||[],now);
    for(const buyer of store.buyers||[]){
      if(!buyer.assistant_find||!fit.approvedForMatching(buyer)||!eligibility.buyerEligible(buyer)||evaluation.matches.some(c=>c.id===buyer.id))continue;
      const box={...buyer.assistant_find.buy_box};delete box.price_min;delete box.price_max;
      const geographic=fit.fitLead({...buyer,assistant_find:{...buyer.assistant_find,buy_box:box}},{state:deal.state,city:deal.city,county:deal.county,zip:deal.zip,property_type:deal.property_type});
      const reasons=geographic.reasons.filter(r=>r.endsWith(' differs'));
      result.get(buyer.id).near_misses.push({id:deal.id,ref:records.reference(deal),city:deal.city||'',state:deal.state||'',zip:deal.zip||'',reason:reasons.length?reasons.join('; '):'Does not pass the full recorded buy box.'});
    }
    for(const candidate of evaluation.matches){
      const view=result.get(candidate.id);if(!view)continue;
      const row={id:deal.id,ref:records.reference(deal),city:deal.city||'',state:deal.state||'',zip:deal.zip||'',asking:evaluation.asking,buyer_max:candidate.max_price,checks:candidate.check_items||[]};
      let reason='';
      if(['closed','dead','expired'].includes(evaluation.status))reason='This deal is no longer active.';
      else if(!evaluation.value.range)reason='Comparable-sale value is not established.';
      else if(candidate.max_price==null)reason='Buyer maximum is not established.';
      else if(evaluation.asking==null)reason='Asking price is not established.';
      else if(evaluation.asking>candidate.max_price)reason='$'+Math.round(evaluation.asking-candidate.max_price).toLocaleString('en-US')+' above the buyer maximum.';
      if(reason)view.near_misses.push({...row,reason});else{view.count++;view.matches.push(row);}
    }
  }
  for(const view of result.values()){view.matches=view.matches.slice(0,10);view.near_misses=view.near_misses.slice(0,10);}
  return result;
}
module.exports={build};
