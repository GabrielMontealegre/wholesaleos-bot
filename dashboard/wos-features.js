(function() {
'use strict';

// ============================================================
// WholesaleOS Features — wos-features.js
// Loaded as separate script tag. NEVER inject this into index.html.
// All DOM manipulation happens AFTER leads table is rendered.
// ============================================================

// Wait for lead rows to appear (after PIN unlock)
var _ready = false;
var _interval = setInterval(function() {
  var rows = document.querySelectorAll('tr[data-lead-id]');
  if (rows.length > 0 && !_ready) {
    _ready = true;
    clearInterval(_interval);
    initFeatures();
  }
}, 600);
setTimeout(function() { clearInterval(_interval); }, 60000);

function initFeatures() {
  injectFilterBar();
  injectBulkDeleteBar();
  injectToolbar();
  injectPullLeadsModal();
  addDataAttrs();
  console.log('[wos-features] initialized');
}

// ── DATA ATTRIBUTES ─────────────────────────────────────────
function addDataAttrs() {
  document.querySelectorAll('tr[data-lead-id]').forEach(function(row) {
    if (row.dataset.wosInit) return;
    row.dataset.wosInit = '1';
    var lid = row.dataset.leadId;
    if (window.APP && APP.leads) {
      var lead = APP.leads.find(function(l) { return l.id === lid; });
      if (lead) {
        row.dataset.state = (lead.state || '').toUpperCase();
        row.dataset.leadType = (lead.motivation || lead.violations || lead.lead_type || '').toLowerCase();
        row.dataset.priority = (lead.priority || '').toUpperCase();
        row.dataset.created = lead.created_at || lead.createdAt || lead.created || '';
      }
    }
  });
}

// ── FILTER BAR ───────────────────────────────────────────────
function injectFilterBar() {
  if (document.getElementById('wosFilterBar')) return;
  var bar = document.createElement('div');
  bar.id = 'wosFilterBar';
  bar.style.cssText = 'display:none;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 16px;background:#f8f8fb;border-bottom:1px solid #e5e7eb;';
  bar.innerHTML =
    '<span style="font-size:11px;font-weight:700;color:#6b7280;">STATE</span>' +
    '<select id="wfState" onchange="wosApplyFilters()" style="font-size:12px;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;background:#fff;">' +
    '<option value="">All</option>' +
    ['TX','FL','GA','OH','PA','IL','MI','NC','TN','MD','NY','CA','AZ','NV','CO',
     'AL','AK','AR','CT','DE','HI','ID','IN','IA','KS','KY','LA','ME','MA','MN',
     'MS','MO','MT','NE','NH','NJ','NM','ND','OK','OR','RI','SC','SD','UT','VT',
     'VA','WA','WV','WI','WY'].map(function(st) {
       return '<option value="'+st+'">'+st+'</option>';
     }).join('') +
    '</select>' +
    '<span style="font-size:11px;font-weight:700;color:#6b7280;">TYPE</span>' +
    '<select id="wfType" onchange="wosApplyFilters()" style="font-size:12px;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;background:#fff;">' +
    '<option value="">All Types</option>' +
    '<option value="code_violation">Code Violation</option>' +
    '<option value="tax_delinquent">Tax Delinquent</option>' +
    '<option value="pre_foreclosure">Pre-Foreclosure</option>' +
    '<option value="auction">Auction/Probate</option>' +
    '<option value="fire">Fire Damaged</option>' +
    '<option value="vacant">Vacant/Abandoned</option>' +
    '<option value="lien">Lien</option>' +
    '</select>' +
    '<span style="font-size:11px;font-weight:700;color:#6b7280;">AGE</span>' +
    '<select id="wfAge" onchange="wosApplyFilters()" style="font-size:12px;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;background:#fff;">' +
    '<option value="">Any Time</option>' +
    '<option value="1">Today</option>' +
    '<option value="3">3 Days</option>' +
    '<option value="5">5 Days</option>' +
    '<option value="7">1 Week</option>' +
    '<option value="30">1 Month</option>' +
    '<option value="60">2 Months</option>' +
    '<option value="90">3 Months</option>' +
    '</select>' +
    '<span style="font-size:11px;font-weight:700;color:#6b7280;">PRIORITY</span>' +
    '<select id="wfPriority" onchange="wosApplyFilters()" style="font-size:12px;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;background:#fff;">' +
    '<option value="">All</option>' +
    '<option value="HIGH">High</option>' +
    '<option value="MEDIUM">Medium</option>' +
    '<option value="LOW">Low</option>' +
    '</select>' +
    '<button onclick="wosClearFilters()" style="font-size:11px;padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#6b7280;cursor:pointer;">Clear</button>' +
    '<span id="wfCount" style="font-size:11px;color:#9ca3af;"></span>';
  insertBeforeTable(bar);
}

// ── BULK DELETE BAR ──────────────────────────────────────────
function injectBulkDeleteBar() {
  if (document.getElementById('wosBulkBar')) return;
  var bar = document.createElement('div');
  bar.id = 'wosBulkBar';
  bar.style.cssText = 'display:none;flex-wrap:wrap;gap:10px;align-items:center;padding:8px 16px;background:#fef2f2;border-bottom:1px solid #fecaca;';
  bar.innerHTML =
    '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;cursor:pointer;">' +
    '<input type="checkbox" id="wosSelectAll" style="width:15px;height:15px;" onchange="wosToggleAll(this.checked)"> Select All' +
    '</label>' +
    '<span id="wosSelCount" style="font-size:12px;color:#6b7280;">0 selected</span>' +
    '<button id="wosDeleteBtn" onclick="wosDeleteSelected()" disabled style="padding:5px 14px;background:#ef4444;border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;opacity:0.4;">Delete Selected</button>' +
    '<button onclick="wosHideBulk()" style="padding:5px 10px;background:#fff;border:1px solid #d1d5db;border-radius:6px;color:#6b7280;font-size:11px;cursor:pointer;">Cancel</button>' +
    '<span id="wosDelStatus" style="font-size:11px;color:#6b7280;"></span>';
  insertBeforeTable(bar);
}

// ── TOOLBAR ──────────────────────────────────────────────────
function injectToolbar() {
  if (document.getElementById('wosToolbar')) return;
  var tb = document.createElement('div');
  tb.id = 'wosToolbar';
  tb.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:8px 16px;background:#fff;border-bottom:1px solid #f3f4f6;';
  tb.innerHTML =
    '<button onclick="wosPullLeadsOpen()" style="font-size:12px;padding:6px 14px;background:linear-gradient(135deg,#7c3aed,#4f46e5);border:none;border-radius:7px;color:#fff;font-weight:700;cursor:pointer;">+ Pull Leads</button>' +
    '<button onclick="wosToggleFilters()" style="font-size:12px;padding:6px 12px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:7px;color:#374151;font-weight:600;cursor:pointer;">Filters</button>' +
    '<button onclick="wosToggleBulk()" style="font-size:12px;padding:6px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:7px;color:#ef4444;font-weight:600;cursor:pointer;">Bulk Delete</button>' +
    '<button onclick="wosReanalyzeAll()" style="font-size:12px;padding:6px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:7px;color:#059669;font-weight:600;cursor:pointer;">Re-analyze Comps</button>';
  insertBeforeTable(tb);
}

// ── PULL LEADS MODAL ─────────────────────────────────────────
function injectPullLeadsModal() {
  if (document.getElementById('wosPullModal')) return;
  var modal = document.createElement('div');
  modal.id = 'wosPullModal';
  modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.75);z-index:99999;align-items:center;justify-content:center;';
  var states = ['TX','FL','GA','OH','PA','IL','MI','NC','TN','MD','NY','CA','AZ','NV','CO',
    'AL','AK','AR','CT','DE','HI','ID','IN','IA','KS','KY','LA','ME','MA','MN',
    'MS','MO','MT','NE','NH','NJ','NM','ND','OK','OR','RI','SC','SD','UT','VT',
    'VA','WA','WV','WI','WY'];
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
    [['','All Sources'],['code_violation','Code Violations'],['tax_delinquent','Tax Delinquent'],
     ['pre_foreclosure','Pre-Foreclosure'],['auction','Auctions/Probate'],['arcgis','ArcGIS Portals']].map(function(opt,i) {
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

// ── HELPERS ──────────────────────────────────────────────────
function insertBeforeTable(el) {
  var tbl = document.querySelector('table, #leadsTable');
  if (tbl && tbl.parentNode) tbl.parentNode.insertBefore(el, tbl);
  else document.body.appendChild(el);
}

// ── PUBLIC API ───────────────────────────────────────────────
window.wosToggleFilters = function() {
  var b = document.getElementById('wosFilterBar');
  if (b) b.style.display = b.style.display === 'flex' ? 'none' : 'flex';
};

window.wosApplyFilters = function() {
  addDataAttrs();
  var state    = (document.getElementById('wfState')    || {}).value || '';
  var type     = (document.getElementById('wfType')     || {}).value || '';
  var age      = parseInt((document.getElementById('wfAge')    || {}).value || '0');
  var priority = (document.getElementById('wfPriority') || {}).value || '';
  var now = Date.now();
  var shown = 0;
  document.querySelectorAll('tr[data-lead-id]').forEach(function(row) {
    var ok = true;
    if (state    && row.dataset.state    !== state)                           ok = false;
    if (type     && (row.dataset.leadType || '').indexOf(type) === -1)        ok = false;
    if (priority && row.dataset.priority !== priority)                        ok = false;
    if (age && row.dataset.created) {
      var d = new Date(row.dataset.created).getTime();
      if ((now - d) > age * 86400000) ok = false;
    }
    row.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });
  var c = document.getElementById('wfCount');
  if (c) c.textContent = shown + ' shown';
};

window.wosClearFilters = function() {
  ['wfState','wfType','wfAge','wfPriority'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  document.querySelectorAll('tr[data-lead-id]').forEach(function(r) { r.style.display = ''; });
  var c = document.getElementById('wfCount'); if (c) c.textContent = '';
};

window.wosToggleBulk = function() {
  var b = document.getElementById('wosBulkBar');
  if (!b) return;
  var showing = b.style.display === 'flex';
  b.style.display = showing ? 'none' : 'flex';
  if (!showing) addCheckboxes();
  else removeCheckboxes();
};

window.wosHideBulk = function() {
  var b = document.getElementById('wosBulkBar'); if (b) b.style.display = 'none';
  removeCheckboxes();
};

var _sel = {};

function addCheckboxes() {
  document.querySelectorAll('tr[data-lead-id]').forEach(function(row) {
    if (row.querySelector('.wos-chk')) return;
    var td = document.createElement('td');
    td.style.cssText = 'padding:4px 6px;width:28px;';
    var chk = document.createElement('input');
    chk.type = 'checkbox'; chk.className = 'wos-chk';
    chk.style.cssText = 'width:14px;height:14px;cursor:pointer;';
    var lid = row.dataset.leadId;
    chk.onchange = function() {
      if (this.checked) _sel[lid] = true; else delete _sel[lid];
      updateBulkBar();
    };
    td.appendChild(chk);
    row.insertBefore(td, row.firstChild);
  });
}

function removeCheckboxes() {
  document.querySelectorAll('.wos-chk').forEach(function(c) { c.parentElement.remove(); });
  _sel = {}; updateBulkBar();
}

function updateBulkBar() {
  var n = Object.keys(_sel).length;
  var sc = document.getElementById('wosSelCount'); if (sc) sc.textContent = n + ' selected';
  var btn = document.getElementById('wosDeleteBtn');
  if (btn) { btn.disabled = n === 0; btn.style.opacity = n === 0 ? '0.4' : '1'; }
}

window.wosToggleAll = function(checked) {
  document.querySelectorAll('.wos-chk').forEach(function(c) {
    c.checked = checked;
    var row = c.closest('tr[data-lead-id]'); if (!row) return;
    var lid = row.dataset.leadId;
    if (checked) _sel[lid] = true; else delete _sel[lid];
  });
  updateBulkBar();
};

window.wosDeleteSelected = function() {
  var ids = Object.keys(_sel); if (!ids.length) return;
  var st = document.getElementById('wosDelStatus');
  var btn = document.getElementById('wosDeleteBtn');
  if (st) st.textContent = 'Deleting ' + ids.length + '...';
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting...'; }
  fetch('/api/leads/delete-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ids })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      ids.forEach(function(id) {
        var row = document.querySelector('tr[data-lead-id="' + id + '"]');
        if (row) row.remove();
      });
      _sel = {}; updateBulkBar();
      if (st) st.textContent = d.removed + ' deleted.';
      if (btn) { btn.disabled = true; btn.textContent = 'Delete Selected'; btn.style.opacity = '0.4'; }
      var sa = document.getElementById('wosSelectAll'); if (sa) sa.checked = false;
    } else {
      if (st) st.textContent = 'Error: ' + (d.error || 'failed');
      if (btn) { btn.disabled = false; btn.textContent = 'Delete Selected'; }
    }
  })
  .catch(function(e) {
    if (st) st.textContent = 'Error: ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = 'Delete Selected'; }
  });
};

window.wosPullLeadsOpen  = function() { var m = document.getElementById('wosPullModal'); if (m) m.style.display = 'flex'; };
window.wosPullLeadsClose = function() { var m = document.getElementById('wosPullModal'); if (m) m.style.display = 'none'; };

window.wosRunPull = function() {
  var btn = document.getElementById('wplRunBtn');
  var res = document.getElementById('wplResult');
  var state  = (document.getElementById('wplState')  || {}).value || '';
  var county = ((document.getElementById('wplCounty') || {}).value || '').trim();
  var count  = parseInt((document.getElementById('wplCount') || {}).value || '200');
  var srcType = '';
  document.querySelectorAll('input[name="wplSrc"]').forEach(function(r) { if (r.checked) srcType = r.value; });
  if (btn) { btn.textContent = 'Searching...'; btn.disabled = true; }
  if (res) { res.style.display = 'block'; res.style.color = '#a78bfa'; res.textContent = 'Pulling ' + (state || 'all states') + (county ? ' / ' + county : '') + (srcType ? ' / ' + srcType : '') + ' — ' + count + ' leads...'; }
  var body = { count: count };
  if (state)   body.state       = state;
  if (county)  body.county      = county;
  if (srcType) body.source_type = srcType;
  fetch('/api/leads/search-fresh-v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (btn) { btn.textContent = 'Pull Leads Now'; btn.disabled = false; }
    if (d.ok) {
      if (res) { res.style.color = '#10b981'; res.textContent = 'Done! ' + d.inserted + ' new leads added. Refreshing...'; }
      setTimeout(function() { if (typeof loadLeads === 'function') loadLeads(); }, 1500);
    } else {
      if (res) { res.style.color = '#ef4444'; res.textContent = 'Error: ' + (d.error || 'Unknown'); }
    }
  })
  .catch(function(e) {
    if (btn) { btn.textContent = 'Pull Leads Now'; btn.disabled = false; }
    if (res) { res.style.color = '#ef4444'; res.textContent = 'Error: ' + e.message; }
  });
};

window.wosReanalyzeAll = function() {
  if (!confirm('Re-analyze all leads for real ARV? Runs in background (10-15 min for 500 leads).')) return;
  fetch('/api/leads/reanalyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max: 1000, force: false })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) alert('Reanalysis started for ' + d.max + ' leads. ARV values update in background.');
    else alert('Error: ' + (d.error || 'failed'));
  })
  .catch(function(e) { alert('Error: ' + e.message); });
};

})();
