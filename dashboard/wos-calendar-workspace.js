'use strict';
(function(root){
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function day(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v?v:'';}
  function label(v){return day(v)?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z')):'Date not recorded';}
  function visible(data,{mode='today',selected='',type=''}={}){
    return (data?.events||[]).filter(e=>(!type||e.type===type)&&(mode==='all'||mode==='month'&&e.day.slice(0,7)===selected.slice(0,7)||mode==='day'&&e.day===selected||mode==='today'&&(e.day===data.today||['due','pending'].includes(e.state)&&e.day<data.today)));
  }
  function markup(data,state={}){
    const {mode='today',selected='',type='',busy=false,error=''}=state;
    const head='<header class="calendar-head"><h2>Calendar</h2><div><button type="button" data-cal-add>+ Add Event</button><button type="button" data-cal-refresh'+(busy?' disabled':'')+' title="Reload stored activity only">Refresh</button></div></header>';
    if(!data)return '<section id="wos-calendar-workspace" class="calendar-workspace">'+head+'<p role="status">'+esc(error||'Loading recorded activity...')+'</p></section>';
    const list=visible(data,state),types=data.types||{};
    const brief='<div class="calendar-brief"><button type="button" data-cal-yesterday><strong>'+data.brief.yesterday_done+'</strong> Yesterday we did</button><button type="button" data-cal-today><strong>'+data.brief.today_due+'</strong> Today follow up with</button></div>';
    const filters='<div class="calendar-controls"><div role="group" aria-label="Calendar view">'+[['today','Today'],['month','Month'],['all','All recorded']].map(([key,name])=>'<button type="button" data-cal-mode="'+key+'" aria-pressed="'+(mode===key)+'">'+name+'</button>').join('')+'</div><label>Type<select data-cal-type><option value="">All types</option>'+Object.entries(types).map(([key,name])=>'<option value="'+esc(key)+'"'+(type===key?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label><label>Day<input type="date" data-cal-day value="'+esc(selected||data.today)+'"></label></div>';
    let grid='';
    if(mode==='month'){
      const month=(day(selected)||data.today).slice(0,7),first=new Date(month+'-01T12:00:00Z'),count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
      grid='<div class="calendar-month-head"><button type="button" data-cal-shift="-1" aria-label="Previous month">Prev</button><h3>'+esc(new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(first))+'</h3><button type="button" data-cal-shift="1" aria-label="Next month">Next</button></div><div class="calendar-month" aria-label="Recorded events by day">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(v=>'<span>'+v+'</span>').join('')+Array.from({length:first.getUTCDay()},()=>'<span></span>').join('')+Array.from({length:count},(_,i)=>{const d=month+'-'+String(i+1).padStart(2,'0'),n=list.filter(e=>e.day===d).length;return '<button type="button" data-cal-date="'+d+'"'+(d===data.today?' aria-current="date"':'')+' aria-label="'+esc(label(d)+', '+n+' events')+'"><b>'+(i+1)+'</b>'+(n?'<small>'+n+'<span> events</span></small>':'')+'</button>';}).join('')+'</div>';
    }
    const groups=new Map();for(const e of list){if(!groups.has(e.day))groups.set(e.day,[]);groups.get(e.day).push(e);}
    const rows=[...groups].map(([d,events])=>'<section class="calendar-day-group"><h3>'+esc(label(d))+'</h3><ul>'+events.map(e=>'<li><button type="button" class="calendar-event" data-cal-event="'+esc(e.key)+'"><span class="calendar-type calendar-'+esc(e.type)+'">'+esc(types[e.type]||'Note')+'</span><strong>'+esc(e.person||e.label||e.title)+'</strong><span>'+esc(e.title)+'</span><small>'+esc(e.at&&root.wosCardClock?root.wosCardClock.formatTime(e.at,data.now):e.day<data.today&&['due','pending'].includes(e.state)?'Overdue':e.state==='recorded'?'Time not recorded':'Date only')+'</small></button></li>').join('')+'</ul></section>').join('');
    return '<section id="wos-calendar-workspace" class="calendar-workspace">'+head+brief+filters+'<p role="status">'+esc(error||(list.length+' of '+data.total+' recorded or scheduled items.'))+'</p><div class="calendar-content">'+grid+(mode==='day'?'<h3>'+esc(label(selected))+'</h3>':'')+(rows||'<p>No recorded work in this view. Choose All recorded or add a manual event.</p>')+'</div><footer>Activity reports are not delivery or closing proof. Reminders use recorded conversations; nothing is sent automatically.</footer></section>';
  }
  const api={markup,visible};if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}
  let data=null,busy=false,error='',sequence=0,state={mode:'today',selected:'',type:''};
  function paint(){const el=document.getElementById('wos-calendar-workspace');if(el)el.outerHTML=markup(data,{...state,busy,error});}
  function localEvents(v){
    const events=v.events.slice(),known=new Set(events.filter(e=>e.source_kind==='operator_calendar').map(e=>e.source_id));
    for(const e of root.APP?.calendar||[])if(day(e.date)&&!known.has(String(e.id))){known.add(String(e.id));events.push({key:'local:'+String(e.id),type:({call:'call',close:'closing',follow:'followup',offer:'offer'})[e.type]||'note',day:e.date,at:null,state:'scheduled',title:e.title||'Manual event',summary:e.notes||'',label:'This browser calendar',source_kind:'local_operator_calendar',source_field:'APP.calendar',target:null,reported:true});}
    events.sort((a,b)=>a.day.localeCompare(b.day)||(a.at||'').localeCompare(b.at||''));return {...v,events,total:events.length};
  }
  async function load(){
    if(!document.getElementById('wos-calendar-workspace'))return;const ticket=++sequence;busy=true;error='';paint();
    try{const r=await fetch('/api/dashboard/calendar-workspace',{cache:'no-store'}),v=await r.json();if(ticket!==sequence)return;if(!r.ok||v.source_kind!=='derived_workflow'||!day(v.today)||!Array.isArray(v.events)||!v.brief||!v.types||!Array.isArray(v.conversations))throw Error();data=localEvents(v);if(!state.selected)state.selected=v.today;}
    catch{if(ticket===sequence){data=null;error='Calendar unavailable. Check your login, then refresh. Nothing was changed.';document.getElementById('calendar-event-dialog')?.close();}}
    finally{if(ticket===sequence){busy=false;paint();}}
  }
  root.renderCalendar=function(){setTimeout(load,0);return markup(data,{...state,busy,error});};
  const signout=root.signOutDashboard;if(signout)root.signOutDashboard=function(){++sequence;data=null;busy=false;error='Dashboard login required.';document.getElementById('calendar-event-dialog')?.close();paint();return signout.apply(this,arguments);};
  function openRecord(t){if(t.kind==='deal'||t.kind==='match')root.openReviewedDeal(t.kind==='match'?t.deal_id:t.id);else if(t.kind==='buyer')t.assistant_find?root.openBuyerFind(t.id):root.openBuyerDetail(t.id);else if(t.kind==='lead')root.openLeadModal(t.id);}
  function openConversation(row){
    if(root.wosTodayWorkspace?.openConversation){root.wosTodayWorkspace.openConversation(row,data);return;}
    if(!root.wosConversationCards?.render)return;
    const dialog=document.createElement('dialog');dialog.id='calendar-event-dialog';dialog.className='calendar-dialog';
    dialog.innerHTML='<button type="button" data-cal-close aria-label="Close calendar event" title="Close">X</button><h2>Recorded conversation</h2>'+root.wosConversationCards.render(row,{clock:root.wosCardClock,roleChip:root.wosRoleChip,roleColor:root.wosRoleColor,now:data.now,today:data.today});
    document.body.appendChild(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove());
  }
  function detail(key){
    const e=data?.events.find(e=>e.key===key);if(!e||!root.APP?.unlocked||root.APP.currentUser?.role!=='admin')return;
    document.getElementById('calendar-event-dialog')?.remove();const dialog=document.createElement('dialog');dialog.id='calendar-event-dialog';dialog.className='calendar-dialog';
    const conversation=data.conversations.find(c=>c.id===e.conversation_id);
    const origin=({imported_report:'Assistant activity report',recorded_activity:'Recorded activity log',derived_workflow:'Recorded workflow',connected_mailbox:'Saved linked mailbox receipt',source_record:'Property source record',operator_calendar:'Manual calendar event',local_operator_calendar:'Manual event in this browser'})[e.source_kind]||'Recorded source';
    dialog.innerHTML='<button type="button" data-cal-close aria-label="Close calendar event" title="Close">X</button><h2>'+esc(e.title)+'</h2><h3>'+esc(e.person||e.label)+'</h3><p>'+esc(label(e.day))+'</p>'+(e.summary?'<p>'+esc(e.summary)+'</p>':'')+(conversation?.next_step?'<h3>Next step</h3><p>'+esc(conversation.next_step)+'</p>':'')+'<p>'+esc(e.derived?'Derived reminder, not a recorded action':e.reported?'Reported, not independently verified':'Saved linked mailbox receipt')+'</p><small>'+esc(origin)+'</small>'+(e.reminder_basis?'<p>'+esc(e.reminder_basis)+'</p>':'')+'<div class="calendar-detail-actions">'+(e.target?'<button type="button" data-cal-record="'+esc(key)+'">Open '+(e.target.kind==='buyer'?'buyer':e.target.kind==='lead'?'lead':'deal')+'</button>':'')+(conversation?'<button type="button" data-cal-conversation="'+esc(key)+'">Open conversation</button><button type="button" data-cal-followup="'+esc(key)+'">Prepare follow-up</button>':'')+(e.state==='pending'?'<button type="button" data-cal-approvals>Open approvals</button>':'')+(e.source_url?'<a href="'+esc(e.source_url)+'" target="_blank" rel="noopener noreferrer">Open source</a>':'')+'</div>';
    document.body.appendChild(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove());
  }
  document.addEventListener('change',e=>{if(e.target.matches('[data-cal-type]')){state.type=e.target.value;paint();}if(e.target.matches('[data-cal-day]')&&day(e.target.value)){state.selected=e.target.value;state.mode='day';paint();}});
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-cal-close]')){document.getElementById('calendar-event-dialog')?.close();return;}
    if(e.target.closest('[data-cal-add]')){root.openAddEvent(state.selected||data?.today);return;}
    if(e.target.closest('[data-cal-refresh]')){load();return;}
    if(e.target.closest('[data-cal-approvals]')){document.getElementById('calendar-event-dialog')?.close();root.navigate('approvals',null);return;}
    const mode=e.target.closest('[data-cal-mode]');if(mode){state.mode=mode.dataset.calMode;if(state.mode==='today'&&data)state.selected=data.today;paint();return;}
    if(e.target.closest('[data-cal-today]')){state.mode='today';state.type='';if(data)state.selected=data.today;paint();return;}
    if(e.target.closest('[data-cal-yesterday]')&&data){state.mode='day';state.selected=data.yesterday;state.type='';paint();return;}
    const shift=e.target.closest('[data-cal-shift]');if(shift&&data){const d=new Date((state.selected||data.today).slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+Number(shift.dataset.calShift));state.selected=d.toISOString().slice(0,10);paint();return;}
    const dateButton=e.target.closest('[data-cal-date]');if(dateButton){state.selected=dateButton.dataset.calDate;state.mode='day';paint();return;}
    const event=e.target.closest('[data-cal-event]');if(event){detail(event.dataset.calEvent);return;}
    const record=e.target.closest('[data-cal-record]');if(record){const item=data?.events.find(x=>x.key===record.dataset.calRecord);document.getElementById('calendar-event-dialog')?.close();if(item?.target)openRecord(item.target);return;}
    const c=e.target.closest('[data-cal-conversation],[data-cal-followup]');if(c){const item=data?.events.find(x=>x.key===(c.dataset.calConversation||c.dataset.calFollowup)),row=data?.conversations.find(x=>x.id===item?.conversation_id);if(row&&root.APP?.unlocked&&root.APP.currentUser?.role==='admin'){document.getElementById('calendar-event-dialog')?.close();openConversation(row);}return;}
  });
  root.wosCalendarWorkspace=api;
})(typeof window==='undefined'?{}:window);
