// dashboard/wos-leads-detail.js v2
// Lead Source Transparency + AI Seller Guidance per lead type
(function() {
'use strict';
var T = {
  foreclosure:{label:'Foreclosure/Auction',icon:'🔨',color:'#1d4ed8',bg:'#eff6ff',border:'#bfdbfe',urgency:'VERY HIGH — Going to auction',approach:'Fast and factual. Numbers only.',questions:['What is the auction date?','What is the opening bid?','Is there a redemption period?','Are occupants in the property?','Can I inspect before auction?'],risks:'Buy as-is, no inspection, may have occupants',opportunity:'Steep discount if opening bid is below ARV'},
  pre_foreclosure:{label:'Pre-Foreclosure',icon:'⚠️',color:'#dc2626',bg:'#fef2f2',border:'#fecaca',urgency:'HIGH — Owner facing foreclosure',approach:'Empathetic and fast. They need relief now.',questions:['How far behind on payments?','Notice of Default received?','How much do you owe on the mortgage?','Other liens or judgments?','Primary residence or investment?'],risks:'Short timeline, title issues, possible 2nd liens',opportunity:'Big discount if you close before auction date'},
  probate:{label:'Probate',icon:'⚖️',color:'#7c3aed',bg:'#faf5ff',border:'#e9d5ff',urgency:'MEDIUM — Estate must sell',approach:'Compassionate and patient. Work with executor.',questions:['Are you the executor?','Have Letters Testamentary been issued?','All heirs in agreement to sell?','Is there a mortgage?','How long has property been vacant?','Timeline for closing?'],risks:'Court approval required, heirs may disagree',opportunity:'Often priced below market, motivated executor'},
  tax_lien:{label:'Tax Delinquent',icon:'🏛️',color:'#b45309',bg:'#fffbeb',border:'#fde68a',urgency:'HIGH — May lose to tax sale',approach:'Educational. Many owners do not know they can sell.',questions:['How far behind on taxes?','Tax sale notice received?','Property occupied or vacant?','Other debts on property?','Would you sell for cash to avoid losing it?'],risks:'Tax buyer lien, title cleanup needed',opportunity:'Owner very motivated, may accept near-payoff price'},
  fire_damaged:{label:'Fire Damaged',icon:'🔥',color:'#ea580c',bg:'#fff7ed',border:'#fed7aa',urgency:'HIGH — Owner wants out of problem',approach:'Direct and solution-focused. Get the problem gone.',questions:['Insurance claim filed?','Payout received?','Status of property?','Permits pulled for repair?','How long ago was the fire?'],risks:'Demolition may be needed, environmental hazards',opportunity:'Deep discount, no competing retail buyers'},
  code_violation:{label:'Code Violation',icon:'🚨',color:'#d97706',bg:'#fffbeb',border:'#fde68a',urgency:'MEDIUM — Fines accumulating',approach:'Problem-solver. Position as relief from city pressure.',questions:['What violations were cited?','How long has property had these?','Daily fines or penalties?','Property occupied or vacant?','Repair estimates received?'],risks:'City liens, fines accumulated on title',opportunity:'Owner stressed, often takes discount for quick relief'},
  bankruptcy:{label:'Bankruptcy',icon:'📋',color:'#6b7280',bg:'#f9fafb',border:'#e5e7eb',urgency:'HIGH — Trustee controls timeline',approach:'Professional and quick. Trustee needs documented offers.',questions:['Chapter 7 or 13?','Who is the trustee?','Has automatic stay been lifted?','Estimated value trustee expects?','Other creditors on property?'],risks:'Court approval required, cannot move fast',opportunity:'Trustee has fiduciary duty to sell'},
};
function getType(lead){
  var m=(lead.motivation||lead.source_details||'').toLowerCase();
  if(m.indexOf('foreclos')>-1||m.indexOf('auction')>-1) return T.foreclosure;
  if(m.indexOf('pre_foreclos')>-1||m.indexOf('pre-foreclos')>-1) return T.pre_foreclosure;
  if(m.indexOf('probate')>-1) return T.probate;
  if(m.indexOf('tax')>-1||m.indexOf('lien')>-1||m.indexOf('delinqu')>-1) return T.tax_lien;
  if(m.indexOf('fire')>-1) return T.fire_damaged;
  if(m.indexOf('code')>-1||m.indexOf('violation')>-1) return T.code_violation;
  if(m.indexOf('bankrupt')>-1) return T.bankruptcy;
  return {label:'Lead',icon:'📍',color:'#374151',bg:'#f9fafb',border:'#e5e7eb',urgency:'Research needed',approach:'Gather info first.',questions:['How long have you owned?','Are you looking to sell?','What is your timeline?'],risks:'Unknown situation',opportunity:'TBD after qualification'};
}
function qs(arr){return arr.map(function(q,i){return '<li style="font-size:12px;color:#374151;line-height:1.6;padding:2px 0;">'+q+'</li>';}).join('');}
function buildPanel(lead){
  var tc=getType(lead);
  var score=lead.hot_score||lead.motivation_score||lead.score||0;
  var sb=score>=85?'🔥 HOT':score>=65?'⚡ WARM':'❄️ COLD';
  var pd=lead.created_at||lead.createdAt||lead.created||'';
  try{if(pd)pd=new Date(pd).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}catch(e){}
  var srcName=lead.source||lead.county||'Unknown';
  var srcUrl=lead.source_url||'';
  var h='<div id="wosLeadDetailPanel" style="margin-bottom:16px;border-radius:10px;overflow:hidden;border:2px solid '+tc.border+';font-family:system-ui,sans-serif;">';
  h+='<div style="background:'+tc.color+';color:#fff;padding:11px 15px;display:flex;align-items:center;gap:10px;">';
  h+='<span style="font-size:20px;">'+tc.icon+'</span>';
  h+='<div style="flex:1;"><div style="font-size:15px;font-weight:700;">'+tc.label+'</div><div style="font-size:11px;opacity:0.85;">'+tc.urgency+'</div></div>';
  h+='<div style="text-align:right;"><div style="font-size:16px;font-weight:700;">'+sb+'</div><div style="font-size:11px;opacity:0.8;">Score: '+score+'/100</div></div>';
  h+='</div>';
  h+='<div style="background:'+tc.bg+';padding:11px 15px;display:flex;gap:14px;flex-wrap:wrap;border-bottom:1px solid '+tc.border+';">';
  h+='<div style="flex:1;min-width:120px;"><div style="font-size:10px;font-weight:700;color:'+tc.color+';text-transform:uppercase;margin-bottom:3px;">Source</div>';
  h+='<div style="font-size:13px;font-weight:500;">'+srcName+'</div>';
  if(srcUrl)h+='<a href="'+srcUrl+'" target="_blank" style="font-size:11px;color:#6b7280;">🔗 View Source</a>';
  h+='</div>';
  h+='<div style="flex:1;min-width:100px;"><div style="font-size:10px;font-weight:700;color:'+tc.color+';text-transform:uppercase;margin-bottom:3px;">Date Pulled</div><div style="font-size:13px;font-weight:500;">'+pd+'</div></div>';
  h+='<div style="flex:1;min-width:100px;"><div style="font-size:10px;font-weight:700;color:'+tc.color+';text-transform:uppercase;margin-bottom:3px;">Type</div><div style="font-size:13px;font-weight:500;">'+tc.label+'</div></div>';
  h+='<div style="flex:1;min-width:130px;"><div style="font-size:10px;font-weight:700;color:'+tc.color+';text-transform:uppercase;margin-bottom:4px;">Links</div>';
  if(lead.zillow_url)h+='<a href="'+lead.zillow_url+'" target="_blank" style="font-size:11px;background:#1277e1;color:#fff;padding:2px 7px;border-radius:4px;text-decoration:none;margin-right:4px;">Zillow</a>';
  if(lead.maps_url)h+='<a href="'+lead.maps_url+'" target="_blank" style="font-size:11px;background:#34a853;color:#fff;padding:2px 7px;border-radius:4px;text-decoration:none;margin-right:4px;">Maps</a>';
  if(lead.redfin_url)h+='<a href="'+lead.redfin_url+'" target="_blank" style="font-size:11px;background:#cc0000;color:#fff;padding:2px 7px;border-radius:4px;text-decoration:none;">Redfin</a>';
  h+='</div></div>';
  h+='<div style="background:#fff;padding:13px 15px;">';
  h+='<div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:9px;">🤖 Seller Approach Guide — '+tc.label+'</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">';
  h+='<div style="background:#f8fafc;border-radius:7px;padding:9px;"><div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px;">How to Approach</div><div style="font-size:12px;color:#1f2937;line-height:1.5;">'+tc.approach+'</div></div>';
  h+='<div style="background:#f8fafc;border-radius:7px;padding:9px;"><div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Opportunity</div><div style="font-size:12px;color:#1f2937;line-height:1.5;">'+tc.opportunity+'</div></div>';
  h+='</div>';
  h+='<div style="margin-bottom:10px;"><div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:5px;">Key Questions to Ask</div>';
  h+='<ol style="margin:0;padding-left:18px;display:grid;grid-template-columns:1fr 1fr;gap:1px;">'+qs(tc.questions)+'</ol></div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">';
  h+='<div style="background:#fef3c7;border-radius:7px;padding:9px;"><div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:3px;">Watch Out For</div><div style="font-size:12px;color:#78350f;line-height:1.5;">'+tc.risks+'</div></div>';
  h+='<div style="background:#f0fdf4;border-radius:7px;padding:9px;"><div style="font-size:10px;font-weight:700;color:#166534;text-transform:uppercase;margin-bottom:3px;">What to Look For</div><div style="font-size:12px;color:#14532d;line-height:1.5;">'+tc.opportunity+'</div></div>';
  h+='</div>';
  h+='<div style="display:flex;gap:7px;flex-wrap:wrap;">';
  h+='<button onclick="wosOpenComms&&wosOpenComms(\'' + lead.id + '\')" style="background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:6px 13px;font-size:12px;cursor:pointer;font-weight:600;">📡 Communications</button>';
  if(!lead.phone)h+='<button onclick="alert(\'Skip trace needed — add BatchData key to Railway env vars\')" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:6px;padding:6px 13px;font-size:12px;cursor:pointer;">📱 Skip Trace Needed</button>';
  h+='</div></div></div>';
  return h;
}
window.wosLeadDetailHTML=buildPanel;
window.wosShowLeadDetail=function(lead){
  window._currentLead=lead;
  var old=document.getElementById('wosLeadDetailPanel');
  if(old)old.remove();
  var modal=document.querySelector('.modal.show .modal-body,#leadModal .modal-body,[id*=lead-detail],.lead-detail-panel,#leadDetailContent');
  if(!modal)return;
  var div=document.createElement('div');
  div.innerHTML=buildPanel(lead);
  modal.insertBefore(div.firstChild,modal.firstChild);
};
var _orig=window.selectLead;
if(typeof _orig==='function'){
  window.selectLead=function(id){
    _orig.apply(this,arguments);
    setTimeout(function(){
      fetch('/api/leads/'+id).then(function(r){return r.json();}).then(function(lead){
        window._currentLead=lead;
        var old=document.getElementById('wosLeadDetailPanel');if(old)old.remove();
        var modal=document.querySelector('.modal.show .modal-body,#leadModal .modal-body');
        if(!modal)return;
        var div=document.createElement('div');div.innerHTML=buildPanel(lead);
        modal.insertBefore(div.firstChild,modal.firstChild);
      }).catch(function(){});
    },400);
  };
}
console.log('[wos-leads-detail] v2 loaded');
})();