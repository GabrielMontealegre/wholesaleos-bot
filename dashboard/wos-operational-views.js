'use strict';
(function (root) {
  var payload = null, loading = false, error = '';
  var filters = { lane: 'working', state: '', county: '', city: '', sort: 'priority', offset: 0 };
  var pages = ['pipeline', 'outreach', 'matching', 'review'];
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function safeUrl(value) { try { var u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch (_) { return ''; } }
  function sourceLink(row) {
    var url = safeUrl(row.source_document_url || row.source_record_url || row.source_url);
    if (!url || (row.operational_eligibility || {}).source_conflict) return '';
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Source record</a>';
  }
  function eligible(row) { return !!(row.operational_eligibility && row.operational_eligibility.lane === 'working'); }
  function matchable(row, buyer) { return eligible(row) && Number(row.arv) > 0 && Number(row.offer) > 0 && buyer && buyer.matching_eligible === true; }
  function rowCard(row) {
    var state = row.operational_eligibility || {};
    return '<article class="ops-record" data-ops-id="' + esc(row.id) + '"><div class="ops-pii ops-address">' + esc(row.property_address || row.address || 'Record without a property address') + '</div>' +
      '<p>' + esc([row.city, row.county, row.state].filter(Boolean).join(', ')) + '</p><p>' + esc(state.reason || 'Needs address proof') + '</p>' +
      '<p>' + (Number(row.arv) > 0 ? 'Recorded value requires review' : 'Value unknown') + '</p><div class="ops-actions">' + sourceLink(row) +
      '<button type="button" data-ops-open="' + esc(row.id) + '">Open Lead Details</button></div></article>';
  }
  function markup(page, data) {
    var c = data && data.counts || {}, rows = data && data.rows || [];
    var labels = { working: 'Properties with address proof', needs_address_proof: 'Needs address proof', source_conflict: 'Link conflicts', all: 'Saved records' };
    var controls = Object.keys(labels).map(function(key){ var n = key === 'all' ? c.total_saved : c[key]; return '<button type="button" data-ops-lane="' + key + '">' + labels[key] + ': ' + esc(n == null ? 'Not measured' : n) + '</button>'; }).join('');
    var form = ['state', 'county', 'city'].map(function(key){return '<label>' + key[0].toUpperCase() + key.slice(1) + '<input data-ops-filter="' + key + '" value="' + esc(filters[key]) + '"></label>';}).join('') +
      '<label>Sort<select data-ops-filter="sort"><option value="priority"' + (filters.sort === 'priority' ? ' selected' : '') + '>Priority</option><option value="sale_date"' + (filters.sort === 'sale_date' ? ' selected' : '') + '>Sale date</option><option value="newest"' + (filters.sort === 'newest' ? ' selected' : '') + '>Newest</option></select></label><button type="button" data-ops-apply>Apply filters</button>';
    var body = '';
    if (page === 'pipeline' && filters.lane === 'working') {
      body = '<div class="pipeline-view">' + ['New Lead','Contacted','Offer Sent','Negotiating','Under Contract','Closed'].map(function(stage){var items = rows.filter(function(row){return row.status === stage;});return '<section class="pipe-col"><div class="pipe-header"><b>' + stage + '</b> (' + items.length + ' on this page)</div><div class="pipe-body">' + items.map(rowCard).join('') + '</div></section>';}).join('') + '</div>';
    } else if ((page === 'matching' || page === 'review') && filters.lane === 'working') {
      var pairs = data && data.matches || [];
      body = pairs.length ? pairs.map(function(pair){var row = rows.find(function(item){return String(item.id)===String(pair.lead_id);});return row ? rowCard(row) + '<p class="ops-pii">Approved buyer: ' + esc(pair.buyer_name) + '</p><p>' + esc((pair.reasons||[]).join(' | ')) + '</p>' : '';}).join('') : '<p>No eligible matches. Property proof, recorded value, offer and buyer verification are required.</p>';
    } else body = '<div class="ops-records">' + rows.map(rowCard).join('') + '</div>';
    return '<style>.ops-view{color:#e2e8f0}.ops-controls,.ops-filters,.ops-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.ops-view label{color:#cbd5e1!important;font-size:12px;display:flex;flex-direction:column;gap:5px}.ops-view input{max-width:170px}.ops-view input,.ops-view select,.ops-view button{font:inherit;border:1px solid #334155;border-radius:5px;padding:8px;background:#1a2744;color:#e2e8f0}.ops-view a{color:#93c5fd!important}.ops-records{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px}.ops-record{min-width:0;border:1px solid #334155;border-radius:8px;padding:12px;margin:8px 0;background:#0c1422;cursor:pointer;overflow-wrap:anywhere}.ops-record p{font-size:13px;margin:8px 0}.ops-address{font-weight:600}.ops-view .pipeline-view{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.ops-view .pipe-col{min-width:0}.ops-view .pipe-header{padding:10px}.ops-error{color:#fca5a5}@media(max-width:600px){.ops-view .pipeline-view{grid-template-columns:1fr}}</style>' +
      '<style>.ops-view .pipe-col,.ops-view .pipe-header,.ops-view .pipe-body{background:#0c1422!important;color:#e2e8f0!important}.ops-view .pipe-col{border:1px solid #334155;border-radius:8px}.ops-view .pipe-header b{color:#e2e8f0!important}</style>' +
      '<section class="ops-view"><div class="ops-controls">' + controls + '</div><div class="ops-filters">' + form + '</div>' +
      '<p>Showing ' + esc(data ? rows.length : 0) + ' of ' + esc(data ? data.total : 'not measured') + ' ' + esc(labels[filters.lane] || 'records') + '.</p>' +
      (error ? '<p class="ops-error" role="status">' + esc(error) + '</p>' : '') +
      (data ? body || '<p>No records in this view.</p>' : '<p>' + (error ? 'Records are unavailable.' : 'Loading records...') + '</p>') +
      '<div class="ops-actions"><button type="button" data-ops-page="previous"' + (!filters.offset ? ' disabled' : '') + '>Previous</button><button type="button" data-ops-page="next"' + (!data || data.next_offset == null ? ' disabled' : '') + '>Next</button></div></section>';
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { markup: markup, eligible: eligible, matchable: matchable, safeUrl: safeUrl };
  if (typeof document === 'undefined') return;
  root.closeMobileMenu = function() {
    var sidebar = document.querySelector('.sidebar'), overlay = document.getElementById('sidebar-overlay'), button = document.querySelector('.mobile-menu-btn');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.style.display='none';
    if (button) button.setAttribute('aria-expanded','false');
  };
  root.toggleMobileMenu = function() {
    var sidebar = document.querySelector('.sidebar'), overlay = document.getElementById('sidebar-overlay'), button = document.querySelector('.mobile-menu-btn');
    if (!sidebar) return;
    var shown = sidebar.classList.toggle('mobile-open');
    if (overlay) overlay.style.display=shown?'block':'none';
    if (button) {button.setAttribute('aria-expanded',String(shown));button.setAttribute('aria-label','Open navigation menu');}
  };
  var oldNavigate = root.navigate;
  root.navigate = function() { root.closeMobileMenu(); return oldNavigate.apply(this,arguments); };
  root.commandIsVerifiedBuyer = function(buyer){return buyer && buyer.matching_eligible===true;};
  function paint() { if (root.APP && pages.includes(root.APP.page)) document.getElementById('content').innerHTML = markup(root.APP.page,payload); }
  function load() {
    if (loading) return; loading = true;
    var query = new URLSearchParams(filters); query.set('limit','50');
    query.set('matches','true');
    return fetch('/api/dashboard/operational-leads?' + query, {cache:'no-store'}).then(function(response){if(!response.ok) throw new Error('Records could not load. Check your admin session.');return response.json();})
      .then(function(data){payload=data;error='';root.APP._operationalCounts=data.counts_all;})
      .catch(function(caught){payload=null;error=caught.message;}).finally(function(){loading=false;paint();});
  }
  var renderers = {pipeline:'renderPipeline',outreach:'renderOutreachHub',matching:'renderMatching',review:'renderReviewQueue'};
  Object.keys(renderers).forEach(function(page){root[renderers[page]]=function(){setTimeout(load,0);return markup(page,payload);};});
  var oldMatches = root.matchBuyersToLead;
  root.matchBuyersToLead = function(row,buyers){return eligible(row) && Number(row.arv)>0 && Number(row.offer)>0 && oldMatches ? oldMatches(row,(buyers||root.APP.buyers||[]).filter(function(buyer){return buyer.matching_eligible===true;})) : [];};
  var oldOpen = root.openLeadModal;
  root.openLeadModal = function(id) {
    if (oldOpen) oldOpen(id);
    var row = (root.APP.leads||[]).find(function(item){return String(item.id)===String(id);});
    var state = row && row.operational_eligibility;
    var content = document.getElementById('modal-content');
    if (!state || !content) return;
    var banner = document.createElement('p'); banner.className='ops-evidence-warning'; banner.textContent=state.reason;
    banner.style.cssText='padding:12px;background:#1a2744;color:#e2e8f0'; content.prepend(banner);
    content.querySelectorAll('a[href^="tel:"],a[href^="sms:"]').forEach(function(link){
      var digits = String(link.getAttribute('href')||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
      var proven = String(state.proven_phone||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
      if (!state.callable || digits!==proven) {link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.textContent='Phone needs source proof';}
    });
  };
  function open(id) {
    var row = (payload && payload.rows || []).find(function(item){return String(item.id)===id;});
    if (row && !root.APP.leads.some(function(item){return String(item.id)===id;})) root.APP.leads.push(row);
    root.openLeadModal(id);
  }
  document.addEventListener('click',function(event){
    var lane = event.target.closest('[data-ops-lane]');
    if(lane){filters.lane=lane.dataset.opsLane;filters.offset=0;load();return;}
    var apply = event.target.closest('[data-ops-apply]');
    if(apply){document.querySelectorAll('[data-ops-filter]').forEach(function(input){filters[input.dataset.opsFilter]=input.value;});filters.offset=0;load();return;}
    var page = event.target.closest('[data-ops-page]');
    if(page){filters.offset=page.dataset.opsPage==='next'?payload.next_offset:Math.max(0,filters.offset-50);load();return;}
    var button = event.target.closest('[data-ops-open]');
    if(button){open(button.dataset.opsOpen);return;}
    var card = event.target.closest('.ops-record');
    if(card && !event.target.closest('a,button,input,select,textarea')) open(card.dataset.opsId);
  });
})(typeof window==='undefined'?{}:window);
