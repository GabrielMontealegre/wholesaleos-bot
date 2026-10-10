'use strict';
(function (root) {
  var payload = null; var missing = null; var reserve = null; var receipt = null; var message = ''; var loading = false;
  var filters = { ref: '', type: '', from: '', to: '' }; var searchSequence = 0; var searchTimer;
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function date(v) { var n = new Date(v); return Number.isFinite(n.getTime()) ? n.toLocaleString('en-US', { month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short' }) : 'Time not recorded'; }
  function rows(items) { return (items || []).map(function(e) { return '<li><b>' + esc(e.type.replace(/_/g,' ')) + '</b> <span>' + esc([e.deal_ref,e.buyer_ref,e.match_ref].filter(Boolean).join(' / ')) + '</span><p>' + esc(e.summary) + '</p><small>' + esc(date(e.ts)) + ' | ' + esc(e.who) + ' | ' + esc(e.channel) + ' | ' + esc(e.attribution === 'imported_report' ? 'Imported report' : e.attribution === 'operator_report' ? 'Operator reported' : e.attribution === 'legacy_card_history' || e.attribution === 'legacy_record' ? 'Historical record' : 'Recorded action') + '</small></li>'; }).join('') || '<li>No recorded activity.</li>'; }
  root.wosRecordTimeline = function(kind,id,ref) { return '<details data-record-timeline data-kind="' + esc(kind) + '" data-id="' + esc(id) + '"><summary>Activity' + (ref ? ' - ' + esc(ref) : '') + '</summary><ul class="ra-timeline" role="status"><li>Open history to load recorded activity.</li></ul></details>'; };
  root.parseRecordImport = function(value) {
    var parsed;
    try { parsed = JSON.parse(value); } catch (_) {
      parsed = value.split(/\r?\n/).filter(function(line) { return line.trim(); }).map(function(line) { var item = JSON.parse(line); return Object.assign({kind:'interaction'},item); });
    }
    if (Array.isArray(parsed)) return {items:parsed};
    if (parsed && parsed.items) return parsed;
    if (parsed && (parsed.kind || parsed.ts && parsed.ref)) return {items:[Object.assign({kind:'interaction'},parsed)]};
    throw new Error('Invalid import structure');
  };
  function markup() {
    return '<section class="ra-page" id="wos-record-activity"><h2>Activity</h2><div class="ra-filters">' + ['ref','from','to'].map(function(k) { return '<label>' + ({ref:'Reference',from:'From',to:'To'})[k] + '<input data-activity-filter="' + k + '" type="' + (k==='ref'?'text':'date') + '" value="' + esc(filters[k]) + '" maxlength="60"></label>'; }).join('') + '<label>Type<select data-activity-filter="type"><option value="">All activity</option>' + (payload && payload.types || []).map(function(t) { return '<option value="' + esc(t) + '"' + (filters.type===t?' selected':'') + '>' + esc(t.replace(/_/g,' ')) + '</option>'; }).join('') + '</select></label><button data-activity-load>Apply filters</button></div><p role="status">' + esc(message || (loading ? 'Loading activity...' : payload ? 'Showing ' + payload.items.length + ' of ' + payload.total + ' events' : 'Activity not loaded')) + '</p><ul class="ra-timeline">' + rows(payload && payload.items) + '</ul><details><summary>Record references</summary><p>Missing references: ' + esc(missing ? missing.leads + ' leads, ' + missing.buyers + ' buyers, ' + missing.deals + ' deals' : 'Not measured') + '</p><label><input type="checkbox" data-reference-confirm> Assign missing references only; preserve all facts and existing reference aliases.</label><button data-reference-assign disabled>Assign missing references</button><p>References identify records, not proof or approval. XX means the state is not recorded.</p></details></section>';
  }
  function paint() {
    var el=document.getElementById('wos-record-activity'); if(!el)return;
    el.outerHTML=markup(); el=document.getElementById('wos-record-activity');
    var details=el.querySelector('[data-reference-confirm]').closest('details');
    details.querySelector('label').lastChild.nodeValue=' Assign references to buyers, reviewed deals and matches only. Legacy leads get a reference when you work on them.';
    details.querySelector('[data-reference-assign]').textContent='Assign buyer, deal and match references';
    var status=document.createElement('p'); status.dataset.referenceReserve='';
    status.textContent=reserve ? 'Deal number reserve: '+reserve.reserved+' of '+reserve.namespaces+' namespaces; minimum '+(reserve.minimum==null?'not set':reserve.minimum)+'. Missing match references: '+missing.matches+'.' : 'Deal number reserve: not measured.';
    details.appendChild(status);
    if(receipt){var confirmation=document.createElement('p');confirmation.dataset.referenceReceipt='';confirmation.textContent=receipt;details.appendChild(confirmation);}
  }
  function get(url) { return fetch(url,{cache:'no-store'}).then(function(r) { if(!r.ok) throw new Error('Records unavailable. Check your admin session.'); return r.json(); }); }
  function load() {
    if(loading || !document.getElementById('wos-record-activity')) return;
    loading=true;var signature=JSON.stringify(filters);
    var query={ref:filters.ref,type:filters.type};
    if(filters.from)query.from_ts=new Date(filters.from+'T00:00:00').toISOString();
    if(filters.to)query.to_ts=new Date(filters.to+'T23:59:59.999').toISOString();
    Promise.all([get('/api/dashboard/record-activity?'+new URLSearchParams(query)),get('/api/dashboard/record-refs')]).then(function(values) { if(signature!==JSON.stringify(filters))return;payload=values[0]; missing=values[1].missing; reserve=values[1].deal_reserve; message=''; }).catch(function(e) { if(signature===JSON.stringify(filters))message=e.message; }).finally(function() { loading=false;if(signature!==JSON.stringify(filters))load();else paint(); });
  }
  root.renderRecordActivity = function() { setTimeout(load,0);return markup(); };
  document.addEventListener('toggle',function(e) {
    if(!e.target.matches('details[data-record-timeline]') || !e.target.open) return;
    var el=e.target; var params=new URLSearchParams({kind:el.dataset.kind,id:el.dataset.id,limit:'20'});
    get('/api/dashboard/record-activity?'+params).then(function(data) { el.querySelector('ul').innerHTML=rows(data.items); }).catch(function() { el.querySelector('ul').innerHTML='<li>History unavailable. Nothing was changed.</li>'; });
  },true);
  document.addEventListener('change',function(e) {
    if(e.target.matches('[data-activity-filter]')) filters[e.target.dataset.activityFilter]=e.target.value;
    if(e.target.matches('[data-reference-confirm]')) document.querySelector('[data-reference-assign]').disabled=!e.target.checked;
  });
  document.addEventListener('click',function(e) {
    if(e.target.closest('[data-activity-load]')) { load();return; }
    var assign=e.target.closest('[data-reference-assign]');
    if(assign) {
      if(!document.querySelector('[data-reference-confirm]').checked)return;
      assign.disabled=true;
      fetch('/api/dashboard/record-refs/assign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})}).then(function(r) { if(!r.ok)throw Error('References not assigned. No facts were changed.');return r.json(); }).then(function(data) { receipt=data.assigned+' references assigned: '+data.counts.buyer+' buyers, '+data.counts.deal+' deals, '+data.counts.match+' matches. Legacy leads and facts unchanged. '+(data.backup?'Private backup created ('+data.backup.bytes+' bytes).':'No write or backup was needed.');load(); }).catch(function(err) { message=err.message;paint(); });return;
    }
    var open=e.target.closest('[data-search-record]');
    if(open) {
      root.closeModal();
      if(open.dataset.kind==='deal')root.openReviewedDeal(open.dataset.id);
      else if(open.dataset.kind==='match')root.openReviewedDeal(open.dataset.dealId);
      else if(open.dataset.kind==='buyer' && open.dataset.find==='true')root.openBuyerFind(open.dataset.id);
      else if(open.dataset.kind==='lead')root.openLeadModal(open.dataset.id);
      else root.navigate(open.dataset.kind==='buyer'?'buyers':'todays_deals',null);
    }
    if(e.target.closest('[data-search-close]'))root.closeModal();
  });
  var oldSearch=root.globalSearch;
  root.globalSearch=function(query) {
    clearTimeout(searchTimer);var seq=++searchSequence;
    if(!query || query.trim().length<2)return;
    searchTimer=setTimeout(function() {
      get('/api/dashboard/record-search?q='+encodeURIComponent(query.trim())).then(function(data) {
        if(seq!==searchSequence)return;
        if(!data.items.length) { if(oldSearch)oldSearch(query);return; }
        var content=document.getElementById('modal-content');
content.innerHTML='<div class="ra-page"><h2>Record search</h2><button data-search-close title="Close">X</button><ul class="ra-timeline">'+data.items.map(function(item) { return '<li><button data-search-record data-kind="'+esc(item.kind)+'" data-id="'+esc(item.id)+'" data-deal-id="'+esc(item.deal_id)+'" data-find="'+esc(item.assistant_find)+'">'+esc(item.ref || 'Reference pending')+' | '+esc(item.label)+' | '+esc([item.city,item.zip].filter(Boolean).join(' '))+'</button></li>'; }).join('')+'</ul></div>';
        document.getElementById('modal-overlay').style.display='flex';
      }).catch(function() { if(seq===searchSequence && oldSearch)oldSearch(query); });
    },250);
  };
  var linkedRef=new URLSearchParams(location.search).get('record_ref');
  if(/^(?:WOS-[A-Z]{2}|BUY|M)-\d{4}$/.test(linkedRef||'')) {
    var openedLink=false;
    var linkObserver=new MutationObserver(openLinkedRecord);
    function openLinkedRecord(){
      if(openedLink||!root.APP||!root.APP.unlocked||root.APP.currentUser?.role!=='admin')return;
      openedLink=true;linkObserver.disconnect();
      get('/api/dashboard/record-search?q='+encodeURIComponent(linkedRef)).then(function(data){
        var matches=(data.items||[]).filter(function(item){return item.ref===linkedRef;});
        if(matches.length!==1){if(root.toast)root.toast('Record link is missing or ambiguous.','error');return;}
        var item=matches[0];
        if(item.kind==='deal')root.openReviewedDeal(item.id);
        else if(item.kind==='match')root.openReviewedDeal(item.deal_id);
        else if(item.kind==='buyer'&&item.assistant_find)root.openBuyerFind(item.id);
        else if(item.kind==='lead')root.openLeadModal(item.id);
        else root.navigate('buyers',null);
      }).catch(function(){if(root.toast)root.toast('Record link unavailable. Check your admin session.','error');});
    }
    linkObserver.observe(document.body,{childList:true,subtree:true});openLinkedRecord();
  }
  var oldRef=root.getDealRefId;
  if(oldRef)root.getDealRefId=function(lead) { return lead.record_ref || oldRef(lead); };
  var oldAssign=root.assignRefIds;
  if(oldAssign)root.assignRefIds=function(leads) { return oldAssign(leads).map(function(lead) { return lead.record_ref?Object.assign({},lead,{ref_id:lead.record_ref}):lead; }); };
var style=document.createElement('style');style.textContent='.ra-page{color:var(--ink,#e2e8f0);max-width:1100px}.ra-page h2{font-size:22px;color:#e2e8f0!important}.ra-filters{display:flex;flex-wrap:wrap;gap:12px}.ra-page label{display:block;color:#e2e8f0!important}.ra-page input:not([type=checkbox]),.ra-page select{display:block;min-height:44px;box-sizing:border-box;max-width:100%;padding:10px;background:var(--card,#132139)!important;color:#e2e8f0!important;border:1px solid #637891!important;border-radius:4px}.ra-page button{min-height:44px;padding:9px;background:var(--card,#132139)!important;color:var(--accent,#bde4ff)!important;border:1px solid #637891;border-radius:4px;cursor:pointer}.ra-timeline{list-style:none;padding:0;font-size:14px;overflow-wrap:anywhere}.ra-timeline li{padding:12px 0;border-bottom:1px solid #42516a}.ra-timeline p{margin:6px 0}.ra-timeline small{font-size:12px}.ra-page button:disabled{opacity:.5}.ra-timeline button{max-width:100%;text-align:left}@media(max-width:480px){.ra-filters>label{width:100%}.ra-filters input,.ra-filters select{width:100%;box-sizing:border-box}} .ra-page{font-family:var(--font,inherit)}.ra-page summary{min-height:44px;display:flex;align-items:center;cursor:pointer}.ra-page label:has([data-reference-confirm]){display:flex;gap:12px;align-items:center;min-height:44px;padding:8px 0}.ra-page input[data-reference-confirm]{width:24px;height:24px;flex:none}';document.head.appendChild(style);
})(window);
