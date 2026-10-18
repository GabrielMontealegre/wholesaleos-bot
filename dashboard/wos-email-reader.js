'use strict';
(function(root){
  var state={folder:'inbox',role:'',messages:[],notes:[],status:'Not checked',error:'',body:null,thread:[],busy:false,linkStatus:'',reply:''};
  var sequence=0;
  var folders=[['inbox','Inbox / replies'],['sent','Sent'],['drafts','Drafts'],['starred','Starred'],['notes','WOS notes']];
  var roleFilters=[['','All roles'],['buyer','Buyers'],['seller','Sellers / owners'],['jv','JV partners'],['title','Title'],['attorney','Attorneys'],['lender','Lenders'],['agent','Agents'],['other','Other'],['unlinked','Not linked']];
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function role(m){var value=m&&m.conversation&&m.conversation.role;return ['holder','buyer','partner','seller','title','attorney','lender','agent','other'].includes(value)?value:'';}
  function category(value){return value==='holder'||value==='partner'?'jv':value;}
  function chip(value){return value&&root.wosRoleChip?root.wosRoleChip(value):'';}
  function sender(message){
    if(typeof message.sender_name==='string'&&message.sender_name.trim())return message.sender_name;
    if(message.direction==='out'&&message.source_kind==='connected_mailbox')return 'You';
    // A legacy plain header name is still source text, not a name guessed from an email.
    if(typeof message.from==='string'&&message.from.trim()&&!/[@<>\r\n]/.test(message.from))return message.from;
    return 'Sender name not supplied';
  }
  function time(value){var at=Date.parse(value);if(!Number.isFinite(at))return 'Unknown';var iso=new Date(at).toISOString();return root.wosCardClock?root.wosCardClock.formatTime(iso,new Date().toISOString()):new Intl.DateTimeFormat('en-US',{timeZone:'Etc/GMT+7',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(at));}
  function groups(){
    var map=new Map();
    state.messages.slice(0,30).forEach(function(m,index){
      if(!m||typeof m.id!=='string'||!m.id||m.id.length>1000)return;
      var key=/^[a-f0-9]{64}$/.test(m.thread_key||'')?m.thread_key:'isolated:'+index;
      if(!map.has(key))map.set(key,[]);map.get(key).push(m);
    });
    return Array.from(map.values()).map(function(items){items.sort((a,b)=>(Date.parse(a.date)||0)-(Date.parse(b.date)||0));return {items,latest:items[items.length-1]};}).sort((a,b)=>(Date.parse(b.latest.date)||0)-(Date.parse(a.latest.date)||0));
  }
  function linkForm(){return state.folder==='inbox'&&state.body&&state.body.direction!=='out'?'<details class="email-link"><summary>Link to a person</summary><form data-email-link-form><label>Person<input name="person" maxlength="120" required autocomplete="off"></label><label>Role<select name="role" required><option value="">Choose a role</option>'+[['holder','Deal holder'],['buyer','Buyer'],['partner','JV partner'],['seller','Seller / owner'],['title','Title company'],['attorney','Attorney'],['lender','Lender'],['agent','Agent'],['other','Other']].map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join('')+'</select></label><label>References (optional)<input name="refs" maxlength="200" placeholder="BUY-0001, WOS-FL-1031" autocomplete="off"></label><label>Next step (optional)<input name="next_step" maxlength="1000" autocomplete="off"></label><button type="submit"'+(state.busy?' disabled':'')+'>Save conversation link</button><p role="status">'+esc(state.linkStatus)+'</p></form></details>':'';}
  function statusPanel(){return '<section id="email-connection" class="email-connection"><span data-email-status>'+esc(state.status)+'</span><button type="button" data-email-test'+(state.busy?' disabled':'')+'>Test connection</button><p role="alert">'+esc(state.error)+'</p></section>';}
  function paint(){var el=document.querySelector('#email-reader');if(el)el.outerHTML=markup();var panel=document.querySelector('#email-connection');if(panel&&!el)panel.outerHTML=statusPanel();}
  function threadRows(){
    var visible=groups().filter(g=>!state.role||(state.role==='unlinked'?!role(g.latest):category(role(g.latest))===state.role));
    return visible.map(g=>'<button type="button" class="email-thread-row'+(g.items.some(m=>m.unread===true||m.read===false)?' email-unread':'')+'" data-email-message="'+esc(g.latest.id)+'"'+(state.busy?' disabled':'')+' aria-pressed="'+(state.body&&state.body.id===g.latest.id?'true':'false')+'"><span class="email-row-top"><span class="email-sender" title="'+esc(g.latest.from||'')+'">'+esc(sender(g.latest))+'</span><time>'+esc(time(g.latest.date))+'</time></span><span class="email-subject-line">'+chip(role(g.latest))+'<strong>'+esc(g.latest.subject||'(No subject)')+'</strong></span><span class="email-snippet">'+esc(g.latest.snippet||'')+'</span>'+(g.items.length>1?'<small>'+g.items.length+' messages</small>':'')+(g.latest.link_status==='ambiguous'?'<small>Link needs review</small>':'')+'</button>').join('')+(!visible.length&&!state.busy&&!state.error?'<p class="email-empty">No messages in this view.</p>':'');
  }
  function reading(){
    if(!state.body)return '<p class="email-empty">Select a conversation.</p>';
    var messages=state.thread.length?state.thread:[state.body];
    var context=messages.map(m=>m.conversation).find(v=>v&&v.role)||state.body.conversation;
    var deals=context&&Array.isArray(context.deals)?context.deals:[];
    return '<button type="button" data-email-back>Back to messages</button><div class="email-reading-head"><h3>'+esc(state.body.subject||'(No subject)')+'</h3>'+chip(context&&context.role)+deals.filter(d=>typeof d.id==='string'&&/^WOS-[A-Z]{2}-\d{4,}$/.test(d.ref||'')).map(d=>'<button type="button" data-email-deal="'+esc(d.id)+'">Open deal '+esc(d.ref)+'</button>').join('')+'</div><div class="email-messages">'+messages.slice().sort((a,b)=>(Date.parse(a.date)||0)-(Date.parse(b.date)||0)).map(m=>'<article class="email-message" data-email-body style="--message-role:'+({buyer:'#34d399',seller:'#60a5fa',holder:'#a78bfa',partner:'#a78bfa',title:'#2dd4bf',attorney:'#94a3b8',lender:'#fb923c',agent:'#fbbf24'}[role(m)]||'#94a3b8')+'"><header><strong>'+esc(m.from||'Sender not supplied')+'</strong><time>'+esc(time(m.date))+'</time></header><p class="email-body">'+esc(m.body||'(No readable text)')+'</p></article>').join('')+'</div><section class="email-composer"><label>Reply<textarea data-email-reply maxlength="4000" rows="5">'+esc(state.reply)+'</textarea></label><button type="button" data-email-send disabled title="Sending is not available until the explicit-send release is verified">Send email</button><small>Not sent</small></section>'+linkForm();
  }
  function markup(){
    var notes=state.folder==='notes';
    return '<section id="email-reader" class="email-workspace'+(state.body?' email-open':'')+'"><header class="email-head"><h2>Email</h2>'+statusPanel()+'</header><div class="email-panes">'+navigation()+'<section class="email-thread-list" aria-label="'+(notes?'WholesaleOS notes':'Email conversations')+'"><h3>'+esc(notes?'WOS notes':folders.find(f=>f[0]===state.folder)?.[1]||'Gmail label')+'</h3><small>'+ (notes?'Reported next steps - not mailbox messages':'Latest 30 messages in this folder')+'</small>'+(state.busy?'<p role="status">Loading email...</p>':'')+'<div class="email-thread-scroll">'+(notes?state.notes.filter(n=>!state.role||category(n.role)===state.role).map(n=>'<article class="email-note">'+chip(n.role)+'<h4>'+esc(n.person)+'</h4><p>'+esc(n.next_step||'No next step recorded')+'</p><small>'+esc(time(n.captured_at))+'</small></article>').join('')||'<p>No recorded notes.</p>':threadRows())+'</div></section><section class="email-reading" aria-label="Open email conversation">'+(notes?'<p class="email-empty">Notes are separate from real email.</p>':reading())+'</section></div></section>';
  }
  function navigation(){
    var extra=folders.slice(2).concat([['buyers','Gmail: Buyers'],['jv_deals','Gmail: JV Deals'],['lead_alerts','Gmail: Lead Alerts'],['title','Gmail: Title'],['templates','Gmail: Templates'],['bounced','Gmail: Bounced'],['billing','Gmail: Billing']]);
    return '<nav class="email-folders" aria-label="Email folders">'+folders.slice(0,2).map(([k,l])=>'<button type="button" data-email-folder="'+k+'" aria-pressed="'+(state.folder===k&&!state.role)+'"'+(state.busy?' disabled':'')+'>'+(k==='inbox'?'Inbox':l)+'</button>').join('')+
      roleFilters.slice(1).map(([k,l])=>'<button type="button" data-email-role="'+k+'" aria-pressed="'+(state.role===k)+'">'+l+'</button>').join('')+
      '<label class="email-extra-label">Other folders<select aria-label="Other email folders" data-email-extra-folder'+(state.busy?' disabled':'')+'><option value="">More</option>'+extra.map(([k,l])=>'<option value="'+k+'"'+(state.folder===k?' selected':'')+'>'+l+'</option>').join('')+'</select></label></nav>';
  }
  function readFailure(code){
    var reasons={
      email_message_too_large:'This message exceeds the safe reading limit. Open it in Gmail. Your Inbox is still available.',
      email_thread_too_large:'This conversation is too large. Open it in Gmail. Your Inbox is still available.',
      email_message_stale:'This message reference is out of date. Reopen Inbox to load current messages.',
      email_message_missing:'This message is no longer available at this reference. Reopen Inbox to load current messages.',
      email_message_invalid:'This message reference cannot be opened. Reopen Inbox to load current messages.',
      email_thread_invalid:'This conversation reference cannot be opened. Reopen Inbox to load current messages.',
      email_busy:'Email is busy with other reads. Your Inbox is still available; try opening the message later.'
    };
    return typeof code==='string'&&Object.prototype.hasOwnProperty.call(reasons,code)?reasons[code]:'The message could not be read. Your Inbox is still available. Check Email status in Settings if this continues.';
  }
  async function request(path,options){
    var ticket=++sequence;state.busy=true;state.error='';paint();
    try{var r=await fetch(path),data=await r.json();if(ticket!==sequence)return null;if(!r.ok||data.ok===false){var failure=Error();failure.code=data.code;failure.status=r.status;throw failure;}if(data.status)state.status=data.status;return data;}
    catch(e){
      if(ticket!==sequence)return null;
      var login=e.status===401||e.status===403,keepList=options&&options.keepList&&!login;
      if(!keepList){state.messages=[];state.notes=[];}
      state.thread=[];state.body=null;state.reply='';
      if(login)state.status='Dashboard login required';
      else if(!keepList&&e.code!=='email_folder_unavailable')state.status='Not connected';
      state.error=login?'Sign in to the dashboard to read email.':keepList?readFailure(e.code):e.code==='email_thread_too_large'?'This conversation is too large. Open it in Gmail.':e.code==='email_folder_unavailable'?'This Gmail label is not present. No label was created.':'Email unavailable. Check the connection in Settings.';
      return null;
    }
    finally{if(ticket===sequence){state.busy=false;paint();}}
  }
  async function load(){
    state.messages=[];state.notes=[];state.body=null;state.thread=[];state.linkStatus='';state.reply='';
    var folder=state.folder,data=await request(folder==='notes'?'/api/dashboard/conversations':'/api/gmail/messages?folder='+encodeURIComponent(folder)+'&limit=30');
    if(data&&folder===state.folder){if(folder==='notes')state.notes=Array.isArray(data.items)?data.items:[];else state.messages=Array.isArray(data.messages)?data.messages:[];}paint();
  }
  root.renderGmail=function(){++sequence;state.busy=false;state.messages=[];state.notes=[];state.body=null;state.thread=[];state.reply='';setTimeout(load,0);return markup();};
  document.addEventListener('input',function(e){if(e.target.matches('[data-email-reply]'))state.reply=typeof e.target.value==='string'?e.target.value.slice(0,4000):'';});
  document.addEventListener('change',async function(e){if(e.target.matches('[data-email-extra-folder]')&&e.target.value&&!state.busy){state.folder=e.target.value;state.role='';await load();}});
  document.addEventListener('submit',async function(e){
    if(!e.target.matches('[data-email-link-form]'))return;e.preventDefault();if(state.busy||!state.body)return;
    var f=e.target.elements,body={message_id:state.body.id,person:f.person.value.trim(),role:f.role.value,refs:f.refs.value.split(',').map(s=>s.trim()).filter(Boolean),next_step:f.next_step.value.trim()};
    if(!body.person||!body.role){state.linkStatus='Enter the person and choose their role. Nothing saved.';paint();return;}
    state.busy=true;state.linkStatus='Saving conversation link...';paint();
    try{var r=await fetch('/api/dashboard/conversations/email-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),v=await r.json();if(!r.ok||v.ok!==true)throw Error();state.linkStatus='Conversation link saved. Later exact replies can be saved from Dashboard.';}
    catch{state.linkStatus='Save result unavailable. Reopen the conversation before trying again. No email sent.';}
    finally{state.busy=false;paint();}
  });
  var settings=root.renderSettings;root.renderSettings=function(){return statusPanel()+settings();};
  document.addEventListener('click',async function(e){
    if(e.target.closest('[data-email-send]'))return;
    if(e.target.closest('[data-email-test]')){await request('/api/gmail/test');return;}
    var folder=e.target.closest('[data-email-folder]');if(folder&&!state.busy){state.folder=folder.dataset.emailFolder;state.role='';await load();return;}
    var filter=e.target.closest('[data-email-role]');if(filter){state.role=filter.dataset.emailRole;paint();return;}
    if(e.target.closest('[data-email-back]')){state.body=null;state.thread=[];paint();return;}
    var deal=e.target.closest('[data-email-deal]');if(deal&&root.openReviewedDeal){root.openReviewedDeal(deal.dataset.emailDeal);return;}
    var item=e.target.closest('[data-email-message]');if(item&&!state.busy){
      state.linkStatus='';state.reply='';var group=groups().find(g=>g.items.some(m=>m.id===item.dataset.emailMessage)),ids=group?Array.from(new Set(group.items.map(m=>m.id))):[item.dataset.emailMessage];
      var data=await request(ids.length>1?'/api/gmail/thread?ids='+encodeURIComponent(JSON.stringify(ids)):'/api/gmail/message/'+encodeURIComponent(ids[0]),{keepList:true});
      if(data){state.thread=Array.isArray(data.messages)?data.messages:[data];state.body=state.thread.find(m=>m.id===item.dataset.emailMessage)||state.thread[state.thread.length-1]||null;}paint();
    }
  });
})(window);
