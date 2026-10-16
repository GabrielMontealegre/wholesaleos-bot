'use strict';
(function(root){
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function time(v,data,clock){return v&&clock?clock.formatTime(v,data.now):'';}
  function money(value){return Number.isFinite(value)?'$'+value.toLocaleString('en-US',{maximumFractionDigits:0}):'';}
  function groupActions(actions,today){
    function day(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
    return {overdue:actions.filter(a=>day(today)&&day(a.due_date)&&a.due_date<today),current:actions.filter(a=>!(day(today)&&day(a.due_date)&&a.due_date<today))};
  }
  function markup(data,{clock,error='',busy=false,overdueExpanded=false}={}){
    const head='<header class="today-heading"><div><h2>Today</h2>'+(data?'<p>Checked '+esc(time(data.now,data,clock))+'</p>':'')+'</div><button type="button" data-today-refresh'+(busy?' disabled':'')+' title="Reload recorded work; no collection or messages">Refresh</button></header>';
    if(!data)return '<section id="wos-today-workspace" class="today-workspace">'+head+'<p role="status">'+esc(error||'Loading your recorded work...')+'</p></section>';
    const kpis=[['replies','Replies waiting'],['approvals','Approvals'],['followups','Follow-ups due'],['deadlines','Deadlines this week']];
    const groups=groupActions(data.actions,data.today);
    const rows=list=>list.map(a=>'<li><div><strong>'+esc(a.label)+'</strong>'+(a.ref?'<span>'+esc(a.ref)+'</span>':'')+(a.due_date&&clock?'<small>Due '+esc(clock.formatDate(a.due_date))+'</small>':'')+'</div><button type="button" data-today-action="'+esc(a.key)+'" title="Open the recorded '+esc(a.kind)+'; nothing is sent or approved">'+esc(a.action_label)+'</button></li>').join('');
    const overdue=groups.overdue.length?'<details class="today-overdue"'+(overdueExpanded?' open':'')+'><summary>Overdue (<span data-today-overdue-count>'+groups.overdue.length+'</span>)</summary><ul class="today-list">'+rows(groups.overdue)+'</ul></details>':'';
    const best=data.best_deals.map(d=>'<li><button type="button" data-today-deal="'+esc(d.id)+'" title="Open the reviewed deal; this is not an offer"><strong>'+esc(d.heading||d.location||d.ref)+'</strong><span>'+esc(d.ref)+'</span><span title="Interim grade: operator-reviewed deal, real reviewed value, matched approved buyer, at least $10,000 calculated room and three days to deadline. Gold is missing exactly one criterion.">'+esc(d.grade)+' - Interim grade</span><span>'+esc(d.buyer_count)+' approved buyers match</span>'+(money(d.asking)?'<span>Asking '+esc(money(d.asking))+'</span>':'')+(d.value_range&&money(d.value_range.low)&&money(d.value_range.high)?'<span>'+esc(d.value_tier)+' value '+esc(money(d.value_range.low))+' to '+esc(money(d.value_range.high))+' ('+esc(d.comp_count)+' comps)</span>':'')+'<span>'+esc(money(d.spread))+' estimated share before closing costs</span><small>Deadline '+esc(clock?clock.formatDate(d.deadline):'')+'</small></button></li>').join('');
    const recent=data.last_24h.map(e=>'<li><div><strong title="'+esc(e.reported?'Recorded report; not proof that an email was delivered.':'Verified deployment record; linked pull request.')+'">'+esc(e.label)+'</strong>'+(e.ref?'<span>'+esc(e.ref)+'</span>':'')+'<small>'+esc(time(e.at,data,clock))+'</small></div>'+(e.source_url?'<a href="'+esc(e.source_url)+'" target="_blank" rel="noopener noreferrer">Open release</a>':e.target?'<button type="button" data-today-record="'+esc(e.key)+'">Open record</button>':'<button type="button" data-today-history>Open activity</button>')+'</li>').join('');
    return '<section id="wos-today-workspace" class="today-workspace">'+head+
      '<div class="today-kpis">'+kpis.map(([key,label])=>'<button type="button" data-today-filter="'+key+'"><span>'+label+'</span><strong>'+esc(data.counts[key])+'</strong></button>').join('')+'</div>'+
      '<div class="today-main"><section class="today-actions"><h3>Your action queue <span>'+data.actions.length+'</span></h3><button type="button" data-today-approval-page>Open approvals</button>'+overdue+'<ul class="today-list">'+(rows(groups.current)||(!data.actions.length?'<li>No recorded work needs your action today.</li>':''))+'</ul><p data-today-empty hidden>No work in this category.</p></section>'+
      '<div class="today-columns"><section><h3>Best deals today</h3><ul class="today-best">'+(best||'<li>No reviewed Diamond or Gold deals have a positive calculated spread and a current deadline.</li>')+'</ul></section>'+
      '<section><h3>Last 24 hours</h3><button type="button" data-today-history title="Open the complete recorded activity log">Open activity</button><ul class="today-list today-recent">'+(recent||'<li>No recorded activity in the last 24 hours.</li>')+'</ul></section></div></div>'+
      '<footer class="today-coverage">Email activity: recorded reports, not delivery proof. Records-request and routine-result feeds are not connected.</footer><p role="status" data-today-status>'+esc(error)+'</p></section>';
  }
  const api={markup,groupActions};if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}
  root.wosTodayWorkspace=api;
  if(root.wosDashboardFeatures?.todayActionCenter!==true)return;
  let data=null,busy=false,error='',checked=0,filter='',sequence=0,overdueExpanded=false;
  function paint(){const el=document.getElementById('wos-today-workspace');if(el){const group=el.querySelector('.today-overdue');if(group)overdueExpanded=group.open;el.outerHTML=markup(data,{clock:root.wosCardClock,error,busy,overdueExpanded});applyFilter();}}
  function applyFilter(){const el=document.getElementById('wos-today-workspace');if(!el||!data)return;let shown=0,overdueShown=0;el.querySelectorAll('[data-today-action]').forEach(b=>{const a=data.actions.find(a=>a.key===b.dataset.todayAction);const fits=!filter||filter==='replies'&&a.kind==='conversation'&&a.conversation?.status==='hot'||filter==='approvals'&&a.label.includes('approval')||filter==='followups'&&a.label==='Follow-up due'||filter==='deadlines'&&a.label==='Deadline within seven days';b.closest('li').hidden=!fits;if(fits){shown++;if(b.closest('.today-overdue'))overdueShown++;}});const group=el.querySelector('.today-overdue');if(group){group.hidden=overdueShown===0;group.querySelector('[data-today-overdue-count]').textContent=overdueShown;}el.querySelector('[data-today-empty]').hidden=!filter||shown>0;el.querySelectorAll('[data-today-filter]').forEach(b=>b.setAttribute('aria-pressed',String(filter===b.dataset.todayFilter)));}
  async function load(force=false){if(busy||!document.getElementById('wos-today-workspace')||!force&&checked&&Date.now()-checked<30000)return;const ticket=++sequence;busy=true;error='';paint();try{const r=await fetch('/api/dashboard/today-workspace'),v=await r.json();if(ticket!==sequence)return;if(!r.ok||v.source_kind!=='derived_workflow'||!Array.isArray(v.actions)||!Array.isArray(v.best_deals)||!Array.isArray(v.last_24h)||!v.counts)throw Error();data=v;checked=Date.now();}catch{if(ticket===sequence){data=null;checked=0;error='Today is unavailable. Check your login, then refresh.';}}finally{if(ticket===sequence){busy=false;paint();}}}
  const signout=root.signOutDashboard;if(signout)root.signOutDashboard=function(){++sequence;data=null;checked=0;busy=false;error='Dashboard login required.';document.getElementById('today-conversation-dialog')?.close();paint();return signout.apply(this,arguments);};
  root.renderDashboard=function(){setTimeout(()=>load(),0);return markup(data,{clock:root.wosCardClock,error,busy,overdueExpanded})+'<details class="today-tools"><summary>Conversation tools</summary>'+root.renderConversationTools()+'</details>';};
  function openConversation(c,context=data){
    const old=document.getElementById('today-conversation-dialog');if(old)old.remove();const dialog=document.createElement('dialog');dialog.id='today-conversation-dialog';dialog.className='today-dialog';
    dialog.innerHTML='<button type="button" data-today-close aria-label="Close conversation">Close</button><h2>Recorded conversation</h2>'+root.wosConversationCards.render(c,{clock:root.wosCardClock,roleChip:root.wosRoleChip,roleColor:root.wosRoleColor,now:context.now,today:context.today});
    document.body.appendChild(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove());
  }
  api.openConversation=(row,context)=>{if(root.APP?.unlocked&&root.APP.currentUser?.role==='admin')openConversation(row,context);};
  function openRecord(target){
    if(target.kind==='deal')root.openReviewedDeal(target.id);
    else if(target.kind==='match'&&target.deal_id)root.openReviewedDeal(target.deal_id);
    else if(target.kind==='buyer'&&target.assistant_find)root.openBuyerFind(target.id);
    else if(target.kind==='buyer')root.openBuyerDetail(target.id);
    else if(target.kind==='lead')root.openLeadModal(target.id);
    else root.navigate('record_activity',null);
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-today-approval-page]')){root.navigate('approvals',null);return;}
    if(e.target.closest('[data-today-refresh]')){load(true);return;}
    const f=e.target.closest('[data-today-filter]');if(f){filter=filter===f.dataset.todayFilter?'':f.dataset.todayFilter;applyFilter();document.querySelector('.today-actions')?.scrollIntoView({block:'start'});return;}
    if(e.target.closest('[data-today-close]')){document.getElementById('today-conversation-dialog')?.close();return;}
    if(e.target.closest('[data-today-history]')){root.navigate('record_activity',null);return;}
    const d=e.target.closest('[data-today-deal]');if(d){root.openReviewedDeal(d.dataset.todayDeal);return;}
    const r=e.target.closest('[data-today-record]');if(r&&data){const item=data.last_24h.find(item=>item.key===r.dataset.todayRecord);if(item?.target)openRecord(item.target);return;}
    const b=e.target.closest('[data-today-action]');if(!b||!data)return;const a=data.actions.find(a=>a.key===b.dataset.todayAction);if(!a)return;
    if(a.kind==='conversation')openConversation(a.conversation);else if(a.kind==='deal')root.openReviewedDeal(a.record_id);else if(a.kind==='buyer')root.openBuyerFind(a.record_id);
  });
  root.wosTodayWorkspace=api;
})(typeof window==='undefined'?{}:window);
