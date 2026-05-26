(function() {
'use strict';
// wos-outreach.js — Outreach Hub UI
// Panel A: Seller outreach (individual, AI-generated per lead)
// Panel B: Buyer outreach (bulk blind deals)
// Loaded via <script src> tag — never injected into index.html

var _initialized = false;
var _currentPanel = 'seller';
var _selectedLeads = {};
var _buyers = [];
var _leads = [];

// Init when Outreach Hub tab is visible
window.wosOutreachInit = function() {
  if (_initialized) { _refreshData(); return; }
  _initialized = true;
  _buildUI();
  _refreshData();
  console.log('[wos-outreach] initialized');
};

// Watch for tab navigation to Outreach Hub
document.addEventListener('click', function(e) {
  var t = e.target.closest('a,button,[onclick],[data-tab]');
  if (!t) return;
  var txt = t.textContent.trim();
  if (txt === 'Outreach Hub' || txt === 'Outreach') {
    setTimeout(function() { window.wosOutreachInit && wosOutreachInit(); }, 400);
  }
});

// ── DATA ─────────────────────────────────────────────────────────────────
function _refreshData() {
  fetch('/api/buyers').then(function(r){return r.json();}).then(function(d){
    _buyers = d.buyers || d || [];
    _renderBuyerList();
  }).catch(function(){});
  fetch('/api/leads?limit=500').then(function(r){return r.json();}).then(function(d){
    _leads = d.leads || d || [];
    _renderLeadList();
  }).catch(function(){});
}

// ── BUILD MAIN UI ─────────────────────────────────────────────────────────
function _buildUI() {
  var container = _findOutreachContainer();
  if (!container) { console.warn('[wos-outreach] container not found'); return; }

  container.innerHTML = '';

  // Header
  var hdr = document.createElement('div');
  hdr.style.cssText = 'padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:12px;background:#fff;';
  hdr.innerHTML =
    '<h2 style="margin:0;font-size:18px;font-weight:700;color:#111;">Outreach Hub</h2>' +
    '<div style="display:flex;gap:6px;margin-left:auto;">' +
    '<button id="wosOTabSeller" onclick="wosOutreachPanel(\"seller\")" style="'+_tabBtn(true)+'">Seller Outreach</button>' +
    '<button id="wosOTabBuyer" onclick="wosOutreachPanel(\"buyer\")" style="'+_tabBtn(false)+'">Buyer Outreach</button>' +
    '</div>';
  container.appendChild(hdr);

  // Seller Panel
  var sp = document.createElement('div');
  sp.id = 'wosSellerPanel';
  sp.style.cssText = 'display:flex;height:calc(100vh - 120px);';
  sp.innerHTML =
    // Left: lead list
    '<div id="wosOLeadList" style="width:320px;min-width:280px;border-right:1px solid #e5e7eb;overflow-y:auto;background:#fafafa;">' +
    '<div style="padding:10px;border-bottom:1px solid #e5e7eb;background:#fff;">' +
    '<input id="wosOLeadSearch" type="text" placeholder="Search leads..." oninput="wosOFilterLeads(this.value)" style="width:100%;padding:7px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:13px;box-sizing:border-box;">' +
    '</div>' +
    '<div id="wosOLeadItems" style="padding:8px;"></div>' +
    '</div>' +
    // Right: outreach composer
    '<div id="wosOComposer" style="flex:1;overflow-y:auto;padding:24px;background:#fff;">' +
    '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:14px;flex-direction:column;gap:8px;">' +
    '<div style="font-size:40px;">✉️</div>' +
    '<div>Select a lead from the left to compose outreach</div>' +
    '</div>' +
    '</div>';
  container.appendChild(sp);

  // Buyer Panel
  var bp = document.createElement('div');
  bp.id = 'wosBuyerPanel';
  bp.style.cssText = 'display:none;height:calc(100vh - 120px);';
  bp.innerHTML =
    '<div style="display:flex;height:100%;">' +
    // Left: buyer list
    '<div style="width:300px;min-width:260px;border-right:1px solid #e5e7eb;overflow-y:auto;background:#fafafa;">' +
    '<div style="padding:10px;border-bottom:1px solid #e5e7eb;background:#fff;">' +
    '<input type="text" placeholder="Search buyers..." oninput="wosOFilterBuyers(this.value)" style="width:100%;padding:7px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:13px;box-sizing:border-box;">' +
    '</div>' +
    '<div id="wosOBuyerItems" style="padding:8px;"></div>' +
    '</div>' +
    // Right: buyer detail + matched deals + bulk composer
    '<div id="wosOBuyerDetail" style="flex:1;overflow-y:auto;padding:24px;background:#fff;">' +
    '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:14px;flex-direction:column;gap:8px;">' +
    '<div style="font-size:40px;">🤝</div>' +
    '<div>Select a buyer to see their profile and matched deals</div>' +
    '</div>' +
    '</div>' +
    '</div>';
  container.appendChild(bp);
}

// ── PANEL SWITCH ──────────────────────────────────────────────────────────
window.wosOutreachPanel = function(panel) {
  _currentPanel = panel;
  var sp = document.getElementById('wosSellerPanel');
  var bp = document.getElementById('wosBuyerPanel');
  var tb1 = document.getElementById('wosOTabSeller');
  var tb2 = document.getElementById('wosOTabBuyer');
  if (sp) sp.style.display = panel==='seller' ? 'flex' : 'none';
  if (bp) bp.style.display = panel==='buyer'  ? 'flex' : 'none';
  if (tb1) tb1.style.cssText = _tabBtn(panel==='seller');
  if (tb2) tb2.style.cssText = _tabBtn(panel==='buyer');
};

// ── LEAD LIST ─────────────────────────────────────────────────────────────
function _renderLeadList(filter) {
  var el = document.getElementById('wosOLeadItems');
  if (!el) return;
  var leads = filter
    ? _leads.filter(function(l){ return ((l.address||'')+(l.city||'')+(l.state||'')).toLowerCase().indexOf(filter.toLowerCase()) > -1; })
    : _leads.slice(0, 200);

  el.innerHTML = leads.map(function(l) {
    var leadJson = JSON.stringify(String(l.id || ''));
    var score = l.hot_score || 0;
    var tier = l.hot_tier || 'COLD';
    var emoji = tier==='HOT'?'🔥':tier==='WARM'?'⚡':'❄️';
    var scoreColor = tier==='HOT'?'#ef4444':tier==='WARM'?'#f59e0b':'#9ca3af';
    var addr = [l.address, l.city, l.state].filter(Boolean).join(', ');
    var src = l.source_details || l.source || l.category || '';
    return "<div onclick='wosOOpenLead(" + leadJson + ")' style='padding:10px;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:6px;cursor:pointer;background:#fff;transition:border-color .15s;' onmouseover='this.style.borderColor=\"#7c3aed\"' onmouseout='this.style.borderColor=\"#e5e7eb\"'>" +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
      '<div style="font-size:12px;font-weight:600;color:#111;line-height:1.3;">'+addr+'</div>' +
      '<span style="font-size:11px;font-weight:700;color:'+scoreColor+';white-space:nowrap;margin-left:4px;">'+emoji+' '+score+'</span>' +
      '</div>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:3px;">'+src+'</div>' +
      '</div>';
  }).join('');
}

window.wosOFilterLeads = function(v) { _renderLeadList(v); };

// ── LEAD COMPOSER ─────────────────────────────────────────────────────────
window.wosOOpenLead = function(leadId) {
  var lead = _leads.find(function(l){ return l.id===leadId; });
  if (!lead) return;
  var el = document.getElementById('wosOComposer');
  if (!el) return;

  var leadJson = JSON.stringify(String(leadId || ''));
  var addr = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
  var score = lead.hot_score || 0;
  var tier = lead.hot_tier || '—';
  var signals = (lead.hot_signals || []).join(', ') || 'No signals yet';
  var src = lead.source_details || lead.source || lead.category || 'Unknown source';
  var arv = lead.arv ? '$'+lead.arv.toLocaleString() : 'No comp yet';
  var mao = lead.mao ? '$'+lead.mao.toLocaleString() : '—';
  var spread = lead.spread ? '$'+lead.spread.toLocaleString() : '—';

  el.innerHTML =
    // Lead header
    '<div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">' +
    '<div>' +
    '<div style="font-size:16px;font-weight:700;color:#111;margin-bottom:3px;">'+addr+'</div>' +
    '<div style="font-size:12px;color:#6b7280;">'+src+'</div>' +
    '</div>' +
    '<div style="text-align:right;">' +
    '<div style="font-size:22px;font-weight:800;color:'+(tier==='HOT'?'#ef4444':tier==='WARM'?'#f59e0b':'#6b7280')+';">'+score+'<span style="font-size:13px;font-weight:400;">/100</span></div>' +
    '<div style="font-size:11px;color:#6b7280;">'+tier+'</div>' +
    '</div>' +
    '</div>' +
    '<div style="font-size:12px;color:#374151;margin-bottom:10px;"><strong>Signals:</strong> '+signals+'</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">' +
    _metricBox('ARV', arv, '#059669') +
    _metricBox('MAO', mao, '#7c3aed') +
    _metricBox('Spread', spread, '#f59e0b') +
    '</div>' +
    '</div>' +
    // Outreach type selector
    '<div style="display:flex;gap:8px;margin-bottom:16px;">' +
    "<button onclick='wosOGenerateMsg(" + leadJson + ",\"sms_seller\")' style='flex:1;padding:9px;background:#7c3aed;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;'>Generate SMS</button>" +
    "<button onclick='wosOGenerateMsg(" + leadJson + ",\"email_seller\")' style='flex:1;padding:9px;background:#4f46e5;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;'>Generate Email</button>" +
    "<button onclick='wosOScoreLead(" + leadJson + ")' style='padding:9px 14px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:8px;color:#374151;font-size:13px;cursor:pointer;'>Score Lead</button>" +
    '</div>' +
    // Message output area
    '<div id="wosOMsgArea" style="background:#f8f8fb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;min-height:120px;">' +
    '<div style="color:#9ca3af;font-size:13px;">Click Generate SMS or Generate Email above. AI will craft a unique message based on this specific lead\'s situation.</div>' +
    '</div>' +
    '<div id="wosOActionBtns" style="display:none;margin-top:12px;gap:8px;">' +
    '<button onclick="wosOCopyMsg()" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:7px;color:#374151;font-size:13px;cursor:pointer;">Copy</button>' +
    '<button onclick="wosOEditMsg()" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:7px;color:#374151;font-size:13px;cursor:pointer;">Edit</button>' +
    "<button onclick='wosOSendEmail(" + leadJson + ")' style='padding:8px 16px;background:#059669;border:none;border-radius:7px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;'>Send Email</button>" +
    '</div>';

  // Score the lead if not already scored
  if (!lead.hot_score) wosOScoreLead(leadId);
};

window.wosOGenerateMsg = function(leadId, type) {
  var area = document.getElementById('wosOMsgArea');
  var btns = document.getElementById('wosOActionBtns');
  if (area) { area.innerHTML = '<div style="color:#7c3aed;font-size:13px;">Generating unique AI message...</div>'; area.style.background='#f8f4ff'; }

  fetch('/api/outreach/generate-ai', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({leadId: leadId, type: type})
  })
  .then(function(r){return r.json();})
  .then(function(d){
    if (d.ok && d.message) {
      if (area) {
        area.style.background='#fff';
        area.innerHTML = '<pre id="wosOMsgText" style="white-space:pre-wrap;font-family:inherit;font-size:13px;color:#111;margin:0;">'+_esc(d.message)+'</pre>';
      }
      if (btns) btns.style.display='flex';
      window._lastMsg = d.message;
      window._lastMsgType = type;
    } else {
      if (area) area.innerHTML = '<div style="color:#ef4444;font-size:13px;">Error: '+(d.error||'Failed')+'</div>';
    }
  })
  .catch(function(e){
    if (area) area.innerHTML = '<div style="color:#ef4444;font-size:13px;">Error: '+e.message+'</div>';
  });
};

window.wosOScoreLead = function(leadId) {
  fetch('/api/leads/'+leadId+'/score-hot', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
  .then(function(r){return r.json();})
  .then(function(d){
    if (d.ok) {
      // Update local leads array
      _leads = _leads.map(function(l){ return l.id===leadId ? Object.assign({},l,d.score) : l; });
      // Re-open to refresh display
      wosOOpenLead(leadId);
    }
  }).catch(function(){});
};

window.wosOCopyMsg = function() {
  if (window._lastMsg) navigator.clipboard.writeText(window._lastMsg);
};

window.wosOEditMsg = function() {
  var pre = document.getElementById('wosOMsgText');
  if (pre) {
    var ta = document.createElement('textarea');
    ta.id = 'wosOMsgText';
    ta.style.cssText = 'width:100%;min-height:140px;font-size:13px;border:none;outline:none;resize:vertical;font-family:inherit;';
    ta.value = pre.textContent;
    ta.oninput = function(){ window._lastMsg = this.value; };
    pre.parentNode.replaceChild(ta, pre);
    ta.focus();
  }
};

window.wosOSendEmail = function(leadId) {
  var msg = window._lastMsg;
  if (!msg) return alert('Generate a message first.');
  var lead = _leads.find(function(l){return l.id===leadId;});
  if (!lead || !lead.email) return alert('No email on file for this lead. Run skip trace first.');
  fetch('/api/email/send', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({to:lead.email, subject:'Regarding your property at '+lead.address, body:msg})
  })
  .then(function(r){return r.json();})
  .then(function(d){ alert(d.success ? 'Email sent!' : 'Error: '+(d.error||'failed')); })
  .catch(function(e){ alert('Error: '+e.message); });
};

// ── BUYER LIST ─────────────────────────────────────────────────────────────
function _renderBuyerList(filter) {
  var el = document.getElementById('wosOBuyerItems');
  if (!el) return;
  var buyers = filter
    ? _buyers.filter(function(b){ return ((b.name||b.contact||'')+(b.email||'')).toLowerCase().indexOf(filter.toLowerCase())>-1; })
    : _buyers.slice(0,100);

  if (!buyers.length) {
    el.innerHTML = '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">No buyers yet.<br>Add buyers in Buyers & Buy Boxes tab.</div>';
    return;
  }

  el.innerHTML = buyers.map(function(b) {
    var name = b.name || b.contact || b.email || 'Unnamed Buyer';
    var states = (b.buyBox&&b.buyBox.states) ? b.buyBox.states.join(', ') : (b.state||'');
    var budget = (b.buyBox&&b.buyBox.maxPrice) ? '$'+Math.round(b.buyBox.maxPrice/1000)+'K max' : '';
    return '<div onclick="wosOOpenBuyer(\"'+b.id+'\")" style="padding:10px;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:6px;cursor:pointer;background:#fff;" onmouseover="this.style.borderColor=\"#7c3aed\"" onmouseout="this.style.borderColor=\"#e5e7eb\"">' +
      '<div style="font-size:13px;font-weight:600;color:#111;">'+_esc(name)+'</div>' +
      (states ? '<div style="font-size:11px;color:#6b7280;margin-top:2px;">'+states+'</div>' : '') +
      (budget ? '<div style="font-size:11px;color:#059669;margin-top:1px;">'+budget+'</div>' : '') +
      '</div>';
  }).join('');
}

window.wosOFilterBuyers = function(v) { _renderBuyerList(v); };

// ── BUYER DETAIL ──────────────────────────────────────────────────────────
window.wosOOpenBuyer = function(buyerId) {
  var buyer = _buyers.find(function(b){return b.id===buyerId;});
  if (!buyer) return;
  var el = document.getElementById('wosOBuyerDetail');
  if (!el) return;

  var name = buyer.name || buyer.contact || 'Unnamed Buyer';
  var bb = buyer.buyBox || {};
  var states = (bb.states||[]).join(', ') || buyer.state || '—';
  var types = (bb.propertyTypes||[]).join(', ') || '—';
  var minPrice = bb.minPrice ? '$'+bb.minPrice.toLocaleString() : '—';
  var maxPrice = bb.maxPrice ? '$'+bb.maxPrice.toLocaleString() : '—';

  // Find matching leads
  var matched = _leads.filter(function(l) {
    var stateMatch = !bb.states || bb.states.length===0 || bb.states.indexOf(l.state)>-1;
    var priceMatch = !bb.maxPrice || !l.mao || l.mao <= bb.maxPrice;
    var priceMin   = !bb.minPrice || !l.arv  || l.arv  >= bb.minPrice;
    return stateMatch && priceMatch && priceMin;
  }).slice(0,20);

  el.innerHTML =
    // Buyer profile
    '<div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">' +
    '<div style="font-size:18px;font-weight:700;color:#111;margin-bottom:12px;">'+_esc(name)+'</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
    _infoBadge('Email', buyer.email||'—') +
    _infoBadge('Phone', buyer.phone||'—') +
    _infoBadge('States', states) +
    _infoBadge('Property Types', types) +
    _infoBadge('Min Price', minPrice) +
    _infoBadge('Max Price', maxPrice) +
    '</div>' +
    (buyer.notes ? '<div style="font-size:12px;color:#374151;background:#f8f8fb;padding:8px;border-radius:6px;">'+_esc(buyer.notes)+'</div>' : '') +
    '</div>' +
    // Matched deals
    '<div style="font-size:14px;font-weight:700;color:#111;margin-bottom:12px;">'+matched.length+' Matching Deals</div>' +
    (matched.length === 0
      ? '<div style="color:#9ca3af;font-size:13px;">No matching deals based on this buyer\'s buy box.</div>'
      : matched.map(function(l) {
          var addr = [l.address, l.city, l.state].filter(Boolean).join(', ');
          var score = l.hot_score || 0;
          var arv  = l.arv  ? '$'+l.arv.toLocaleString()  : 'TBD';
          var mao  = l.mao  ? '$'+l.mao.toLocaleString()  : 'TBD';
          var sprd = l.spread ? '$'+l.spread.toLocaleString() : '—';
          return '<div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div style="font-size:13px;font-weight:600;color:#111;">'+addr+'</div>' +
            '<span style="font-size:12px;color:'+(score>=70?'#ef4444':score>=45?'#f59e0b':'#6b7280')+';font-weight:700;">'+score+'/100</span>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;">' +
            _metricBox('ARV',arv,'#059669') + _metricBox('MAO',mao,'#7c3aed') + _metricBox('Spread',sprd,'#f59e0b') +
            '</div>' +
            '</div>';
        }).join('')
    ) +
    // Bulk outreach button
    (matched.length > 0
      ? '<div style="margin-top:16px;">' +
        '<button onclick="wosOGenerateBulkBuyer(\"'+buyerId+'\")" style="width:100%;padding:12px;background:linear-gradient(135deg,#7c3aed,#4f46e5);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">Generate Blind Deal Email for This Buyer</button>' +
        '<div id="wosOBulkResult" style="margin-top:12px;background:#f8f8fb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;display:none;"></div>' +
        '</div>'
      : '');
};

window.wosOGenerateBulkBuyer = function(buyerId) {
  var buyer = _buyers.find(function(b){return b.id===buyerId;});
  if (!buyer) return;
  var bb = buyer.buyBox || {};
  var matched = _leads.filter(function(l) {
    var stateMatch = !bb.states || bb.states.length===0 || bb.states.indexOf(l.state)>-1;
    var priceMatch = !bb.maxPrice || !l.mao || l.mao <= bb.maxPrice;
    return stateMatch && priceMatch;
  }).slice(0, 5);

  var res = document.getElementById('wosOBulkResult');
  if (res) { res.style.display='block'; res.innerHTML='<div style="color:#7c3aed;font-size:13px;">Generating blind deal email...</div>'; }

  fetch('/api/outreach/bulk-buyer', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({leadIds: matched.map(function(l){return l.id;}), buyerId: buyerId})
  })
  .then(function(r){return r.json();})
  .then(function(d){
    if (d.ok && d.message) {
      if (res) res.innerHTML =
        '<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;color:#111;margin:0 0 12px;">'+_esc(d.message)+'</pre>' +
        '<div style="display:flex;gap:8px;">' +
        '<button onclick="navigator.clipboard.writeText(\"'+d.message.replace(/"/g,"'")+'\")" style="padding:7px 14px;background:#fff;border:1px solid #d1d5db;border-radius:7px;font-size:12px;cursor:pointer;">Copy</button>' +
        (buyer.email ? '<button onclick="wosOSendBulkEmail(\"'+buyerId+'\")" style="padding:7px 14px;background:#059669;border:none;border-radius:7px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">Send to '+_esc(buyer.email)+'</button>' : '') +
        '</div>';
      window._lastBulkMsg = d.message;
    } else {
      if (res) res.innerHTML = '<div style="color:#ef4444;font-size:13px;">Error: '+(d.error||'failed')+'</div>';
    }
  }).catch(function(e){
    if (res) res.innerHTML = '<div style="color:#ef4444;font-size:13px;">Error: '+e.message+'</div>';
  });
};

window.wosOSendBulkEmail = function(buyerId) {
  var buyer = _buyers.find(function(b){return b.id===buyerId;});
  var msg = window._lastBulkMsg;
  if (!buyer || !buyer.email || !msg) return;
  fetch('/api/email/send', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({to:buyer.email, subject:'Available Deals — '+new Date().toLocaleDateString(), body:msg})
  })
  .then(function(r){return r.json();})
  .then(function(d){ alert(d.success ? 'Email sent to '+buyer.email+'!' : 'Error: '+(d.error||'failed')); })
  .catch(function(e){ alert('Error: '+e.message); });
};

// ── HELPERS ────────────────────────────────────────────────────────────────
function _findOutreachContainer() {
  // Try common container selectors for the Outreach Hub section
  var selectors = ['#outreachContent','#outreach-content','.outreach-content','[data-section="outreach"]'];
  for (var i=0; i<selectors.length; i++) {
    var el = document.querySelector(selectors[i]);
    if (el) return el;
  }
  // Fallback: find any visible section with 'outreach' in its ID or class
  var all = document.querySelectorAll('[id],[class]');
  for (var j=0; j<all.length; j++) {
    var id = (all[j].id||'').toLowerCase();
    var cls = (all[j].className||'').toLowerCase();
    if ((id.indexOf('outreach')>-1 || cls.indexOf('outreach')>-1) && all[j].offsetParent) return all[j];
  }
  return null;
}

function _tabBtn(active) {
  return 'font-size:13px;padding:7px 16px;border-radius:8px;cursor:pointer;font-weight:600;transition:all .15s;' +
    (active ? 'background:#7c3aed;color:#fff;border:none;' : 'background:#f3f4f6;color:#374151;border:1px solid #d1d5db;');
}

function _metricBox(label, value, color) {
  return '<div style="background:#f8f8fb;border-radius:8px;padding:10px;text-align:center;">' +
    '<div style="font-size:10px;color:#6b7280;font-weight:600;letter-spacing:.5px;margin-bottom:3px;">'+label+'</div>' +
    '<div style="font-size:14px;font-weight:700;color:'+color+';">'+value+'</div>' +
    '</div>';
}

function _infoBadge(label, value) {
  return '<div style="background:#f8f8fb;border-radius:7px;padding:8px;">' +
    '<div style="font-size:10px;color:#9ca3af;margin-bottom:2px;">'+label+'</div>' +
    '<div style="font-size:12px;color:#111;font-weight:500;">'+value+'</div>' +
    '</div>';
}

function _esc(str) {
  return (str||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

})();
