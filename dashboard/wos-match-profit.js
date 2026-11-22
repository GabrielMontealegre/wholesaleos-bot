(function(root){
  'use strict';
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function amount(v){return typeof v==='number'&&Number.isFinite(v)?'$'+v.toLocaleString('en-US',{maximumFractionDigits:2}):'Not established';}
  function range(v){return v&&typeof v.low==='number'&&typeof v.high==='number'?v.low===v.high?amount(v.low):amount(v.low)+' - '+amount(v.high):'Not established';}
  function validRange(v,negative=false){return !!(v&&typeof v.low==='number'&&typeof v.high==='number'&&Number.isFinite(v.low)&&Number.isFinite(v.high)&&v.low<=v.high&&(negative||v.low>=0));}
  function source(v,requireDate=true){try{const u=new URL(v?.source_url);return v?.source_kind==='imported_report'&&u.protocol==='https:'&&!u.username&&!u.password&&typeof v.evidence_text==='string'&&v.evidence_text.trim()&&(!requireDate||typeof v.captured_at==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v.captured_at)&&Number.isFinite(Date.parse(v.captured_at))&&new Date(v.captured_at).toISOString().slice(0,19)===v.captured_at.slice(0,19))?u.href:'';}catch{return '';}}
  function present(p){
    const base=p?.source_kind==='derived_workflow'&&p.reported_only===true&&p.buyer_confirmed===false&&typeof p.report_id==='string'&&!!p.report_id;
    const fields={};
    for(const key of ['buyer_price','contract_price','costs'])fields[key]=base&&validRange(p[key])&&(key==='costs'?source(p.field_provenance?.[key])||p.costs_basis==='configured_estimate'&&typeof p.estimate_label==='string'&&!!p.estimate_label.trim():p[key].low>0&&source(p.field_provenance?.[key]))?p[key]:null;
    const share=base&&typeof p.our_share==='number'&&p.our_share>0&&p.our_share<=1?p.our_share:null;
    const missing=[...Object.keys(fields).filter(key=>!fields[key]),...(share===null?['our_share']:[])];
    const consistent=Array.isArray(p?.missing)&&p.missing.length===0;
    return {fields,share,missing,profit:!missing.length&&consistent&&validRange(p.net_fee,true)&&validRange(p.our_net,true)?p.our_net:null,
      net_fee:base&&Object.values(fields).every(Boolean)&&validRange(p.net_fee,true)?p.net_fee:null};
  }
  function date(v){const clock=root.wosCardClock,label=typeof clock?.formatTime==='function'?clock.formatTime(v,new Date().toISOString()):'Unknown';return label==='Unknown'?'Time not confirmed':label;}
  function markup(p){
    const view=present(p),labels={buyer_price:'buyer price',contract_price:'contract price',costs:'total costs',our_share:'your recorded share'};
    p=p||{};
    const fields=[['buyer_price','Reported buyer price'],['contract_price','Reported contract price'],['costs','Total costs']];
    return '<div class="match-profit"><strong data-profit-headline>Estimated profit: '+(view.profit?esc(range(view.profit)):'unavailable')+'</strong>'+
      (view.missing.length?'<ul class="profit-missing">'+view.missing.map(key=>'<li>Missing: '+labels[key]+'. Review the source report.</li>').join('')+'</ul>':'')+
      '<p>Potential, no confirmed buyer. Funds are not verified.</p><details><summary>Price sources and costs</summary><p>Buyer price - contract price - total costs = net fee before split. Net fee x your recorded share = estimated profit.</p><dl>'+fields.map(([key,label])=>{
      const proof=p.field_provenance?.[key],url=source(proof,false);
      return '<div><dt>'+label+'</dt><dd>'+esc(view.fields[key]?range(view.fields[key]):'Missing: '+labels[key])+(url?' <a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Reported source</a> ('+esc(date(proof.captured_at))+')':'')+'</dd></div>';
    }).join('')+'<div><dt>Net fee before split</dt><dd>'+esc(view.net_fee?range(view.net_fee):'Missing source prices or costs')+'</dd></div><div><dt>Your recorded share</dt><dd>'+esc(view.share===null?'Missing: recorded share':String(view.share*100)+'%')+'</dd></div></dl><p>Path: '+esc(p.path==='assignment'?'Assignment':p.path==='double_close'?'Double close':'Not recorded')+'. '+esc(p.estimate_label||p.reason||'')+'</p><small>Derived estimate only; not an offer, confirmed funds or earned profit.</small></details></div>';
  }
  if(typeof module==='object'&&module.exports)module.exports={markup,present};else root.wosMatchProfit={markup,present};
})(typeof window==='object'?window:globalThis);
