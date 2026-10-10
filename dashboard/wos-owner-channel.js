'use strict';
(function(root){
 var state=null,busy=false;
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function markup(){return '<section id="owner-channel-panel"><h3>Owner notifications</h3><p data-owner-channel-status>'+esc(state?.status||'Not checked')+'</p><p data-owner-channel-schedule>'+esc(!state||typeof state.configured!=='boolean'?'':!state.configured?'Daily briefing unavailable: Telegram is not configured.':state.schedule?.enabled?'Daily briefing: 7:00 AM (UTC-7)':'Scheduled daily briefing is disabled by the existing background setting.')+'</p><button type="button" data-owner-channel-refresh title="Refresh owner notification status" aria-label="Refresh owner notification status"'+(busy?' disabled':'')+'>\u21bb</button></section>';}
 function paint(){var panel=document.querySelector('#owner-channel-panel');if(panel)panel.outerHTML=markup();}
 async function refresh(){if(busy)return;busy=true;paint();try{var r=await fetch('/api/dashboard/operator-channel-status');var v=await r.json();if(!r.ok||typeof v.configured!=='boolean'||typeof v.status!=='string'||typeof v.schedule?.enabled!=='boolean')throw Error('unavailable');state=v;}catch{state={status:'Status unavailable. Check your admin session.'};}finally{busy=false;paint();}}
 var previous=root.renderSettings;root.renderSettings=function(){setTimeout(refresh,0);return markup()+previous();};
 document.addEventListener('click',e=>{if(e.target.closest('[data-owner-channel-refresh]'))refresh();});
})(window);
