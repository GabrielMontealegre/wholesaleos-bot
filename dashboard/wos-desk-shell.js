'use strict';
(function(root){
  if(document.body.dataset.wosDesign!=='marketplace')return;
  var key='wos_ui_scheme',scheme='dark';
  try{if(root.localStorage.getItem(key)==='light')scheme='light';}catch(_){}
  document.documentElement.dataset.wosScheme=scheme;
  var groups=[['Today',['dashboard','todays_deals','approvals','jv']],['Find',['leads']],['People',['buyers_found','gmail','followups']],['Close',['pipeline','contracts']]];
  function install(){
    var header=document.querySelector('.topbar'),menu=document.querySelector('.sidebar-nav');if(!header||!menu)return;
    // Move existing navigation nodes, retaining their handlers, badges and identity.
    var sidebar=document.querySelector('.sidebar');if(sidebar.dataset.deskInstalled)return;sidebar.dataset.deskInstalled='true';
    var items=Array.from(menu.querySelectorAll('.nav-item'));menu.querySelectorAll('.nav-section').forEach(el=>el.remove());
    groups.forEach(group=>{var nodes=group[1].flatMap(page=>items.filter(el=>el.getAttribute('onclick')?.includes("navigate('"+page+"',")));if(!nodes.length)return;var label=document.createElement('div');label.className='nav-section';label.textContent=group[0];menu.appendChild(label);nodes.forEach(el=>menu.appendChild(el));});
    var more=document.createElement('details');more.className='desk-more';var summary=document.createElement('summary');summary.textContent='More';summary.setAttribute('role','button');summary.setAttribute('aria-label','More tools');summary.title='Open legacy tools without crowding the main menu';more.appendChild(summary);
    var moreItems=document.createElement('div');moreItems.className='desk-more-items';moreItems.setAttribute('aria-label','More tools');
    var close=document.createElement('button');close.type='button';close.textContent='\u00d7';close.className='desk-panel-close';close.setAttribute('aria-label','Close more tools');close.title='Close more tools';close.addEventListener('click',()=>{more.open=false;summary.focus();});moreItems.appendChild(close);
    var email=document.createElement('a');email.href='/app?preview=1&view=email';email.textContent='Email workspace';email.className='desk-workspace-entry';email.title='Open Email in the new workspace';moreItems.appendChild(email);
    items.filter(el=>!groups.some(group=>group[1].some(page=>el.getAttribute('onclick')?.includes("navigate('"+page+"',")))).forEach(el=>moreItems.appendChild(el));
    var tools=sidebar.querySelector('.marketplace-tools');if(tools)moreItems.appendChild(tools);more.appendChild(moreItems);menu.appendChild(more);
    var account=document.createElement('details');account.className='desk-user-menu';var avatar=document.createElement('summary');avatar.textContent='Account';avatar.setAttribute('role','button');avatar.setAttribute('aria-label','User menu');avatar.title='Theme and sign out';account.appendChild(avatar);
    var accountPanel=document.createElement('div');accountPanel.className='desk-user-panel';account.appendChild(accountPanel);sidebar.appendChild(account);
    var accountClose=document.createElement('button');accountClose.type='button';accountClose.textContent='\u00d7';accountClose.className='desk-panel-close';accountClose.setAttribute('aria-label','Close account menu');accountClose.title='Close account menu';accountClose.addEventListener('click',()=>{account.open=false;avatar.focus();});accountPanel.appendChild(accountClose);
    var signout=sidebar.querySelector('button[onclick*="signOutDashboard"]');if(signout)accountPanel.appendChild(signout);
    var bell=header.querySelector('.notif-bell')||sidebar.querySelector('.notif-bell');if(bell&&bell.parentElement!==header)header.appendChild(bell);
    if(bell){bell.setAttribute('role','button');bell.tabIndex=0;bell.setAttribute('aria-label','Notifications');bell.title='Notifications';}
    var gear=document.createElement('button');gear.type='button';gear.className='desk-settings';gear.textContent='\u2699';gear.title='Settings';gear.setAttribute('aria-label','Settings');gear.addEventListener('click',()=>root.navigate('settings',null));header.appendChild(gear);
    var label=document.createElement('label');label.className='desk-scheme';var input=document.createElement('input');input.type='checkbox';input.setAttribute('role','switch');input.checked=scheme==='light';input.setAttribute('aria-label','Light mode');
    input.addEventListener('change',()=>{scheme=input.checked?'light':'dark';document.documentElement.dataset.wosScheme=scheme;try{root.localStorage.setItem(key,scheme);}catch(_){}});
    label.appendChild(input);label.appendChild(document.createTextNode('Light mode'));accountPanel.prepend(label);
    document.addEventListener('click',event=>{if(event.target.closest('.nav-item'))more.open=false;if(!account.contains(event.target))account.open=false;});
    document.addEventListener('keydown',event=>{if(event.target===bell&&['Enter',' '].includes(event.key)){event.preventDefault();bell.click();}if(event.key==='Escape'){if(more.open){more.open=false;summary.focus();}if(account.open){account.open=false;avatar.focus();}}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);
