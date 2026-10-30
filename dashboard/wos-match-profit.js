(function(root){
  'use strict';
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function amount(v){return typeof v==='number'&&Number.isFinite(v)?'$'+v.toLocaleString('en-US',{maximumFractionDigits:2}):'Not established';}
  function range(v){return v&&typeof v.low==='number'&&typeof v.high==='number'?v.low===v.high?amount(v.low):amount(v.low)+' - '+amount(v.high):'Not established';}
  function date(v){return Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC'})+' UTC':'Date not recorded';}
  function markup(p){
    if(!p)return '<div class="match-profit"><strong>Potential net fee: Not established</strong><p>Potential, no confirmed buyer. Proof of funds: Not established.</p></div>';
    const fields=[['buyer_price','Reported buyer price'],['contract_price','Reported contract price'],['costs','Total costs']];
    return '<div class="match-profit"><strong>Potential net fee: '+esc(range(p.net_fee))+'</strong><p>Our share: '+esc(range(p.our_net))+'</p><p>Potential, no confirmed buyer. Proof of funds: Not established.</p><details><summary>Price sources and costs</summary><dl>'+fields.map(([key,label])=>{
      const source=p.field_provenance?.[key];let url='';try{const u=new URL(source?.source_url);if(u.protocol==='https:'&&!u.username&&!u.password)url=u.href;}catch{}
      return '<div><dt>'+label+'</dt><dd>'+esc(range(p[key]))+(url?' <a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Reported source</a> ('+esc(date(source.captured_at))+')':'')+'</dd></div>';
    }).join('')+'</dl><p>Path: '+esc(p.path==='assignment'?'Assignment':p.path==='double_close'?'Double close':'Not recorded')+'. '+esc(p.estimate_label||p.reason||'')+'</p><small>Derived potential only; no offer, confirmed funds or deposit from Gabriel.</small></details></div>';
  }
  if(typeof module==='object'&&module.exports)module.exports={markup};else root.wosMatchProfit={markup};
})(typeof window==='object'?window:globalThis);
