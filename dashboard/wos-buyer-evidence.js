(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={buying_intent:'Buying intent',proof_received:'Proof receipt'};
 function date(v){return Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC'})+' UTC':'Not recorded';}
 function day(v){return /^\d{4}-\d{2}-\d{2}$/.test(v||'')?new Date(v+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'Not recorded';}
 function markup(item){
  const view=item.evidence_tracking||{},disabled=!view.can_record,kindViews=view.kinds||{};
  return '<section class="buyer-evidence" data-buyer-evidence="'+esc(item.id)+'" data-evidence-version="'+esc(view.version||'')+'"><h4>Buyer evidence</h4><p>Source notes only. Not bank verification, available cash or a commitment to this deal.</p>'+
   Object.keys(labels).map(kind=>{const k=kindViews[kind]||{};let url='';try{const u=new URL(k.source_url);if(u.protocol==='https:'&&!u.username&&!u.password)url=u.href;}catch{}
    return '<div><strong>'+labels[kind]+': '+esc(k.label||(view.unavailable||!view.version?'Evidence history unavailable':'Not recorded'))+'</strong>'+(k.evidence_text?'<p>'+esc(k.evidence_text)+'</p>':'')+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Open recorded source</a><p>Captured '+esc(date(k.captured_at))+'; valid through '+esc(day(k.valid_through))+' UTC.</p>':'')+(k.note?'<p>Correction note: '+esc(k.note)+'</p>':'')+(k.can_flag?'<button type="button" data-evidence-flag="'+kind+'">Flag '+labels[kind].toLowerCase()+'</button>':'')+'</div>';
   }).join('')+'<p role="status" data-evidence-status>'+(disabled?'Assign a unique buyer reference or resolve the evidence history before adding a note.':'')+'</p><details><summary>Record a source note</summary><label>Evidence kind<select data-evidence-kind><option value="buying_intent">Buying intent</option><option value="proof_received">Proof receipt</option></select></label><label>Source URL<input type="url" data-evidence-source maxlength="2048"></label><label>What this source says<textarea data-evidence-text maxlength="300"></textarea></label><p>Do not enter bank account numbers, balances or credentials.</p><label>Evidence captured (your local time)<input type="datetime-local" data-evidence-captured></label><label>Valid through (UTC date, as reviewed)<input type="date" data-evidence-valid></label><label><input type="checkbox" data-evidence-reviewed>I reviewed this source and it belongs to this buyer.</label><button type="button" data-evidence-record'+(disabled?' disabled':'')+'>Record source note</button></details>'+(Object.values(kindViews).some(k=>k.can_flag)?'<label>Reason for a correction flag<textarea data-evidence-note maxlength="300"></textarea></label>':'')+'</section>';
 }
 if(typeof module==='object'&&module.exports){module.exports={markup};return;}
 root.wosBuyerEvidence={markup};
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-evidence-record],[data-evidence-flag]');if(!button)return;
  const panel=button.closest('[data-buyer-evidence]'),status=panel?.querySelector('[data-evidence-status]');if(!panel||panel.dataset.busy==='true')return;
  let body;try{
   if(button.hasAttribute('data-evidence-flag')){const note=panel.querySelector('[data-evidence-note]').value.trim();if(!note)throw Error('Enter the reason for the correction flag.');body={action:'flag',evidence_kind:button.dataset.evidenceFlag,version:panel.dataset.evidenceVersion,note};}
   else{
    const source=panel.querySelector('[data-evidence-source]').value.trim(),evidence_text=panel.querySelector('[data-evidence-text]').value.trim(),captured=panel.querySelector('[data-evidence-captured]').value,valid_through=panel.querySelector('[data-evidence-valid]').value;
    if(!panel.querySelector('[data-evidence-reviewed]').checked)throw Error('Review the source and tick the buyer/source check first.');
    if(!source||!evidence_text||!captured||!valid_through)throw Error('Enter the source, source note, captured time and validity date.');
    if(new URL(source).protocol!=='https:')throw Error('Use an HTTPS source URL.');
    body={action:'record',evidence_kind:panel.querySelector('[data-evidence-kind]').value,version:panel.dataset.evidenceVersion,source_url:source,evidence_text,captured_at:new Date(captured).toISOString(),valid_through,reviewed_source:true};
   }
  }catch(e){status.textContent=e.message||'Review the source fields.';return;}
  panel.dataset.busy='true';panel.querySelectorAll('button').forEach(b=>{b.disabled=true;});status.textContent='Recording a source note; not verifying funds...';
  try{
   const response=await fetch('/api/dashboard/buyers-found/'+encodeURIComponent(panel.dataset.buyerEvidence)+'/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(!panel.isConnected)return;
   if(!response.ok){
    if(response.status>=500){status.textContent='Result unknown. Refresh this buyer before trying again.';return;}
    if(response.status===409){status.textContent='Buyer or source history changed. Refresh and review again.';return;}
    if(response.status===401||response.status===403){status.textContent='Sign in again before recording evidence.';return;}
    let code='';try{code=(await response.json()).code||'';}catch{}
    if(!panel.isConnected)return;
    status.textContent=code==='buyer_evidence_source_invalid'?'Use a clean HTTPS document or message link, without private addresses, passwords or sign-in query parameters.':code==='buyer_evidence_date_invalid'?'Check the captured time and validity date. The capture cannot be in the future.':'Note not accepted. Review the source fields before trying again.';
    panel.dataset.busy='false';panel.querySelectorAll('button').forEach(b=>{b.disabled=false;});return;
   }
   const result=await response.json();if(result.ok!==true)throw Error('unknown');status.textContent='Source note recorded. Funds and matching are unchanged.';document.dispatchEvent(new Event('wos-buyer-evidence-recorded'));
  }catch{if(panel.isConnected)status.textContent='Result unknown. Refresh this buyer before trying again.';}
 });
})(typeof window==='object'?window:globalThis);
