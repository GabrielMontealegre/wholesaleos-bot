'use strict';
(function(root){
 const profit=typeof module!=='undefined'&&module.exports?require('./wos-match-profit'):root.wosMatchProfit;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function safe(v){try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
 function canEditPrices(item){const stamp=item?.provenance?.captured_at;return !!(item?.kind==='pipeline_report'&&item.source_kind==='imported_report'&&item.reported===true&&item.verified===false&&item.review_status==='pending'&&item.address_withheld===false&&item.report_review?.can_review===true&&!item.report_review.conflict&&typeof item.id==='string'&&/^[a-f0-9]{64}$/.test(item.id)&&typeof item.report_id==='string'&&item.report_id&&item.provenance?.source_kind==='imported_report'&&safe(item.provenance.source_url)&&typeof stamp==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(stamp)&&Number.isFinite(Date.parse(stamp))&&new Date(stamp).toISOString().slice(0,19)===stamp.slice(0,19)&&typeof item.provenance.evidence_text==='string'&&item.provenance.evidence_text.trim());}
 function priceValues(values,{sourceUrl,after}={}){
  const number=(text,label,zero=false)=>{if(typeof text!=='string'||text.length>64||! /^\d+(?:\.\d+)?$/.test(text)||!Number.isFinite(Number(text))||Number(text)>1e9||Number(text)<(zero?0:Number.MIN_VALUE))throw Error('Enter a valid '+label+'.');return Number(text);};
  const amounts={};for(const [key,label] of [['buyer_price','buyer price'],['contract_price','contract price'],['costs','total costs']]){
   const low=values[key+'_low'],high=values[key+'_high'];if(low===''&&high===''){amounts[key]=null;continue;}
   const range={low:number(low,label,key==='costs'),high:number(high,label,key==='costs')};if(range.high<range.low)throw Error('The high '+label+' must not be below the low amount.');amounts[key]=range;
  }
  const share=values.our_share===''?null:number(values.our_share,'share percentage');if(share!==null&&share>100)throw Error('Share must be at most 100%.');
  const stamp=values.captured_at;if(typeof stamp!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(stamp)||!Number.isFinite(Date.parse(stamp+'Z'))||new Date(stamp+'Z').toISOString().slice(0,16)!==stamp.slice(0,16)||after&&Date.parse(stamp+'Z')<=Date.parse(after))throw Error('Enter a valid source capture time in UTC'+(after?' newer than the recorded capture.':'.'));
  if(!safe(values.source_url)||sourceUrl&&values.source_url!==sourceUrl||typeof values.evidence_text!=='string'||!values.evidence_text.trim()||values.evidence_text.length>1000||/[\x00-\x1f<>]/.test(values.evidence_text))throw Error('Provide evidence from the recorded source for this report.');
  return {...amounts,our_share:share===null?null:share/100,source_url:values.source_url,evidence_text:values.evidence_text.trim(),captured_at:new Date(stamp+'Z').toISOString()};
 }
 function priceDraft(item,values){
  if(!canEditPrices(item))throw Error('Refresh Pipeline and open a current, shareable report.');
  const prices=priceValues(values,{sourceUrl:item.provenance.source_url,after:item.provenance.captured_at});
  const report={kind:'pipeline_item',report_id:item.report_id,record_ref:item.target.ref,buyer_ref:item.buyer?.ref||'',conversation_id:item.conversation_id||'',waiting_on:item.group,reason_code:item.reason_code,next_date:item.group==='no_reply'?'':item.due_date||'',asked_at:item.asked_at||'',offer_sent_at:item.offer_sent_at||'',followup_count:item.followup_count??null,last_answer:item.last_answer||'',next_step:item.next_step,path:item.money?.path||null,...prices};
  for(const key of ['last_offer','seller_price','walk_away'])report[key]=item[key]||null;
  return {items:[report],expected_pipeline_revision:item.id,expected_pipeline_version:item.report_review.version};
 }
 function newPriceDraft(values,reportId){
  if(typeof reportId!=='string'||!/^price-[a-f0-9-]{36}$/.test(reportId)||!/^WOS-[A-Z]{2}-\d{4}$/.test(values.record_ref||'')||!/^BUY-\d{4}$/.test(values.buyer_ref||''))throw Error('Enter the exact property and buyer references.');
  if(typeof values.next_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(values.next_date)||!Number.isFinite(Date.parse(values.next_date))||new Date(values.next_date).toISOString().slice(0,10)!==values.next_date||typeof values.next_step!=='string'||!values.next_step.trim()||values.next_step.length>600||/[\x00-\x1f<>]/.test(values.next_step)||!['','assignment','double_close'].includes(values.path))throw Error('Enter the next review date, action and recorded closing path.');
  return {new_pipeline_price_report:true,items:[{kind:'pipeline_item',report_id:reportId,record_ref:values.record_ref,buyer_ref:values.buyer_ref,waiting_on:'gabriel',reason_code:'decision_needed',next_date:values.next_date,next_step:values.next_step.trim(),path:values.path||null,...priceValues(values)}]};
 }
 function priceFields(item){
  const moneyFields=[['buyer_price','Buyer price'],['contract_price','Contract price'],['costs','Total costs']].map(([key,label])=>{
   const v=key==='costs'&&item?.money?.costs_basis!=='reported_total'?null:item?.money?.[key];
   return '<fieldset><legend>'+label+'</legend><div class="pipeline-price-range">'+['low','high'].map(bound=>'<label>'+ (bound==='low'?'Low amount':'High amount')+'<input inputmode="decimal" data-price-field="'+key+'_'+bound+'" value="'+esc(v?.[bound]??'')+'"></label>').join('')+'</div></fieldset>';
  }).join('');
  return moneyFields+'<label>Your recorded share (%)<input inputmode="decimal" data-price-field="our_share" value="'+esc(typeof item?.money?.our_share==='number'?item.money.our_share*100:'')+'"></label><label>Recorded source link<input type="url"'+(item?' readonly':'')+' data-price-field="source_url" value="'+esc(item?.provenance?.source_url||'')+'"></label><label>Source captured (UTC)<input type="datetime-local" step="1" data-price-field="captured_at"></label><label>Source evidence for this report<textarea data-price-field="evidence_text" maxlength="1000" rows="3"></textarea></label><label class="pipeline-source-check"><input type="checkbox" data-price-reviewed> I checked the source, prices and '+(item?'unchanged workflow details.':'next review action.')+'</label><p>Prices remain reported, not agreed prices or confirmed funds.</p>';
 }
 function priceMarkup(item,creating=false){
  if(!creating&&!canEditPrices(item))return '';
  const identity=creating?'<label>Property reference<input data-price-field="record_ref" maxlength="11" placeholder="WOS-FL-0001"></label><label>Buyer reference<input data-price-field="buyer_ref" maxlength="8" placeholder="BUY-0001"></label><p>Waiting on your decision</p><label>Next review date<input type="date" data-price-field="next_date"></label><label>Next review action<textarea data-price-field="next_step" maxlength="600" rows="2"></textarea></label><label>Recorded closing path<select data-price-field="path"><option value="">Not recorded</option><option value="assignment">Assignment</option><option value="double_close">Double close</option></select></label>':'<h3>'+esc(item.name)+'</h3><p>'+esc(item.target.ref)+'</p><details><summary>Reported workflow kept in this revision</summary><p>'+esc(item.label)+'</p><p>'+esc(item.next_step)+'</p></details>';
  return '<header class="pipeline-review-heading"><h2 id="pipeline-review-title">'+(creating?'Add price report':'Update reported prices')+'</h2><button type="button" data-price-close aria-label="Close price editor" title="Close price editor">X</button></header><div class="pipeline-review-body">'+identity+priceFields(item)+(creating?'<section data-price-target-section hidden><h3>Confirm the linked records</h3><p data-price-target></p><label class="pipeline-source-check"><input type="checkbox" data-price-target-reviewed> These are the intended property and buyer.</label></section>':'')+'</div><footer><p role="alert" data-price-error></p><p role="status" data-price-status></p><div class="pipeline-actions"><button type="button" data-price-action="preview">Preview prices</button><button type="button" data-price-action="commit" disabled>Save reported prices</button></div></footer>';
 }
 function markup(item,{clock,now}={}){
  const source=safe(item?.provenance?.source_url);
  if(item?.kind!=='pipeline_report'||item.reported!==true||item.verified!==false||item.review_status!=='pending'||!item.report_review?.can_review||item.provenance?.source_kind!=='imported_report'||!source)return '';
  const prices=profit?profit.markup(profit.fromReport(item)):'';
  return '<header class="pipeline-review-heading"><h2 id="pipeline-review-title">Review reported workflow</h2><button type="button" data-review-close aria-label="Close report review" title="Close report review">X</button></header><div class="pipeline-review-body"><h3>'+esc(item.name)+'</h3><p>'+esc(item.target?.ref)+'</p><p>'+esc(item.label)+'</p><p>'+esc(item.next_action)+'</p><p>Next review: '+esc(item.due_date?(clock?clock.formatDate(item.due_date):item.due_date):'Not recorded')+'</p>'+prices+'<h3>Reported evidence</h3><p>'+esc(item.provenance.evidence_text)+'</p><a href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">Open reported source</a><p>Recorded: '+esc(clock?clock.formatTime(item.provenance.captured_at,now):'Time recorded')+'</p><p>Review does not verify funds, send an offer, approve a buyer or close a deal.</p><label class="pipeline-source-check"><input type="checkbox" data-review-source> I checked the reported source.</label><label for="pipeline-review-note">Correction note (required when flagging)</label><textarea id="pipeline-review-note" maxlength="300" rows="3"></textarea></div><footer><p role="alert" data-review-error></p><div class="pipeline-actions"><button type="button" data-review-decision="reviewed">Mark report reviewed</button><button type="button" data-review-decision="flagged">Flag report for correction</button></div></footer>';
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={markup,canEditPrices,priceDraft,priceMarkup,newPriceDraft};return;}
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
 function openPrices(key,creating=false){
  const identity=actor(),item=creating?null:root.wosPipelineWorkspace?.itemForReview(key);if(!identity||creating&&!root.wosPipelineWorkspace?.canAddPriceReport())return;const body=priceMarkup(item,creating);if(!body)return;
  const reportId=creating?'price-'+root.crypto.randomUUID():null;
  document.getElementById('pipeline-review-dialog')?.close();const dialog=document.createElement('dialog');dialog.id='pipeline-review-dialog';dialog.setAttribute('aria-labelledby','pipeline-review-title');dialog.innerHTML=body;document.body.appendChild(dialog);dialog.showModal();
  let saving=false,preview=null,controller=null,terminal=false,sequence=0;
  const buttons=[...dialog.querySelectorAll('[data-price-action]')],error=dialog.querySelector('[data-price-error]'),status=dialog.querySelector('[data-price-status]');
  const targetCheck=dialog.querySelector('[data-price-target-reviewed]'),targetSection=dialog.querySelector('[data-price-target-section]');
  const controls=()=>{buttons[0].disabled=saving||terminal;buttons[1].disabled=saving||terminal||!preview||creating&&!targetCheck.checked;for(const field of dialog.querySelectorAll('input,textarea,select'))field.disabled=saving||terminal;};
  dialog.addEventListener('close',()=>{sequence++;controller?.abort();preview=null;dialog.remove();},{once:true});
  const changed=e=>{if(e.target===targetCheck){controls();return;}preview=null;if(targetCheck){targetCheck.checked=false;targetSection.hidden=true;}status.textContent='';error.textContent='';controls();};
  dialog.addEventListener('input',changed);
  dialog.addEventListener('change',changed);
  dialog.addEventListener('click',async e=>{
   if(e.target.closest('[data-price-close]')){dialog.close();return;}const button=e.target.closest('[data-price-action]');if(!button||saving||terminal||actor()!==identity)return;
   const action=button.dataset.priceAction;let payload;error.textContent='';
   if(!dialog.querySelector('[data-price-reviewed]').checked){error.textContent='Check the source and tick the review box first.';return;}
   if(action==='preview'){preview=null;if(targetCheck){targetCheck.checked=false;targetSection.hidden=true;}controls();try{const values=Object.fromEntries([...dialog.querySelectorAll('[data-price-field]')].map(field=>[field.dataset.priceField,field.value]));payload=creating?newPriceDraft(values,reportId):priceDraft(item,values);}catch(caught){error.textContent=caught.message;return;}}
   else{if(!preview||creating&&!targetCheck.checked)return;payload={preview_id:preview,bulk_approve:false,...(creating?{price_target_reviewed:true}:{})};}
   saving=true;controls();controller=new AbortController();const ticket=++sequence,timer=setTimeout(()=>controller.abort(),10000);status.textContent=action==='preview'?'Checking prices...':'Saving reported prices...';
   try{
    const response=await fetch('/api/dashboard/buyers-found/import/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    if(ticket!==sequence||!dialog.isConnected||actor()!==identity)return;
    if([401,403].includes(response.status)){dialog.close();return;}
    if(!response.ok){preview=null;terminal=action==='commit'||[409,429].includes(response.status);error.textContent=response.status===409?'This report changed. Close and refresh Pipeline before editing again.':response.status===429?'Request limit reached. Close this editor and wait before another change.':'Request refused. Close and refresh Pipeline before another change.';status.textContent='';return;}
    const result=await response.json();if(ticket!==sequence||!dialog.isConnected||actor()!==identity)return;
    if(action==='preview'){
     if(typeof result.preview_id!=='string'||! /^[a-f0-9-]{36}$/.test(result.preview_id)||result.counts?.new_items!==1||result.counts.rejected!==0||result.counts.bulk_approval_eligible!==0)throw Error();
     if(creating){const target=result.price_report_target;if(!target||target.record_ref!==payload.items[0].record_ref||target.buyer_ref!==payload.items[0].buyer_ref||typeof target.name!=='string'||!target.name||target.name.length>512||typeof target.buyer_name!=='string'||!target.buyer_name||target.buyer_name.length>512)throw Error();dialog.querySelector('[data-price-target]').textContent=target.name+' ('+target.record_ref+') / '+target.buyer_name+' ('+target.buyer_ref+')';targetCheck.checked=false;targetSection.hidden=false;}
     preview=result.preview_id;status.textContent='One source report previewed. Nothing saved; no buyer or deal approved.';
    }else{if(result.created!==1||result.approved!==0)throw Error();dialog.close();root.wosPipelineWorkspace.reload();}
   }catch{if(ticket===sequence&&dialog.isConnected&&actor()===identity){preview=null;terminal=action==='commit';error.textContent=action==='commit'?'Save result is unknown. Close and refresh Pipeline before another change.':'Preview unavailable. Nothing was saved.';status.textContent='';}}
   finally{clearTimeout(timer);saving=false;if(ticket===sequence&&dialog.isConnected)controls();}
  });
 }
 document.addEventListener('click',e=>{const add=e.target.closest('#wos-pipeline-workspace [data-pipe-new-prices]');if(add&&!add.disabled){openPrices(null,true);return;}const prices=e.target.closest('[data-pipe-prices]');if(prices&&!prices.disabled){openPrices(prices.dataset.pipePrices);return;}const button=e.target.closest('[data-pipe-review]');if(button&&!button.disabled)open(button.dataset.pipeReview);});
})(typeof window==='undefined'?{}:window);
