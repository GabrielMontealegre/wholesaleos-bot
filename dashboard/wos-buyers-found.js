'use strict';
(function (root) {
  var data = null;
  var loading = false;
  var error = '';
  var notice = '';
  var filters = { status: '', deal_type: '', area: '', approval: '', buyer_type: '' };
  var drafts = {};
  var selectedId = '';
  var section = 'box';
  var messageState = {};
  var buyerTypes = { flipper:'Flipper',landlord:'Landlord / rental investor',institutional:'Institutional / hedge fund',
    acquisitions:'Acquisitions company',wholesaler:'Wholesaler / middleman',builder:'Builder',land_buyer:'Land buyer',unknown:'Type not stated' };
  var importOpen = false;
  var importJson = '';
  var importPreview = null;
  var importBusy = false;
  var importApprove = false;
  var importMessage = '';
  var statusLabels = { new: 'Not contacted', messaged: 'Messaged', emailed: 'Emailed', commented: 'Commented', replied: 'Replied', not_a_fit: 'Not a fit' };
  var approvalLabels = { pending: 'Pending approval', approved: 'Approved', rejected: 'Rejected' };
  var boxLabels = { state: 'State', areas: 'Areas', zips: 'ZIP codes', types: 'Property types', price_min: 'Minimum price', price_max: 'Maximum price',
    arv_min: 'Minimum after-repair value', arv_max: 'Maximum after-repair value', pct_arv: 'Share of after-repair value', all_in_max: 'Maximum total cost',
    beds_min: 'Minimum bedrooms', baths_min: 'Minimum bathrooms', sqft_min: 'Minimum square feet', sqft_max: 'Maximum square feet', year_min: 'Built since',
    construction: 'Construction', flood: 'Flood zone', rehab_tolerance: 'Repairs accepted', exclusions: 'Exclusions', funding: 'Funding', close_speed: 'Closing speed', capacity: 'Capacity', wants_sent: 'What to send' };
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function options(values, chosen, first) {
    return '<option value="">' + first + '</option>' + Object.keys(values).map(function (key) {
      return '<option value="' + esc(key) + '"' + (chosen === key ? ' selected' : '') + '>' + esc(values[key]) + '</option>';
    }).join('');
  }
  function importPanel() {
    if (!data || !data.capabilities || !data.capabilities.can_import) return '';
    if (!importOpen) return '<div class="bf-actions"><button type="button" data-import-action="open">Import buyers</button></div>';
    var counts = importPreview && importPreview.counts;
    var reasons = { find_url_invalid: 'Source or profile link is missing or invalid.', find_field_required: 'Required information is missing.',
      find_field_invalid: 'A field is invalid or too long.', find_item_invalid: 'Unsupported fields or item format.', find_type_invalid: 'Platform or property type is unsupported.',
      find_buy_box_invalid: 'Buy-box criteria are invalid.', find_capture_date_invalid: 'Capture date is invalid.', find_contact_invalid: 'Published contact is invalid or conflicts.',
      find_classification_invalid: 'Buyer category is invalid.', find_item_too_large: 'Item exceeds the size limit.' };
    return '<section class="bf-import"><style>.bf-import{padding:16px 0;border-bottom:1px solid #334155}.bf-import label{color:#e2e8f0!important;margin:8px 0}.bf-import input[type=file]{width:100%}.bf-import .bf-import-check{display:flex;gap:8px;align-items:center}.bf-import-check input{width:auto}.bf-import textarea{min-height:140px}.bf-import ul{padding-left:20px;font-size:13px}.bf-import p{margin:10px 0}.bf-import input::placeholder{color:#a8b7ca!important}</style>' +
      '<h3>Import buyers, deals or reported interactions</h3><label>JSON / JSONL file<input type="file" accept=".json,.jsonl,application/json" data-import-file' + (importBusy ? ' disabled' : '') + '></label>' +
      '<label>Or paste JSON<textarea data-import-json maxlength="262144"' + (importBusy ? ' disabled' : '') + '>' + esc(importJson) + '</textarea></label>' +
      '<div class="bf-actions"><button type="button" data-import-action="preview"' + (importBusy ? ' disabled' : '') + '>Preview</button>' +
      '<button type="button" data-import-action="cancel"' + (importBusy ? ' disabled' : '') + '>Cancel</button></div>' +
      (counts ? '<div data-import-preview><p><b>' + esc(counts.new_items) + ' new | ' + esc(counts.updates || 0) + ' updates | ' + esc(counts.duplicates) + ' duplicates | ' + esc(counts.rejected) + ' invalid</b></p>' +
        '<ul>' + (importPreview.rejected || []).map(function (entry) { return '<li>Item ' + esc(entry.item) + ': ' + esc(reasons[entry.reason] || 'Invalid item.') + '</li>'; }).join('') + '</ul>' +
        '<label class="bf-import-check"><input type="checkbox" data-import-approve' + (importApprove ? ' checked' : '') + (importBusy ? ' disabled' : '') + '>These were already approved by me</label>' +
        '<p class="bf-muted">' + esc(counts.bulk_approval_eligible) + ' new end buyers eligible for approval. Partners, caution records and non-buyers stay pending. Existing approvals stay unchanged.</p>' +
        '<div class="bf-actions"><button type="button" data-import-action="commit"' + (importBusy || counts.new_items + counts.duplicates + (counts.updates || 0) === 0 ? ' disabled' : '') + '>Import</button></div></div>' : '') +
      '<p class="bf-muted">Nothing is saved until you click Import.</p><p role="status">' + esc(importMessage) + '</p></section>';
  }
  function money(value){return typeof value==='number'&&Number.isFinite(value)?'$'+value.toLocaleString('en-US',{maximumFractionDigits:0}):'';}
  function sourceTime(value){return root.wosCardClock?root.wosCardClock.formatTime(value,new Date().toISOString()):'Unknown';}
  function contactTime(item){return item.deal_fit&&item.deal_fit.last_contact_at&&root.wosCardClock?root.wosCardClock.formatTime(item.deal_fit.last_contact_at,new Date().toISOString()):'';}
  function matchLabel(view){return view?view.count+(view.count===1?' deal matches':' deals match'):'Deal matches not measured';}
  function contacts(item) {
    return '<div class="bf-contact">'+(item.phone?'<span>'+esc(item.phone)+'</span>':'')+
      (item.email?'<span>'+esc(item.email)+'</span>':'<span class="bf-email-missing">Email missing</span>')+'</div>';
  }
  function typeChip(item) {
    var view=item.buyer_type_view||{},kind=view.kind||item.buyer_type||'unknown';
    return '<span class="bf-type">'+esc(buyerTypes[kind]||buyerTypes.unknown)+'</span>'+
      (view.verify_purchase||['institutional','acquisitions'].includes(kind)?'<span class="bf-caution">Verify they close</span>':'');
  }
  function card(item,editedDraft){
    if(selectedId===item.id)return detailedCard(item,editedDraft);
    var box=item.buy_box||{},view=item.deal_fit,criteria=[];
    if(box.price_min!=null||box.price_max!=null)criteria.push([money(box.price_min),money(box.price_max)].filter(Boolean).join(' - '));
    if(Array.isArray(box.types)&&box.types.length)criteria.push(box.types.join(', '));
    if(box.pct_arv)criteria.push(box.pct_arv+' of after-repair value');
    if(box.rehab_tolerance)criteria.push(box.rehab_tolerance);
    if(box.beds_min!=null)criteria.push(box.beds_min+'+ beds');
    if(box.baths_min!=null)criteria.push(box.baths_min+'+ baths');
    criteria=criteria.concat((box.exclusions||[]).map(function(value){return 'Check: '+value;}));
    var areas=[].concat(item.states||[],item.areas||[],box.zips||[]).join(', '),last=contactTime(item);
    return '<article class="bf-card bf-compact" data-id="'+esc(item.id)+'" data-buyer-card-open="'+esc(item.id)+'" tabindex="0" aria-label="Open buyer '+esc(item.name)+'"><h3>'+esc(item.name)+'</h3>'+contacts(item)+'<div class="bf-chips">'+typeChip(item)+'</div>'+(areas?'<p>'+esc(areas)+'</p>':'')+(criteria.length?'<div class="bf-chips">'+criteria.map(function(value){return '<span>'+esc(value)+'</span>';}).join('')+'</div>':'')+(view?'<button type="button" class="bf-match-badge" data-buyer-open="'+esc(item.id)+'" data-buyer-section="matches" title="Open the recorded matching deals">'+esc(matchLabel(view))+'</button>':'<span class="bf-match-badge">Deal matches not measured</span>')+(last?'<p>Last contact report: '+esc(last)+'</p>':'')+'<div class="bf-compact-status"><span>'+esc(approvalLabels[item.approval||'pending'])+'</span>'+(statusLabels[item.status]?'<span>'+esc(statusLabels[item.status])+'</span>':'')+'</div><button type="button" data-buyer-open="'+esc(item.id)+'">Open buyer</button></article>';
  }
  function detailedCard(item, editedDraft) {
    var publishedContacts = [item.email, item.phone].filter(Boolean).map(function (value) { return '<span>' + esc(value) + ' (published by them)</span>'; }).join('<br>');
    var box = item.buy_box || {};
    var fits = item.fits || {};
    var buyerKind = String(item.classification || 'unknown').replace(/_/g, ' ');
    var boxRows = Object.keys(boxLabels).filter(function (key) { return box[key] != null && box[key] !== '' && (!Array.isArray(box[key]) || box[key].length); }).map(function (key) {
      return '<div><dt>' + esc(boxLabels[key]) + '</dt><dd>' + esc(Array.isArray(box[key]) ? box[key].join(', ') : box[key]) + '</dd></div>';
    }).join('');
    return '<article class="bf-card" data-id="' + esc(item.id) + '">' +
      '<div class="bf-card-heading"><h3>' + esc(item.name) + '</h3>'+(statusLabels[item.status]?'<span>' + esc(statusLabels[item.status]) + '</span>':'')+'</div>'+(item.record_ref?'<p class="bf-muted">'+esc(item.record_ref)+'</p>':'') +
      contacts(item)+'<div class="bf-chips">'+typeChip(item)+'</div>'+
      '<div class="bf-actions"><button type="button" data-buyer-compose="buyer_buy_box"'+(!item.email||item.approval!=='approved'?' disabled':'')+'>Email this buyer</button><button type="button" data-buyer-section="matches">Send matching deals</button></div>'+
      '<div class="bf-tabs" role="tablist" aria-label="Buyer workspace">'+[['box','Buy box'],['matches','Matching deals'],['messages','Messages']].map(function(tab){return '<button type="button" role="tab" aria-selected="'+(section===tab[0])+'" data-buyer-section="'+tab[0]+'">'+tab[1]+'</button>';}).join('')+'</div>'+
      '<section class="bf-workspace-section"'+(section!=='box'?' hidden':'')+'><label>Buyer type<select data-edit-buyer-type>'+options(buyerTypes,item.buyer_type_view&&item.buyer_type_view.kind||item.buyer_type||'unknown','Choose type')+'</select></label><button type="button" data-action="type">Save buyer type</button>'+
      (item.email_subject ? '<p>Email subject: ' + esc(item.email_subject) + '</p>' : '') +
      '<p class="bf-muted">Submitted buyer record</p><p>' + esc(item.trust_label || 'Imported - not verified') + ' | ' + esc(approvalLabels[item.approval || 'pending']) + '</p>' +
      '<p class="bf-muted">' + esc(buyerKind) + (item.post_age ? ' | Post age: ' + esc(item.post_age) : '') + '</p>' +
      (item.possible_duplicate_of ? '<p>Possible duplicate of ' + esc(item.possible_duplicate_of) + ' (' + esc(item.duplicate_basis) + '). Kept on the existing record.</p>' : '') +
      '<p><b>' + esc(item.group_name) + '</b> · ' + esc(item.deal_type) + '</p>' +
      '<p>' + esc(item.what_they_buy) + '</p><p class="bf-muted">' + esc([].concat(item.states || [], item.areas || []).join(', ') || 'Area not stated') + '</p>' +
      (publishedContacts ? '<p>' + publishedContacts + '</p>' : '') +
      '<p class="bf-muted">Captured ' + esc(sourceTime(item.captured_at)) + ' · <a href="' + esc(item.source_url) + '" target="_blank" rel="noopener noreferrer">Source search</a></p>' +
      (item.post_url ? '<p><a href="' + esc(item.post_url) + '" target="_blank" rel="noopener noreferrer">Original post</a></p>' : '') +
      '<details><summary>Buy box</summary>' + (boxRows ? '<dl class="bf-box">' + boxRows + '</dl>' : '<p>No structured criteria supplied.</p>') + '</details>' +
      '<div class="bf-actions"><label>Approval reason (optional)<input data-reason maxlength="300" placeholder="Optional reason"></label><button type="button" data-action="approval" data-approval="approved"'+(item.approval==='approved'?' disabled':'')+'>Approve</button><button type="button" data-action="approval" data-approval="rejected"'+(item.approval==='rejected'?' disabled':'')+'>Reject</button></div></section>'+
      '<section class="bf-workspace-section"'+(section!=='matches'?' hidden':'')+'><h4>Reviewed deals that match</h4>'+dealRows(item.deal_fit&&item.deal_fit.matches,false)+'<button type="button" data-buyer-compose="buyer_teaser"'+(!item.email||item.approval!=='approved'?' disabled':'')+'>Preview selected deals in one email</button><p class="bf-muted">Only current, approved deals with reviewed value and confirmed availability can be shared.</p><h4>Near misses</h4>'+dealRows(item.deal_fit&&item.deal_fit.near_misses,true)+(contactTime(item)?'<p>Last contact report: '+esc(contactTime(item))+'</p>':'')+
      '<p><b>Leads that fit this buy box: ' + esc(fits.count == null ? 'Not measured' : fits.count) + '</b></p>' +
      '<details><summary>Fit reasons</summary><p>' + esc(fits.approval_required ? 'Approval required for matching. Partners stay outside end-buyer matching.' : fits.scope || 'Fit not measured.') + '</p>' +
      Object.keys(fits.reasons || {}).map(function (reason) { return '<p>' + esc(reason) + ': ' + esc(fits.reasons[reason]) + '</p>'; }).join('') +
      Object.keys(fits.unknown || {}).map(function (reason) { return '<p class="bf-muted">' + esc(reason) + ': ' + esc(fits.unknown[reason]) + '</p>'; }).join('') + '</details>' +
      '</section><section class="bf-workspace-section"'+(section!=='messages'?' hidden':'')+'>'+emailPanel(item)+
      '<label>Draft message<textarea maxlength="600" data-draft="' + esc(item.id) + '">' + esc(editedDraft == null ? item.drafted_message : editedDraft) + '</textarea></label>' +
      '<div class="bf-actions"><button type="button" data-action="save">Save draft</button><button type="button" data-action="copy">Copy message</button>' +
      '<a href="' + esc(item.profile_url) + '" target="_blank" rel="noopener noreferrer">Open profile</a></div>' +
      '<div class="bf-actions">' + ['messaged', 'emailed', 'commented', 'replied', 'not_a_fit'].map(function (status) {
        return '<button type="button" data-action="status" data-status="' + status + '"' + (status === item.status || (item.approval !== 'approved' && status !== 'not_a_fit') ? ' disabled' : '') + '>Mark ' + esc(statusLabels[status].toLowerCase()) + '</button>';
      }).join('') + '</div>' +
      (root.wosRecordTimeline ? root.wosRecordTimeline('buyer', item.id, item.record_ref) : '') + '</section></article>';
  }
  function dealRows(rows,near){return Array.isArray(rows)&&rows.length?rows.map(function(d){return '<div class="bf-deal-row">'+(!near?'<label class="bf-deal-select"><input type="checkbox" data-buyer-email-deal="'+esc(d.id)+'"'+(!d.teaser_ready?' disabled':'')+'>Include in email'+(!d.teaser_ready?' (availability review needed)':'')+'</label>':'')+'<button type="button" data-buyer-deal="'+esc(d.id)+'">'+esc(d.ref||'Open deal')+' - '+esc([d.city,d.state,d.zip].filter(Boolean).join(', '))+'</button><p>'+esc(near?d.reason:money(d.asking)+' asking | '+money(d.buyer_max)+' buyer maximum')+'</p>'+(d.checks||[]).map(function(check){return '<p>Check: '+esc(check)+'</p>';}).join('')+'</div>';}).join(''):'<p>'+(near?'No price/value near misses in the reviewed-deal candidates.':'No reviewed deals match this buyer yet.')+'</p>';}
  function emailPanel(item) {
    var state=messageState[item.id]||{},preview=state.preview;
    return '<div class="bf-email-panel"><h4>Buyer email</h4><p role="status">'+esc(state.error||state.notice||'Choose Email this buyer, or select matching deals. Nothing is sent automatically.')+'</p>'+
      (preview?'<p>To: '+esc(preview.to)+'</p><h4>'+esc(preview.subject)+'</h4><pre class="bf-email-preview">'+esc(preview.body)+'</pre>'+
        '<label class="bf-deal-select"><input type="checkbox" data-email-reviewed>I reviewed this entire email and its recipient.</label><div class="bf-actions"><button type="button" data-buyer-email="draft"'+(state.busy?' disabled':'')+'>Save reviewed draft</button><button type="button" data-buyer-email="send"'+(!state.draftId||!preview.configured||state.busy?' disabled':'')+'>Send email</button></div>'+
        (!preview.configured?'<p>Email sending is not connected. Check Settings &gt; Email.</p>':''):'')+
      (state.messages||[]).map(function(message){return '<details><summary>'+esc(message.subject)+' - '+esc(message.status==='accepted'?'Accepted by mail server':message.status==='unknown'||message.status==='sending'?'Delivery uncertain - check Sent before doing anything else':'Draft, not sent')+'</summary><p>'+esc(sourceTime(message.sent_at||message.created_at))+'</p><pre class="bf-email-preview">'+esc(message.body)+'</pre></details>';}).join('')+'</div>';
  }
  function markup(payload) {
    var counts = payload && payload.counts || {};
    var items = payload && payload.items || [];
    var shown = items.filter(function (item) {
      if (selectedId) return item.id === selectedId;
      return (!filters.status || item.status === filters.status) && (!filters.deal_type || item.deal_type === filters.deal_type) &&
        (filters.approval ? (item.approval || 'pending') === filters.approval : item.approval !== 'rejected') &&
        (!filters.buyer_type || (item.buyer_type_view&&item.buyer_type_view.kind||item.buyer_type||'unknown') === filters.buyer_type) &&
        (!filters.area || [].concat(item.states || [], item.areas || []).join(' ').toLowerCase().includes(filters.area.toLowerCase()));
    });
    return '<style>.bf-page{max-width:1180px;color:#202124}.bf-stats,.bf-filters,.bf-actions,.bf-card-heading{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.bf-stats{padding:12px 0;border-bottom:1px solid #ddd}.bf-stats b{font-size:20px}.bf-filters{padding:16px 0}.bf-page label{font-size:12px;display:block}.bf-page select,.bf-page input,.bf-page textarea{box-sizing:border-box;padding:9px;border:1px solid #c9cdd2;border-radius:5px;background:#fff;color:#202124;font:inherit;max-width:100%}.bf-page input{width:200px}.bf-page textarea{display:block;width:100%;min-height:110px;resize:vertical;margin-top:6px}.bf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:14px}.bf-card{min-width:0;border:1px solid #d8dce1;border-radius:8px;padding:16px;background:#fff;overflow-wrap:anywhere}.bf-card-heading{justify-content:space-between}.bf-card h3{font-size:16px;margin:0}.bf-card p{font-size:13px;line-height:1.5;margin:10px 0}.bf-muted{color:#62676e}.bf-actions{margin:12px 0;gap:8px}.bf-actions button,.bf-actions a{font:inherit;font-size:12px;padding:8px 10px;border:1px solid #c9cdd2;border-radius:5px;background:#fff;color:#184b80;cursor:pointer;text-decoration:none}.bf-actions button:disabled{opacity:.5;cursor:default}.bf-message{padding:8px 0;font-size:13px}.bf-error{color:#a32222}</style>' +
      '<div class="bf-page"><div class="bf-stats"><span><b>' + esc(counts.new_today == null ? '—' : counts.new_today) + '</b> new today</span>' +
      '<span><b>' + esc(counts.total == null ? '—' : counts.total) + '</b> total</span><span><b>' + esc(counts.messaged_this_week == null ? '—' : counts.messaged_this_week) + '</b> messaged this week</span></div>' +
      '<style>.bf-box{font-size:13px}.bf-box div{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}.bf-box dd{margin:0}.bf-card details{font-size:13px;margin:12px 0}.bf-card details summary{cursor:pointer}.bf-card input[data-reason]{width:100%}.bf-page{color:#e2e8f0}.bf-stats{border-color:#334155}.bf-card{background:#0c1422;border-color:#334155}.bf-muted,.bf-box dt{color:#a8b7ca}.bf-page a{color:#93c5fd}.bf-page select,.bf-page input,.bf-page textarea,.bf-actions button,.bf-actions a{background:#1a2744;color:#e2e8f0;border-color:#334155}.bf-error{color:#fca5a5}</style>' +
      '<div class="bf-filters"><label>Approval<br><select data-filter="approval">' + options(approvalLabels, filters.approval, 'Pending and approved') + '</select></label>' +
      '<label>Status<br><select data-filter="status">' + options(statusLabels, filters.status, 'All statuses') + '</select></label>' +
      '<label>Property type<br><select data-filter="deal_type">' + options({ house: 'House', land: 'Land' }, filters.deal_type, 'All types') + '</select></label>' +
      '<label>Buyer type<br><select data-filter="buyer_type">'+options(buyerTypes,filters.buyer_type,'All buyer types')+'</select></label>'+
      '<label>State or metro<br><input data-filter="area" value="' + esc(filters.area) + '" placeholder="State or metro"></label></div>' +
      '<p class="bf-muted">'+esc(payload&&payload.last_import_at?'Last imported '+sourceTime(payload.last_import_at):'Import time not recorded')+'</p>'+
      '<div class="bf-message' + (error ? ' bf-error' : '') + '" role="status">' + esc(error || notice) + '</div>' +
      (selectedId ? '<button data-clear-record-selection>Show all buyers</button>' : '') + importPanel() +
      (payload ? (shown.length ? '<div class="bf-grid">' + shown.map(function (item) { return card(item, drafts[item.id]); }).join('') + '</div>' : '<p>' + (items.length ? 'No buyers match these filters.' : 'No buyers found yet. Public-post finds from your assistant will appear here.') + '</p>') : '<p>' + (error ? 'Buyer finds are unavailable.' : 'Loading buyer finds...') + '</p>') + '</div>';
  }
  function paint() {
    var target = document.getElementById('wos-buyers-found');
    if (target) target.innerHTML = markup(data);
  }
  function readMessages(id) {
    return fetch('/api/dashboard/buyers-found/'+encodeURIComponent(id)+'/email',{cache:'no-store'})
      .then(function(response){if(!response.ok)throw new Error('Could not load buyer email history.');return response.json();})
      .then(function(result){messageState[id]=Object.assign({},messageState[id],{messages:result.messages});})
      .catch(function(caught){messageState[id]=Object.assign({},messageState[id],{error:caught.message});}).finally(paint);
  }
  function load() {
    if (loading || !document.getElementById('wos-buyers-found')) return;
    loading = true;
    return fetch('/api/dashboard/buyers-found', { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to view buyer finds.' : 'Could not load buyer finds.');
      return response.json();
    }).then(function (payload) { data = payload; error = ''; }).catch(function (caught) { error = caught.message; })
      .finally(function () { loading = false; paint(); });
  }
  root.renderBuyersFound = function () { setTimeout(load, 0); return '<section id="wos-buyers-found">' + markup(data) + '</section>'; };
  root.openBuyerFind = function(id) { selectedId=id;section='box';root.navigate('buyers_found',null); };
  if (typeof module !== 'undefined' && module.exports) module.exports = { markup: markup, card: card, detailedCard: detailedCard };
  if (typeof document === 'undefined') return;
  document.addEventListener('keydown', function (event) {
    if (!event.target.matches('#wos-buyers-found [data-buyer-card-open]') || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    selectedId = event.target.dataset.buyerCardOpen;
    section='box';
    paint();
  });
  document.addEventListener('input', function (event) {
    if (event.target.matches('#wos-buyers-found textarea[data-draft]')) drafts[event.target.dataset.draft] = event.target.value;
    if (event.target.matches('#wos-buyers-found [data-import-json]')) {
      importJson = event.target.value; importPreview = null; importApprove = false;
      var previewRegion = document.querySelector('#wos-buyers-found [data-import-preview]');
      if (previewRegion) previewRegion.remove();
    }
  });
  document.addEventListener('change', function (event) {
    if (event.target.matches('#wos-buyers-found [data-import-approve]')) { importApprove = event.target.checked; return; }
    if (event.target.matches('#wos-buyers-found [data-import-file]')) {
      var file = event.target.files[0];
      importPreview = null; importApprove = false;
      if (!file) return;
      if (file.size > 262144) { importMessage = 'File exceeds 256 KiB.'; paint(); return; }
      importBusy = true; importJson = ''; importMessage = 'Reading file...'; paint();
      file.text().then(function (value) { importJson = value; importMessage = 'File loaded. Preview it before importing.'; })
        .catch(function () { importMessage = 'Could not read this file.'; })
        .finally(function () { importBusy = false; paint(); });
      return;
    }
    if (!event.target.matches('#wos-buyers-found [data-filter]')) return;
    selectedId='';
    filters[event.target.dataset.filter] = event.target.value;
    paint();
  });
  document.addEventListener('click', function (event) {
    var openBuyer=event.target.closest('[data-buyer-open]');if(openBuyer){selectedId=openBuyer.dataset.buyerOpen;section=openBuyer.dataset.buyerSection||'box';paint();return;}
    var tab=event.target.closest('#wos-buyers-found [data-buyer-section]');if(tab){section=tab.dataset.buyerSection;paint();if(section==='messages')readMessages(selectedId);return;}
    var compose=event.target.closest('#wos-buyers-found [data-buyer-compose]');
    if(compose){
      var ids=[].map.call(document.querySelectorAll('#wos-buyers-found [data-buyer-email-deal]:checked'),function(input){return input.dataset.buyerEmailDeal;});
      var kind=compose.dataset.buyerCompose,id=selectedId;
      if(kind==='buyer_teaser'&&!ids.length){error='Select at least one shareable deal first.';paint();return;}
      section='messages';error='';messageState[id]={busy:true,notice:'Preparing a preview. Nothing sent.'};paint();
      fetch('/api/dashboard/buyers-found/'+encodeURIComponent(id)+'/email/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:kind,deal_ids:kind==='buyer_teaser'?ids:[]})})
        .then(function(response){if(!response.ok)throw new Error('Preview refused. Check approval, published email and current deal availability.');return response.json();})
        .then(function(result){messageState[id]={preview:result};})
        .catch(function(caught){messageState[id]={error:caught.message};}).finally(function(){paint();readMessages(id);});return;
    }
    var emailButton=event.target.closest('#wos-buyers-found [data-buyer-email]');
    if(emailButton){
      var id=selectedId,state=messageState[id]||{},preview=state.preview,review=document.querySelector('#wos-buyers-found [data-email-reviewed]');
      if(!preview||state.busy)return;
      if(!review||!review.checked){state.error='Review the entire email and tick the review box first.';paint();return;}
      var action=emailButton.dataset.buyerEmail;
      if(action==='send'&&!state.draftId)return;
      state.busy=true;state.error='';paint();
      fetch('/api/dashboard/buyers-found/'+encodeURIComponent(id)+'/email/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='draft'?{kind:preview.kind,deal_ids:preview.deal_ids,version:preview.version}:{draft_id:state.draftId,reviewed:true})})
        .then(function(response){if(!response.ok)throw new Error(action==='send'?'Send not confirmed. Check Sent before trying anything else.':'Draft changed or expired. Prepare a new preview.');return response.json();})
        .then(function(result){if(action==='draft'){state.draftId=result.id;state.notice='Draft saved. Nothing sent.';}else{state.preview=null;state.draftId=null;state.notice='Accepted by mail server. Delivery is not confirmed.';}})
        .catch(function(caught){state.error=caught.message;}).finally(function(){state.busy=false;paint();readMessages(id);});return;
    }
    var buyerCard = event.target.closest('#wos-buyers-found [data-buyer-card-open]');
    if (buyerCard && !event.target.closest('button,a,input,select,textarea,summary,[role="button"]')) { selectedId=buyerCard.dataset.buyerCardOpen;section='box';paint();return; }
    var openDeal=event.target.closest('[data-buyer-deal]');if(openDeal&&root.openReviewedDeal){root.openReviewedDeal(openDeal.dataset.buyerDeal);return;}
    if(event.target.closest('[data-clear-record-selection]')) { selectedId='';paint();return; }
    var importButton = event.target.closest('#wos-buyers-found [data-import-action]');
    if (importButton) {
      if (importBusy) return;
      var action = importButton.dataset.importAction;
      if (action === 'open') { importOpen = true; paint(); return; }
      if (action === 'cancel') { importOpen = false; importJson = ''; importPreview = null; importApprove = false; importMessage = ''; paint(); return; }
      var importBody;
      if (action === 'preview') {
        try { importBody = root.parseRecordImport ? root.parseRecordImport(importJson) : JSON.parse(importJson); } catch (_) { importMessage = 'Invalid JSON or JSONL. Check the file format.'; importPreview = null; paint(); return; }
        importApprove = false; importPreview = null;
      } else {
        if (!importPreview) return;
        importBody = { preview_id: importPreview.preview_id, bulk_approve: importApprove };
      }
      importBusy = true; importMessage = action === 'preview' ? 'Checking items...' : 'Importing...'; paint();
      fetch('/api/dashboard/buyers-found/import/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(importBody) })
        .then(function (response) {
          if (!response.ok) throw new Error(response.status === 409 ? 'Preview expired. Preview this file again.' : response.status === 413 ? 'Import exceeds the size limit.' : 'Request refused. Check the file and your admin session.');
          return response.json();
        }).then(function (result) {
          if (action === 'preview') { importPreview = result; importMessage = 'Preview only. Nothing has been saved.'; }
          else { importPreview = null; importJson = ''; importApprove = false; importOpen = false;
            notice = 'Imported ' + result.created + ' new, ' + (result.updated || 0) + ' updates, ' + result.duplicates + ' duplicates, ' + result.rejected + ' invalid, ' + result.approved + ' approved.';
            return load(); }
        }).catch(function (caught) { importPreview = null; importMessage = caught.message; })
        .finally(function () { importBusy = false; paint(); });
      return;
    }
    var button = event.target.closest('#wos-buyers-found button[data-action]');
    if (!button) return;
    var article = button.closest('[data-id]');
    var id = article.dataset.id;
    var draft = article.querySelector('textarea')&&article.querySelector('textarea').value;
    if (button.dataset.action === 'copy') {
      navigator.clipboard.writeText(draft).then(function () { notice = 'Message copied. You choose whether to send it.'; error = ''; paint(); })
        .catch(function () { error = 'Clipboard unavailable. Select the draft text to copy it.'; paint(); });
      return;
    }
    button.disabled = true;
    var body = button.dataset.action === 'type' ? {buyer_type:article.querySelector('[data-edit-buyer-type]').value} : button.dataset.action === 'save' ? { drafted_message: draft } : button.dataset.action === 'approval' ?
      { approval: button.dataset.approval, reason: article.querySelector('[data-reason]').value } : { status: button.dataset.status };
    fetch('/api/dashboard/buyers-found/' + encodeURIComponent(id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (response) {
      if (!response.ok) throw new Error('Change was not saved. Check your session and try again.');
      if (body.drafted_message !== undefined) delete drafts[id];
      notice = body.buyer_type ? 'Buyer type saved. Approval is unchanged.' : body.approval ? 'Approval saved.' : body.status ? 'Status saved.' : 'Draft saved.';
      return load();
    }).catch(function (caught) { error = caught.message; paint(); });
  });
})(typeof window === 'undefined' ? {} : window);
