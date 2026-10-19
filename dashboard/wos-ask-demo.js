'use strict';
(function(root){
  let data=null,response=null,question='',busy=false,message='',sequence=0,controller=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const actor=()=>root.APP?.unlocked&&root.APP?.currentUser?.role==='admin'&&root.APP.currentUser.id;
  const money=v=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v):'Not recorded';
  const range=v=>v?money(v.low)+' to '+money(v.high):'Not established';
  const time=v=>v&&Number.isFinite(Date.parse(v))?new Intl.DateTimeFormat('en-US',{timeZone:'America/Mazatlan',weekday:'short',hour:'numeric',minute:'2-digit'}).format(new Date(v)):'Not recorded';
  const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))?new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'}).format(new Date(v+'T12:00:00Z')):'Not recorded';
  function clear(){++sequence;controller?.abort();controller=null;data=null;response=null;question='';message='';busy=false;root.wosLocalVoice?.cancel();document.getElementById('wos-ask-panel')?.remove();}
  function context(row){
    if(!row)return '';
    const conversations=data.conversations.filter(c=>row.ref&&c.refs.includes(row.ref)).slice(0,5);
    const activity=data.events.filter(e=>e.target?.kind===row.kind&&e.target?.id===row.id).slice(-5).reverse();
    return '<aside class="ask-context" aria-label="Recorded context"><h3>'+esc(row.name)+'</h3><small>'+esc(row.ref)+' / Recorded dashboard data</small>'+
      (row.kind==='deal'?'<p><strong>Recorded stage: '+esc(row.stage)+'</strong></p><p>Current status: '+esc(row.status_label)+'</p>'+(row.address_withheld?'<p>Street address withheld until the existing signed-evidence gate passes.</p>':'')+
        '<ol class="ask-stages">'+row.stages.map(s=>'<li'+(s.recorded?' class="ask-recorded"':'')+'>'+esc(s.label)+(s.recorded?' (recorded)':' (not recorded)')+'</li>').join('')+'</ol>'+
        '<dl><dt>Asking</dt><dd>'+money(row.asking)+'</dd><dt>Value after repairs</dt><dd>'+range(row.value_range)+' / '+esc(row.value_tier)+' / '+row.comp_count+' reviewed comps</dd><dt>Repairs</dt><dd>'+money(row.repair_estimate)+'</dd><dt>Our offer</dt><dd>Not established by this view</dd></dl>'+
        '<h4>Canonical buyer matches</h4><p>Showing '+row.matches.length+' of '+row.match_total+'</p>'+(row.matches.length?'<ul>'+row.matches.map(m=>'<li>'+esc(m.name)+' / Buyer max '+money(m.max_price)+' / Estimated room '+range(m.spread)+'</li>').join('')+'</ul>':'<p>No matching buyer in this snapshot.</p>')+'<p>A buy-box match is not a confirmed purchase or proof of funds.</p>':'<p>Approval: '+esc(row.approval||'Not recorded')+'</p><p>Areas: '+esc(row.areas.join(', ')||row.states.join(', ')||'Not recorded')+'</p><p>'+esc(row.criteria||'Buying criteria not recorded')+'</p><p>Proof of funds: '+esc(row.proof_of_funds)+'</p>')+
      '<h4>Next recorded step</h4><p>'+esc(row.next_step)+'</p>'+(row.why?'<p>Reason: '+esc(row.why)+'</p>':'')+'<h4>Conversation reports</h4>'+(conversations.length?conversations.map(c=>'<p>'+esc(c.person)+': '+esc(c.what_they_said||'No reply text recorded')+'<br>Next: '+esc(c.next_step||'Not recorded')+' / Due: '+esc(day(c.due_date))+'</p>').join(''):'<p>No uniquely linked conversation report loaded.</p>')+
      '<h4>Recent recorded activity</h4>'+(activity.length?'<ul>'+activity.map(e=>'<li>'+esc(e.title)+' / '+esc(time(e.at))+'<br>'+esc(e.summary||'')+'</li>').join('')+'</ul>':'<p>No linked recorded activity loaded.</p>')+
      '<button type="button" data-ask-record="'+esc(row.id)+'" data-ask-kind="'+row.kind+'">Open '+row.kind+' workspace</button></aside>';
  }
  function markup(){return '<header><div><h2>Ask WholesaleOS</h2><p>Read-only demo / Feed incomplete</p></div><button type="button" data-ask-close aria-label="Close Ask WholesaleOS" title="Close">X</button></header><div class="ask-body'+(response?.record?' ask-has-context':'')+'"><section class="ask-chat"><p role="status" data-ask-status>'+esc(busy?'Loading recorded snapshot...':message)+'</p>'+
    (data?'<small>Snapshot '+esc(time(data.now))+' / '+data.coverage.deals_returned+' of '+data.coverage.deal_total+' deals; '+data.coverage.buyers_returned+' of '+data.coverage.buyer_total+' buyers. Mailbox is not fetched.</small>':'')+
    '<nav aria-label="Recorded questions">'+['What is waiting on me','New deals today','What did we do yesterday'].map(q=>'<button type="button" data-ask-question="'+esc(q)+'"'+(!data?' disabled':'')+'>'+q+'</button>').join('')+'</nav>'+
    (response?'<div class="ask-answer" aria-live="polite"><p>'+esc(response.text)+'</p>'+response.items.slice(0,20).map((item,i)=>'<button type="button" data-ask-item="'+i+'"><strong>'+esc(item.name)+'</strong><br>'+esc(item.ref||'')+' '+esc(item.label||'Open recorded context')+'</button>').join('')+(response.calendar?'<button type="button" data-ask-calendar>Open Calendar</button>':'')+'</div>':'')+
    '<form data-ask-form><label>Question or exact reference<textarea data-ask-query maxlength="300" rows="2">'+esc(question)+'</textarea></label><div><button type="submit"'+(!data?' disabled':'')+'>Ask</button><button type="button" data-ask-refresh'+(busy?' disabled':'')+'>Reload snapshot</button></div></form><p>No sends, approvals, imports or AI provider in this demo. Open a workspace to review its existing actions.</p></section>'+context(response?.record)+'</div>';}
  function paint(){const panel=document.getElementById('wos-ask-panel');if(panel)panel.innerHTML=markup();}
  async function load(){
    const identity=actor();if(!identity){clear();return;}const ticket=++sequence;controller?.abort();controller=new AbortController();busy=true;data=null;response=null;message='';paint();
    try{const r=await fetch('/api/dashboard/ask-workspace',{cache:'no-store',signal:controller.signal}),v=await r.json();if(ticket!==sequence||actor()!==identity)return;if(!r.ok||v.source_kind!=='derived_workflow'||v.read_only!==true||v.feed_incomplete!==true||!Array.isArray(v.records)||!Array.isArray(v.people)||!Array.isArray(v.actions)||!Array.isArray(v.events)||!Array.isArray(v.conversations)||!v.coverage)throw Error();data=v;message='Recorded snapshot loaded. Nothing changed.';}
    catch{if(ticket!==sequence||actor()!==identity)return;message='Snapshot unavailable. Check your dashboard login, then reload.';}finally{if(ticket===sequence){busy=false;paint();}}
  }
  function open(){if(!actor())return;const existing=document.getElementById('wos-ask-panel');if(existing){existing.focus();return;}const dialog=document.createElement('dialog');dialog.id='wos-ask-panel';dialog.className='wos-ask-panel';document.body.appendChild(dialog);paint();dialog.addEventListener('close',()=>clear());dialog.showModal();load();}
  function ask(q){question=q;response=root.wosAskModel.answer(q,data);paint();}
  function openRecord(kind,id){if(!actor()||!data)return;const rows=data.records.concat(data.people).filter(r=>r.kind===kind&&r.id===id);if(rows.length!==1)return;clear();if(kind==='deal')root.openReviewedDeal(id);else root.openBuyerFind(id);}
  const bubble=document.createElement('button');bubble.id='wos-ask-open';bubble.type='button';bubble.title='Ask about recorded deals, buyers and work';bubble.setAttribute('aria-label','Open Ask WholesaleOS');bubble.textContent='Ask';bubble.hidden=!actor();document.querySelector('.topbar')?.appendChild(bubble);
  document.addEventListener('click',e=>{
    if(e.target.closest('#wos-ask-open'))open();
    if(e.target.closest('[data-ask-close]'))document.getElementById('wos-ask-panel')?.close();
    if(e.target.closest('[data-ask-refresh]')&&!busy)load();
    const q=e.target.closest('[data-ask-question]');if(q&&data)ask(q.dataset.askQuestion);
    const item=e.target.closest('[data-ask-item]');if(item&&response){const row=response.items[Number(item.dataset.askItem)];if(row?.kind==='calendar'||row?.kind==='conversation'){clear();root.navigate('calendar',null);}else if(row){const records=data.records.concat(data.people).filter(r=>r.kind===row.kind&&r.id===row.id);if(records.length===1){response={text:'Recorded dashboard context; no action taken.',items:[],record:records[0]};paint();}else{message='This item is outside the uniquely loaded record subset. Open Today for its canonical action.';paint();}}}
    const record=e.target.closest('[data-ask-record]');if(record)openRecord(record.dataset.askKind,record.dataset.askRecord);
    if(e.target.closest('[data-ask-calendar]')){clear();root.navigate('calendar',null);}
  });
  document.addEventListener('submit',e=>{if(!e.target.matches('[data-ask-form]'))return;e.preventDefault();if(data&&actor())ask(e.target.querySelector('[data-ask-query]').value);});
  const signout=root.signOutDashboard;if(signout)root.signOutDashboard=function(){clear();bubble.hidden=true;return signout.apply(this,arguments);};
  const login=root.showDashboardLogin;if(login)root.showDashboardLogin=function(){clear();bubble.hidden=true;return login.apply(this,arguments);};
  new MutationObserver(()=>{const allowed=!!actor();if(bubble.hidden===allowed)bubble.hidden=!allowed;if(!allowed&&document.getElementById('wos-ask-panel'))clear();}).observe(document.body,{attributes:true,attributeFilter:['style'],childList:true,subtree:true});
})(window);
