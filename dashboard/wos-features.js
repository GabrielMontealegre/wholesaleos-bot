(function() {

// ── TOAST HELPER ──────────────────────────────────────────────────────────
function wosToast(msg, color) {
  color = color || '#1f2937';
  var t = document.getElementById('wosToastEl');
  if (!t) {
    t = document.createElement('div');
    t.id = 'wosToastEl';
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:500;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.2);transition:opacity 0.4s;max-width:340px;line-height:1.4;';
    document.body.appendChild(t);
  }
  t.style.background = color;
  t.style.opacity = '1';
  t.textContent = msg;
  clearTimeout(t._timer);
  t._timer = setTimeout(function(){ t.style.opacity='0'; }, 3000);
}

'use strict';
// wos-features.js v4 — Complete rewrite
// Leads tab: filters, bulk delete, pull leads, re-analyze
// Dashboard: top deals only
// Author: WholesaleOS Lead Architect

var _ready = false;
var _sel = {};
var _filtersOpen = false;
var _bulkOpen = false;
var _currentTab = 'leads';

// Expose global init for manual triggering
window.wosInit = function() {
  if (document.querySelectorAll('tr[data-lead-id]').length > 0) {
    if (!_ready) { _ready = true; _boot(); console.log('[wos] v4 initialized'); }
    else { _mountOnTab(); } // re-mount on tab change
  }
};

// Poll 500ms / 5 min
var _poll = setInterval(function() {
  if (_ready) { clearInterval(_poll); return; }
  if (document.querySelectorAll('tr[data-lead-id]').length > 0) {
    _ready = true; clearInterval(_poll); _boot();
    console.log('[wos] v4 initialized via poll');
  }
}, 500);
setTimeout(function() { clearInterval(_poll); }, 300000);

// Watch for tab changes (SPA)
document.addEventListener('click', function(e) {
  var t = e.target;
  var href = t.dataset && t.dataset.tab || (t.closest('[data-tab]') && t.closest('[data-tab]').dataset.tab);
  if (href) { _currentTab = href; setTimeout(_mountOnTab, 300); }
});

function _boot() {
  _skipPin();
  _mountOnTab();
  _addDataAttrs();
  _patchDashboard();
  // Watch for SPA navigation — remount when table container changes
  var _obs = new MutationObserver(function() {
    var tbl = document.querySelector('table');
    if (tbl && !document.getElementById('wosToolbar')) {
      setTimeout(_mountOnTab, 200);
    }
  });
  var target = document.querySelector('.content, #content, main, body');
  if (target) _obs.observe(target, { childList: true, subtree: true });
}

// ── SKIP PIN (optional — hides after first visit) ────────────────────────
function _skipPin() {
  // We do NOT auto-bypass — PIN stays for security. Just ensure UI is clean.
  var pin = document.getElementById('pin-screen');
  if (pin) {
    // Add keyboard shortcut: press Enter after 4 digits auto-submits
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var okBtn = document.querySelector('#pin-screen button.ok-btn, #pin-screen .confirm-btn');
        if (okBtn) okBtn.click();
      }
    });
  }
}

// ── MOUNT CONTROLS IN LEADS TAB ─────────────────────────────────────────
function _mountOnTab() {
  // Guard: only mount on LEADS section, not Dashboard
  var _at = document.querySelector('.nav-link.active, [data-tab].active, [aria-selected="true"]');
  var _atText = _at ? (_at.textContent||'').toLowerCase().trim() : '';
  if (_atText === 'dashboard' || _atText === 'home') return;
  // Only mount if toolbar not already present
  if (document.getElementById('wosToolbar')) {
    // Already mounted — just re-add checkboxes if bulk mode is open
    if (_bulkOpen) _addCheckboxes();
    _addDataAttrs();
    return;
  }
  _sel = {};

  var tbl = document.querySelector('table');
  if (!tbl) return;
  var container = tbl.parentNode;

  // ── TOOLBAR ────────────────────────────────────────────────────────────
  var tb = document.createElement('div');
  tb.id = 'wosToolbar';
  tb.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;background:#fff;border-bottom:2px solid #f0f0f5;position:sticky;top:0;z-index:200;align-items:center;';
  tb.innerHTML =
    _btn('+ Pull Leads','wosPullLeadsOpen()','background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;') +
    _btn('Filters','wosToggleFilters()','background:#f3f4f6;color:#374151;border:1px solid #d1d5db;') +
    _btn('Bulk Delete','wosToggleBulk()','background:#fef2f2;color:#ef4444;border:1px solid #fecaca;') +
    _btn('Re-analyze Comps','wosReanalyzeAll()','background:#f0fdf4;color:#059669;border:1px solid #bbf7d0;') +
    _btn('Score All Leads','wosScoreAllLeads()','background:#fef3c7;color:#92400e;border:1px solid #fcd34d;') +
    _btn('Run Courthouse','wosCourthouseScrape()','background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;') +
    '<span id="wosLeadCount" style="margin-left:auto;font-size:12px;color:#6b7280;"></span>';
  container.insertBefore(tb, tbl);

  // ── FILTER PANEL (hidden by default) ────────────────────────────────────
  var fp = document.createElement('div');
  fp.id = 'wosFilterPanel';
  fp.style.cssText = 'display:none;background:#f8f8fb;border-bottom:1px solid #e5e7eb;padding:12px 14px;flex-wrap:wrap;gap:10px;align-items:flex-end;';
  fp.innerHTML =
    _fld('STATE', '<select id="wfState" onchange="wosFilter()" style="'+_sel_s+'">' + _stateOpts() + '</select>') +
    _fld('SOURCE TYPE', '<select id="wfSrc" onchange="wosFilter()" style="'+_sel_s+'">' +
      '<option value="">All Sources</option>' +
      '<option value="pre_foreclosure">Pre-Foreclosure</option>' +
      '<option value="auction">Auction/Probate</option>' +
      '<option value="tax_delinquent">Tax Delinquent</option>' +
      '<option value="code_violation">Code Violation</option>' +
      '<option value="fire">Fire Damaged</option>' +
      '<option value="vacant">Vacant/Abandoned</option>' +
      '<option value="lien">Lien</option>' +
      '<option value="arcgis">ArcGIS Portal</option>' +
      '<option value="socrata">Socrata Open Data</option>' +
    '</select>') +
    _fld('DAYS ADDED', '<select id="wfAge" onchange="wosFilter()" style="'+_sel_s+'">' +
      '<option value="">Any Time</option>' +
      '<option value="1">Today</option>' +
      '<option value="3">3 Days</option>' +
      '<option value="5">5 Days</option>' +
      '<option value="7">1 Week</option>' +
      '<option value="30">1 Month</option>' +
      '<option value="60">2 Months</option>' +
      '<option value="90">3 Months</option>' +
    '</select>') +
    _fld('PRIORITY', '<select id="wfPri" onchange="wosFilter()" style="'+_sel_s+'">' +
      '<option value="">All</option>' +
      '<option value="HIGH">High Only</option>' +
      '<option value="MEDIUM">Medium+</option>' +
      '<option value="LOW">Low</option>' +
    '</select>') +
    _fld('HAS PHONE', '<select id="wfPhone" onchange="wosFilter()" style="'+_sel_s+'">' +
      '<option value="">Any</option>' +
      '<option value="yes">Has Phone</option>' +
      '<option value="no">No Phone</option>' +
    '</select>') +
    _fld('HAS ARV', '<select id="wfArv" onchange="wosFilter()" style="'+_sel_s+'">' +
      '<option value="">Any</option>' +
      '<option value="yes">Has Real ARV</option>' +
      '<option value="no">No Comp Yet</option>' +
    '</select>') +
    _fld('MOTIVATION', '<select id="wfMotivation" onchange="wosFilter()" style="'+_sel_s+'">' +
      '<option value="">All Types</option>' +
      '<option value="pre_foreclosure">Pre-Foreclosure</option>' +
      '<option value="probate">Probate</option>' +
      '<option value="tax_lien">Tax Lien</option>' +
      '<option value="fire_damaged">Fire Damaged</option>' +
      '<option value="bankruptcy">Bankruptcy</option>' +
      '<option value="code_violation">Code Violation</option>' +
    '</select>') +
    _fld('MIN SCORE', '<select id="wfScore" onchange="wosFilter()" style="'+_sel_s+'">' +
      '<option value="">Any Score</option>' +
      '<option value="90">90+ (HOT)</option>' +
      '<option value="70">70+ (Warm)</option>' +
      '<option value="50">50+ (Avg)</option>' +
    '</select>') +
    _fld('VIEW', '<select id="wfTop300" onchange="wosApplyTop300()" style="'+_sel_s+'">' +
      '<option value="">All Leads</option>' +
      '<option value="1">🔥 Top 300 Deals</option>' +
    '</select>') +
    style="display:flex;gap:6px;align-items:center;padding-top:14px;">" +
    _btn('Apply','wosFilter()','background:#7c3aed;color:#fff;border:none;font-size:11px;padding:5px 12px;') +
    _btn('Clear','wosClearFilter()','background:#fff;color:#6b7280;border:1px solid #d1d5db;font-size:11px;padding:5px 10px;') +
    '<span id="wfCount" style="font-size:11px;color:#9ca3af;"></span>' +
    '</div>';
  container.insertBefore(fp, tbl);

  // ── BULK DELETE BAR (hidden by default) ─────────────────────────────────
  var bb = document.createElement('div');
  bb.id = 'wosBulkBar';
  bb.style.cssText = 'display:none;background:#fef2f2;border-bottom:1px solid #fecaca;padding:8px 14px;flex-wrap:wrap;gap:8px;align-items:center;';
  bb.innerHTML =
    '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;">' +
    '<input type="checkbox" id="wosSelAll" onchange="wosToggleAll(this.checked)" style="width:15px;height:15px;"> Select All on Page' +
    '</label>' +
    '<span id="wosSelCnt" style="font-size:12px;color:#6b7280;">0 selected</span>' +
    '<button id="wosDelBtn" onclick="wosDeleteSelected()" disabled style="padding:5px 14px;background:#ef4444;border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;opacity:0.4;">Delete Selected</button>' +
    '<button onclick="wosHideBulk()" style="padding:5px 10px;background:#fff;border:1px solid #d1d5db;border-radius:6px;color:#6b7280;font-size:11px;cursor:pointer;">Cancel</button>' +
    '<span id="wosDelSt" style="font-size:11px;color:#6b7280;"></span>';
  container.insertBefore(bb, tbl);

  // ── PULL LEADS MODAL ────────────────────────────────────────────────────
  if (!document.getElementById('wosPullModal')) {
    var modal = document.createElement('div');
    modal.id = 'wosPullModal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:99999;align-items:center;justify-content:center;';
    var states = 'TX,FL,GA,OH,PA,IL,MI,NC,TN,MD,NY,CA,AZ,NV,CO,AL,AK,AR,CT,DE,HI,ID,IN,IA,KS,KY,LA,ME,MA,MN,MS,MO,MT,NE,NH,NJ,NM,ND,OK,OR,RI,SC,SD,UT,VT,VA,WA,WV,WI,WY'.split(',');
    modal.innerHTML =
      '<div style="background:#1a1a2e;border:1px solid #7c3aed;border-radius:16px;padding:28px;width:500px;max-width:95vw;max-height:90vh;overflow-y:auto;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;"><h2 style="color:#fff;margin:0;font-size:18px;font-weight:700;">Pull Fresh Leads</h2>' +
      '<button onclick="wosPullLeadsClose()" style="background:none;border:none;color:#aaa;font-size:26px;cursor:pointer;">&times;</button></div>' +
      '<label style="color:#a78bfa;font-size:11px;font-weight:700;display:block;margin-bottom:5px;">STATE</label>' +
      '<select id="wplState" style="width:100%;background:#0f0f23;border:1px solid #4c1d95;color:#fff;padding:9px;border-radius:8px;font-size:13px;margin-bottom:12px;">' +
      '<option value="">All States (best markets first)</option>' +
      states.map(function(st){return '<option value="'+st+'">'+st+'</option>';}).join('') +
      '</select>' +
      '<label style="color:#a78bfa;font-size:11px;font-weight:700;display:block;margin-bottom:5px;">COUNTY (optional)</label>' +
      '<input id="wplCounty" type="text" placeholder="e.g. Harris, Cook, Fulton" style="width:100%;background:#0f0f23;border:1px solid #4c1d95;color:#fff;padding:9px;border-radius:8px;font-size:13px;box-sizing:border-box;margin-bottom:12px;">' +
      '<label style="color:#a78bfa;font-size:11px;font-weight:700;display:block;margin-bottom:8px;">SOURCE TYPE</label>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:12px;">' +
      [['','All Sources'],['code_violation','Code Violations'],['tax_delinquent','Tax Delinquent'],['pre_foreclosure','Pre-Foreclosure'],['auction','Auctions/Probate'],['arcgis','ArcGIS Portals']]
      .map(function(o,i){return '<label style="display:flex;align-items:center;gap:5px;color:#ccc;font-size:12px;background:#0f0f23;padding:7px 10px;border-radius:7px;border:1px solid #4c1d95;cursor:pointer;"><input type="radio" name="wplSrc" value="'+o[0]+'"'+(i===0?' checked':'')+' style="accent-color:#7c3aed"> '+o[1]+'</label>';}).join('') +
      '</div>' +
      '<label style="color:#a78bfa;font-size:11px;font-weight:700;display:block;margin-bottom:5px;">HOW MANY: <span id="wplN">200</span></label>' +
      '<input id="wplCount" type="range" min="50" max="500" step="50" value="200" oninput="document.getElementById(\"wplN\").textContent=this.value" style="width:100%;accent-color:#7c3aed;margin-bottom:16px;">' +
      '<button id="wplRunBtn" onclick="wosRunPull()" style="width:100%;padding:13px;background:linear-gradient(135deg,#7c3aed,#4f46e5);border:none;border-radius:10px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">Pull Leads Now</button>' +
      '<div id="wplRes" style="margin-top:10px;padding:10px;background:#0f0f23;border-radius:8px;color:#a78bfa;font-size:13px;display:none;text-align:center;"></div>' +
      '</div>';
    document.body.appendChild(modal);
  }

  _addDataAttrs();
  _updateLeadCount();
}

// ── DASHBOARD: TOP DEALS PATCH ───────────────────────────────────────────
function _patchDashboard() {
  // The top-100 deals table already exists in the dashboard tab
  // Just ensure it sorts by motivation_score and limits to 300
  if (window.APP && APP.leads) {
    var sorted = APP.leads
      .filter(function(l) { return l.motivation_score > 0 || l.spread > 0; })
      .sort(function(a,b) { return ((b.motivation_score||0)+(b.spread||0)) - ((a.motivation_score||0)+(a.spread||0)); })
      .slice(0, 300);
    console.log('[wos] top deals: '+sorted.length+' leads');
  }
}

// ── ADD DATA ATTRS TO ROWS ───────────────────────────────────────────────
function _addDataAttrs() {
  // Read directly from table cells — APP.leads not always available
  // Col 0:chk 1:ref 2:address 3:state 4:type 5:status 6:spread 7:buyers 8:date
  document.querySelectorAll('tr[data-lead-id]').forEach(function(row) {
    if (row.dataset.wosInit) return;
    row.dataset.wosInit = '1';
    var cells = row.querySelectorAll('td');
    var offset = 0; // adjust if checkbox col added
    if (cells.length >= 9) {
      row.dataset.state    = (cells[3].textContent||cells[3+offset].textContent||"").trim().toUpperCase();
      row.dataset.src      = (cells[4].textContent||"").trim().toLowerCase();
      row.dataset.priority = ""; // not in DOM, use motivation_score from API if available
      row.dataset.phone    = "any";
      row.dataset.arv      = (cells[6].textContent||"").trim() === "$0" ? "no" : "yes";
        row.dataset.hotScore = "0"; // will be set when leads are scored
      var dateStr = (cells[8].textContent||"").trim();
      row.dataset.created  = dateStr ? new Date(dateStr).toISOString() : "";
    }
    // Override with APP.leads if available
    if (window.APP && APP.leads) {
      var lid = row.dataset.leadId;
      var lead = APP.leads.find(function(l) { return l.id === lid; });
      if (lead) {
        row.dataset.state    = (lead.state || row.dataset.state || '').toUpperCase();
        row.dataset.src      = (lead.source_details || lead.source || lead.motivation || lead.violations || row.dataset.src || '').toLowerCase();
        row.dataset.priority = (lead.priority || '').toUpperCase();
        row.dataset.phone    = (lead.phone && lead.phone.length > 7) ? 'yes' : 'no';
        row.dataset.arv      = (lead.arv && lead.arv > 0) ? 'yes' : 'no';
        row.dataset.created  = lead.created_at || lead.createdAt || lead.created || row.dataset.created || '';
      }
    }
  });
}

function _updateLeadCount() {
  var cnt = document.getElementById('wosLeadCount');
  if (!cnt) return;
  var rows = document.querySelectorAll('tr[data-lead-id]');
  var visible = 0;
  rows.forEach(function(r) { if (r.style.display !== 'none') visible++; });
  cnt.textContent = visible + ' of ' + rows.length + ' leads';
}

// ── HELPERS ───────────────────────────────────────────────────────────────
var _sel_s = 'font-size:12px;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;background:#fff;color:#111;min-width:110px;';

function _btn(label, onclick, style) {
  return '<button onclick="'+onclick+'" style="font-size:12px;padding:6px 12px;border-radius:7px;cursor:pointer;font-weight:600;'+style+'">'+label+'</button>';
}

function _fld(label, input) {
  return '<div style="display:flex;flex-direction:column;gap:3px;"><span style="font-size:10px;font-weight:700;color:#6b7280;letter-spacing:.5px;">'+label+'</span>'+input+'</div>';
}

function _stateOpts() {
  var states = 'ALL,TX,FL,GA,OH,PA,IL,MI,NC,TN,MD,NY,CA,AZ,NV,CO,AL,AK,AR,CT,DE,HI,ID,IN,IA,KS,KY,LA,ME,MA,MN,MS,MO,MT,NE,NH,NJ,NM,ND,OK,OR,RI,SC,SD,UT,VT,VA,WA,WV,WI,WY'.split(',');
  return states.map(function(s,i) { return '<option value="'+(i===0?'':s)+'">'+( i===0?'All States':s)+'</option>'; }).join('');
}

// ── FILTER LOGIC ──────────────────────────────────────────────────────────
window.wosToggleFilters = function() {
  _filtersOpen = !_filtersOpen;
  var fp = document.getElementById('wosFilterPanel');
  if (fp) fp.style.display = _filtersOpen ? 'flex' : 'none';
};

window.wosFilter = function() {
  _addDataAttrs();
  var state = (document.getElementById('wfState') || {}).value || '';
  var src   = (document.getElementById('wfSrc')   || {}).value || '';
  var age   = parseInt((document.getElementById('wfAge') || {}).value || '0');
  var pri   = (document.getElementById('wfPri')   || {}).value || '';
  var phone = (document.getElementById('wfPhone') || {}).value || '';
  var arv   = (document.getElementById('wfArv')   || {}).value || '';
  var now   = Date.now();
  var shown = 0;

  document.querySelectorAll('tr[data-lead-id]').forEach(function(row) {
    var ok = true;
    if (state && row.dataset.state !== state) ok = false;
    if (src   && (row.dataset.src || '').indexOf(src) === -1) ok = false;
    if (pri   && row.dataset.priority !== pri) ok = false;
    if (phone && row.dataset.phone !== phone) ok = false;
    if (arv   && row.dataset.arv !== arv) ok = false;
    var mot = (document.getElementById('wfMotivation')||{}).value||'';
    var score = parseInt((document.getElementById('wfScore')||{}).value||'0');
    if (mot && (row.dataset.motivation||'').indexOf(mot)===-1) ok = false;
    if (score && parseInt(row.dataset.score||'0') < score) ok = false;
    if (age && row.dataset.created) {
      var d = new Date(row.dataset.created).getTime();
      if (isNaN(d)) { ok = false; }
      else if (age === 1) {
        // 'Today' — compare date strings in local time
        var leadDate = new Date(d).toLocaleDateString();
        var todayDate = new Date().toLocaleDateString();
        if (leadDate !== todayDate) ok = false;
      } else {
        if ((now - d) > age * 86400000) ok = false;
      }
    }
    row.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });

  var c = document.getElementById('wfCount');
  if (c) c.textContent = shown + ' leads shown';
  _updateLeadCount();
};

window.wosClearFilter = function() {
  ['wfState','wfSrc','wfAge','wfPri','wfPhone','wfArv','wfMotivation','wfScore','wfTop300'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  document.querySelectorAll('tr[data-lead-id]').forEach(function(r) { r.style.display = ''; });
  var c = document.getElementById('wfCount'); if (c) c.textContent = '';
  _updateLeadCount();
};

// ── BULK DELETE ────────────────────────────────────────────────────────────
window.wosToggleBulk = function() {
  _bulkOpen = !_bulkOpen;
  var bb = document.getElementById('wosBulkBar');
  if (bb) bb.style.display = _bulkOpen ? 'flex' : 'none';
  if (_bulkOpen) _addCheckboxes(); else _removeCheckboxes();
};

window.wosHideBulk = function() {
  _bulkOpen = false;
  var bb = document.getElementById('wosBulkBar'); if (bb) bb.style.display = 'none';
  _removeCheckboxes();
};

function _addCheckboxes() {
  document.querySelectorAll('tr[data-lead-id]').forEach(function(row) {
    if (row.querySelector('.wos-chk')) return;
    var td = document.createElement('td');
    td.style.cssText = 'padding:6px 8px;width:30px;vertical-align:middle;';
    var chk = document.createElement('input');
    chk.type = 'checkbox'; chk.className = 'wos-chk';
    chk.style.cssText = 'width:15px;height:15px;cursor:pointer;accent-color:#ef4444;';
    var lid = row.dataset.leadId;
    chk.addEventListener('change', function(e) {
      e.stopPropagation();
      if (this.checked) _sel[lid] = true; else delete _sel[lid];
      _updateBulkUI();
    });
    chk.addEventListener('click', function(e) { e.stopPropagation(); });
    // Stop clicks on checkbox cell from bubbling to row onclick (openLeadModal)
    td.addEventListener('click', function(e) { e.stopPropagation(); });
    td.appendChild(chk);
    td.addEventListener('click', function(e){ e.stopPropagation(); });
    row.insertBefore(td, row.firstChild);
  });
}

function _removeCheckboxes() {
  document.querySelectorAll('.wos-chk').forEach(function(c) { c.parentElement.remove(); });
  _sel = {}; _updateBulkUI();
}

function _updateBulkUI() {
  var n = Object.keys(_sel).length;
  var sc = document.getElementById('wosSelCnt'); if (sc) sc.textContent = n + ' selected';
  var btn = document.getElementById('wosDelBtn');
  if (btn) { btn.disabled = (n === 0); btn.style.opacity = n > 0 ? '1' : '0.4'; }
}

window.wosToggleAll = function(checked) {
  document.querySelectorAll('.wos-chk').forEach(function(c) {
    if (c.closest('tr') && c.closest('tr').style.display !== 'none') {
      c.checked = checked;
      var lid = c.closest('tr[data-lead-id]') && c.closest('tr[data-lead-id]').dataset.leadId;
      if (lid) { if (checked) _sel[lid] = true; else delete _sel[lid]; }
    }
  });
  _updateBulkUI();
};

window.wosDeleteSelected = function() {
  var ids = Object.keys(_sel);
  if (!ids.length) return;
  if (!confirm('Delete ' + ids.length + ' leads? This cannot be undone.')) return;
  var st = document.getElementById('wosDelSt');
  var btn = document.getElementById('wosDelBtn');
  if (st) st.textContent = 'Deleting ' + ids.length + '...';
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting...'; }

  wosToast("⏳ Re-analyzing comps…", "#7c3aed"); fetch('/api/leads/delete-bulk', {
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
      _sel = {}; _updateBulkUI();
      if (st) st.textContent = (d.removed || ids.length) + ' deleted.';
      if (btn) { btn.disabled = true; btn.textContent = 'Delete Selected'; btn.style.opacity = '0.4'; }
      var sa = document.getElementById('wosSelAll'); if (sa) sa.checked = false;
      _updateLeadCount();
    } else {
      if (st) st.textContent = 'Error: ' + (d.error || 'unknown');
      if (btn) { btn.disabled = false; btn.textContent = 'Delete Selected'; btn.style.opacity='1'; }
    }
  })
  .catch(function(e) {
    if (st) st.textContent = 'Error: ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = 'Delete Selected'; btn.style.opacity='1'; }
  });
};

// ── PULL LEADS ─────────────────────────────────────────────────────────────
window.wosPullLeadsOpen  = function() { var m=document.getElementById('wosPullModal'); if(m) m.style.display='flex'; };
window.wosPullLeadsClose = function() { var m=document.getElementById('wosPullModal'); if(m) m.style.display='none'; };

window.wosRunPull = function() {
  var btn = document.getElementById('wplRunBtn');
  var res = document.getElementById('wplRes');
  var state  = (document.getElementById('wplState')  || {}).value || '';
  var county = ((document.getElementById('wplCounty') || {}).value || '').trim();
  var count  = parseInt((document.getElementById('wplCount') || {}).value || '200');
  var srcType = '';
  document.querySelectorAll('input[name="wplSrc"]').forEach(function(r) { if (r.checked) srcType = r.value; });

  if (btn) { btn.textContent = 'Searching...'; btn.disabled = true; }
  if (res) { res.style.display='block'; res.style.color='#a78bfa'; res.textContent='Pulling '+(state||'all states')+(county?' / '+county:'')+(srcType?' / '+srcType:'')+' — '+count+' leads...'; }

  var body = { count: count };
  if (state)   body.state = state;
  if (county)  body.county = county;
  if (srcType) body.source_type = srcType;

  fetch('/api/leads/search-fresh-v2', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
  .then(function(r){return r.json();})
  .then(function(d) {
    if (btn) { btn.textContent='Pull Leads Now'; btn.disabled=false; }
    if (d.ok) {
      if (res) { res.style.color='#10b981'; res.textContent='Done! '+d.inserted+' new leads added. Refreshing...'; }
      setTimeout(function() { if (typeof loadLeads==='function') loadLeads(); }, 1500);
    } else {
      if (res) { res.style.color='#ef4444'; res.textContent='Error: '+(d.error||'Unknown'); }
    }
  })
  .catch(function(e) {
    if (btn) { btn.textContent='Pull Leads Now'; btn.disabled=false; }
    if (res) { res.style.color='#ef4444'; res.textContent='Error: '+e.message; }
  });
};

// ── RE-ANALYZE ─────────────────────────────────────────────────────────────
window.wosReanalyzeAll = function() {
  if (!confirm('Start background ARV analysis for 1000 leads? Takes 10-15 min, runs silently.')) return;
  fetch('/api/leads/reanalyze', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({max:1000,force:false}) })
  .then(function(r){return r.json();})
  .then(function(d) {
    alert(d.ok ? 'Started! ARV values will appear in the Spread column as they complete.' : 'Error: '+(d.error||'failed'));
  })
  .catch(function(e){alert('Error: '+e.message);});
};

// ── Score All Leads ────────────────────────────────────────────────────
window.wosScoreAllLeads = function() {
  var btn = event && event.target;
  if (btn) { btn.textContent = "Scoring..."; btn.disabled = true; }
  wosToast("⏳ Scoring all leads…", "#1d4ed8"); fetch("/api/leads/score-all", {method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})
  .then(function(r){return r.json();})
  .then(function(d){
    if (btn) { btn.textContent = "Score All Leads"; btn.disabled = false; }
    if (d.ok) {
      wosToast("✅ Scored "+d.total+" leads: "+d.hot+" HOT 🔥 "+d.warm+" WARM ⚡ "+d.cold+" COLD ❄️", "#059669");
      _ready = false;
      setTimeout(function() { if (typeof loadLeads==="function") loadLeads(); setTimeout(_mountOnTab, 1500); }, 500);
    } else {
      alert("Error: "+(d.error||"failed"));
    }
  }).catch(function(e){
    if (btn) { btn.textContent = "Score All Leads"; btn.disabled = false; }
    alert("Error: "+e.message);
  });
};

// ── Add hot score badge to lead rows ─────────────────────────────────────
function _addScoreBadges() {
  document.querySelectorAll("tr[data-lead-id]").forEach(function(row) {
    if (row.querySelector(".wos-score-badge")) return;
    var ref = row.querySelector("td:nth-child(2), td:first-child");
    if (!ref) return;
    // Get score from data attribute or 0
    var score = parseInt(row.dataset.hotScore || "0");
    if (score === 0) return; // Only show if scored
    var color = score>=70 ? "#ef4444" : score>=45 ? "#f59e0b" : "#9ca3af";
    var emoji = score>=70 ? "🔥" : score>=45 ? "⚡" : "";
    var badge = document.createElement("span");
    badge.className = "wos-score-badge";
    badge.style.cssText = "font-size:10px;font-weight:700;color:"+color+";margin-left:4px;white-space:nowrap;";
    badge.textContent = emoji+" "+score;
    ref.appendChild(badge);
  });
}


window.wosApplyTop300 = function() {
  var val = (document.getElementById('wfTop300')||{}).value||'';
  if (!val) { if (typeof loadLeads === 'function') { loadLeads(); } return; }
  wosToast('🔥 Loading top 300 deals by score…', '#7c3aed');
  fetch('/api/leads?top300=1&sort=motivation_score')
    .then(function(r){return r.json();})
    .then(function(d){
      if (!d.leads) return;
      var tbl = document.querySelector('table tbody');
      if (!tbl) return;
      // Store original rows for restore
      if (!window._wosOrigRows) window._wosOrigRows = tbl.innerHTML;
      // Build new rows from API data
      var html = d.leads.map(function(l){
        var score = l.hot_score||l.motivation_score||0;
        var badge = score>=90?'🔥':score>=70?'⚡':'❄️';
        return '<tr data-lead-id="'+l.id+'" data-state="'+(l.state||'')+'" data-src="'+(l.motivation||'')+'" data-score="'+score+'" data-motivation="'+(l.motivation||'')+'" data-priority="'+(l.priority||'')+'" data-phone="'+(l.phone?'yes':'no')+'" data-arv="'+(l.arv?'yes':'no')+'" data-created="'+(l.created_at||l.created||'')+'">' +
          '<td style="padding:6px 10px;font-size:12px;">' + badge + ' ' + (score||0) + '</td>' +
          '<td style="padding:6px 10px;font-size:12px;">' + (l.address||'') + '</td>' +
          '<td style="padding:6px 10px;font-size:12px;">' + (l.city||'') + ', ' + (l.state||'') + '</td>' +
          '<td style="padding:6px 10px;font-size:12px;">' + (l.motivation||'').replace(/_/g,' ') + '</td>' +
          '<td style="padding:6px 10px;font-size:12px;">' + (l.arv?'$'+Math.round(l.arv/1000)+'k':'—') + '</td>' +
          '</tr>';
      }).join('');
      tbl.innerHTML = html;
      _addDataAttrs();
      wosToast('✅ Showing top 300 deals by score ('+d.leads.length+' leads)', '#059669');
    }).catch(function(e){ wosToast('Error loading top 300: '+e.message,'#dc2626'); });
};
})();
