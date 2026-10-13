'use strict';
(function(root) {
 function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function day(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)return '';return value;}
 function rank(row,today){const due=day(row.due_date),current=day(today);return due&&current&&due<current?0:due&&current&&due===current?1:2;}
 function order(rows,today){return rows.slice().sort((a,b)=>rank(a,today)-rank(b,today)||(day(a.due_date)||'9999').localeCompare(day(b.due_date)||'9999')||String(a.id||'').localeCompare(String(b.id||'')));}
 function thread(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&['facebook.com','www.facebook.com','messenger.com','www.messenger.com','mail.google.com'].includes(url.hostname)?url.href:'';}catch{return '';}}
 function render(row,{clock,roleChip,roleColor,now,today}={}){
  const recordedRole=['imported_report','operator_input','reported_interaction'].includes(row.source_kind)?row.role:'not_recorded';
  const role=roleChip?roleChip(recordedRole):'<span class="wos-role-chip">Role not recorded</span>';
  const color=roleColor?roleColor(recordedRole):'';
  const due=day(row.due_date),priority=rank(row,today),url=thread(row.thread_url);
  const deals=(row.linked_deals||[]).filter(d=>typeof d.id==='string'&&/^WOS-[A-Z]{2}-\d{4}$/.test(d.ref||''));
  const primary=url?'<a class="cv-primary" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" title="Open the recorded conversation; nothing is sent">Reply</a>':deals.length?'<a class="cv-primary" href="/dashboard/?record_ref='+encodeURIComponent(deals[0].ref)+'" title="Open the exact linked deal; no contact action">Open deal</a>':'';
  const time=value=>clock?clock.formatTime(value,now):'Unknown';
  const provenance=row.source_kind==='imported_report'?'Reported conversation, not an independently verified contact outcome.':row.source_kind==='operator_input'?'Explicit operator record, not an automatic contact action.':'Recorded conversation context; no contact outcome inferred.';
  return '<article class="cv-row" data-conversation-id="'+esc(row.id||'')+'" data-urgency="'+priority+'"'+(/^#[0-9a-f]{6}$/i.test(color)?' style="--role-color:'+color+'"':'')+'><div class="cv-heading">'+role+'<h3>'+esc(row.person)+'</h3>'+(priority<2?'<span class="cv-age'+(priority===0?' cv-overdue':'')+'">'+(priority===0?'Overdue':'Due today')+'</span>':'')+'</div>'+
   '<p title="'+esc(provenance)+'">'+esc((row.refs||[]).join(' / '))+(row.refs?.length?' | ':'')+esc(({hot:'Waiting on you',to_send:'To send',follow_up:'Follow up',waiting_on_deal:'Waiting on deal',closed:'Closed'})[row.status]||'Status not recorded')+'</p>'+
   (row.what_they_said?'<p>They said: '+esc(row.what_they_said)+'</p>':'')+
   (row.email_evidence?'<p>Latest linked email subject: '+esc(row.email_subject||'No subject')+'</p><small title="'+(row.email_evidence.persisted?'Saved reply; source retained.':'Read-only preview; nothing saved.')+'">Checked '+esc(time(row.email_evidence.captured_at))+'</small>':'')+
   (row.next_step?'<p>Next: '+esc(row.next_step)+'</p>':'')+
   '<div class="cv-times">'+(due?'<span>Due: '+esc(clock?clock.formatDate(due):'Unknown')+'</span>':'')+(row.last_in?'<span>Last incoming: '+esc(time(row.last_in))+'</span>':'')+(row.last_out?'<span>Last outgoing: '+esc(time(row.last_out))+'</span>':'')+'</div>'+
   (row.ready_message?'<details><summary>Draft message</summary><label>Unsent draft<textarea readonly data-conversation-draft>'+esc(row.ready_message)+'</textarea></label><button type="button" data-conversation-copy title="Copy the unsent draft; nothing is sent">Copy message</button></details>':'')+
   primary+'</article>';
 }
 const api={order,render,rank};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.wosConversationCards=api;
})(typeof window==='undefined'?{}:window);
