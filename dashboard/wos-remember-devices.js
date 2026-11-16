'use strict';
(function(root){
  const endpoint='/api/auth/devices';
  let generation=0,reads=0,rows=[],busy=false,ready=false,message='',controllers=new Set();
  const allowed=()=>root.APP?.unlocked===true&&!!root.APP?.currentUser?.id;
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>'<img src="/dashboard/workspace/vendor/lucide-1.60.0/'+name+'.svg" width="20" height="20" alt="" aria-hidden="true">';
  function validTime(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;}
  function validRows(value){return Array.isArray(value)&&new Set(value.map(r=>r?.id)).size===value.length&&value.filter(r=>r?.current===true).length<=1&&value.every(r=>r&&Object.keys(r).sort().join(',')==='active,created_at,current,expires_at,id,revoked_at'&&/^[a-f0-9]{32}$/.test(r.id)&&validTime(r.created_at)&&validTime(r.expires_at)&&r.expires_at>r.created_at&&(r.revoked_at===null||validTime(r.revoked_at))&&typeof r.active==='boolean'&&typeof r.current==='boolean'&&(!r.current||r.active)&&(!r.active||r.revoked_at===null));}
  function stamp(value){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));}
  function clear(){generation++;controllers.forEach(c=>c.abort());controllers.clear();rows=[];ready=false;busy=false;message='';}
  const alive=t=>t===generation&&allowed()&&!document.hidden&&!!document.getElementById('remembered-device-settings');
  function markup(){return '<section id="remembered-device-settings" class="rd-settings" aria-label="Remembered devices"><header><h2>Remembered devices</h2><button type="button" data-device-refresh title="Refresh remembered devices" aria-label="Refresh remembered devices"'+(busy?' disabled':'')+'>'+icon('refresh-cw')+'</button></header><p role="status">'+esc(message)+'</p><ul>'+rows.map((row,i)=>'<li><div><strong>'+(row.current?'This device':'Remembered device')+'</strong><span>Added '+esc(stamp(row.created_at))+'</span><span>'+(row.revoked_at?'Forgotten '+esc(stamp(row.revoked_at)):row.active?'Expires '+esc(stamp(row.expires_at)):'Expired '+esc(stamp(row.expires_at)))+'</span></div>'+(row.active?'<button type="button" data-device-forget="'+i+'" title="Forget '+(row.current?'this':'remembered')+' device"'+(busy?' disabled':'')+'>'+icon('log-out')+'<span>Forget</span></button>':'')+'</li>').join('')+'</ul>'+(ready&&!rows.length?'<p>No remembered devices.</p>':'')+'</section>';}
  function paint(){const node=document.getElementById('remembered-device-settings');if(!node)return;if(!allowed()){clear();node.textContent='Sign in to review remembered devices.';return;}node.outerHTML=markup();}
  function lock(){clear();root.WOSDashboardAuth?.lockIdentity(root.APP);if(typeof root.showDashboardLogin==='function')root.showDashboardLogin('Sign in again.');else paint();}
  async function request(suffix='',method='GET'){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);controllers.add(controller);
    try{const response=await fetch(endpoint+suffix,{method,credentials:'include',cache:'no-store',headers:method==='POST'?{'X-WOS-Device-Action':'1'}:{},signal:controller.signal});return{response,value:await response.json()};}
    finally{clearTimeout(timer);controllers.delete(controller);}
  }
  async function load(keepMessage=false){
    if(busy||!allowed()||!document.getElementById('remembered-device-settings'))return;
    const t=generation,read=++reads;ready=false;rows=[];if(!keepMessage)message='Loading remembered devices...';paint();
    try{const result=await request();if(!alive(t)||read!==reads)return;if(result.response.status===401){lock();return;}if(!result.response.ok||result.value?.ok!==true||!validRows(result.value.devices))throw Error();rows=result.value.devices;ready=true;if(!keepMessage)message='';}
    catch{if(alive(t)&&read===reads)message='Remembered devices unavailable.';}
    finally{if(alive(t)&&read===reads)paint();}
  }
  async function forget(index){
    const row=rows[index];if(!ready||busy||!row?.active||!allowed())return;const t=generation;busy=true;message='Forgetting device...';paint();
    try{const result=await request('/'+row.id+'/revoke','POST');if(!alive(t))return;if(result.response.status===401){lock();return;}if(!result.response.ok||result.value?.ok!==true||typeof result.value.current_device!=='boolean'||result.value.current_device!==row.current)throw Error();if(result.value.current_device){lock();return;}message='Device forgotten.';}
    catch{if(alive(t))message='Result unavailable. Refresh remembered devices.';}
    finally{if(alive(t)){busy=false;await load(true);document.querySelector('[data-device-refresh]')?.focus();}}
  }
  const previous=root.renderSettings;if(typeof previous!=='function')return;
  root.renderSettings=function(){clear();const original=previous.apply(this,arguments);if(!allowed())return original;message='Loading remembered devices...';setTimeout(()=>load(),0);return markup()+original;};
  document.addEventListener('click',event=>{const button=event.target.closest('#remembered-device-settings button');if(!button)return;if(button.hasAttribute('data-device-refresh'))load();else if(button.hasAttribute('data-device-forget'))forget(Number(button.dataset.deviceForget));});
  new MutationObserver(()=>{if((ready||controllers.size)&&!document.getElementById('remembered-device-settings'))clear();}).observe(document.body,{childList:true,subtree:true});
  const signout=root.signOutDashboard;if(signout)root.signOutDashboard=function(){clear();return signout.apply(this,arguments);};
  root.addEventListener('pagehide',clear);root.addEventListener('wos:session-ended',()=>{clear();paint();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clear();paint();}else if(document.getElementById('remembered-device-settings'))load();});
})(window);
