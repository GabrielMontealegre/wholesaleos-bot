// wos-public-deals.js - "Best Public Deals" queue section on the main Dashboard.
// Reads/refreshes the deal-board snapshot cache (never saved leads).
'use strict';

(function () {
  var API_LATEST = '/api/dashboard/free-public-deal-board/latest';
  var API_RUN = '/api/dashboard/free-public-deal-board/run';
  var API_CONTACT_WORKFLOW = '/api/dashboard/free-public-deal-board/contact-workflow';
  var API_DOCUMENT_REVIEW_CLEAR = '/api/dashboard/free-public-deal-board/document-review-clear';
  var API_MANUAL_EVIDENCE_UPLOAD = '/api/dashboard/free-public-deal-board/manual-evidence/upload';
  var API_MANUAL_EVIDENCE_PROPOSAL = '/api/dashboard/free-public-deal-board/manual-evidence/proposal';
  var API_MARKET_DEMAND_INDEX = '/api/dashboard/market-demand-index?limit=400';
  var lastData = null;
  var lastNote = '';
  var fetchInFlight = false;
  var marketDemandFetchInFlight = false;
  var marketDemandData = null;
  var dataByMarket = {};
  var MARKET_PRESETS = [
    { key: 'dallas', label: 'Dallas County, TX', city: 'Dallas', county: 'Dallas', state: 'TX' },
    { key: 'san_antonio', label: 'San Antonio / Bexar, TX', city: 'San Antonio', county: 'Bexar', state: 'TX' },
    { key: 'detroit', label: 'Detroit / Wayne, MI', city: 'Detroit', county: 'Wayne', state: 'MI' },
    { key: 'san_diego', label: 'San Diego County, CA', city: 'San Diego', county: 'San Diego', state: 'CA' },
    { key: 'los_angeles', label: 'Los Angeles County, CA', city: 'Los Angeles', county: 'Los Angeles', state: 'CA' },
    { key: 'houston', label: 'Houston / Harris, TX (proof lane)', city: 'Houston', county: 'Harris', state: 'TX' }
  ];
  var selectedMarketKey = readStoredMarketKey();

  function readStoredMarketKey() {
    try {
      var stored = window.localStorage && window.localStorage.getItem('wos_public_deals_market');
      if (MARKET_PRESETS.some(function (market) { return market.key === stored; })) return stored;
    } catch (_) { /* local storage unavailable */ }
    return 'dallas';
  }

  function selectedMarket() {
    return MARKET_PRESETS.find(function (market) { return market.key === selectedMarketKey; }) || MARKET_PRESETS[0];
  }

  function selectedMarketLabel() {
    return selectedMarket().label;
  }

  function selectedMarketStoreKey() {
    var market = selectedMarket();
    return [market.city, market.county, market.state].map(function (value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }).join('|');
  }

  function latestUrl() {
    var market = selectedMarket();
    return API_LATEST + '?city=' + encodeURIComponent(market.city) +
      '&county=' + encodeURIComponent(market.county) + '&state=' + encodeURIComponent(market.state);
  }

  function storeSelectedMarket(key) {
    selectedMarketKey = MARKET_PRESETS.some(function (market) { return market.key === key; }) ? key : 'dallas';
    try {
      if (window.localStorage) window.localStorage.setItem('wos_public_deals_market', selectedMarketKey);
    } catch (_) { /* local storage unavailable */ }
  }

  function headers() {
    return { 'Content-Type': 'application/json', 'x-user-id': window._uid || 'admin' };
  }

  function authHeaders() {
    return { 'x-user-id': window._uid || 'admin' };
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function link(label, url) {
    if (!url) return '';
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:underline;margin-right:8px;">' + esc(label) + '</a>';
  }

  function chip(label, value, color) {
    return '<span style="display:inline-block;margin:2px 6px 2px 0;padding:3px 10px;border-radius:12px;background:' + (color || '#eef2ff') + ';color:#111;font-size:12px;font-weight:600;">' + esc(label) + ': ' + esc(value) + '</span>';
  }

  function statusColor(status) {
    if (status === 'CALL_READY') return '#bbf7d0';
    if (status === 'OUTREACH_READY') return '#bfdbfe';
    if (status === 'MAIL_READY') return '#ccfbf1';
    if (/BLOCKED/.test(status || '')) return '#fecaca';
    return '#e5e7eb';
  }

  function rowStateColor(status) {
    if (status === 'CALL_READY') return '#bbf7d0';
    if (status === 'OUTREACH_READY') return '#bfdbfe';
    if (status === 'MAIL_READY') return '#ccfbf1';
    if (status === 'NEEDS_CONTACT_SEARCH') return '#e0f2fe';
    if (status === 'NEEDS_SKIP_TRACE') return '#fed7aa';
    if (status === 'NEEDS_COMPS') return '#fde68a';
    if (status === 'TITLE_NEEDED') return '#ddd6fe';
    if (status === 'CLOSED_NOT_INTERESTED') return '#e5e7eb';
    return '#e5e7eb';
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function lifecycleChip(row) {
    var state = row && row.lifecycle_status;
    if (!state || !state.status) return '';
    var color = state.quarantined ? '#fecaca' : state.status === 'FRESH' ? '#bbf7d0' : '#e5e7eb';
    return ' <span title="' + esc(state.reason_text || '') + '" style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:' + color + ';color:#111827;">' + esc(state.status) + '</span>';
  }

  function ledgerList(row) {
    var ledger = row && row.enrichment_ledger;
    var attempts = safeArray(ledger && ledger.attempts).slice(-5).reverse();
    if (!attempts.length) return '';
    return '<details style="margin-top:4px;font-size:11px;color:#374151;"><summary style="cursor:pointer;color:#2563eb;">What we tried (' + esc(String(safeArray(ledger.attempts).length)) + ')</summary>' +
      '<ul style="margin:4px 0 0 18px;padding:0;">' +
      attempts.map(function (attempt) {
        return '<li>' + esc(attempt.lane || 'lane') + ' - ' + esc(attempt.outcome || 'UNKNOWN') +
          ' - ' + esc(attempt.reason_code || '') + ' - $' + esc(String(attempt.cost_usd == null ? 0 : attempt.cost_usd)) + '</li>';
      }).join('') + '</ul></details>';
  }

  function localDateIso() {
    var today = new Date();
    return today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  }

  function saleDateInfo(row) {
    var iso = String(row && row.sale_date_iso || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { iso: '', passed: false, days: null };
    var today = localDateIso();
    var days = Math.round((Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) -
      Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)))) / 86400000);
    return { iso: iso, passed: iso < today, days: days };
  }

  function saleDateBadge(row) {
    var info = saleDateInfo(row);
    if (!info.iso) return '';
    if (info.passed) return ' <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#fecaca;color:#991b1b;">Sale date passed - verify status</span>';
    var label = row.sale_date_or_event_date || info.iso;
    return ' <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#dbeafe;color:#1e3a8a;">Sale: ' + esc(label) + ' (in ' + esc(info.days) + ' days)</span>';
  }

  function currentPage() {
    return (window.APP && window.APP.page) || '';
  }

  function marketSelectHtml() {
    return '<label style="font-size:12px;color:#374151;display:flex;align-items:center;gap:6px;">Market ' +
      '<select id="wos-public-deals-market" style="border:1px solid #cbd5e1;border-radius:7px;padding:6px 8px;background:#fff;color:#111827;font-size:12px;">' +
      MARKET_PRESETS.map(function (market) {
        return '<option value="' + esc(market.key) + '"' + (market.key === selectedMarketKey ? ' selected' : '') + '>' + esc(market.label) + '</option>';
      }).join('') + '</select></label>';
  }

  function contactWorkflowControl(row) {
    var attempts = safeArray(row.contact_workflow_attempts);
    var lastAttempt = row.contact_workflow_outcome ? '<div style="font-size:11px;color:#374151;margin-top:6px;">Last contact attempt: <b>' +
      esc(String(row.contact_workflow_outcome || '').replace(/_/g, ' ')) + '</b>' +
      (row.contact_workflow_at ? ' at ' + esc(row.contact_workflow_at) : '') +
      (attempts.length ? ' (' + esc(String(attempts.length)) + ' attempts)' : '') + '</div>' : '';
    if (row.row_state === 'CLOSED_NOT_INTERESTED') {
      return '<div style="font-size:11px;color:#374151;margin-top:6px;padding:6px 8px;border:1px solid #d1d5db;border-radius:7px;background:#f9fafb;">' +
        'Closed: <b>not interested</b>' + (row.contact_workflow_at ? ' at ' + esc(row.contact_workflow_at) : '') + '</div>';
    }
    if (row.contact_workflow_complete === true) {
      return '<div style="font-size:11px;color:#065f46;margin-top:6px;padding:6px 8px;border:1px solid #bbf7d0;border-radius:7px;background:#f0fdf4;">' +
        'Contact recorded: <b>' + esc(String(row.contact_workflow_outcome || 'contacted').replace(/_/g, ' ')) + '</b>' +
        (row.contact_workflow_at ? ' at ' + esc(row.contact_workflow_at) : '') +
        (attempts.length ? ' (' + esc(String(attempts.length)) + ' attempts)' : '') + '</div>';
    }
    if (['CALL_READY', 'OUTREACH_READY', 'MAIL_READY'].indexOf(row.row_state) === -1) return lastAttempt;
    return lastAttempt + '<div class="wos-contact-workflow" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:7px;padding:7px 8px;border:1px solid #bfdbfe;border-radius:7px;background:#eff6ff;">' +
      '<label style="font-size:11px;color:#1e3a8a;font-weight:600;">Contact outcome ' +
      '<select class="wos-contact-outcome" style="margin-left:4px;border:1px solid #93c5fd;border-radius:6px;padding:5px 7px;background:#fff;color:#111827;font-size:11px;">' +
      '<option value="">Select outcome</option><option value="reached">Reached</option><option value="left_message">Left message</option>' +
      '<option value="wrong_number">Wrong number</option><option value="not_interested">Not interested</option><option value="follow_up">Follow up</option>' +
      '</select></label>' +
      '<button type="button" class="wos-contact-save" style="padding:5px 9px;border-radius:6px;border:1px solid #2563eb;background:#2563eb;color:#fff;font-size:11px;font-weight:600;cursor:pointer;">Mark contacted</button>' +
      '<span class="wos-contact-message" style="font-size:11px;color:#6b7280;">Nothing changes until you save an outcome.</span></div>';
  }

  function documentReviewItem(item) {
    var docUrl = item && item.document_url || '';
    return '<div class="wos-document-review-item" data-queue-key="' + esc(item.queue_key || '') + '" data-document-url="' + esc(docUrl) + '" style="border:1px solid #fecaca;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff;">' +
      '<div style="font-weight:700;font-size:13px;margin-bottom:3px;">' + esc(item.queue_key || 'document review') + ' <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#fee2e2;">Terminal review</span></div>' +
      '<div style="font-size:12px;color:#374151;">' +
        (item.market && item.market.county ? esc(item.market.county) + ' County, ' : '') +
        (item.market && item.market.state ? esc(item.market.state) : '') +
        ' - ' + link('Open document', docUrl) + '</div>' +
      '<div style="font-size:12px;margin-top:3px;color:#374151;">Reason: <b>' + esc(item.latest_reason_code || '') + '</b>' +
        (item.latest_reason_text ? ' - ' + esc(item.latest_reason_text) : '') + '</div>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:4px;">This is read-only until you click Mark reviewed. It only clears the terminal review flag for this document URL.</div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:7px;">' +
        '<button type="button" class="wos-document-review-clear" style="padding:5px 9px;border-radius:6px;border:1px solid #dc2626;background:#dc2626;color:#fff;font-size:11px;font-weight:600;cursor:pointer;">Mark reviewed</button>' +
        '<span class="wos-document-review-message" style="font-size:11px;color:#6b7280;">Nothing changes until you click.</span>' +
      '</div>' +
      '</div>';
  }

  function documentReviewPanel(data) {
    var review = data && data.document_reextraction_terminal_review || {};
    var items = safeArray(review.items);
    var body = items.length
      ? items.map(documentReviewItem).join('')
      : '<div style="font-size:12px;color:#6b7280;">No terminal document reviews right now.</div>';
    return panelBox('Documents Needing Review <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#fecaca;">' + esc(review.total_count || 0) + '</span>',
      'Read-only terminal review queue from stored source documents. This does nothing until clicked.',
      body,
      '#fca5a5');
  }

  var MANUAL_EVIDENCE_SLOTS = [
    { key: 'subject_property', label: '1. Subject property', sources: ['Zillow', 'Redfin', 'Realtor.com', 'Google Maps'] },
    { key: 'sold_comp', label: '2. Sold comp', sources: ['Zillow sold result', 'Redfin sold result', 'Realtor.com sold result', 'County sales record'] },
    { key: 'county_appraisal_record', label: '3. County appraisal record', sources: ['County appraisal district', 'County parcel record'] },
    { key: 'auction_status', label: '4. Auction / sale status', sources: ['County auction page', 'Official source document'] },
    { key: 'skip_trace', label: '5. Skip-trace clue', sources: ['CyberBackgroundChecks', 'Official public contact page', 'Public search result'] }
  ];

  var MANUAL_FIELD_LABELS = {
    normalized_address: 'Address', property_kind: 'Property type', beds: 'Beds', baths: 'Baths', sqft: 'Sqft', year_built: 'Year built',
    lot_size: 'Lot size', latitude: 'Latitude', longitude: 'Longitude',
    zestimate: 'Zestimate clue', list_price: 'List price clue', asking_price: 'Asking price clue', source_url: 'Source URL', comp_address: 'Comp address', parcel_id: 'Parcel / APN',
    sold_status: 'Sold status', sold_price: 'Sold price', sold_date: 'Sold date', similarity_basis: 'Similarity basis', land_use: 'Land use',
    distance_miles: 'Distance miles', owner_name: 'Possible owner name', taxpayer_name: 'Taxpayer name', assessed_value: 'Assessed value clue',
    tax_value: 'Tax value clue', sale_date: 'Sale date', status: 'Sale status', minimum_bid: 'Minimum bid clue',
    redemption_amount: 'Redemption amount clue', contact_value: 'Phone / email / link', contact_route_kind: 'Contact type',
    contact_classification: 'Who this may reach', seller_owner_confirmed: 'I confirmed this is the owner / seller'
  };

  function manualFieldInput(item, key) {
    var value = item && item.fields && item.fields[key];
    var base = 'class="wos-manual-field" data-field="' + esc(key) + '" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:5px 7px;background:#fff;color:#111827;font-size:11px;"';
    if (key === 'seller_owner_confirmed') {
      return '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#374151;"><input type="checkbox" ' + base + (value === true ? ' checked' : '') + '> ' + esc(MANUAL_FIELD_LABELS[key]) + '</label>';
    }
    if (key === 'contact_classification') {
      var choices = [
        ['unknown_unverified_contact', 'Unknown / unverified contact'],
        ['possible_owner_contact', 'Possible owner contact'],
        ['possible_household_or_relative_contact', 'Possible household / relative'],
        ['trustee_servicer_or_attorney_contact', 'Trustee / servicer / attorney']
      ];
      return '<label style="font-size:10px;color:#6b7280;">' + esc(MANUAL_FIELD_LABELS[key]) + '<select ' + base + '>' + choices.map(function (choice) {
        return '<option value="' + esc(choice[0]) + '"' + (String(value || 'unknown_unverified_contact') === choice[0] ? ' selected' : '') + '>' + esc(choice[1]) + '</option>';
      }).join('') + '</select></label>';
    }
    if (key === 'contact_route_kind') {
      return '<label style="font-size:10px;color:#6b7280;">' + esc(MANUAL_FIELD_LABELS[key]) + '<select ' + base + '>' +
        ['phone', 'email', 'form', 'reply_link'].map(function (choice) { return '<option value="' + choice + '"' + (String(value || '') === choice ? ' selected' : '') + '>' + esc(choice.replace(/_/g, ' ')) + '</option>'; }).join('') +
        '</select></label>';
    }
    return '<label style="font-size:10px;color:#6b7280;">' + esc(MANUAL_FIELD_LABELS[key] || key.replace(/_/g, ' ')) +
      '<input type="text" ' + base + ' value="' + esc(value || '') + '"></label>';
  }

  function manualEvidenceItem(item) {
    var keys = Object.keys(MANUAL_FIELD_LABELS).filter(function (key) {
      if (item.evidence_type === 'sold_comp') return ['comp_address', 'parcel_id', 'sold_status', 'sold_price', 'sold_date', 'source_url', 'similarity_basis', 'land_use', 'property_kind', 'distance_miles', 'latitude', 'longitude', 'beds', 'baths', 'sqft', 'year_built', 'lot_size'].indexOf(key) !== -1;
      if (item.evidence_type === 'skip_trace') return ['owner_name', 'contact_value', 'contact_route_kind', 'contact_classification', 'seller_owner_confirmed', 'source_url'].indexOf(key) !== -1;
      if (item.evidence_type === 'county_appraisal_record') return ['normalized_address', 'owner_name', 'taxpayer_name', 'parcel_id', 'assessed_value', 'tax_value', 'year_built', 'land_use', 'source_url'].indexOf(key) !== -1;
      if (item.evidence_type === 'auction_status') return ['normalized_address', 'sale_date', 'status', 'minimum_bid', 'redemption_amount', 'source_url'].indexOf(key) !== -1;
      return ['normalized_address', 'property_kind', 'beds', 'baths', 'sqft', 'year_built', 'lot_size', 'latitude', 'longitude', 'zestimate', 'list_price', 'asking_price', 'source_url'].indexOf(key) !== -1;
    });
    var conflicts = safeArray(item.conflicts);
    return '<div class="wos-manual-proposal" data-evidence-id="' + esc(item.evidence_id || '') + '" style="border:1px solid ' + (item.operator_confirmed ? '#86efac' : '#fcd34d') + ';border-radius:7px;padding:8px;margin-top:7px;background:' + (item.operator_confirmed ? '#f0fdf4' : '#fffbeb') + ';">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;"><b style="font-size:11px;">' + esc(String(item.evidence_type || '').replace(/_/g, ' ')) + ' from ' + esc(item.source_name || 'screenshot') + '</b>' +
      '<span style="font-size:10px;padding:2px 7px;border-radius:9px;background:' + (item.operator_confirmed ? '#bbf7d0' : '#fde68a') + ';">' + (item.operator_confirmed ? 'CONFIRMED' : 'UNCONFIRMED OCR PROPOSAL') + '</span></div>' +
      '<div style="font-size:10px;color:#6b7280;margin-top:3px;">Captured ' + esc(item.captured_at || '') + ' - screenshot ' + esc(item.screenshot_id || '') + '</div>' +
      (conflicts.length ? '<div style="font-size:11px;color:#991b1b;margin-top:5px;"><b>Conflict - no overwrite:</b> ' + conflicts.map(function (conflict) { return esc(conflict.field + ': official "' + conflict.official_value + '" vs screenshot "' + conflict.screenshot_value + '"'); }).join(' | ') + '</div>' : '') +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px;margin-top:7px;">' + keys.map(function (key) { return manualFieldInput(item, key); }).join('') + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:7px;"><button type="button" class="wos-manual-confirm" style="padding:5px 9px;border-radius:6px;border:1px solid #047857;background:#047857;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">' + (item.operator_confirmed ? 'Update confirmed evidence' : 'Confirm these fields') + '</button>' +
      '<span class="wos-manual-proposal-message" style="font-size:10px;color:#6b7280;">Nothing counts until you confirm.</span></div></div>';
  }

  function manualUploadSlot(slot) {
    return '<div class="wos-manual-upload-slot" data-evidence-type="' + esc(slot.key) + '" style="border:1px solid #dbeafe;border-radius:7px;padding:7px;background:#f8fafc;">' +
      '<div style="font-size:11px;font-weight:700;color:#1e3a8a;margin-bottom:5px;">' + esc(slot.label) + '</div>' +
      '<select class="wos-manual-source" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:5px;background:#fff;font-size:10px;">' + slot.sources.map(function (source) { return '<option value="' + esc(source) + '">' + esc(source) + '</option>'; }).join('') + '</select>' +
      '<input class="wos-manual-source-url" type="url" placeholder="Paste the exact page URL" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:5px;margin-top:5px;font-size:10px;">' +
      '<input class="wos-manual-file" type="file" accept="image/png,image/jpeg,image/webp" style="width:100%;font-size:10px;margin-top:5px;">' +
      '<button type="button" class="wos-manual-upload" style="width:100%;padding:5px 7px;margin-top:5px;border-radius:6px;border:1px solid #2563eb;background:#2563eb;color:#fff;font-size:10px;font-weight:700;cursor:pointer;">Upload screenshot</button>' +
      '<div class="wos-manual-upload-message" style="font-size:10px;color:#6b7280;margin-top:4px;">PNG, JPG or WebP, max 8MB.</div></div>';
  }

  function manualEvidenceCard(item) {
    var packet = item.packet || {};
    var evaluation = packet.evaluation || {};
    var links = safeArray(item.research_links).map(function (entry) {
      return '<a href="' + esc(entry.url || '') + '" target="_blank" rel="noopener" title="' + esc(entry.warning || '') + '" style="display:inline-block;padding:5px 8px;margin:3px 4px 0 0;border:1px solid #93c5fd;border-radius:6px;background:#eff6ff;color:#1d4ed8;font-size:10px;text-decoration:none;font-weight:600;">' + esc(entry.label || 'Open source') + '</a>';
    }).join('');
    var missing = safeArray(item.missing_evidence);
    var proposals = safeArray(packet.evidence_items);
    var arv = evaluation.arv_range;
    var researchUrls = safeArray(item.research_links).map(function (entry) { return entry && entry.url; }).filter(Boolean);
    var gridSummary = safeArray(evaluation.comp_grid_comps).map(function (comp) {
      var criteria = safeArray(comp && comp.comp_grid && comp.comp_grid.criteria);
      return '<div style="font-size:10px;color:#374151;margin-top:3px;"><b>' + esc(comp.comp_address || comp.parcel_id || 'comp') + ':</b> ' +
        criteria.map(function (entry) { return esc(entry.criterion + ' ' + entry.status + (entry.reason ? ' (' + entry.reason + ')' : '')); }).join(' | ') +
        (comp.rejected_reason ? ' <span style="color:#991b1b;">Rejected: ' + esc(comp.rejected_reason) + '</span>' : '') +
        (comp.rural_comp_warning ? ' <span style="color:#9a3412;">' + esc(comp.rural_comp_warning) + '</span>' : '') + '</div>';
    }).join('');
    return '<details class="wos-manual-evidence-card" data-queue-key="' + esc(item.queue_key || '') + '" open style="border:1px solid #93c5fd;border-radius:8px;padding:9px 10px;margin-top:8px;background:#fff;">' +
      '<summary style="cursor:pointer;font-weight:700;font-size:13px;color:#111827;">' + esc(item.address || item.headline || item.queue_key) + ' <span style="font-size:10px;padding:2px 7px;border-radius:9px;background:#dbeafe;">' + esc(item.lead_origin || 'public record') + '</span></summary>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-top:7px;font-size:11px;color:#374151;">' +
        '<div><b>Why it may be a deal:</b> ' + esc(item.why_worth_checking || '') + '<br><b>Current state:</b> ' + esc(item.row_state || 'review') + '<br><b>Address status:</b> ' + esc(item.address_state || '') + '</div>' +
        '<div><b>Still missing:</b> ' + esc(missing.length ? missing.join(', ') : 'nothing currently listed') + '<br>' + link('Open county source proof', item.source_proof_url) + '</div>' +
      '</div>' +
      '<div style="margin-top:5px;"><b style="font-size:11px;">Open research pages:</b><br>' + (links || '<span style="font-size:10px;color:#6b7280;">No safe direct link can be built until the address is verified.</span>') +
        (researchUrls.length ? '<div style="margin-top:5px;"><button type="button" class="wos-open-research-set" data-research-urls="' + esc(encodeURIComponent(JSON.stringify(researchUrls))) + '" style="padding:6px 10px;border-radius:6px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">Open research set</button> <span class="wos-open-research-message" style="font-size:10px;color:#6b7280;">Opens the existing human research links. No server scraping.</span></div>' : '') + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px;margin-top:8px;">' + MANUAL_EVIDENCE_SLOTS.map(manualUploadSlot).join('') + '</div>' +
      '<div style="margin-top:8px;padding:7px 8px;border:1px solid #e5e7eb;border-radius:7px;background:#f9fafb;font-size:11px;">' +
        '<b>Evidence status:</b> ' + esc(evaluation.confirmed_evidence_count || 0) + ' confirmed; ' + esc(evaluation.verified_sold_comp_count || 0) + '/3 verified sold comps; ARV ' + esc(String(evaluation.arv_status || 'LOCKED').replace(/_/g, ' ')) + '; projected work state ' + esc(evaluation.projected_row_state || item.row_state || 'review') + '.' +
        (arv ? '<br><b>Preliminary screenshot ARV range:</b> $' + esc(Number(arv.low || 0).toLocaleString()) + ' - $' + esc(Number(arv.high || 0).toLocaleString()) + ' (median $' + esc(Number(arv.median || 0).toLocaleString()) + '). This is separate from county/API comp evidence.' : '') +
        (safeArray(evaluation.clue_values_not_arv).length ? '<br><b>Clues only, not ARV:</b> ' + safeArray(evaluation.clue_values_not_arv).map(function (clue) { return esc(clue.field + ' ' + clue.value); }).join(', ') : '') +
        (gridSummary ? '<details style="margin-top:5px;"><summary style="cursor:pointer;color:#1d4ed8;">Strict comp grid evidence</summary><div style="font-size:10px;color:#6b7280;">NOT_APPLIED means a required fact was missing; it never silently passes the comp.</div>' + gridSummary + '</details>' : '') +
      '</div>' +
      (proposals.length ? '<div style="margin-top:7px;"><b style="font-size:11px;">Review OCR proposals:</b>' + proposals.map(manualEvidenceItem).join('') + '</div>' : '') +
      '</details>';
  }

  function manualEvidencePanel(data) {
    var packet = data && data.manual_evidence_packet || {};
    var items = safeArray(packet.items);
    return panelBox('Manual Evidence Packet <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#dbeafe;">' + esc(String(packet.selected_count || 0)) + ' sample leads</span>',
      'Open the prepared research links, take screenshots, upload them to the matching slot, then review and confirm. OCR proposals count toward nothing until you confirm them.',
      '<div style="font-size:11px;color:#374151;padding:6px 8px;border:1px solid #fde68a;border-radius:7px;background:#fffbeb;"><b>Safety:</b> screenshot evidence never overwrites official evidence. Conflicts stay side by side. Images are temporary; confirmed extracted fields and their provenance remain in the packet store.</div>' +
      (items.length ? items.map(manualEvidenceCard).join('') : '<div style="font-size:12px;color:#6b7280;margin-top:8px;">' + esc(packet.empty_reason || 'No eligible stored rows for this market yet.') + '</div>'), '#60a5fa');
  }

  function manualEvidenceSummary(data) {
    var packet = data && data.manual_evidence_packet || {};
    var items = safeArray(packet.items);
    var confirmed = items.reduce(function (sum, item) { return sum + Number(item.packet && item.packet.evaluation && item.packet.evaluation.confirmed_evidence_count || 0); }, 0);
    return panelBox('Manual Evidence Packet',
      'A small, deterministic set of the best current rows is prepared for screenshot research.',
      '<div>' + chip('Prepared leads', packet.selected_count || 0, '#dbeafe') + chip('Confirmed evidence', confirmed, '#bbf7d0') + '</div>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:5px;">Open Deal Finder to use the Zillow, Redfin, Realtor.com, Maps, county, auction, and background-check links.</div>', '#93c5fd');
  }

  function demandValue(component, format) {
    if (!component || component.status !== 'KNOWN') return 'UNKNOWN';
    if (format === 'number') return Number(component.value || 0).toLocaleString();
    if (format === 'percent') return Number(component.value || 0).toFixed(1) + '%';
    return component.value;
  }

  function marketDemandPanel() {
    if (!marketDemandData) {
      return panelBox('County Demand Index', 'Demand is separate from lead evidence and never unlocks ARV.', '<div style="font-size:12px;color:#6b7280;">Loading the reproducible county ranking...</div>', '#a7f3d0');
    }
    if (!safeArray(marketDemandData.counties).length) {
      return panelBox('County Demand Index', 'Demand is separate from lead evidence and never unlocks ARV.', '<div style="font-size:12px;color:#991b1b;">Index unavailable: ' + esc(marketDemandData.unavailable_reason || 'no counties') + '</div>', '#a7f3d0');
    }
    var rows = safeArray(marketDemandData.counties).slice(0, 400).map(function (county) {
      var components = county.components || {};
      var city = components.nearest_major_city && components.nearest_major_city.value;
      var evidence = Object.keys(components).map(function (key) {
        var component = components[key] || {};
        return '<div><b>' + esc(key.replace(/_/g, ' ')) + ':</b> ' + esc(component.status || 'UNKNOWN') +
          ' - ' + esc(component.source || 'source unavailable') + ' (' + esc(component.evidence_date || 'date unavailable') + ')' +
          (component.unknown_reason ? ' - ' + esc(component.unknown_reason) : '') + '</div>';
      }).join('');
      return '<tr>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;font-weight:700;">' + esc(county.rank) + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;">' + esc(county.county + ', ' + county.state) + '<details style="font-size:9px;color:#6b7280;"><summary style="cursor:pointer;">sources and dates</summary>' + evidence + '</details></td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right;">' + esc(county.demand_score) + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right;">' + esc(county.confidence_score) + '%</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right;">' + esc(demandValue(components.population, 'number')) + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right;">' + esc(demandValue(components.growth_rate, 'percent')) + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;">' + esc(city ? city.name + ' (' + city.distance_miles + ' mi)' : 'UNKNOWN') + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;">' + esc(demandValue(components.source_readiness)) + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;">' + esc(demandValue(components.comp_readiness)) + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right;">' + esc(county.unknown_component_count) + '</td>' +
      '</tr>';
    }).join('');
    return panelBox('County Demand Index <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#d1fae5;">' + esc(marketDemandData.county_count || 0) + ' counties ranked</span>',
      'Population, growth, density, metro proximity, rural class, source readiness, and comp readiness. This score never changes a lead or unlocks ARV.',
      '<div style="font-size:10px;color:#6b7280;margin-bottom:5px;">Top ' + esc(Math.min(400, marketDemandData.returned_count || 0)) + ' shown. UNKNOWN values are omitted from scoring and reduce confidence. Expand a county to see every source and evidence date.</div>' +
      '<div style="overflow:auto;max-height:340px;"><table style="width:100%;border-collapse:collapse;font-size:10px;"><thead><tr><th>#</th><th>County</th><th>Score</th><th>Confidence</th><th>Population</th><th>Growth</th><th>Nearest major city</th><th>Lead source</th><th>Public comps</th><th>Unknown</th></tr></thead><tbody>' + rows + '</tbody></table></div>', '#6ee7b7');
  }

  function fetchMarketDemand(container) {
    if (marketDemandData || marketDemandFetchInFlight) return;
    marketDemandFetchInFlight = true;
    fetch(API_MARKET_DEMAND_INDEX, { headers: headers() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        marketDemandData = data || { counties: [], unavailable_reason: 'empty_response' };
        if (currentPage() === 'dashboard' && lastData) render(container, lastData, lastNote);
      })
      .catch(function (error) {
        marketDemandData = { counties: [], unavailable_reason: error.message || 'request_failed' };
        if (currentPage() === 'dashboard' && lastData) render(container, lastData, lastNote);
      })
      .finally(function () { marketDemandFetchInFlight = false; });
  }

  function rowCard(row) {
    var zipReview = row.quality_bucket === 'NEEDS_ZIP_REVIEW';
    var title = row.normalized_address || row.partial_address || row.headline || 'Source proof row';
    var lines = [];
    lines.push('<div style="font-weight:700;font-size:14px;margin-bottom:4px;">' + esc(title) +
      (zipReview ? ' <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#fed7aa;">ZIP MISSING - verify in document</span>' : '') +
      (row.county ? ' <span style="font-weight:500;font-size:11px;color:#6b7280;">(' + esc(row.county) + ' County)</span>' : '') +
      ' <span style="font-weight:500;font-size:11px;padding:2px 8px;border-radius:10px;background:' + statusColor(row.contact_status) + ';">' + esc(row.contact_status || row.quality_bucket || '') + '</span>' + lifecycleChip(row) + saleDateBadge(row) + '</div>');
    if (zipReview && row.maps_search_url_review_needed) {
      lines.push('<div style="font-size:12px;">' + link('Maps search (zip unverified - review)', row.maps_search_url_review_needed) + '</div>');
    }
    if (row.row_state) {
      lines.push('<div style="font-size:12px;">Row state: <b style="display:inline-block;padding:2px 8px;border-radius:10px;background:' + rowStateColor(row.row_state) + ';">' + esc(row.row_state) + '</b>' +
        (row.row_state_reason ? ' <span style="color:#6b7280;">' + esc(row.row_state_reason) + '</span>' : '') + '</div>');
    }
    if (row.owner_clue) lines.push('<div style="font-size:12px;">Owner clue: <b>' + esc(row.owner_clue) + '</b>' + (row.official_lookup_status ? ' <span style="color:#6b7280;">(' + esc(row.official_lookup_status) + ')</span>' : '') + '</div>');
    var recordName = row.owner_record && (row.owner_record.owner_name || row.owner_record.taxpayer_name);
    var recordLabel = row.owner_record && row.owner_record.owner_role === 'taxpayer_of_record' ? 'Taxpayer of record' : 'Owner of record';
    if (recordName) {
      lines.push('<div style="font-size:12px;">' + esc(recordLabel) + ': <b>' + esc(recordName) + '</b>' +
        (row.owner_record.is_entity ? ' <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#ddd6fe;">ENTITY</span>' : '') +
        (row.owner_record.parcel_id ? ' <span style="color:#6b7280;">Parcel/APN ' + esc(row.owner_record.parcel_id) + '</span>' : '') +
        ' ' + link('owner proof', row.owner_record.source_url) + '</div>');
    }
    if (row.mailing_route && row.mailing_route.value) {
      var taxpayerMail = row.owner_record && row.owner_record.owner_role === 'taxpayer_of_record';
      lines.push('<div style="font-size:12px;">Mailing route: <b>' + esc(row.mailing_route.value) + '</b> ' +
        '<span style="color:#991b1b;">' + esc(taxpayerMail ? 'taxpayer may be a servicer or escrow company, not the owner' : 'mail only - owner of record may differ from occupant') + '</span> ' +
        link('mail proof', row.mailing_route.source_url) + '</div>');
    }
    if (row.business_entity_resolution && (row.business_entity_resolution.status || row.business_entity_resolution.registered_agent_name)) {
      lines.push('<div style="font-size:12px;">Entity lookup: <b>' + esc(row.business_entity_resolution.status || 'review') + '</b>' +
        (row.business_entity_resolution.registered_agent_name ? ' Agent: <b>' + esc(row.business_entity_resolution.registered_agent_name) + '</b>' : '') +
        (row.business_entity_resolution.registered_agent_address ? ' - ' + esc(row.business_entity_resolution.registered_agent_address) : '') +
        ' <span style="color:#991b1b;">registered agent is not the seller</span> ' + link('entity proof', row.business_entity_resolution.source_url) + '</div>');
    }
    var links = link('Source proof', row.source_document_url || row.source_url) + link('Best click', row.best_link_to_click_first) +
      link('Maps', row.maps_url) + link('Zillow', row.zillow_url) + link('Redfin', row.redfin_url) + link('Realtor', row.realtor_url) + link('Auction', row.auction_url) + link('County record', row.official_property_record_url);
    if (links) lines.push('<div style="font-size:12px;margin:3px 0;">' + links + '</div>');
    if (row.best_contact) lines.push('<div style="font-size:12px;">Contact route: <b>' + esc(row.best_contact) + '</b></div>');
    if (row.foreclosure_type || row.source_row_reference || row.filing_period) {
      lines.push('<div style="font-size:12px;color:#374151;">' +
        (row.foreclosure_type ? 'Type: <b>' + esc(row.foreclosure_type) + '</b> ' : '') +
        (row.source_row_reference ? 'Doc #<b>' + esc(row.source_row_reference) + '</b> ' : '') +
        (row.filing_period ? 'Filing period <b>' + esc(row.filing_period) + '</b> <span style="color:#991b1b;">(not a sale date)</span>' : '') +
        '</div>');
    }
    if (row.status_evidence_text) {
      lines.push('<div style="font-size:12px;color:#374151;">Status evidence: <b>' + esc(row.status_evidence_text) + '</b></div>');
    }
    if (row.listed_price) lines.push('<div style="font-size:12px;">Source listed price: <b>' + esc(row.listed_price) + '</b>' +
      (row.program ? ' <span style="color:#6b7280;">(' + esc(row.program) + ')</span>' : '') +
      ' <span style="color:#991b1b;">not ARV or MAO</span></div>');
    lines.push('<div style="font-size:11px;color:#374151;margin-top:3px;">Comps: ' + esc(row.screenshot_comp_status || row.comp_status || 'not run') +
      (row.verified_sold_comp_count ? ' (' + esc(row.verified_sold_comp_count) + ' verified)' : '') +
      ' | ARV: ' + esc(row.ARV_lock_state || 'unknown') + ' | MAO: ' + esc(row.MAO_lock_state || 'unknown') +
      (row.appraisal_clue ? ' | County appraisal clue: ' + esc(row.appraisal_clue) + ' (not ARV)' : '') + '</div>');
    if (row.arv_lock_reason) lines.push('<div style="font-size:11px;color:#6b7280;margin-top:2px;">ARV reason: ' + esc(row.arv_lock_reason) + '</div>');
    if (safeArray(row.verified_comps).length) {
      lines.push('<div style="font-size:11px;color:#065f46;margin-top:2px;">Verified comps: ' +
        safeArray(row.verified_comps).map(function (c) {
          var compLabel = c.comp_address || (c.comp_identity_kind === 'parcel_id_only' ? 'parcel only - no street address on the public record' : '');
          return esc(compLabel) + ' $' + esc(String(c.sold_price)) + ' (' + esc(c.sold_date) + ') ' + link('public record', c.source_url);
        }).join(' | ') + '</div>');
    }
    if (row.next_comp_action) lines.push('<div style="font-size:11px;color:#374151;">Comp action: ' + esc(row.next_comp_action) + '</div>');
    lines.push('<div style="font-size:12px;margin-top:3px;">Next action: <b>' + esc(row.next_best_action || 'review') + '</b>' +
      (row.missing_fields && row.missing_fields.length ? ' <span style="color:#6b7280;">Missing: ' + esc(row.missing_fields.join(', ')) + '</span>' : '') + '</div>');
    if (row.row_state_next_action) {
      lines.push('<div style="font-size:12px;color:#1f2937;margin-top:2px;">Work-queue action: <b>' + esc(row.row_state_next_action) + '</b></div>');
    }
    lines.push(contactWorkflowControl(row));
    lines.push(ledgerList(row));
    if (safeArray(row.seller_questions).length) {
      lines.push('<details style="margin-top:4px;font-size:12px;"><summary style="cursor:pointer;color:#2563eb;">Seller questions (' + row.seller_questions.length + ')</summary><ul style="margin:4px 0 0 18px;padding:0;">' +
        safeArray(row.seller_questions).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></details>');
    }
    if (safeArray(row.blocked_sources).length) {
      lines.push('<div style="font-size:11px;color:#991b1b;margin-top:3px;">Blocked: ' + esc(safeArray(row.blocked_sources).map(function (b) { return b.source + ' (' + b.reason + ')'; }).join('; ')) + '</div>');
    }
    return '<div class="wos-public-deal-row" data-queue-key="' + esc(row.queue_key || '') + '" style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff;">' + lines.join('') + '</div>';
  }

  var BLOCKED_SUBREASON_ORDER = [
    'SALE_PASSED',
    'SUPERSEDED_DUPLICATE',
    'UNVERIFIABLE',
    'LOCKED_NO_COMPLETE_ADDRESS',
    'LOCKED_NO_SOURCED_IDENTITY',
    'RESEARCH_REFERENCE_BAD_SKIPPED',
    'LOCKED_OTHER'
  ];

  var BLOCKED_SUBREASON_LABELS = {
    SALE_PASSED: 'Sale Passed',
    SUPERSEDED_DUPLICATE: 'Superseded Duplicate',
    UNVERIFIABLE: 'Unverifiable',
    LOCKED_NO_COMPLETE_ADDRESS: 'Missing Complete Address',
    LOCKED_NO_SOURCED_IDENTITY: 'Missing Sourced Identity',
    RESEARCH_REFERENCE_BAD_SKIPPED: 'Research / Reference and Bad / Skipped',
    LOCKED_OTHER: 'Locked Other'
  };

  var BLOCKED_SUBREASON_ACTIONS = {
    LOCKED_NO_COMPLETE_ADDRESS: 'Verify the complete address from the source document.',
    LOCKED_NO_SOURCED_IDENTITY: 'Run or await the public owner/taxpayer record lookup.',
    SALE_PASSED: 'Verify a repost only if a newer source document exists.',
    SUPERSEDED_DUPLICATE: 'Confirm the richer duplicate row is the one to work.',
    UNVERIFIABLE: 'No usable address or source document; leave parked.',
    RESEARCH_REFERENCE_BAD_SKIPPED: 'Reference only; not a callable lead.',
    LOCKED_OTHER: 'Unclassified; report the reason to engineering.'
  };

  function rowIsResearchReferenceBadSkipped(row) {
    return row.quality_bucket === 'SOURCE_PROOF_ONLY' ||
      row.quality_bucket === 'REJECTED_GENERIC';
  }

  function blockedSubreasonForLoadedRow(row) {
    var status = row.lifecycle_status && row.lifecycle_status.status;
    if (rowIsResearchReferenceBadSkipped(row)) return 'RESEARCH_REFERENCE_BAD_SKIPPED';
    if (status === 'SUPERSEDED_DUPLICATE') return 'SUPERSEDED_DUPLICATE';
    if (status === 'UNVERIFIABLE') return 'UNVERIFIABLE';
    if (status === 'SALE_PASSED') return 'SALE_PASSED';
    if (!row.normalized_address) return 'LOCKED_NO_COMPLETE_ADDRESS';
    if (/owner|taxpayer|identity/i.test(row.row_state_reason || '')) return 'LOCKED_NO_SOURCED_IDENTITY';
    return 'LOCKED_OTHER';
  }

  function selectedMarketBreakdown(data) {
    var breakdown = data && data.blocked_inventory_breakdown || {};
    var key = selectedMarketStoreKey();
    var markets = safeArray(breakdown.markets);
    return markets.find(function (entry) { return entry && entry.market_key === key; }) || null;
  }

  function blockedInventoryGroups(data, segment, rows, color) {
    var breakdown = selectedMarketBreakdown(data);
    if (!breakdown) {
      return '<details style="margin-top:8px;">' +
        '<summary style="cursor:pointer;font-size:13px;font-weight:700;color:#111827;padding:6px 8px;border-radius:7px;background:' + (color || '#fecaca') + ';">Blocked / Quarantined (' + esc(String(segment && segment.count || 0)) + ')</summary>' +
        (rows.length ? '<div style="margin-top:7px;">' + rows.map(rowCard).join('') + '</div>' : '<div style="font-size:12px;color:#6b7280;padding:7px 4px;">No loaded blocked row details.</div>') +
        '</details>';
    }
    var byReason = {};
    rows.forEach(function (row) {
      var reason = blockedSubreasonForLoadedRow(row);
      if (!byReason[reason]) byReason[reason] = [];
      byReason[reason].push(row);
    });
    var order = safeArray(data && data.blocked_inventory_breakdown && data.blocked_inventory_breakdown.subreason_order).length
      ? safeArray(data.blocked_inventory_breakdown.subreason_order)
      : BLOCKED_SUBREASON_ORDER;
    var counts = breakdown.counts || {};
    var groups = order.map(function (reason) {
      var count = Number(counts[reason] || 0);
      var loadedRows = safeArray(byReason[reason]);
      if (!count && !loadedRows.length) return '';
      var samples = reason === 'LOCKED_OTHER' && safeArray(breakdown.locked_other_reason_samples).length
        ? '<div style="font-size:11px;color:#991b1b;margin-top:4px;">Reason samples: ' + esc(breakdown.locked_other_reason_samples.join(' | ')) + '</div>'
        : '';
      if (reason === 'RESEARCH_REFERENCE_BAD_SKIPPED' && breakdown.research_reference_bad_skipped) {
        var split = breakdown.research_reference_bad_skipped.rejected_reason_distribution || {};
        var splitText = Object.keys(split).sort(function (a, b) {
          return Number(split[b] || 0) - Number(split[a] || 0) || a.localeCompare(b);
        }).slice(0, 6).map(function (key) {
          return key + ': ' + split[key];
        }).join(' | ');
        if (splitText) {
          samples += '<div style="font-size:11px;color:#7c2d12;margin-top:4px;">Rejected/source-proof split: ' + esc(splitText) + '</div>';
        }
      }
      var unloaded = loadedRows.length < count
        ? '<div style="font-size:12px;color:#6b7280;padding:7px 4px;">' + esc(String(count - loadedRows.length)) + ' row detail' + (count - loadedRows.length === 1 ? ' is' : 's are') + ' outside the first 100 loaded rows; count and next action are still shown.</div>'
        : '';
      return '<details style="margin-top:7px;">' +
        '<summary style="cursor:pointer;font-size:12px;font-weight:700;color:#111827;padding:6px 8px;border-radius:7px;background:#fee2e2;">' +
        esc(BLOCKED_SUBREASON_LABELS[reason] || reason) + ' (' + esc(String(count)) + ')</summary>' +
        '<div style="font-size:12px;color:#374151;margin-top:6px;">Next action: <b>' + esc(BLOCKED_SUBREASON_ACTIONS[reason] || BLOCKED_SUBREASON_ACTIONS.LOCKED_OTHER) + '</b></div>' +
        samples +
        (loadedRows.length ? '<div style="margin-top:7px;">' + loadedRows.map(rowCard).join('') + '</div>' : '') +
        unloaded +
        (!loadedRows.length && !unloaded ? '<div style="font-size:12px;color:#6b7280;padding:7px 4px;">No rows in this blocked subreason.</div>' : '') +
        '</details>';
    }).join('');
    if (!groups) groups = '<div style="font-size:12px;color:#6b7280;padding:7px 4px;">No blocked inventory in this market.</div>';
    return '<details style="margin-top:8px;">' +
      '<summary style="cursor:pointer;font-size:13px;font-weight:700;color:#111827;padding:6px 8px;border-radius:7px;background:' + (color || '#fecaca') + ';">Blocked / Quarantined (' + esc(String(segment && segment.count || breakdown.total_inventory || 0)) + ') - grouped by reason</summary>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:5px;">blocked_inventory_breakdown returns counts and queue keys only; row details appear only when already loaded in this snapshot response.</div>' +
      groups +
      '</details>';
  }

  function panelBox(title, subtitle, bodyHtml, accent) {
    return '<div style="border:1px solid ' + (accent || '#d1d5db') + ';border-radius:10px;padding:10px 12px;margin-bottom:10px;background:#fff;">' +
      '<div style="font-weight:700;font-size:14px;margin-bottom:2px;">' + title + '</div>' +
      (subtitle ? '<div style="font-size:11px;color:#6b7280;margin-bottom:6px;">' + subtitle + '</div>' : '') +
      bodyHtml + '</div>';
  }

  function isActionableRow(row) {
    return row.quality_bucket === 'INSPECT_NOW' || row.quality_bucket === 'NEEDS_ZIP_REVIEW' ||
      row.contact_status === 'CALL_READY' || row.contact_status === 'OUTREACH_READY' || row.contact_status === 'MAIL_READY' || row.row_state === 'MAIL_READY';
  }

  function minutesUntil(iso) {
    if (!iso) return null;
    var diff = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
    return isNaN(diff) ? null : diff;
  }

  function upcomingSaleRow(rows) {
    var upcoming = rows.map(function (row) {
      return { row: row, info: saleDateInfo(row) };
    }).filter(function (item) {
      return item.info.iso && !item.info.passed;
    }).sort(function (a, b) {
      if (a.info.iso !== b.info.iso) return a.info.iso.localeCompare(b.info.iso);
      return String(a.row.normalized_address || a.row.partial_address || a.row.headline || '')
        .localeCompare(String(b.row.normalized_address || b.row.partial_address || b.row.headline || ''));
    });
    return upcoming.length ? upcoming[0] : null;
  }

  function topUrgentAddresses(rows) {
    return rows.filter(function (row) {
      var riskFlags = Array.isArray(row.risk_flags) ? row.risk_flags : [];
      var excluded = row.contact_status === 'ADDRESS_VERIFICATION_REQUIRED' ||
        riskFlags.indexOf('ADDRESS_PREFIX_SUSPECTED_VERIFY_DOCUMENT') !== -1 ||
        riskFlags.indexOf('SALE_DATE_PASSED_VERIFY_STATUS') !== -1;
      var sale = saleDateInfo(row);
      var eligible = row.contact_status === 'CALL_READY' ||
        row.row_state === 'MAIL_READY' ||
        (sale.iso && !sale.passed) ||
        row.quality_bucket === 'INSPECT_NOW' ||
        row.quality_bucket === 'NEEDS_ZIP_REVIEW';
      return !excluded && eligible && Boolean(row.normalized_address || row.partial_address);
    }).sort(function (a, b) {
      var aSale = saleDateInfo(a);
      var bSale = saleDateInfo(b);
      function rank(row, sale) {
        if (row.contact_status === 'CALL_READY') return 0;
        if (row.row_state === 'MAIL_READY') return 1;
        if (sale.iso && !sale.passed) return 2;
        if (row.quality_bucket === 'INSPECT_NOW') return 3;
        return 4;
      }
      var aRank = rank(a, aSale);
      var bRank = rank(b, bSale);
      if (aRank !== bRank) return aRank - bRank;
      if (aRank === 2 && aSale.iso !== bSale.iso) return aSale.iso.localeCompare(bSale.iso);
      return String(a.normalized_address || a.partial_address).localeCompare(
        String(b.normalized_address || b.partial_address)
      );
    }).slice(0, 3);
  }

  function urgentContextLabel(row) {
    if (row.contact_status === 'CALL_READY') return 'CALL_READY';
    if (row.row_state === 'MAIL_READY') return 'MAIL_READY';
    var sale = saleDateInfo(row);
    if (sale.iso && !sale.passed) return 'Sale in ' + sale.days + ' days';
    return row.quality_bucket || 'REVIEW';
  }

  function dailyMachinePanel(data, rows) {
    var c = data.counts || {};
    var batch = data.batch;
    var daily = data.daily || {};
    var autoRun = data.auto_run || {};
    var today = new Date().toISOString().slice(0, 10);
    var actionableToday = rows.filter(function (r) {
      return isActionableRow(r) && String(r.first_seen_at || '').slice(0, 10) === today;
    }).length;
    var eta = minutesUntil(autoRun.next_run_at);
    var statusChip = autoRun.enabled
      ? chip('AUTO-RUN', 'ON every ' + (autoRun.interval_minutes || 20) + ' min', '#bbf7d0') +
        (eta != null ? chip('Next run', eta <= 0 ? 'due now' : 'in ~' + eta + ' min', '#bfdbfe') : '') +
        chip('Runs today', (autoRun.runs_today || 0) + '/' + (autoRun.daily_cap || 24))
      : chip('AUTO-RUN', 'OFF - flip the switch above to collect deals all day', '#fecaca');
    var statChips = [
      chip('Batches today', daily.batches_today || 0),
      chip('New rows today', c.today_rows || 0, '#ddd6fe'),
      chip('Address rows today', daily.address_rows_today || 0, '#ddd6fe'),
      chip('Actionable today', actionableToday, '#fde68a'),
      chip('OCR rows today', daily.ocr_address_rows_today || 0),
      chip('CALL_READY', c.call_ready || 0, '#bbf7d0'),
      chip('MAIL_READY', c.mail_ready || 0, '#ccfbf1'),
      chip('Needs contact search', c.needs_contact_search || 0, '#e0f2fe'),
      chip('Needs skip trace', c.needs_skip_trace || 0, '#fed7aa'),
      chip('ZIP review', c.needs_zip_review || 0, '#fed7aa'),
      chip('INSPECT_NOW', c.inspect_now || 0, '#fde68a'),
      chip('Quarantined', c.quarantined || 0, '#fecaca'),
      chip('Rows total', c.total_rows || 0)
    ].join('');
    var meta = batch
      ? '<div style="font-size:12px;color:#4b5563;margin-top:6px;">Last batch ' + esc(String(batch.run_at).replace('T', ' ').slice(0, 16)) + ' - ' + esc(batch.new_rows) + ' new, ' + esc(batch.refreshed_rows) + ' refreshed, ' + esc(batch.rejected_generic_count || 0) + ' generic rejected' + (batch.board_blocker_summary ? ' - blocker: ' + esc(batch.board_blocker_summary) : '') + '</div>'
      : '<div style="font-size:12px;color:#4b5563;margin-top:6px;">No batch yet - click "Run next free batch" or turn auto-run on.</div>';
    var ocrLine = '';
    if (batch && batch.ocr) {
      ocrLine = '<div style="font-size:11px;color:#4b5563;margin-top:4px;">OCR: ' +
        esc(batch.ocr.ocr_documents_attempted) + ' scanned docs attempted, ' +
        esc(batch.ocr.ocr_documents_succeeded) + ' read, ' +
        esc(batch.ocr.ocr_rows_with_address) + ' address rows (review recommended), ' +
        (batch.ocr.ocr_retry_documents ? esc(batch.ocr.ocr_retry_documents) + ' retried at higher scale, ' : '') +
        'quality ' + esc(batch.ocr.ocr_text_quality_score || 0) + '/100, ' +
        esc(batch.ocr.ocr_skipped_oversize) + ' oversize skipped, ' +
        esc(batch.ocr.ocr_failures) + ' failed.</div>';
    }
    var reextractionLine = '';
    if (batch && batch.document_reextraction) {
      var doc = batch.document_reextraction;
      reextractionLine = '<div style="font-size:11px;color:#4b5563;margin-top:4px;">Document re-extraction: ' +
        esc(doc.selected_count || 0) + ' stored rows selected, ' +
        esc(doc.complete_address_recovered_count || 0) + ' complete addresses recovered, ' +
        esc(doc.needs_zip_review_recovered_count || 0) + ' moved to ZIP/address review, ' +
        esc(doc.no_recovery_count || 0) + ' no recovery, ' +
        esc(doc.blocked_count || 0) + ' blocked, ' +
        esc(doc.failed_count || 0) + ' failed.</div>';
    }
    var errLine = autoRun.last_error
      ? '<div style="font-size:11px;color:#991b1b;margin-top:4px;">Last auto-run error: ' + esc(autoRun.last_error) + '</div>' : '';
    var blockers = '';
    var coverage = batch && batch.source_coverage;
    if (coverage && coverage.length) {
      var blocked = coverage.filter(function (item) { return item.blocked_reason; });
      if (blocked.length) {
        blockers = '<div style="font-size:11px;color:#991b1b;margin-top:4px;">Source blockers: ' +
          blocked.map(function (item) { return esc((item.county || item.source_id) + ' (' + item.blocked_reason + ')'); }).join(', ') + '</div>';
      }
    }
    return panelBox('Daily Deal Machine',
      selectedMarketLabel() + ' - free public sources only - snapshot cache, not saved leads.',
      '<div style="margin-bottom:4px;">' + statusChip + '</div><div>' + statChips + '</div>' + meta + ocrLine + reextractionLine + errLine + blockers + coverageTable(batch),
      autoRun.enabled ? '#86efac' : '#fca5a5');
  }

  function zipReviewCard(row) {
    return '<div style="border:1px solid #fed7aa;border-radius:10px;padding:8px 12px;margin-bottom:6px;background:#fff;">' +
      '<div style="font-weight:700;font-size:13px;">' + esc(row.partial_address || row.headline || '') +
      ' <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#fed7aa;">ZIP MISSING</span>' +
      (row.county ? ' <span style="font-weight:500;font-size:11px;color:#6b7280;">(' + esc(row.county) + ' County)</span>' : '') + '</div>' +
      '<div style="font-size:12px;margin-top:3px;">' +
      link('Open official document (find the zip here)', row.source_document_url || row.source_url) +
      link('Maps search (zip unverified - review)', row.maps_search_url_review_needed) + '</div>' +
      (row.census_zip_suggestion
        ? '<div style="font-size:12px;margin-top:3px;color:#065f46;">US Census geocoder suggests zip <b>' + esc(row.census_zip_suggestion) + '</b>' +
          (row.census_matched_address ? ' (' + esc(row.census_matched_address) + ')' : '') + ' - confirm it in the document.</div>'
        : '') +
      '<div style="font-size:12px;margin-top:3px;">Next action: <b>' + esc(row.next_best_action || 'VERIFY_ZIP_FROM_SOURCE_DOCUMENT') + '</b></div>' +
      '</div>';
  }

  function zipReviewPanel(rows) {
    var zipRows = rows.filter(function (r) { return r.quality_bucket === 'NEEDS_ZIP_REVIEW'; });
    var body = zipRows.length
      ? zipRows.map(zipReviewCard).join('')
      : '<div style="font-size:12px;color:#6b7280;">No zip-review rows right now. New ones appear when OCR reads a street + city but the zip is unreadable.</div>';
    return panelBox('ZIP Review <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#fed7aa;">' + zipRows.length + '</span>',
      'Real addresses from official documents with an unreadable zip. Open the document, read the zip yourself, then search. Never guess or fake a zip.',
      body, '#fdba74');
  }

  function dealDeskCard(data, rows) {
    var c = data.counts || {};
    var daily = data.daily || {};
    var autoRun = data.auto_run || {};
    var today = new Date().toISOString().slice(0, 10);
    var actionableToday = rows.filter(function (r) {
      return isActionableRow(r) && String(r.first_seen_at || '').slice(0, 10) === today;
    }).length;
    var soonest = upcomingSaleRow(rows);
    var urgent = topUrgentAddresses(rows);
    var actionableNow = Number(c.call_ready || 0) + Number(c.inspect_now || 0) + Number(c.needs_zip_review || 0);
    var summary = [
      chip('CALL_READY', c.call_ready || 0, '#bbf7d0'),
      chip('MAIL_READY', c.mail_ready || 0, '#ccfbf1'),
      chip('INSPECT_NOW', c.inspect_now || 0, '#fde68a'),
      chip('ZIP review', c.needs_zip_review || 0, '#fed7aa'),
      chip('New today', c.today_rows || 0, '#ddd6fe')
    ].join('');
    var nextAuction = soonest
      ? '<div style="font-size:12px;color:#374151;margin-top:6px;">Next auction: <b>' + esc(soonest.row.normalized_address || soonest.row.partial_address || soonest.row.headline || 'source row') + '</b> - ' +
        esc(soonest.row.sale_date_or_event_date || soonest.info.iso) + ' (in ' + esc(soonest.info.days) + ' days)</div>'
      : '';
    var urgentText = urgent.length
      ? '<div style="font-size:12px;color:#374151;margin-top:6px;">Top urgent: ' + urgent.map(function (row) {
        return '<span style="display:inline-block;margin-right:8px;"><b>' + esc(row.normalized_address || row.partial_address) + '</b> ' +
          '<span style="display:inline-block;padding:1px 6px;border-radius:8px;background:#e5e7eb;font-size:10px;font-weight:700;">' + esc(urgentContextLabel(row)) + '</span></span>';
      }).join('') + '</div>'
      : '<div style="font-size:12px;color:#6b7280;margin-top:6px;">No clean actionable rows yet. Review Deal Finder or wait for the next batch.</div>';
    var finder = (typeof navigate === 'function')
      ? '<button type="button" onclick="navigate(\'findme_scout\', this)" style="padding:7px 12px;border-radius:8px;border:1px solid #2563eb;background:#2563eb;color:#fff;font-size:12px;cursor:pointer;">Open Deal Finder</button>'
      : '<a href="#" style="color:#2563eb;text-decoration:underline;font-size:12px;">Open Deal Finder</a>';
    return panelBox('Today\'s Deal Desk',
      selectedMarketLabel() + ' - Dashboard summary for what is urgent now.',
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        (autoRun.enabled ? chip('AUTO-RUN', 'ON every ' + (autoRun.interval_minutes || 20) + ' min', '#bbf7d0') : chip('AUTO-RUN', 'OFF', '#fecaca')) +
        chip('Batches today', daily.batches_today || 0) +
        chip('Actionable now', actionableNow, '#bbf7d0') +
        chip('Actionable today', actionableToday, '#fde68a') +
      '</div>' +
      '<div style="margin-top:4px;">' + summary + '</div>' +
      nextAuction +
      urgentText +
      '<div style="margin-top:8px;">' + finder + '</div>',
      autoRun.enabled ? '#86efac' : '#fca5a5');
  }

  function countyOnboardingPanel(data) {
    var onboarding = data.county_onboarding || {};
    var counts = onboarding.readiness_counts || {};
    var plan = onboarding.throughput_plan || onboarding.market_plan || {};
    var counties = Array.isArray(onboarding.counties) ? onboarding.counties : [];
    var allocations = Array.isArray(plan.allocations) ? plan.allocations : [];
    var countyRows = counties.length
      ? counties.slice(0, 8).map(function (county) {
        return '<tr>' +
          '<td style="padding:2px 8px;border-bottom:1px solid #eef2ff;">' + esc(county.county || '') + '</td>' +
          '<td style="padding:2px 8px;border-bottom:1px solid #eef2ff;">' + esc(county.state || '') + '</td>' +
          '<td style="padding:2px 8px;border-bottom:1px solid #eef2ff;">' + esc(county.metro || '') + '</td>' +
          '<td style="padding:2px 8px;border-bottom:1px solid #eef2ff;">' + esc(county.tier || '') + '</td>' +
          '<td style="padding:2px 8px;border-bottom:1px solid #eef2ff;">' + esc(county.status || '') + '</td>' +
          '<td style="padding:2px 8px;border-bottom:1px solid #eef2ff;">' + esc((county.open_legs || []).join(', ')) + '</td>' +
          '<td style="padding:2px 8px;border-bottom:1px solid #eef2ff;color:#991b1b;">' + esc(county.blocked_reason || '') + '</td>' +
          '<td style="padding:2px 8px;border-bottom:1px solid #eef2ff;color:#6b7280;">' + esc(county.hypothesis || '') + '</td>' +
          '</tr>';
      }).join('')
      : '<tr><td colspan="8" style="padding:4px 8px;color:#6b7280;">No county onboarding registry entries yet.</td></tr>';
    var allocationList = allocations.length
      ? '<div style="font-size:11px;color:#374151;margin-top:6px;">Throughput plan: ' + allocations.slice(0, 10).map(function (entry) {
        return esc(entry.county || entry.market_key || '') + ' ' + esc(entry.allocated_slots || 0) + ' (' + esc(entry.budget_class || '') + ')';
      }).join(' | ') + '</div>'
      : '';
    return panelBox('County Onboarding',
      'Candidate counties, probe artifacts, and throughput snapshots for the next markets.',
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        chip('Counties', counts.total_counties || counties.length || 0) +
        chip('Open legs', counts.open_leg_count || 0, '#ddd6fe') +
        chip('Blocked', counts.blocked_count || 0, '#fecaca') +
        chip('Active markets', plan.active_market_count || 0, '#bbf7d0') +
        chip('Piloting markets', plan.piloting_market_count || 0, '#bfdbfe') +
        chip('Candidate markets', plan.candidate_market_count || 0, '#fed7aa') +
      '</div>' +
      (onboarding.generated_at ? '<div style="font-size:11px;color:#6b7280;margin-top:4px;">Generated ' + esc(onboarding.generated_at) + '</div>' : '') +
      (onboarding.artifact_path ? '<div style="font-size:11px;color:#6b7280;margin-top:2px;">Artifact: ' + esc(onboarding.artifact_path) + '</div>' : '') +
      allocationList +
      '<div style="margin-top:6px;overflow:auto;">' +
      '<table style="width:100%;font-size:11px;border-collapse:collapse;">' +
      '<tr><th style="text-align:left;padding:2px 8px;">County</th><th style="text-align:left;padding:2px 8px;">State</th><th style="text-align:left;padding:2px 8px;">Metro</th><th style="text-align:left;padding:2px 8px;">Tier</th><th style="text-align:left;padding:2px 8px;">Status</th><th style="text-align:left;padding:2px 8px;">Open legs</th><th style="text-align:left;padding:2px 8px;">Blocked reason</th><th style="text-align:left;padding:2px 8px;">Hypothesis</th></tr>' +
      countyRows + '</table></div>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:4px;">county_onboarding / readiness_counts / throughput_plan remain preview metadata only.</div>',
      '#c7d2fe');
  }

  // Retained for the compact Dashboard summary and its deterministic tests.
  function sortTopDealsRows(rows) {
    return safeArray(rows).slice().sort(function (a, b) {
      var aSale = saleDateInfo(a);
      var bSale = saleDateInfo(b);
      function rank(row, sale) {
        if (sale.passed) return 4;
        if (row.contact_status === 'CALL_READY') return 0;
        if (row.row_state === 'MAIL_READY') return 1;
        if (sale.iso) return 2;
        return 3;
      }
      var aRank = rank(a, aSale);
      var bRank = rank(b, bSale);
      if (aRank !== bRank) return aRank - bRank;
      if (aSale.iso && bSale.iso && aSale.iso !== bSale.iso) return aSale.iso.localeCompare(bSale.iso);
      return String(a.normalized_address || a.partial_address || a.headline || '').localeCompare(
        String(b.normalized_address || b.partial_address || b.headline || '')
      );
    });
  }

  function leadOperationsQueuePanel(data, allRows) {
    var queue = data && data.lead_operations_queue || {};
    var segments = safeArray(queue.segments);
    var counts = queue.counts || {};
    var rowsByKey = {};
    safeArray(allRows).forEach(function (row) {
      if (row && row.queue_key) rowsByKey[row.queue_key] = row;
    });
    var labels = {
      CALL_READY: 'Call Ready', OUTREACH_READY: 'Outreach Ready', MAIL_READY: 'Mail Ready',
      NEEDS_CONTACT_SEARCH: 'Needs Contact Search', NEEDS_SKIP_TRACE: 'Needs Skip Trace',
      NEEDS_COMPS: 'Needs Comps', TITLE_NEEDED: 'Title Needed',
      CLOSED_NOT_INTERESTED: 'Closed - Not Interested',
      BLOCKED: 'Blocked / Quarantined'
    };
    var colors = {
      CALL_READY: '#bbf7d0', OUTREACH_READY: '#bfdbfe', MAIL_READY: '#ccfbf1',
      NEEDS_CONTACT_SEARCH: '#e0f2fe', NEEDS_SKIP_TRACE: '#fed7aa',
      NEEDS_COMPS: '#fde68a', TITLE_NEEDED: '#ddd6fe',
      CLOSED_NOT_INTERESTED: '#e5e7eb', BLOCKED: '#fecaca'
    };
    var summary = ['CALL_READY', 'OUTREACH_READY', 'MAIL_READY', 'NEEDS_CONTACT_SEARCH', 'NEEDS_SKIP_TRACE', 'NEEDS_COMPS', 'TITLE_NEEDED', 'CLOSED_NOT_INTERESTED', 'BLOCKED']
      .map(function (key) { return chip(key.replace(/_/g, ' '), counts[key] || 0, colors[key]); }).join('');
    var body = segments.map(function (segment) {
      var rows = safeArray(segment && segment.row_keys).map(function (key) { return rowsByKey[key]; }).filter(Boolean);
      var key = segment && segment.key || 'BLOCKED';
      var titleNote = key === 'TITLE_NEEDED' ? ' - no verified public title workflow source yet' : '';
      if (key === 'BLOCKED') return blockedInventoryGroups(data, segment, rows, colors[key]);
      return '<details style="margin-top:8px;"' + (key === 'CALL_READY' || key === 'OUTREACH_READY' || key === 'MAIL_READY' ? ' open' : '') + '>' +
        '<summary style="cursor:pointer;font-size:13px;font-weight:700;color:#111827;padding:6px 8px;border-radius:7px;background:' + (colors[key] || '#e5e7eb') + ';">' +
        esc(labels[key] || segment && segment.label || key) + ' (' + esc(String(segment && segment.count || 0)) + ')' + esc(titleNote) +
        (rows.length < Number(segment && segment.count || 0) ? ' - showing ' + esc(String(rows.length)) + ' loaded rows' : '') + '</summary>' +
        (rows.length ? '<div style="margin-top:7px;">' + rows.map(rowCard).join('') + '</div>' : '<div style="font-size:12px;color:#6b7280;padding:7px 4px;">No rows in this work state.</div>') +
        '</details>';
    }).join('');
    if (!segments.length) body = '<div style="font-size:12px;color:#6b7280;">No lead-operations queue is available yet. Run a batch or wait for auto-run.</div>';
    return panelBox('Lead Operations Queue <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#fde68a;">' + esc(String(queue.total_rows || 0)) + '</span>',
      'Work phone leads first, then public outreach and mail. Skip trace, comps, title, and quarantined rows stay in separate honest queues.',
      '<div style="margin-bottom:6px;">' + summary + '</div>' + body, '#fcd34d');
  }

  function coverageTable(batch) {
    var coverage = batch && batch.source_coverage;
    if (!coverage || !coverage.length) return '';
    function sampleText(item) {
      var samples = item && item.rejected_url_samples;
      if (!samples || !samples.length) return '';
      return samples.slice(0, 2).map(function (sample) {
        return (sample.reason || 'rejected') + ': ' + (sample.source_url || '');
      }).join(' | ');
    }
    var rows = coverage.map(function (item) {
      var ok = item.candidate_count > 0;
      var sample = sampleText(item);
      var docsLabel = item.docs_discovered || item.docs_processed
        ? '<div style="font-size:10px;color:#6b7280;margin-top:2px;">docs read ' + esc(item.docs_processed || 0) + '/' + esc(item.docs_discovered || 0) + '</div>'
        : '';
      return '<tr>' +
        '<td style="padding:2px 8px;border-bottom:1px solid #f3f4f6;">' + esc(item.county || '') + '</td>' +
        '<td style="padding:2px 8px;border-bottom:1px solid #f3f4f6;">' + esc(item.source_name || item.source_id) + '</td>' +
        '<td style="padding:2px 8px;border-bottom:1px solid #f3f4f6;">' + esc(item.status || 'unknown') + '</td>' +
        '<td style="padding:2px 8px;border-bottom:1px solid #f3f4f6;text-align:right;' + (ok ? 'color:#065f46;font-weight:600;' : '') + '">' + esc(item.candidate_count) + docsLabel + '</td>' +
        '<td style="padding:2px 8px;border-bottom:1px solid #f3f4f6;color:#991b1b;">' + esc(item.blocked_reason || '') + '</td>' +
        '<td style="padding:2px 8px;border-bottom:1px solid #f3f4f6;color:#6b7280;max-width:360px;">' + esc(sample) + '</td>' +
        '</tr>';
    }).join('');
    return '<details style="margin-bottom:8px;"><summary style="cursor:pointer;font-size:12px;color:#2563eb;">Source coverage (' + coverage.length + ' lanes)</summary>' +
      '<table style="font-size:11px;border-collapse:collapse;margin-top:4px;"><tr>' +
      '<th style="text-align:left;padding:2px 8px;">County</th><th style="text-align:left;padding:2px 8px;">Source</th><th style="text-align:left;padding:2px 8px;">Status</th><th style="text-align:right;padding:2px 8px;">Rows / docs</th><th style="text-align:left;padding:2px 8px;">Blocked reason</th><th style="text-align:left;padding:2px 8px;">Rejected sample</th></tr>' +
      rows + '</table></details>';
  }

  function render(container, data, note) {
    lastData = data;
    lastNote = note || '';
    dataByMarket[selectedMarketKey] = { data: data, note: lastNote };
    var body = container.querySelector('.wos-public-deals-body');
    if (!body) return;
    var rows = Array.isArray(data.rows) ? data.rows : [];
    var page = currentPage();
    if (page === 'dashboard') {
      body.innerHTML =
        (note ? '<div style="font-size:12px;color:#6b7280;margin-bottom:6px;">' + esc(note) + '</div>' : '') +
        dealDeskCard(data, rows) +
        manualEvidenceSummary(data) +
        documentReviewPanel(data) +
        countyOnboardingPanel(data) +
        marketDemandPanel();
      fetchMarketDemand(container);
      return;
    }
    body.innerHTML =
      (note ? '<div style="font-size:12px;color:#6b7280;margin-bottom:6px;">' + esc(note) + '</div>' : '') +
      dailyMachinePanel(data, rows) +
      zipReviewPanel(rows) +
      manualEvidencePanel(data) +
      leadOperationsQueuePanel(data, rows);
  }

  function fetchLatest(container) {
    var requestMarketKey = selectedMarketKey;
    fetch(latestUrl(), { headers: headers() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (requestMarketKey !== selectedMarketKey) return;
        render(container, data || {}, data && data.has_snapshot ? '' : 'Snapshot cache only - nothing here is a saved lead.');
      })
      .catch(function (err) {
        if (requestMarketKey !== selectedMarketKey) return;
        container.querySelector('.wos-public-deals-body').innerHTML = '<div style="color:#991b1b;font-size:13px;">Could not load public deals: ' + esc(err.message) + '</div>';
      });
  }

  function fetchLatestWithNote(container, note) {
    var requestMarketKey = selectedMarketKey;
    fetch(latestUrl(), { headers: headers() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (requestMarketKey !== selectedMarketKey) return;
        render(container, data || {}, note);
      })
      .catch(function () { fetchLatest(container); });
  }

  function runBatch(container, button) {
    var batchMarketKey = selectedMarketKey;
    var batchMarket = selectedMarket();
    button.disabled = true;
    button.textContent = 'Starting background batch...';
    var pollCount = 0;
    function finish(note) {
      button.disabled = false;
      button.textContent = 'Run next free batch';
      if (batchMarketKey !== selectedMarketKey) return;
      if (note) fetchLatestWithNote(container, note);
      else fetchLatest(container);
    }
    function fail(message) {
      if (batchMarketKey !== selectedMarketKey) return;
      container.querySelector('.wos-public-deals-body').innerHTML = '<div style="color:#991b1b;font-size:13px;">Batch failed: ' + esc(message) + '</div>';
      button.disabled = false;
      button.textContent = 'Run next free batch';
    }
    function poll(jobId) {
      pollCount += 1;
      if (pollCount > 100) return finish('Batch still running in the background - refresh later.');
      fetch(API_RUN.replace('/run', '/job/') + jobId, { headers: headers() })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var job = data && data.job;
          if (!job) return fail((data && data.error) || 'job lost');
          if (job.status === 'running') {
            button.textContent = 'Batch running (' + esc(job.stage || 'working') + ')... ' + pollCount * 6 + 's';
            setTimeout(function () { poll(jobId); }, 6000);
            return;
          }
          if (job.status === 'failed') return fail(job.error || 'batch failed');
          var summary = job.result_summary && job.result_summary.batch;
          finish('Batch complete - ' + (summary ? summary.new_rows + ' new rows' : 'done') + '.');
        })
        .catch(function (err) { fail(err.message); });
    }
    fetch(API_RUN, { method: 'POST', headers: headers(), body: JSON.stringify({ market: batchMarket, limit: 25 }) })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.ok === false || !data.job) throw new Error((data && data.error) || 'could not start batch');
        button.textContent = data.already_running ? 'Joining running batch...' : 'Batch running in background...';
        poll(data.job.job_id);
      })
      .catch(function (err) { fail(err.message); });
  }

  function saveContactWorkflow(container, button) {
    var card = button.closest && button.closest('.wos-public-deal-row');
    var select = card && card.querySelector('.wos-contact-outcome');
    var message = card && card.querySelector('.wos-contact-message');
    var queueKey = card && card.dataset && card.dataset.queueKey;
    var outcome = select && select.value;
    if (!queueKey || !outcome) {
      if (message) message.textContent = 'Choose an outcome first.';
      return;
    }
    var requestMarketKey = selectedMarketKey;
    button.disabled = true;
    button.textContent = 'Saving...';
    fetch(API_CONTACT_WORKFLOW, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ market: selectedMarket(), queue_key: queueKey, outcome: outcome })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error((data && data.error) || 'contact outcome update failed');
        if (requestMarketKey !== selectedMarketKey) return;
        render(container, data, 'Contact outcome saved from explicit operator input.');
      })
      .catch(function (err) {
        button.disabled = false;
        button.textContent = 'Mark contacted';
        if (message) message.textContent = 'Could not save: ' + err.message;
      });
  }

  function clearDocumentReview(container, button) {
    var card = button.closest && button.closest('.wos-document-review-item');
    var queueKey = card && card.dataset && card.dataset.queueKey;
    var documentUrl = card && card.dataset && card.dataset.documentUrl;
    var message = card && card.querySelector('.wos-document-review-message');
    if (!queueKey || !documentUrl) {
      if (message) message.textContent = 'Missing queue key or document URL.';
      return;
    }
    var requestMarketKey = selectedMarketKey;
    button.disabled = true;
    button.textContent = 'Clearing...';
    fetch(API_DOCUMENT_REVIEW_CLEAR, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ market: selectedMarket(), queue_key: queueKey, document_url: documentUrl })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error((data && data.error) || 'document review clear failed');
        if (requestMarketKey !== selectedMarketKey) return;
        render(container, data, 'Terminal document review cleared from explicit operator input.');
      })
      .catch(function (err) {
        button.disabled = false;
        button.textContent = 'Mark reviewed';
        if (message) message.textContent = 'Could not clear: ' + err.message;
      });
  }

  function uploadManualEvidence(container, button) {
    var card = button.closest && button.closest('.wos-manual-evidence-card');
    var slot = button.closest && button.closest('.wos-manual-upload-slot');
    var fileInput = slot && slot.querySelector('.wos-manual-file');
    var sourceSelect = slot && slot.querySelector('.wos-manual-source');
    var sourceUrl = slot && slot.querySelector('.wos-manual-source-url');
    var message = slot && slot.querySelector('.wos-manual-upload-message');
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      if (message) message.textContent = 'Choose a screenshot first.';
      return;
    }
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl.value || '')) {
      if (message) message.textContent = 'Paste the exact page URL shown in the screenshot.';
      return;
    }
    var form = new FormData();
    form.append('market', JSON.stringify(selectedMarket()));
    form.append('queue_key', card && card.dataset && card.dataset.queueKey || '');
    form.append('evidence_type', slot && slot.dataset && slot.dataset.evidenceType || '');
    form.append('source_name', sourceSelect && sourceSelect.value || 'operator screenshot');
    form.append('source_url', sourceUrl.value);
    form.append('captured_at', new Date().toISOString());
    form.append('screenshot', file, file.name);
    button.disabled = true;
    button.textContent = 'Reading screenshot...';
    if (message) message.textContent = 'OCR is proposing fields. Nothing is confirmed yet.';
    fetch(API_MANUAL_EVIDENCE_UPLOAD, { method: 'POST', headers: authHeaders(), body: form })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error((data && data.error) || 'screenshot upload failed');
        fetchLatestWithNote(container, 'Screenshot read. Review the OCR proposal and confirm only fields you can see in the image.');
      })
      .catch(function (err) {
        button.disabled = false;
        button.textContent = 'Upload screenshot';
        if (message) message.textContent = 'Could not upload: ' + err.message;
      });
  }

  function confirmManualEvidence(container, button) {
    var card = button.closest && button.closest('.wos-manual-evidence-card');
    var proposal = button.closest && button.closest('.wos-manual-proposal');
    var message = proposal && proposal.querySelector('.wos-manual-proposal-message');
    var fields = {};
    safeArray(proposal && proposal.querySelectorAll ? Array.prototype.slice.call(proposal.querySelectorAll('.wos-manual-field')) : []).forEach(function (field) {
      var key = field.dataset && field.dataset.field;
      if (!key) return;
      fields[key] = field.type === 'checkbox' ? field.checked : field.value;
    });
    button.disabled = true;
    button.textContent = 'Saving confirmation...';
    fetch(API_MANUAL_EVIDENCE_PROPOSAL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        market: selectedMarket(),
        queue_key: card && card.dataset && card.dataset.queueKey || '',
        evidence_id: proposal && proposal.dataset && proposal.dataset.evidenceId || '',
        fields: fields,
        operator_confirmed: true
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error((data && data.error) || 'evidence confirmation failed');
        fetchLatestWithNote(container, 'Screenshot fields confirmed as explicit operator evidence. Official evidence remains unchanged.');
      })
      .catch(function (err) {
        button.disabled = false;
        button.textContent = 'Confirm these fields';
        if (message) message.textContent = 'Could not confirm: ' + err.message;
      });
  }

  function openResearchSet(button) {
    var message = button.parentNode && button.parentNode.querySelector('.wos-open-research-message');
    var urls = [];
    try { urls = JSON.parse(decodeURIComponent(button.dataset.researchUrls || '[]')); } catch (_) { urls = []; }
    var opened = 0;
    urls.filter(function (url) { return /^https?:\/\//i.test(url || ''); }).forEach(function (url) {
      var tab = window.open(url, '_blank', 'noopener,noreferrer');
      if (tab) opened += 1;
    });
    if (message) message.textContent = opened + ' of ' + urls.length + ' research tabs opened. Allow pop-ups for this dashboard if some were blocked.';
  }

  function ensureSection(page) {
    var host = document.getElementById('content') || document.getElementById('app') || document.body;
    var section = document.getElementById('wos-public-deals');
    var needsRebuild = !section || section.dataset.wosTarget !== page;
    if (!section) {
      section = document.createElement('section');
      section.id = 'wos-public-deals';
      section.style.cssText = 'margin:12px;padding:14px 16px;border:1px solid #d1d5db;border-radius:12px;background:#f9fafb;font-family:inherit;';
    }
    if (section.parentNode !== host || host.firstChild !== section) {
      host.insertBefore(section, host.firstChild);
    }
    if (needsRebuild && page === 'dashboard') {
      section.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:8px;gap:8px;">' +
        '<h2 style="margin:0;font-size:17px;">Today\'s Deal Desk <span style="font-size:11px;font-weight:500;color:#6b7280;">free sources - snapshot cache, not saved leads</span></h2>' +
        marketSelectHtml() +
        '</div><div class="wos-public-deals-body" style="max-height:620px;overflow:auto;">Loading public deals...</div>';
    } else if (needsRebuild) {
      section.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:8px;gap:8px;">' +
        '<h2 style="margin:0;font-size:17px;">Best Public Deals <span style="font-size:11px;font-weight:500;color:#6b7280;">free sources - preview snapshot, not saved leads</span></h2>' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
        marketSelectHtml() +
        '<label style="font-size:12px;color:#374151;display:flex;align-items:center;gap:4px;cursor:pointer;">' +
        '<input type="checkbox" id="wos-public-deals-auto"> Auto-refresh every 20 min</label>' +
        '<button id="wos-public-deals-run" style="padding:7px 14px;border-radius:8px;border:1px solid #2563eb;background:#2563eb;color:#fff;font-size:13px;cursor:pointer;">Run next free batch</button>' +
        '</div>' +
        '</div><div class="wos-public-deals-body" style="max-height:520px;overflow:auto;">Loading public deals...</div>';
    }
    section.dataset.wosTarget = page;
    return section;
  }

  function removeSection() {
    var section = document.getElementById('wos-public-deals');
    if (section && section.parentNode) section.parentNode.removeChild(section);
  }

  function mountForCurrentPage() {
    var page = currentPage();
    if (page !== 'dashboard' && page !== 'findme_scout') {
      removeSection();
      return;
    }

    var existing = document.getElementById('wos-public-deals');
    if (existing && existing.dataset.wosTarget === page) return;

    var section = ensureSection(page);
    var autoBox = document.getElementById('wos-public-deals-auto');
    var runButton = document.getElementById('wos-public-deals-run');
    var marketSelect = document.getElementById('wos-public-deals-market');

    if (!section._wosContactBound) {
      section._wosContactBound = true;
      section.addEventListener('click', function (event) {
        var button = event.target && event.target.closest && event.target.closest('.wos-contact-save');
        if (button) saveContactWorkflow(section, button);
        var reviewButton = event.target && event.target.closest && event.target.closest('.wos-document-review-clear');
        if (reviewButton) clearDocumentReview(section, reviewButton);
        var uploadButton = event.target && event.target.closest && event.target.closest('.wos-manual-upload');
        if (uploadButton) uploadManualEvidence(section, uploadButton);
        var confirmButton = event.target && event.target.closest && event.target.closest('.wos-manual-confirm');
        if (confirmButton) confirmManualEvidence(section, confirmButton);
        var researchButton = event.target && event.target.closest && event.target.closest('.wos-open-research-set');
        if (researchButton) openResearchSet(researchButton);
      });
    }

    if (marketSelect && !marketSelect._wosBound) {
      marketSelect._wosBound = true;
      marketSelect.addEventListener('change', function () {
        storeSelectedMarket(this.value);
        var cached = dataByMarket[selectedMarketKey];
        lastData = cached ? cached.data : null;
        lastNote = cached ? cached.note : '';
        if (autoBox) autoBox.checked = !!(lastData && lastData.auto_run && lastData.auto_run.enabled);
        if (lastData) render(section, lastData, lastNote);
        else {
          var body = section.querySelector('.wos-public-deals-body');
          if (body) body.innerHTML = '<div style="font-size:12px;color:#6b7280;">Loading ' + esc(selectedMarketLabel()) + ' public deals...</div>';
          fetchLatest(section);
        }
      });
    }

    if (page === 'findme_scout') {
      if (runButton && !runButton._wosBound) {
        runButton._wosBound = true;
        runButton.addEventListener('click', function () { runBatch(section, this); });
      }
      if (autoBox && !autoBox._wosBound) {
        autoBox._wosBound = true;
        autoBox.addEventListener('change', function () {
          var box = this;
          fetch(API_RUN.replace('/run', '/auto-run'), {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ market: selectedMarket(), enabled: box.checked, interval_minutes: 20 })
          })
            .then(function (res) { return res.json(); })
            .then(function (data) {
              if (!data || data.ok === false) throw new Error((data && data.error) || 'auto-run update failed');
              fetchLatestWithNote(section, 'Auto-run ' + (data.auto_run && data.auto_run.enabled ? 'enabled (every ' + data.auto_run.interval_minutes + ' min, capped daily).' : 'disabled.'));
            })
            .catch(function (err) {
              box.checked = !box.checked;
              fetchLatestWithNote(section, 'Auto-run change failed: ' + err.message);
            });
        });
      }
    } else {
      if (runButton) runButton.remove();
      if (autoBox) autoBox.remove();
    }

    if (lastData) {
      if (page === 'findme_scout' && autoBox) autoBox.checked = !!(lastData.auto_run && lastData.auto_run.enabled);
      render(section, lastData, lastNote);
      return;
    }

    if (fetchInFlight) return;
    fetchInFlight = true;
    var requestMarketKey = selectedMarketKey;
    fetch(latestUrl(), { headers: headers() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (requestMarketKey !== selectedMarketKey) return;
        if (page === 'findme_scout' && autoBox) autoBox.checked = !!(data && data.auto_run && data.auto_run.enabled);
        render(section, data || {}, data && data.has_snapshot ? '' : 'Snapshot cache only - nothing here is a saved lead.');
      })
      .catch(function () { fetchLatest(section); })
      .finally(function () { fetchInFlight = false; });
  }

  function keepMounted() {
    // The app does `content.innerHTML = ...` on every page render, destroying
    // anything mounted inside - watch for that and re-mount from cache.
    var observer = new MutationObserver(function () {
      mountForCurrentPage();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(function () {
      mountForCurrentPage();
    }, 3000);
  }

  function boot() {
    mountForCurrentPage();
    keepMounted();
  }

  window.__wosPublicDealsTestHooks = {
    sortTopDealsRows: sortTopDealsRows,
    topUrgentAddresses: topUrgentAddresses,
    urgentContextLabel: urgentContextLabel,
    selectedMarket: selectedMarket,
    storeSelectedMarket: storeSelectedMarket,
    latestUrl: latestUrl
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
