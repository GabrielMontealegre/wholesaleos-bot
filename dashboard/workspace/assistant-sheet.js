'use strict';
(function(root){
  var c=root.WOSComponents,model=root.WOSAssistantModel;
  var stageNames={finding_buyer:'Finding buyer',offer_out:'Offer out',under_contract:'Under contract',buyer_assigned:'Buyer assigned',closed:'Closed',dead:'No longer active'};
  var rejection={version_invalid:'This file uses a different version. Ask for a version 1 assistant file.',schema_invalid:'Choose a version 1 assistant snapshot file.',generated_at_invalid:'The file needs a valid generation time that is not in the future.',duplicate_id:'The file contains repeated record identifiers. Ask for a corrected file.',source_file_invalid:'A source reference is not supported. Ask for a corrected file.',source_url_invalid:'A source link is not supported. Ask for a corrected file.',reference_invalid:'A related record reference is missing or invalid. Ask for a corrected file.',money_invalid:'A reported amount is invalid. Use a non-negative number or an unknown value.',date_invalid:'A reported date is invalid. Ask for a corrected file.',field_invalid:'A value has the wrong type or an unsupported category. Ask for a corrected file.',array_invalid:'A list is incomplete or too large. Ask for a corrected file.',rank_invalid:'A call or email priority is invalid. Ask for a corrected file.',file_too_large:'Choose an assistant file smaller than 1 MB.',filename_invalid:'Use a simple JSON filename without folders.',file_invalid:'This is not a readable UTF-8 JSON file.',fields_invalid:'The file has missing or unsupported fields. Ask for a corrected file.'};
  function stamp(value){if(!value)return 'Not reported';var date=new Date(value);if(!Number.isFinite(date.getTime()))return 'Not reported';return /^\d{4}-\d{2}-\d{2}$/.test(value)?new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(date):new Intl.DateTimeFormat('en-US',{weekday:'short',hour:'numeric',minute:'2-digit'}).format(date);}
  function dollars(value){return value===null?'Not reported':'$'+value.toLocaleString('en-US',{maximumFractionDigits:2});}
  function source(p){return '<small class="ws-assistant-source">From the assistant · '+c.escape(stamp(p.generated_at))+'</small>';}
  function fee(d){var low=d.numbers.fee_estimate_low,high=d.numbers.fee_estimate_high;return (low===null||low===0)&&(high===null||high===0)?'Not estimated yet':low!==null&&high!==null?'You make about '+dollars(low)+'–'+dollars(high)+' (estimate)':'Fee estimate incomplete';}
  function person(name,role){var token=String(role).trim().toLowerCase().split(/[ ,]/)[0];var color=['buyer','seller','holder','partner','title','attorney','lender','agent'].includes(token)?' ws-role--'+token:'';return '<strong>'+c.escape(name)+'</strong><span class="ws-assistant-role'+color+'">'+c.escape(role)+'</span>';}
  function section(title,body){return '<section class="ws-assistant-group"><h3>'+title+'</h3>'+body+'</section>';}
  function empty(){return '<p class="ws-muted">None in this assistant file.</p>';}
  async function digest(bytes){var hash=await root.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');}
  function create(options){
    var host=options.host,active=true,ticket=0,view=null,selected=null,busy=false,uncertain=false,message='',canImport=false,loaded=false;
    var checks=new Set(),markVersions=new Map(),drawer=null,buyerDrawer=null,query='',reading=false,controllers=new Set(),viewerScope=null;
    async function request(init){var controller=new AbortController();controllers.add(controller);var timer=setTimeout(function(){controller.abort();},30000);try{var response=await root.fetch('/api/dashboard/assistant-snapshots',Object.assign({credentials:'include',cache:'no-store'},init||{},{signal:controller.signal}));return {response:response,data:await response.json()};}finally{clearTimeout(timer);controllers.delete(controller);}}
    function alive(t){return active&&t===ticket&&host.isConnected;}
    function status(text){message=text;var e=host.querySelector('[data-assistant-status]');if(e)e.textContent=text;}
    function actionsDisabled(){var b=host.querySelector('[data-assistant-import]'),input=host.querySelector('input[type=file]'),choose=host.querySelector('#assistant-choose');if(b){b.disabled=!canImport||!selected||busy||uncertain;b.hidden=!selected;}if(input)input.disabled=!canImport||busy||uncertain;if(choose)choose.disabled=!canImport||busy||uncertain;}
    function draw(){
      if(!active||!host.isConnected)return;
      if(drawer){drawer.close();drawer=null;}
      if(buyerDrawer){buyerDrawer.close();buyerDrawer=null;}
      host.innerHTML='<section class="ws-assistant" aria-label="Assistant sheet"><header class="ws-assistant-header"><div><h2>Your assistant sheet</h2>'+(view?'<p>Updated '+c.escape(stamp(view.generated_at))+' by the assistant</p>':'')+'</div><div class="ws-assistant-tools">'+c.button({label:'Open recorded work',icon:'list-checks',iconOnly:true,id:'assistant-recorded-open'})+c.button({label:'Refresh assistant sheet',icon:'refresh-cw',iconOnly:true,id:'assistant-refresh'})+'</div></header>'+
        '<form class="ws-assistant-import"><input id="assistant-file" type="file" hidden accept=".json,application/json" aria-label="Assistant JSON file" aria-describedby="assistant-status">'+c.button({label:view?'Import a file instead':'Choose assistant file',icon:'folder',id:'assistant-choose'})+c.button({label:"Import today's assistant file",icon:'arrow-up-right',tone:'green',id:'assistant-import',disabled:true})+'</form><p id="assistant-status" data-assistant-status role="status">'+c.escape(message)+'</p>'+
        (reading?c.skeleton('Loading assistant sheet'):view?sheet():loaded?'<p class="ws-muted">No assistant file has been imported. Choose today\'s file to see your next moves.</p>':'')+'</section>'+c.drawer('assistant-detail','Assistant-reported deal')+c.drawer('assistant-buyers','Reported buyers');
      drawer=c.bindDialog(host.querySelector('#assistant-detail'));
      buyerDrawer=c.bindDialog(host.querySelector('#assistant-buyers'));
      host.querySelectorAll('dialog').forEach(function(dialog){dialog.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();}},true);});
      if(view){host.querySelector('#assistant-buyers [data-dialog-body]').innerHTML='<label for="assistant-buyer-search">Search buyers by name or area</label><input id="assistant-buyer-search" type="search" maxlength="200" autocomplete="off"><ul class="ws-list ws-assistant-rows" data-assistant-buyers></ul>';host.querySelector('#assistant-buyers-open').addEventListener('click',buyerDrawer.open);}
      var input=host.querySelector('#assistant-file'),button=host.querySelector('#assistant-import');button.dataset.assistantImport='';
      host.querySelector('#assistant-choose').addEventListener('click',function(){if(!busy&&!uncertain&&canImport)input.click();});
      if(view)host.querySelector('#assistant-choose').classList.add('ws-assistant-secondary');
      host.querySelector('form').addEventListener('submit',function(e){e.preventDefault();});
      input.addEventListener('change',function(){selected=input.files&&input.files[0]||null;status(selected?'File selected. Import it when ready.':'');actionsDisabled();});
      button.addEventListener('click',upload);
      host.querySelector('#assistant-refresh').addEventListener('click',function(){if(!busy)refresh();});
      host.querySelector('#assistant-recorded-open').title='Open recorded work';
      host.querySelector('#assistant-recorded-open').addEventListener('click',function(){if(typeof options.onRecordedWork==='function')options.onRecordedWork();});
      host.querySelectorAll('[data-assistant-deal]').forEach(function(b){b.addEventListener('click',function(){detail(b.dataset.assistantDeal);});});
      host.querySelectorAll('[data-assistant-check]').forEach(function(b){b.addEventListener('change',function(){mark(b);});});
      host.querySelectorAll('[data-assistant-copy]').forEach(function(b){b.addEventListener('click',function(){copyText(Number(b.dataset.assistantCopy));});});
      var search=host.querySelector('#assistant-buyer-search');if(search){search.value=query;search.addEventListener('input',function(){query=search.value.slice(0,200);buyers();});}
      actionsDisabled();if(view)buyers();
    }
    function sheet(){
      var next=view.needs_next;
      var top=next?'<button class="ws-assistant-next" data-assistant-deal="'+c.escape(next.id)+'"><strong>'+c.escape(next.needs_gabriel)+'</strong><span>'+c.escape(next.name)+'</span>'+source(next.provenance)+'</button>':empty();
      var calls=view.calls.map(function(r){return '<li>'+person(r.name,r.role)+'<p>Why: '+c.escape(r.why)+'</p><p>'+c.escape(r.phone||'Phone not reported')+'</p><ul>'+r.questions.map(function(q){return '<li>'+c.escape(q)+'</li>';}).join('')+'</ul>'+source(r.provenance)+(r.href?'<a class="ws-button" href="'+c.escape(r.href)+'">Call '+c.escape(r.name)+'</a>':'<p class="ws-muted">Phone not reported or not usable.</p>')+'</li>';}).join('');
      var texts=view.texts.map(function(r,index){return '<li>'+person(r.name,r.role)+'<p>Why: Not reported in this file.</p><p>'+c.escape(r.phone||'Phone not reported')+'</p><p class="ws-assistant-copy">'+c.escape(r.text)+'</p><small>Drafted '+c.escape(stamp(r.drafted_at))+'</small>'+source(r.provenance)+'<div class="ws-assistant-text-actions"><button type="button" class="ws-button" data-assistant-copy="'+index+'">'+c.icon('copy')+'<span>Copy text</span></button>'+(r.href?'<a class="ws-button" href="'+c.escape(r.href)+'">Open text in Messages</a>':'<p class="ws-muted">Phone not reported or not usable.</p>')+'</div><label class="ws-assistant-check"><input type="checkbox" data-assistant-check="'+index+'"'+(checks.has(r.device_key)?' checked':'')+'>I sent it (saved on this device)</label></li>';}).join('');
      var emails=view.emails.map(function(r){return '<li>'+person(r.who,r.role)+'<p>'+c.escape(r.subject)+'</p>'+source(r.provenance)+'<a class="ws-button" href="'+r.href+'">Open Email</a></li>';}).join('');
      var deals=view.stages.map(function(group){return '<section class="ws-assistant-stage"><h4>'+stageNames[group.stage]+'</h4>'+(group.deals.length?'<ul class="ws-list ws-assistant-deals">'+group.deals.map(function(d){return '<li><button class="ws-assistant-deal" data-assistant-deal="'+c.escape(d.id)+'"><strong>'+c.escape(d.name)+'</strong><span>'+c.escape(stageNames[d.stage])+'</span><span>'+c.escape(fee(d))+'</span><span>Buyer price: '+c.escape(dollars(d.numbers.buyer_number.amount))+'</span><span>Seller next: '+c.escape(d.next_seller||'Not reported')+'</span><span>Buyer next: '+c.escape(d.next_buyer||'Not reported')+'</span>'+source(d.provenance)+'</button></li>';}).join('')+'</ul>':empty())+'</section>';}).join('');
      var funds=view.buyers.filter(function(b){return b.reported_pof===true;}).length,unknown=view.buyers.filter(function(b){return b.reported_pof===null;}).length;
      return section('Do this next',top)+section('Calls',calls?'<ul class="ws-list ws-assistant-rows">'+calls+'</ul>':empty())+section('Texts to send',texts?'<ul class="ws-list ws-assistant-rows">'+texts+'</ul>':empty())+section('Emails waiting on you',emails?'<ul class="ws-list ws-assistant-rows">'+emails+'</ul>':empty())+section('Deals by stage',deals)+section('Buyers','<p>'+view.reported_approved_buyers+' reported approved · Not independently verified</p>'+c.badge('Proof of funds reported: '+funds+' yes · '+unknown+' unknown','neutral')+source({generated_at:view.generated_at,source_file:view.filename})+c.button({label:'All reported buyers',icon:'users',id:'assistant-buyers-open'}));
    }
    async function copyText(index){var t=ticket,row=view&&view.texts[index];if(!row)return;try{if(!root.navigator.clipboard||typeof root.navigator.clipboard.writeText!=='function')throw Error();await root.navigator.clipboard.writeText(row.text);if(alive(t))status('Text copied. Nothing was sent.');}catch(_){if(alive(t))status('Text could not be copied. Nothing was sent.');}}
    function buyers(){
      var container=host.querySelector('[data-assistant-buyers]');if(!container||!view)return;
      var needle=query.trim().toLocaleLowerCase(),rows=view.buyers.filter(function(b){return !needle||[b.name,b.company||''].concat(b.areas).join(' ').toLocaleLowerCase().includes(needle);});
      container.innerHTML=rows.length?rows.map(function(b){return '<li>'+person(b.name,'Buyer'+(b.company?' · '+b.company:''))+'<p>'+c.escape(b.areas.join(', ')||'Area not reported')+'</p><p>'+c.escape(b.buy_box||'Buying criteria not reported')+'</p>'+c.badge('Approval reported: '+(b.reported_approval||'Unknown'),'neutral')+' '+c.badge('Proof of funds reported: '+(b.reported_pof===true?'Yes':b.reported_pof===false?'No':'Unknown'),'neutral')+'<p>Last contact: '+c.escape(stamp(b.last_contact))+'</p><p>Phone: '+c.escape(b.phone||'Not reported')+'</p><p>Email: '+c.escape(b.email||'Not reported')+'</p>'+source(b.provenance)+'</li>';}).join(''):'<li class="ws-muted">No reported buyers match.</li>';
    }
    function detail(id){
      var d=view&&view.stages.flatMap(function(g){return g.deals;}).find(function(d){return d.id===id;});if(!d||!drawer)return;
      var body=host.querySelector('#assistant-detail [data-dialog-body]');
      var labels={ask:'Reported asking price',seller_number:'Reported seller number',our_offer:'Reported our offer',target:'Reported target',value_fixed:'Reported value after repairs',repairs:'Reported repairs',fee_estimate_low:'Fee estimate low',fee_estimate_high:'Fee estimate high'};
      body.innerHTML='<h3>'+c.escape(d.name)+'</h3><p>'+c.escape(stageNames[d.stage])+'</p>'+source(d.provenance)+'<p>'+c.escape(fee(d))+'</p><h4>People</h4><ul class="ws-list ws-assistant-rows">'+d.people.map(function(p){return '<li>'+person(p.name,p.role)+'<p>Phone: '+c.escape(p.phone||'Not reported')+'</p><p>Email: '+c.escape(p.email||'Not reported')+'</p>'+source(d.provenance)+'</li>';}).join('')+'</ul><h4>Reported numbers</h4><dl class="ws-detail">'+Object.keys(labels).map(function(key){return '<div><dt>'+labels[key]+'</dt><dd>'+c.escape(dollars(d.numbers[key]))+'</dd></div>';}).join('')+'<div><dt>Buyer price</dt><dd>'+c.escape(dollars(d.numbers.buyer_number.amount))+' · '+c.escape(d.numbers.buyer_number.buyer||'Buyer not reported')+'</dd></div></dl><h4>Next moves</h4><p>Seller: '+c.escape(d.next_seller||'Not reported')+'</p><p>Buyer: '+c.escape(d.next_buyer||'Not reported')+'</p><h4>Reported log</h4><ul class="ws-list ws-assistant-rows">'+d.log.map(function(e){return '<li>'+c.escape(stamp(e.at))+'<p>'+c.escape(e.text)+'</p>'+source(d.provenance)+'</li>';}).join('')+'</ul>';
      drawer.open();
    }
    async function storageKey(row){if(typeof viewerScope!=='string'||!/^[a-f0-9]{64}$/.test(viewerScope))throw Error('actor_required');return 'wos-assistant-sent:'+await digest(new TextEncoder().encode(JSON.stringify([viewerScope,row.device_key])));}
    async function restoreChecks(t){
      if(!view)return;var rows=view.texts.slice();
      for(var row of rows){try{var key=await storageKey(row);if(!alive(t))return;if(root.localStorage.getItem(key)==='1')checks.add(row.device_key);}catch(_){} }
    }
    async function mark(box){var t=ticket,row=view&&view.texts[Number(box.dataset.assistantCheck)],checked=box.checked;if(!row)return;var version=(markVersions.get(row.device_key)||0)+1;markVersions.set(row.device_key,version);function owned(){return alive(t)&&markVersions.get(row.device_key)===version;}try{var key=await storageKey(row);if(!owned())return;if(checked)root.localStorage.setItem(key,'1');else root.localStorage.removeItem(key);if(checked)checks.add(row.device_key);else checks.delete(row.device_key);}catch(_){if(owned()){box.checked=checks.has(row.device_key);status('This device could not save the check. No message was sent.');}}}
    async function refresh(expected){
      if(!active||busy&&!expected)return;var t=++ticket;reading=true;view=null;checks.clear();markVersions.clear();selected=null;draw();
      try{
        var result=await request(),response=result.response;
        if(!alive(t))return;if(response.status===401||response.status===403){options.onUnauthorized();return;}if(!response.ok)throw Error();
        var data=result.data;if(!alive(t))return;
        if(data.ok!==true||data.capabilities?.can_import!==true||data.capabilities.schema!=='wos-assistant-snapshot'||data.capabilities.version!==1||data.capabilities.max_bytes!==1048576||typeof data.viewer_scope!=='string'||!/^[a-f0-9]{64}$/.test(data.viewer_scope))throw Error();
        var next=model.project(data.latest);if(expected&&(!next||next.receipt_id!==expected.id||next.file_sha256!==expected.sha||next.filename!==expected.filename))throw Error();
        view=next;viewerScope=data.viewer_scope;canImport=true;loaded=true;uncertain=false;reading=false;message=expected?'Assistant file imported.':view?'':'No file imported yet.';
        await restoreChecks(t);if(alive(t)){draw();if(typeof options.onReady==='function')options.onReady();}
      }catch(_){if(!alive(t))return;reading=false;canImport=false;loaded=false;view=null;message=expected?'The import may be saved, but the sheet could not be verified. Refresh before importing again.':'Assistant data is unavailable. Refresh to try again.';draw();if(typeof options.onReady==='function')options.onReady();}
    }
    async function upload(){
      if(!active||busy||uncertain||!selected||!canImport)return;
      var file=selected,t=++ticket;busy=true;actionsDisabled();status('Importing assistant file...');
      try{
        if(!file.size||file.size>1048576){status('Choose an assistant JSON file smaller than 1 MB.');return;}
        if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.json$/.test(file.name)||file.name.includes('..')){status('Use a simple JSON filename without folders.');return;}
        var bytes=await file.arrayBuffer();if(!alive(t))return;var expectedHash=await digest(bytes);if(!alive(t))return;var requestId=root.crypto.randomUUID();
        uncertain=true;
        var result=await request({method:'POST',headers:{'Content-Type':'application/octet-stream','X-WOS-Assistant-Import':'1','X-WOS-Assistant-Filename':file.name,'X-WOS-Assistant-Request':requestId},body:bytes}),response=result.response;bytes=null;
        if(!alive(t))return;if(response.status===401){options.onUnauthorized();return;}
        var data=result.data;if(!alive(t))return;
        if(response.status===403&&data.code!=='assistant_snapshot_origin_required'){options.onUnauthorized();return;}
        if(!response.ok){if(response.status>=500)throw Error();uncertain=false;var code=typeof data.code==='string'?data.code.replace(/^assistant_snapshot_/,''):'';status(rejection[code]||'The file was rejected. Ask for a corrected version 1 assistant file.');return;}
        if(data.ok!==true||typeof data.id!=='string'||!/^[a-f0-9]{64}$/.test(data.id)||data.file_sha256!==expectedHash)throw Error();
        busy=false;selected=null;await refresh({id:data.id,sha:expectedHash,filename:file.name});
      }catch(_){if(alive(t)){uncertain=true;selected=null;status('The import outcome is unknown. Refresh before importing again.');}}
      finally{if(active){busy=false;actionsDisabled();}}
    }
    draw();
    return {refresh:refresh,destroy:function(){active=false;++ticket;controllers.forEach(function(controller){controller.abort();});controllers.clear();view=null;viewerScope=null;selected=null;checks.clear();markVersions.clear();if(drawer)drawer.close();if(buyerDrawer)buyerDrawer.close();host.replaceChildren();}};
  }
  root.WOSAssistantSheet={create:create};
})(window);
