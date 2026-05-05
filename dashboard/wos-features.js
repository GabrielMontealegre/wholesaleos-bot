(function() {
'use strict';

// WholesaleOS Features v4
// Loads via <script src> — never injected into index.html

var _ready = false;

window.wosInit = function() {
  if (_ready) return;
  var rows = document.querySelectorAll('tr[data-lead-id]');
  if (rows.length > 0) { _ready = true; initFeatures(); }
};

var _poll = setInterval(function() {
  if (_ready) { clearInterval(_poll); return; }
  if (document.querySelectorAll('tr[data-lead-id]').length > 0) {
    _ready = true; clearInterval(_poll); initFeatures();
  }
}, 500);
setTimeout(function() { clearInterval(_poll); }, 300000);

// ── HIDE PIN SCREEN ─────────────────────────────────────────
// Remove the PIN screen lock for now (per user request)
function hidePinScreen() {
  var pin = document.getElementById('pin-screen');
  if (pin) {
    pin.style.display = 'none';
    console.log('[wos] pin screen hidden');
  }
}
// Try immediately and after short delay
try { hidePinScreen(); } catch(e) {}
setTimeout(hidePinScreen, 1000);

// ── PATCH DEFAULT PAGINATION TO 300 ─────────────────────────
function patchPagination() {
  if (typeof window._leadsPerPage !== 'undefined') {
    if (window._leadsPerPage === 200) {
      window._leadsPerPage = 300;
      if (typeof renderLeads === 'function') renderLeads();
    }
  }
}

// ── INIT ────────────────────────────────────────────────────
function initFeatures() {
  patchPagination();
  injectLeadsTabControls();
  injectPullModal();
  watchTabNavigation();
  addRowDataAttrs();
  console.log('[wos-features v4] initialized');
}

// ── WATCH TAB NAVIGATION ─────────────────────────────────────
function watchTabNavigation() {
  // Re-inject controls when leads tab is opened
  var origNavigate = window.navigate;
  if (typeof origNavigate === 'function') {
    window.navigate = function(page, el) {
      origNavigate.call(this, page, el);
      if (page === 'leads') {
        setTimeout(function() {
          injectLeadsTabControls();
          addRowDataAttrs();
          patchPagination();
        }, 300);
      }
    };
  }
}

// ── INJECT ALL CONTROLS INTO LEADS TAB ──────────────────────
function injectLeadsTabControls() {
  // Remove old toolbar if present (will re-inject cleanly)
  var old = document.getElementById('wosLeadsControls');
  if (old) old.remove();

  // Find the leads table or its container
  var tbl = document.querySelector('table');
  if (!tbl) return;
  var container = tbl.parentNode;

  // Build the full controls block
  var ctrl = document.createElement('div');
  ctrl.id = 'wosLeadsControls';
  ctrl.style.cssText = 'background:#fff;border-bottom:2px solid #f0f0f5;';

  // ── Row 1: Action buttons ─────────────────────────────────
  var row1 = document.createElement('div');
  row1.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:8px 14px;align-items:center;background:#fafafa;border-bottom:1px solid #ebebf0;';
  row1.innerHTML =
    '<button onclick="wosPullLeadsOpen()" style="background:linear-gradient(135deg,#7c3aed,#4f46e5);border:none;border-radius:7px;color:#fff;padding:7px 16px;font-size:12px;font-weight:700;cursor:pointer;">+ Pull Leads</button>' +
    '<button onclick="wosToggleFilters()" id="wosFilterBtn" style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:7px;color:#374151;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;">⚡ Filters</button>' +
    '<button onclick="wosToggleBulk()" style="background:#fef2f2;border:1px solid #fecaca;border-radius:7px;color:#ef4444;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;">☑ Bulk Delete</button>' +
    '<button onclick="wosReanalyzeAll()" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:7px;color:#059669;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;">📊 Re-analyze Comps</button>' +
    '<div style="margin-left:auto;display:flex;align-items:center;gap:8px;">' +
    '<span style="font-size:11px;color:#9ca3af;" id="wosLeadCount"></span>' +
    '<select id="wosPerPage" onchange="wosSetPerPage(this.value)" style="font-size:12px;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;background:#fff;">' +
    [50,100,150,200,250,300,400,500].map(function(n){return '<option value="'+n+'"'+(n===300?' selected':'')+'>'+n+' / page</option>';}).join('') +
    '</select>' +
    '</div>';

  // ── Row 2: Bulk delete bar (hidden by default) ────────────
  var row2 = document.createElement('div');
  row2.id = 'wosBulkBar';
  row2.style.cssText = 'display:none;flex-wrap:wrap;gap:10px;align-items:center;padding:7px 14px;background:#fff5f5;border-bottom:1px solid #fecaca;';
  row2.innerHTML =
    '<label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#374151;cursor:pointer;font-weight:600;">' +
    '<input type="checkbox" id="wosSelectAll" style="width:15px;height:15px;accent-color:#ef4444;" onchange="wosToggleAll(this.checked)"> Select All</label>' +
    '<span id="wosSelCount" style="font-size:12px;color:#6b7280;">0 selected</span>' +
    '<button id="wosDeleteBtn" onclick="wosDeleteSelected()" disabled style="padding:6px 16px;background:#ef4444;border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;opacity:0.4;">🗑 Delete Selected</button>' +
    '<button onclick="wosHideBulk()" style="padding:6px 12px;background:#fff;border:1px solid #d1d5db;border-radius:6px;color:#6b7280;font-size:11px;cursor:pointer;">Cancel</button>' +
    '<span id="wosDelStatus" style="font-size:11px;color:#6b7280;"></span>';

  // ── Row 3: Advanced filters (hidden by default) ───────────
  var row3 = document.createElement('div');
  row3.id = 'wosFilterBar';
  row3.style.cssText = 'display:none;flex-wrap:wrap;gap:8px;align-items:flex-start;padding:10px 14px;background:#f8f8ff;border-bottom:1px solid #e5e7eb;';

  function mkFilter(label, id, opts) {
    return '<div style="display:flex;flex-direction:column;gap:3px;">' +
      '<span style="font-size:10px;font-weight:700;color:#6b7280;letter-spacing:.5px;">' + label + '</span>' +
      '<select id="' + id + '" onchange="wosApplyFilters()" style="font-size:12px;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;background:#fff;min-width:120px;">' +
      opts.map(function(o) { return '<option value="'+(o[0]||'')+'">'+o[1]+'</option>'; }).join('') +
      '</select></div>';
  }

  row3.innerHTML =
    mkFilter('STATE', 'wfState',
      [['','All States']].concat(['TX','FL','GA','OH','PA','IL','MI','NC','TN','MD','NY','CA','AZ','NV','CO','AL','AK','AR','CT','DE','HI','ID','IN','IA','KS','KY','LA','ME','MA','MN','MS','MO','MT','NE','NH','NJ','NM','ND','OK','OR','RI','SC','SD','UT','VT','VA','WA','WV','WI','WY'].map(function(s){return[s,s];}))) +
    mkFilter('SOURCE TYPE', 'wfType',
      [['','All Types'],['pre_foreclosure','Pre-Foreclosure'],['foreclosure','Foreclosure'],['probate','Probate'],['auction','Auction'],['tax_delinquent','Tax Delinquent'],['code_violation','Code Violation'],['fire','Fire Damaged'],['vacant','Vacant/Abandoned'],['lien','Lien'],['raw','Raw Lead']]) +
    mkFilter('PRIORITY', 'wfPriority',
      [['','All'],['HIGH','High'],['MEDIUM','Medium'],['LOW','Low']]) +
    mkFilter('DAYS IN SYSTEM', 'wfAge',
      [['','Any Time'],['1','Today'],['3','3 Days'],['5','5 Days'],['7','1 Week'],['14','2 Weeks'],['30','1 Month'],['60','2 Months'],['90','3 Months']]) +
    mkFilter('HAS PHONE', 'wfPhone',
      [['','Any'],['yes','Has Phone'],['no','No Phone']]) +
    mkFilter('HAS ARV', 'wfArv',
      [['','Any'],['yes','Has ARV'],['no','No ARV (needs comps)']]) +
    mkFilter('LEAD SOURCE', 'wfSource',
      [['','Any Source'],['arcgis_hub','ArcGIS'],['socrata','Socrata'],['socrata_extra','Socrata Extra'],['socrata_30','New States'],['courthouse','Courthouse']]) +
    '<div style="display:flex;align-items:flex-end;gap:6px;">' +
    '<button onclick="wosClearFilters()" style="font-size:11px;padding:5px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#6b7280;cursor:pointer;">Clear All</button>' +
    '<span id="wfCount" style="font-size:11px;color:#9ca3af;padding-bottom:2px;"></span>' +
    '</div>';

  ctrl.appendChild(row1);
  ctrl.appendChild(row2);
  ctrl.appendChild(row3);
  container.insertBefore(ctrl, tbl);

  // Apply per-page immediately
  wosSetPerPage(300);
  addRowDataAttrs();
}

// ── ADD DATA ATTRS TO ROWS ───────────────────────────────────
function addRowDataAttrs() {
  document.querySelectorAll('tr[data-lead-id]').forEach(function(row) {
    if (row.dataset.wosInit) return;
    row.dataset.wosInit = '1';
    var lid = row.dataset.leadId;
    if (window.APP && APP.leads) {
      var lead = APP.leads.find(function(l) { return l.id === lid; });
      if (lead) {
        row.dataset.state    = (lead.state    || '').toUpperCase();
        row.dataset.leadType = (lead.motivation || lead.violations || lead.lead_type || lead.source_details || '').toLowerCase();
        row.dataset.priority = (lead.priority  || '').toUpperCase();
        row.dataset.created  = lead.created_at || lead.createdAt || lead.created || '';
        row.dataset.hasPhone = (lead.phone && lead.phone.length > 6) ? 'yes' : 'no';
        row.dataset.hasArv   = (lead.arv && lead.arv > 0) ? 'yes' : 'no';
        row.dataset.source   = (lead.source || '').toLowerCase();
      }
    }
  });
}

// ── PAGINATION ───────────────────────────────────────────────
window.wosSetPerPage = function(n) {
  n = parseInt(n);
  if (!n || n < 1) return;
  window._leadsPerPage = n;
  window._leadsPage = 0;
  var sel = document.getElementById('wosPerPage');
  if (sel) sel.value = n;
  if (typeof renderLeads === 'function') renderLeads();
};

// ── FILTER TOGGLE ────────────────────────────────────────────
window.wosToggleFilters = function() {
  var fb = document.getElementById('wosFilterBar');
  var btn = document.getElementById('wosFilterBtn');
  if (!fb) return;
  var open = fb.style.display === 'flex';
  fb.style.display = open ? 'none' : 'flex';
  if (btn) btn.style.background = open ? '#f3f4f6' : '#ede9fe';
};

// ── APPLY FILTERS ────────────────────────────────────────────
window.wosApplyFilters = function() {
  addRowDataAttrs();
  var state  = (document.getElementById('wfState')    || {}).value || '';
  var type   = (document.getElementById('wfType')     || {}).value || '';
  var prio   = (document.getElementById('wfPriority') || {}).value || '';
  var age    = parseInt((document.getElementById('wfAge')    || {}).value || '0');
  var phone  = (document.getElementById('wfPhone')   || {}).value || '';
  var arv    = (document.getElementById('wfArv')     || {}).value || '';
  var src    = (document.getElementById('wfSource')  || {}).value || '';
  var now = Date.now();
  var shown = 0;
  document.querySelectorAll('tr[data-lead-id]').forEach(function(row) {
    var ok = true;
    if (state && row.dataset.state    !== state.toUpperCase())          ok = false;
    if (type  && (row.dataset.leadType||'').indexOf(type) === -1)       ok = false;
    if (prio  && row.dataset.priority !== prio.toUpperCase())           ok = false;
    if (phone && row.dataset.hasPhone !== phone)                        ok = false;
    if (arv   && row.dataset.hasArv   !== arv)                         ok = false;
    if (src   && (row.dataset.source  ||'').indexOf(src) === -1)       ok = false;
    if (age && row.dataset.created) {
      var d = new Date(row.dataset.created).getTime();
      if ((now - d) > age * 86400000) ok = false;
    }
    row.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });
  var c = document.getElementById('wfCount');
  if (c) c.textContent = shown + ' leads shown';
  var lc = document.getElementById('wosLeadCount');
  if (lc) lc.textContent = shown + ' leads';
};

window.wosClearFilters = function() {
  ['wfState','wfType','wfPriority','wfAge','wfPhone','wfArv','wfSource'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  document.querySelectorAll('tr[data-lead-id]').forEach(function(r) { r.style.display = ''; });
  var c = document.getElementById('wfCount'); if (c) c.textContent = '';
  var lc = document.getElementById('wosLeadCount'); if (lc) lc.textContent = '';
};

// ── BULK DELETE ──────────────────────────────────────────────
var _sel = {};

window.wosToggleBulk = function() {
  var b = document.getElementById('wosBulkBar');
  if (!b) { injectLeadsTabControls(); return; }
  var showing = b.style.display === 'flex';
  if (showing) { b.style.display = 'none'; removeCheckboxes(); }
  else { b.style.display = 'flex'; addCheckboxes(); }
};

window.wosHideBulk = function() {
  var b = document.getElementById('wosBulkBar'); if (b) b.style.display = 'none';
  removeCheckboxes();
  _sel = {}; updateBulkBar();
};

function addCheckboxes() {
  document.querySelectorAll('tr[data-lead-id]').forEach(function(row) {
    if (row.querySelector('.wos-chk')) return;
    var td = document.createElement('td');
    td.className = 'wos-chk-td';
    td.style.cssText = 'padding:4px 8px;width:30px;vertical-align:middle;';
    var chk = document.createElement('input');
    chk.type = 'checkbox'; chk.className = 'wos-chk';
    chk.style.cssText = 'width:15px;height:15px;cursor:pointer;accent-color:#ef4444;';
    var lid = row.dataset.leadId;
    if (_sel[lid]) chk.checked = true;
    chk.onchange = function() {
      if (this.checked) _sel[lid] = true; else delete _sel[lid];
      updateBulkBar();
    };
    td.appendChild(chk);
    row.insertBefore(td, row.firstChild);
  });
}

function removeCheckboxes() {
  document.querySelectorAll('.wos-chk-td').forEach(function(td) { td.remove(); });
  _sel = {}; updateBulkBar();
}

function updateBulkBar() {
  var n = Object.keys(_sel).length;
  var sc = document.getElementById('wosSelCount'); if (sc) sc.textContent = n + ' selected';
  var btn = document.getElementById('wosDeleteBtn');
  if (btn) { btn.disabled = n === 0; btn.style.opacity = n === 0 ? '0.4' : '1'; }
}

window.wosToggleAll = function(checked) {
  document.querySelectorAll('tr[data-lead-id]').forEach(function(row) {
    if (row.style.display === 'none') return; // skip filtered-out rows
    var chk = row.querySelector('.wos-chk');
    var lid = row.dataset.leadId;
    if (chk) chk.checked = checked;
    if (checked) _sel[lid] = true; else delete _sel[lid];
  });
  updateBulkBar();
};

window.wosDeleteSelected = function() {
  var ids = Object.keys(_sel);
  if (!ids.length) return;
  if (!confirm('Delete ' + ids.length + ' selected leads? This cannot be undone.')) return;
  var st  = document.getElementById('wosDelStatus');
  var btn = document.getElementById('wosDeleteBtn');
  if (st) st.textContent = 'Deleting ' + ids.length + '...';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Deleting...'; }
  fetch('/api/leads/delete-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ids })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      // Remove rows from DOM
      ids.forEach(function(id) {
        var row = document.querySelector('tr[data-lead-id="' + id + '"]');
        if (row) row.remove();
        // Also remove from APP.leads
        if (window.APP && APP.leads) {
          APP.leads = APP.leads.filter(function(l) { return l.id !== id; });
        }
      });
      _sel = {}; updateBulkBar();
      if (st) st.textContent = '✓ ' + (d.removed || ids.length) + ' leads deleted';
      if (btn) { btn.disabled = true; btn.textContent = '🗑 Delete Selected'; btn.style.opacity = '0.4'; }
      var sa = document.getElementById('wosSelectAll'); if (sa) sa.checked = false;
      // Update lead count badge
      var badge = document.getElementById('nav-lead-count');
      if (badge && window.APP) badge.textContent = APP.leads.length;
    } else {
      if (st) st.textContent = '✗ Error: ' + (d.error || 'Delete failed');
      if (btn) { btn.disabled = false; btn.textContent = '🗑 Delete Selected'; }
    }
  })
  .catch(function(e) {
    if (st) st.textContent = '✗ Error: ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = '🗑 Delete Selected'; }
  });
};

// ── PULL LEADS MODAL ─────────────────────────────────────────
function injectPullModal() {
  if (document.getElementById('wosPullModal')) return;
  var states = ['TX','FL','GA','OH','PA','IL','MI','NC','TN','MD','NY','CA','AZ','NV','CO','AL','AK','AR','CT','DE','HI','ID','IN','IA','KS','KY','LA','ME','MA','MN','MS','MO','MT','NE','NH','NJ','NM','ND','OK','OR','RI','SC','SD','UT','VT','VA','WA','WV','WI','WY'];
  var modal = document.createElement('div');
  modal.id = 'wosPullModal';
  modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.75);z-index:99999;align-items:center;justify-content:center;';
  modal.innerHTML =
    '<div style="background:#1a1a2e;border:1px solid #7c3aed;border-radius:16px;padding:28px;width:500px;max-width:95vw;max-height:90vh;overflow-y:auto;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;"><h2 style="color:#fff;margin:0;font-size:18px;">Pull Fresh Leads</h2>' +
    '<button onclick="wosPullLeadsClose()" style="background:none;border:none;color:#aaa;font-size:26px;cursor:pointer;">&times;</button></div>' +
    '<label style="color:#a78bfa;font-size:11px;font-weight:700;display:block;margin-bottom:5px;">STATE</label>' +
    '<select id="wplState" style="width:100%;background:#0f0f23;border:1px solid #4c1d95;color:#fff;padding:9px;border-radius:8px;font-size:13px;margin-bottom:14px;">' +
    '<option value="">All States (best markets)</option>' +
    states.map(function(st){return '<option value="'+st+'">'+st+'</option>';}).join('') +
    '</select>' +
    '<label style="color:#a78bfa;font-size:11px;font-weight:700;display:block;margin-bottom:5px;">COUNTY (optional)</label>' +
    '<input id="wplCounty" type="text" placeholder="e.g. Harris, Cook, Fulton" style="width:100%;background:#0f0f23;border:1px solid #4c1d95;color:#fff;padding:9px;border-radius:8px;font-size:13px;box-sizing:border-box;margin-bottom:14px;">' +
    '<label style="color:#a78bfa;font-size:11px;font-weight:700;display:block;margin-bottom:8px;">SOURCE TYPE</label>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;">' +
    [['','All Sources'],['code_violation','Code Violations'],['tax_delinquent','Tax Delinquent'],['pre_foreclosure','Pre-Foreclosure'],['auction','Auctions/Probate'],['arcgis','ArcGIS Portals']].map(function(opt,i) {
      return '<label style="display:flex;align-items:center;gap:6px;color:#ccc;font-size:12px;background:#0f0f23;padding:7px 10px;border-radius:7px;border:1px solid #4c1d95;cursor:pointer;"><input type="radio" name="wplSrc" value="'+opt[0]+'"'+(i===0?' checked':'')+' style="accent-color:#7c3aed"> '+opt[1]+'</label>';
    }).join('') +
    '</div>' +
    '<label style="color:#a78bfa;font-size:11px;font-weight:700;display:block;margin-bottom:5px;">HOW MANY: <span id="wplCountLbl">200</span></label>' +
    '<input id="wplCount" type="range" min="50" max="500" step="50" value="200" oninput="document.getElementById(\"wplCountLbl\").textContent=this.value" style="width:100%;accent-color:#7c3aed;margin-bottom:18px;">' +
    '<button onclick="wosRunPull()" id="wplRunBtn" style="width:100%;padding:13px;background:linear-gradient(135deg,#7c3aed,#4f46e5);border:none;border-radius:10px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">Pull Leads Now</button>' +
    '<div id="wplResult" style="margin-top:12px;padding:11px;background:#0f0f23;border-radius:8px;color:#a78bfa;font-size:13px;display:none;text-align:center;"></div>' +
    '</div>';
  document.body.appendChild(modal);
}

window.wosPullLeadsOpen  = function() { if (!document.getElementById('wosPullModal')) injectPullModal(); document.getElementById('wosPullModal').style.display = 'flex'; };
window.wosPullLeadsClose = function() { var m = document.getElementById('wosPullModal'); if (m) m.style.display = 'none'; };

window.wosRunPull = function() {
  var btn = document.getElementById('wplRunBtn');
  var res = document.getElementById('wplResult');
  var state  = (document.getElementById('wplState')  ||{}).value || '';
  var county = ((document.getElementById('wplCounty')||{}).value||'').trim();
  var count  = parseInt((document.getElementById('wplCount')||{}).value||'200');
  var srcType = '';
  document.querySelectorAll('input[name="wplSrc"]').forEach(function(r){if(r.checked)srcType=r.value;});
  if (btn) { btn.textContent = '⏳ Searching...'; btn.disabled = true; }
  if (res) { res.style.display = 'block'; res.style.color = '#a78bfa'; res.textContent = 'Pulling ' + (state||'all states') + ' — ' + count + ' leads...'; }
  var body = { count: count };
  if (state)   body.state       = state;
  if (county)  body.county      = county;
  if (srcType) body.source_type = srcType;
  fetch('/api/leads/search-fresh-v2', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
  .then(function(r){return r.json();})
  .then(function(d){
    if (btn) { btn.textContent = 'Pull Leads Now'; btn.disabled = false; }
    if (d.ok) {
      if (res) { res.style.color = '#10b981'; res.textContent = '✓ ' + d.inserted + ' new leads added! Refreshing...'; }
      setTimeout(function() { if (typeof loadLeads === 'function') loadLeads(); else if (typeof renderLeads === 'function') renderLeads(); }, 1500);
    } else {
      if (res) { res.style.color = '#ef4444'; res.textContent = '✗ Error: ' + (d.error||'Unknown'); }
    }
  }).catch(function(e) {
    if (btn) { btn.textContent = 'Pull Leads Now'; btn.disabled = false; }
    if (res) { res.style.color = '#ef4444'; res.textContent = '✗ Error: ' + e.message; }
  });
};

window.wosReanalyzeAll = function() {
  if (!confirm('Re-analyze all leads for real ARV comps? Runs in background (10-15 min for 500 leads).')) return;
  fetch('/api/leads/reanalyze', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({max:1000,force:false}) })
  .then(function(r){return r.json();})
  .then(function(d){if(d.ok)alert('✓ Reanalysis started for '+d.max+' leads. ARV values update in background.');else alert('Error: '+(d.error||'failed'));})
  .catch(function(e){alert('Error: '+e.message);});
};

})();
