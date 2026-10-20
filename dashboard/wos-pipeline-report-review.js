'use strict';
(function(root){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function safe(v){try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
 function markup(item,{clock,now}={}){
  const source=safe(item?.provenance?.source_url);
  if(item?.kind!=='pipeline_report'||item.reported!==true||item.verified!==false||item.review_status!=='pending'||!item.report_review?.can_review||item.provenance?.source_kind!=='imported_report'||!source)return '';
  const amount=r=>r&&Number.isFinite(r.low)&&Number.isFinite(r.high)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(r.low)+(r.low!==r.high?' to '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(r.high):''):'Not established';
  const prices=[['Contract price','contract_price'],['Buyer price','buyer_price'],['Total costs','costs'],['Potential net fee','net_fee']].map(([label,key])=>'<dt>'+label+'</dt><dd>'+esc(amount(item.money?.[key]))+'</dd>').join('');
  return '<header class="pipeline-review-heading"><h2 id="pipeline-review-title">Review reported workflow</h2><button type="button" data-review-close aria-label="Close report review" title="Close report review">X</button></header><div class="pipeline-review-body"><h3>'+esc(item.name)+'</h3><p>'+esc(item.target?.ref)+'</p><p>'+esc(item.label)+'</p><p>'+esc(item.next_action)+'</p><p>Next review: '+esc(item.due_date?(clock?clock.formatDate(item.due_date):item.due_date):'Not recorded')+'</p><dl>'+prices+'</dl><p>'+esc(item.money?.label||'Reported amounts, not independently verified')+'</p><h3>Reported evidence</h3><p>'+esc(item.provenance.evidence_text)+'</p><a href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">Open reported source</a><p>Recorded: '+esc(clock?clock.formatTime(item.provenance.captured_at,now):'Time recorded')+'</p><p>Review does not verify funds, send an offer, approve a buyer or close a deal.</p><label class="pipeline-source-check"><input type="checkbox" data-review-source> I checked the reported source.</label><label for="pipeline-review-note">Correction note (required when flagging)</label><textarea id="pipeline-review-note" maxlength="300" rows="3"></textarea></div><footer><p role="alert" data-review-error></p><div class="pipeline-actions"><button type="button" data-review-decision="reviewed">Mark report reviewed</button><button type="button" data-review-decision="flagged">Flag report for correction</button></div></footer>';
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={markup};return;}
 const actor=()=>root.APP?.unlocked&&root.APP?.currentUser?.role==='admin'&&root.APP.currentUser.id;
 function open(key){
  if(!actor())return;const item=root.wosPipelineWorkspace?.itemForReview(key),body=markup(item,{clock:root.wosCardClock,now:new Date().toISOString()});if(!body)return;
  document.getElementById('pipeline-review-dialog')?.close();const dialog=document.createElement('dialog');dialog.id='pipeline-review-dialog';dialog.setAttribute('aria-labelledby','pipeline-review-title');dialog.innerHTML=body;document.body.appendChild(dialog);dialog.showModal();
  let saving=false,controller=null;const identity=actor();
  dialog.addEventListener('close',()=>{controller?.abort();dialog.remove();},{once:true});
  dialog.addEventListener('click',async e=>{
   if(e.target.closest('[data-review-close]')){dialog.close();return;}
   const button=e.target.closest('[data-review-decision]');if(!button||saving||actor()!==identity)return;
   const decision=button.dataset.reviewDecision,reviewed_source=dialog.querySelector('[data-review-source]').checked,note=dialog.querySelector('textarea').value.trim(),error=dialog.querySelector('[data-review-error]');
   if(decision==='reviewed'&&!reviewed_source){error.textContent='Check the reported source before marking this report reviewed.';return;}
   if(decision==='flagged'&&!note){error.textContent='Add a correction note before flagging this report.';return;}
   saving=true;error.textContent='';for(const b of dialog.querySelectorAll('[data-review-decision]'))b.disabled=true;controller=new AbortController();
   try{const response=await fetch('/api/dashboard/pipeline-report-reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision_id:item.id,version:item.report_review.version,decision,note,reviewed_source}),signal:controller.signal}),result=await response.json();if(!dialog.isConnected||actor()!==identity)return;
    if(!response.ok||result.ok!==true){error.textContent=response.status===409?'This report or its records changed. Close this review, refresh Pipeline, and check it again.':'Review could not be saved. Nothing was approved or sent.';return;}
    dialog.close();root.wosPipelineWorkspace.reload();
   }catch{if(dialog.isConnected&&actor()===identity)error.textContent='Save result is unknown. Close and refresh Pipeline before trying again.';}
   finally{saving=false;if(dialog.isConnected)for(const b of dialog.querySelectorAll('[data-review-decision]'))b.disabled=false;}
  });
 }
 document.addEventListener('click',e=>{const button=e.target.closest('[data-pipe-review]');if(button&&!button.disabled)open(button.dataset.pipeReview);});
})(typeof window==='undefined'?{}:window);
