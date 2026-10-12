'use strict';
(function(root){
  if(document.body.dataset.wosDesign!=='marketplace')return;
  var key='wos_ui_scheme',scheme='dark';
  try{if(root.localStorage.getItem(key)==='light')scheme='light';}catch(_){}
  document.documentElement.dataset.wosScheme=scheme;
  var groups=[['Today',['dashboard','todays_deals']],['Leads',['leads','search','states','findme_scout','morning_call_desk','review']],['Buyers',['buyers_found','buyers','matching']],['Outreach',['gmail','followups','calendar','outreach','sms','dialer']],['Deals',['jv','pipeline','assignments','contracts','ai_deal_analyzer']],['Admin',['settings','users','apis','bot','drive','automation','contracts_lib','import','record_activity','glossary']]];
  function install(){
    var header=document.querySelector('.topbar'),menu=document.querySelector('.sidebar-nav');if(!header||!menu)return;
    // Move existing navigation nodes, retaining their handlers, badges and identity.
    var items=Array.from(menu.querySelectorAll('.nav-item'));menu.querySelectorAll('.nav-section').forEach(el=>el.remove());
    groups.forEach(group=>{var nodes=items.filter(el=>group[1].some(page=>el.getAttribute('onclick')?.includes("navigate('"+page+"',")));if(!nodes.length)return;var label=document.createElement('div');label.className='nav-section';label.textContent=group[0];menu.appendChild(label);nodes.forEach(el=>menu.appendChild(el));});
    var gear=document.createElement('button');gear.type='button';gear.className='desk-settings';gear.textContent='\u2699';gear.title='Settings';gear.setAttribute('aria-label','Settings');gear.addEventListener('click',()=>root.navigate('settings',null));header.appendChild(gear);
    var label=document.createElement('label');label.className='desk-scheme';var input=document.createElement('input');input.type='checkbox';input.setAttribute('role','switch');input.checked=scheme==='light';input.setAttribute('aria-label','Light mode');
    input.addEventListener('change',()=>{scheme=input.checked?'light':'dark';document.documentElement.dataset.wosScheme=scheme;try{root.localStorage.setItem(key,scheme);}catch(_){}});
    label.appendChild(input);label.appendChild(document.createTextNode('Light mode'));(document.querySelector('.sidebar-header')||document.querySelector('.sidebar')).appendChild(label);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);
