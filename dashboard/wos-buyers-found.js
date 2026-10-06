'use strict';
(function (root) {
  var data = null;
  var loading = false;
  var error = '';
  var notice = '';
  var filters = { status: '', deal_type: '', area: '', approval: '' };
  var drafts = {};
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
  function card(item, editedDraft) {
    var contacts = [item.email, item.phone].filter(Boolean).map(function (value) { return '<span>' + esc(value) + ' (published by them)</span>'; }).join('<br>');
    var box = item.buy_box || {};
    var fits = item.fits || {};
    var buyerKind = String(item.classification || 'unknown').replace(/_/g, ' ');
    var boxRows = Object.keys(boxLabels).filter(function (key) { return box[key] != null && box[key] !== '' && (!Array.isArray(box[key]) || box[key].length); }).map(function (key) {
      return '<div><dt>' + esc(boxLabels[key]) + '</dt><dd>' + esc(Array.isArray(box[key]) ? box[key].join(', ') : box[key]) + '</dd></div>';
    }).join('');
    return '<article class="bf-card" data-id="' + esc(item.id) + '">' +
      '<div class="bf-card-heading"><h3>' + esc(item.name) + '</h3><span>' + esc(statusLabels[item.status]) + '</span></div>' +
      '<p class="bf-muted">Found by assistant from a public post</p><p>' + esc(item.trust_label || 'Imported - not verified') + ' | ' + esc(approvalLabels[item.approval || 'pending']) + '</p>' +
      '<p class="bf-muted">' + esc(buyerKind) + (item.post_age ? ' | Post age: ' + esc(item.post_age) : '') + '</p>' +
      (item.possible_duplicate_of ? '<p>Possible duplicate of ' + esc(item.possible_duplicate_of) + ' (' + esc(item.duplicate_basis) + '). Kept on the existing record.</p>' : '') +
      '<p><b>' + esc(item.group_name) + '</b> · ' + esc(item.deal_type) + '</p>' +
      '<p>' + esc(item.what_they_buy) + '</p><p class="bf-muted">' + esc([].concat(item.states || [], item.areas || []).join(', ') || 'Area not stated') + '</p>' +
      (contacts ? '<p>' + contacts + '</p>' : '') +
      '<p class="bf-muted">Captured ' + esc(item.captured_at) + ' · <a href="' + esc(item.source_url) + '" target="_blank" rel="noopener noreferrer">Source search</a></p>' +
      (item.post_url ? '<p><a href="' + esc(item.post_url) + '" target="_blank" rel="noopener noreferrer">Original post</a></p>' : '') +
      '<details><summary>Buy box</summary>' + (boxRows ? '<dl class="bf-box">' + boxRows + '</dl>' : '<p>No structured criteria supplied.</p>') + '</details>' +
      '<p><b>Leads that fit this buy box: ' + esc(fits.count == null ? 'Not measured' : fits.count) + '</b></p>' +
      '<details><summary>Fit reasons</summary><p>' + esc(fits.approval_required ? 'Approval required for matching. Partners stay outside end-buyer matching.' : fits.scope || 'Fit not measured.') + '</p>' +
      Object.keys(fits.reasons || {}).map(function (reason) { return '<p>' + esc(reason) + ': ' + esc(fits.reasons[reason]) + '</p>'; }).join('') +
      Object.keys(fits.unknown || {}).map(function (reason) { return '<p class="bf-muted">' + esc(reason) + ': ' + esc(fits.unknown[reason]) + '</p>'; }).join('') + '</details>' +
      '<label>Approval reason (optional)<input data-reason maxlength="300" placeholder="Optional reason"></label>' +
      '<div class="bf-actions"><button type="button" data-action="approval" data-approval="approved"' + (item.approval === 'approved' ? ' disabled' : '') + '>Approve</button>' +
      '<button type="button" data-action="approval" data-approval="rejected"' + (item.approval === 'rejected' ? ' disabled' : '') + '>Reject</button></div>' +
      '<label>Draft message<textarea maxlength="600" data-draft="' + esc(item.id) + '">' + esc(editedDraft == null ? item.drafted_message : editedDraft) + '</textarea></label>' +
      '<div class="bf-actions"><button type="button" data-action="save">Save draft</button><button type="button" data-action="copy">Copy message</button>' +
      '<a href="' + esc(item.profile_url) + '" target="_blank" rel="noopener noreferrer">Open profile</a></div>' +
      '<div class="bf-actions">' + ['messaged', 'emailed', 'commented', 'replied', 'not_a_fit'].map(function (status) {
        return '<button type="button" data-action="status" data-status="' + status + '"' + (status === item.status || (item.approval !== 'approved' && status !== 'not_a_fit') ? ' disabled' : '') + '>Mark ' + esc(statusLabels[status].toLowerCase()) + '</button>';
      }).join('') + '</div>' +
      ((item.history || []).length ? '<details><summary>Activity</summary>' + item.history.map(function (entry) {
        return '<p class="bf-muted">' + esc(approvalLabels[entry.to] || statusLabels[entry.to] || entry.to) + ' | ' + esc(entry.at) + ' | ' + esc(entry.operator_id) + ' | ' + esc(entry.channel) + (entry.reason ? ' | ' + esc(entry.reason) : '') + '</p>';
      }).join('') + '</details>' : '') + '</article>';
  }
  function markup(payload) {
    var counts = payload && payload.counts || {};
    var items = payload && payload.items || [];
    var shown = items.filter(function (item) {
      return (!filters.status || item.status === filters.status) && (!filters.deal_type || item.deal_type === filters.deal_type) &&
        (filters.approval ? (item.approval || 'pending') === filters.approval : item.approval !== 'rejected') &&
        (!filters.area || [].concat(item.states || [], item.areas || []).join(' ').toLowerCase().includes(filters.area.toLowerCase()));
    });
    return '<style>.bf-page{max-width:1180px;color:#202124}.bf-stats,.bf-filters,.bf-actions,.bf-card-heading{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.bf-stats{padding:12px 0;border-bottom:1px solid #ddd}.bf-stats b{font-size:20px}.bf-filters{padding:16px 0}.bf-page label{font-size:12px;display:block}.bf-page select,.bf-page input,.bf-page textarea{box-sizing:border-box;padding:9px;border:1px solid #c9cdd2;border-radius:5px;background:#fff;color:#202124;font:inherit;max-width:100%}.bf-page input{width:200px}.bf-page textarea{display:block;width:100%;min-height:110px;resize:vertical;margin-top:6px}.bf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:14px}.bf-card{min-width:0;border:1px solid #d8dce1;border-radius:8px;padding:16px;background:#fff;overflow-wrap:anywhere}.bf-card-heading{justify-content:space-between}.bf-card h3{font-size:16px;margin:0}.bf-card p{font-size:13px;line-height:1.5;margin:10px 0}.bf-muted{color:#62676e}.bf-actions{margin:12px 0;gap:8px}.bf-actions button,.bf-actions a{font:inherit;font-size:12px;padding:8px 10px;border:1px solid #c9cdd2;border-radius:5px;background:#fff;color:#184b80;cursor:pointer;text-decoration:none}.bf-actions button:disabled{opacity:.5;cursor:default}.bf-message{padding:8px 0;font-size:13px}.bf-error{color:#a32222}</style>' +
      '<div class="bf-page"><div class="bf-stats"><span><b>' + esc(counts.new_today == null ? '—' : counts.new_today) + '</b> new today</span>' +
      '<span><b>' + esc(counts.total == null ? '—' : counts.total) + '</b> total</span><span><b>' + esc(counts.messaged_this_week == null ? '—' : counts.messaged_this_week) + '</b> messaged this week</span></div>' +
      '<style>.bf-box{font-size:13px}.bf-box div{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}.bf-box dd{margin:0}.bf-box dt{color:#62676e}.bf-card details{font-size:13px;margin:12px 0}.bf-card details summary{cursor:pointer}.bf-card input[data-reason]{width:100%}</style>' +
      '<div class="bf-filters"><label>Approval<br><select data-filter="approval">' + options(approvalLabels, filters.approval, 'Pending and approved') + '</select></label>' +
      '<label>Status<br><select data-filter="status">' + options(statusLabels, filters.status, 'All statuses') + '</select></label>' +
      '<label>Property type<br><select data-filter="deal_type">' + options({ house: 'House', land: 'Land' }, filters.deal_type, 'All types') + '</select></label>' +
      '<label>State or metro<br><input data-filter="area" value="' + esc(filters.area) + '" placeholder="State or metro"></label></div>' +
      '<div class="bf-message' + (error ? ' bf-error' : '') + '" role="status">' + esc(error || notice) + '</div>' +
      (payload ? (shown.length ? '<div class="bf-grid">' + shown.map(function (item) { return card(item, drafts[item.id]); }).join('') + '</div>' : '<p>' + (items.length ? 'No buyers match these filters.' : 'No buyers found yet. Public-post finds from your assistant will appear here.') + '</p>') : '<p>' + (error ? 'Buyer finds are unavailable.' : 'Loading buyer finds...') + '</p>') + '</div>';
  }
  function paint() {
    var target = document.getElementById('wos-buyers-found');
    if (target) target.innerHTML = markup(data);
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
  if (typeof module !== 'undefined' && module.exports) module.exports = { markup: markup, card: card };
  if (typeof document === 'undefined') return;
  document.addEventListener('input', function (event) {
    if (event.target.matches('#wos-buyers-found textarea[data-draft]')) drafts[event.target.dataset.draft] = event.target.value;
  });
  document.addEventListener('change', function (event) {
    if (!event.target.matches('#wos-buyers-found [data-filter]')) return;
    filters[event.target.dataset.filter] = event.target.value;
    paint();
  });
  document.addEventListener('click', function (event) {
    var button = event.target.closest('#wos-buyers-found button[data-action]');
    if (!button) return;
    var article = button.closest('[data-id]');
    var id = article.dataset.id;
    var draft = article.querySelector('textarea').value;
    if (button.dataset.action === 'copy') {
      navigator.clipboard.writeText(draft).then(function () { notice = 'Message copied. You choose whether to send it.'; error = ''; paint(); })
        .catch(function () { error = 'Clipboard unavailable. Select the draft text to copy it.'; paint(); });
      return;
    }
    button.disabled = true;
    var body = button.dataset.action === 'save' ? { drafted_message: draft } : button.dataset.action === 'approval' ?
      { approval: button.dataset.approval, reason: article.querySelector('[data-reason]').value } : { status: button.dataset.status };
    fetch('/api/dashboard/buyers-found/' + encodeURIComponent(id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (response) {
      if (!response.ok) throw new Error('Change was not saved. Check your session and try again.');
      if (body.drafted_message !== undefined) delete drafts[id];
      notice = body.approval ? 'Approval saved.' : body.status ? 'Status saved.' : 'Draft saved.';
      return load();
    }).catch(function (caught) { error = caught.message; paint(); });
  });
})(typeof window === 'undefined' ? {} : window);
