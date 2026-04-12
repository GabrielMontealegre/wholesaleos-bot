// WholesaleOS MEGA PATCH v5 - All 9 issues fixed
// No template literals, no backticks, clean ASCII comments only

// UTILITY: Full address builder
function fullAddress(l) {
  if (!l) return '';
  var addr = l.address || '';
  if (addr.match(/,.*,.*\d{5}/)) return addr.trim();
  var parts = [addr];
  if (l.city && !addr.toLowerCase().includes((l.city||'').toLowerCase())) parts.push(l.city);
  if (l.state && !addr.includes(l.state)) parts.push(l.state);
  if (l.zip && !addr.includes(l.zip)) parts.push(l.zip);
  return parts.filter(Boolean).join(', ').trim();
}

// FIX 1+2: Property links use FULL address
function zillowLink(l) {
  return 'https://www.zillow.com/homes/' + encodeURIComponent(fullAddress(l)) + '_rb/';
}
function redfinLink(l) {
  return 'https://www.redfin.com/search#location=' + encodeURIComponent(fullAddress(l)) + '&propertyType=house';
}
function rentometerLink(l) {
  return 'https://www.rentometer.com/analysis/new?address=' + encodeURIComponent(fullAddress(l)) + '&bedrooms=' + (l.beds||3);
}
function mapsLink(l) {
  return 'https://www.google.com/maps/search/' + encodeURIComponent(fullAddress(l));
}

// HELPERS
function closeSearchModal(){var m=document.getElementById('search-results-modal');if(m)m.remove();}
function closeBulkModal(){var m=document.getElementById('bulk-send-modal');if(m)m.remove();}
function closeLeadOverlay(){var m=document.getElementById('lead-overlay-modal');if(m)m.remove();}
function getDealRefId(l){if(l.ref_id)return l.ref_id;var st=(l.state||'XX').toUpperCase().slice(0,2);var h=0,id=l.id||'';for(var i=0;i<id.length;i++)h=((h<<5)-h)+id.charCodeAt(i);return st+'-'+(Math.abs(h)%9000+1000);}
function assignRefIds(ls){return ls.map(function(l){if(!l.ref_id)l.ref_id=getDealRefId(l);return l;});}
function updateLeadsBadge(){var b=document.getElementById('nav-lead-count');if(!b)return;var n=(APP.leads||[]).filter(function(l){return!l.status||l.status==='New Lead';}).length;b.textContent=n;b.style.background=n>0?'#ff3b30':'#34c759';b.style.display='';}

function metricCard(label, val, color) {
  return '<div style="background:#f9f9fb;border-radius:10px;padding:12px;text-align:center">' +
    '<div style="font-size:18px;font-weight:800;color:' + color + '">' + val + '</div>' +
    '<div style="font-size:10px;color:#86868b;font-weight:600">' + label + '</div></div>';
}

function updateLeadStatus(leadId, status) {
  fetch('/api/leads/'+leadId, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:status})})
    .then(function(r){return r.json();})
    .then(function(){
      var l = (APP.leads||[]).find(function(x){return x.id===leadId||x.id==leadId;});
      if(l) l.status = status;
      toast('Status: '+status, 'success');
    }).catch(function(){toast('Saved locally','');});
}

// FIX 1+2+3: Lead detail modal - full address + working links + X button
function openLeadDetailFixed(leadId) {
  var l = (APP.leads||[]).find(function(x){return x.id===leadId||x.id==leadId;});
  if (!l) { console.log('Lead not found:', leadId); return; }
  var fa = fullAddress(l);
  var rid = getDealRefId(l);
  var ex = document.getElementById('lead-overlay-modal');
  if (ex) ex.remove();
  var statusColors = {'New Lead':'#ff9500','Contacted':'#0071e3','Follow-Up':'#5e5ce6','Qualified':'#34c759','Not Interested':'#86868b','Dead':'#ff3b30','Archived':'#86868b'};
  var sc = statusColors[l.status||'New Lead'] || '#86868b';
  var statusOpts = ['New Lead','Contacted','Follow-Up','Qualified','Not Interested','Dead','Archived'].map(function(s){
    return '<option value="' + s + '"' + (s===(l.status||'New Lead')?' selected':'') + '>' + s + '</option>';
  }).join('');
  var modal = document.createElement('div');
  modal.id = 'lead-overlay-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = function(e){if(e.target===modal)modal.remove();};

  var header = '<div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#fff;z-index:1;border-radius:18px 18px 0 0">' +
    '<div>' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<span style="background:#1a1a2e;color:#fff;padding:3px 8px;border-radius:5px;font-size:11px;font-weight:700">' + rid + '</span>' +
        '<span style="font-size:15px;font-weight:700">' + (l.type||'SFR') + ' - ' + (l.county||l.state||'') + '</span>' +
        '<span style="font-size:11px;background:' + sc + '22;color:' + sc + ';padding:3px 10px;border-radius:10px;font-weight:600">' + (l.status||'New Lead') + '</span>' +
      '</div>' +
      '<div style="font-size:13px;color:#1a1a2e;font-weight:600;margin-top:6px;cursor:pointer" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.dataset.addr)" data-addr="' + fa.replace(/"/g,'&quot;') + '" title="Click to copy full address">' +
        '&#128205; ' + fa + ' &#128203;' +
      '</div>' +
    '</div>' +
    '<button onclick="closeLeadOverlay()" style="background:none;border:none;font-size:28px;cursor:pointer;color:#86868b;line-height:1;padding:4px;margin-left:12px">' +
      '&#x2715;' +
    '</button>' +
  '</div>';

  var metrics = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:18px">' +
    metricCard('ARV', '$'+(l.arv||0).toLocaleString(), '#0071e3') +
    metricCard('Offer', '$'+(l.offer||0).toLocaleString(), '#ff9500') +
    metricCard('Repairs', '$'+(l.repairs||0).toLocaleString(), '#5e5ce6') +
    metricCard('Spread', '$'+(l.spread||0).toLocaleString(), '#34c759') +
    metricCard('Equity', (l.equity_pct||0)+'%', '#34c759') +
    metricCard('Rent Est.', l.rent_estimate?'$'+Number(l.rent_estimate).toLocaleString()+'/mo':'-', '#86868b') +
  '</div>';

  var details = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;font-size:12px">' +
    '<div style="background:#f9f9fb;border-radius:10px;padding:12px">' +
      '<div style="font-weight:700;margin-bottom:8px;font-size:11px;color:#86868b">PROPERTY DETAILS</div>' +
      '<div>&#127968; ' + (l.type||'SFR') + ' - ' + (l.beds||'?') + 'bd/' + (l.baths||'?') + 'ba - ' + (l.sqft?Number(l.sqft).toLocaleString()+' sqft':'?') + '</div>' +
      '<div>Built: ' + (l.year||'?') + ' - Lot: ' + (l.lot||'?') + '</div>' +
      '<div>ZIP: ' + (l.zip||'?') + ' - County: ' + (l.county||'?') + '</div>' +
      '<div>List: ' + (l.list_price?'$'+Number(l.list_price).toLocaleString():'?') + ' - DOM: ' + (l.dom||'?') + '</div>' +
      '<div>Distress: ' + (l.distress||'?') + '</div>' +
      '<div>Strategy: ' + (l.deal_classification||l.investment_strategy||'?') + '</div>' +
    '</div>' +
    '<div style="background:#f9f9fb;border-radius:10px;padding:12px">' +
      '<div style="font-weight:700;margin-bottom:8px;font-size:11px;color:#86868b">SELLER INFO</div>' +
      '<div>Phone: ' + (l.phone||'No phone') + '</div>' +
      '<div>Seller type: ' + (l.seller_type||'?') + '</div>' +
      '<div>Owner: ' + (l.ownership||'?') + '</div>' +
      '<div>Reductions: ' + (l.reductions||0) + '</div>' +
      '<div>Added: ' + (l.created||'?') + '</div>' +
    '</div>' +
  '</div>';

  var links = '<div style="margin-bottom:14px">' +
    '<div style="font-weight:700;font-size:11px;color:#86868b;margin-bottom:8px">PROPERTY LINKS (exact address)</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<a href="' + zillowLink(l) + '" target="_blank" style="padding:8px 14px;background:#006aff;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600">&#127968; Zillow</a>' +
      '<a href="' + redfinLink(l) + '" target="_blank" style="padding:8px 14px;background:#cd2026;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600">&#128269; Redfin</a>' +
      '<a href="' + rentometerLink(l) + '" target="_blank" style="padding:8px 14px;background:#6c5ce7;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600">&#128176; Rentometer</a>' +
      '<a href="' + mapsLink(l) + '" target="_blank" style="padding:8px 14px;background:#4285f4;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600">&#128506; Maps</a>' +
      (l.source_url ? '<a href="' + l.source_url + '" target="_blank" style="padding:8px 14px;background:#f5f5f7;color:#1a1a2e;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600">&#128279; Source</a>' : '') +
    '</div>' +
  '</div>';

  var why = l.why_good_deal ? '<div style="background:#f0fff4;border:1px solid #34c75944;border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px"><div style="font-weight:700;color:#34c759;margin-bottom:4px">Why This Deal</div>' + l.why_good_deal + '</div>' : '';
  var script = l.script ? '<div style="background:#f0f6ff;border:1px solid #0071e344;border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px"><div style="font-weight:700;color:#0071e3;margin-bottom:4px">Call Script</div>' + l.script + '</div>' : '';

  var actions = '<div style="display:flex;gap:8px;margin-top:4px">' +
    '<select onchange="updateLeadStatus(\'' + leadId + '\',this.value)" style="flex:1;padding:8px;border:1px solid #e5e5ea;border-radius:8px;font-size:12px">' +
      statusOpts +
    '</select>' +
    '<button onclick="closeLeadOverlay()" style="padding:8px 20px;background:#f5f5f7;border:none;border-radius:8px;cursor:pointer;font-size:12px">Close</button>' +
  '</div>';

  modal.innerHTML = '<div style="background:#fff;border-radius:18px;width:760px;max-width:97vw;max-height:92vh;overflow-y:auto;box-shadow:0 30px 80px rgba(0,0,0,.4)">' +
    header +
    '<div style="padding:20px 24px">' +
      metrics + details + links + why + script + actions +
    '</div>' +
  '</div>';

  document.body.appendChild(modal);
}

// Hook openLeadModal to use enhanced version
openLeadModal = function(id) { openLeadDetailFixed(id); };

// FIX 4: Search label
(function() {
  function fixSearchLabel() {
    document.querySelectorAll('input[placeholder*="Search"]').forEach(function(el) {
      if (!el.placeholder.includes('Buyers')) {
        el.placeholder = '&#128269;  Search Deals & Buyers...';
      }
    });
  }
  fixSearchLabel();
  setTimeout(fixSearchLabel, 1500);
  if (!window._slObs) {
    window._slObs = new MutationObserver(fixSearchLabel);
    window._slObs.observe(document.body, {childList:true, subtree:true});
  }
})();

// FIX 5: Lead pagination with larger options
function setLeadsFilter(s){APP._leadsStatusFilter=s;_leadsPage=0;APP.filtered=s==='All'?APP.leads:(APP.leads||[]).filter(function(l){return(l.status||'New Lead')===s;});render();}
function leadsNextPage(){var t=(APP.filtered||APP.leads||[]).length;if(_leadsPage<Math.ceil(t/_leadsPerPage)-1){_leadsPage++;render();}}
function leadsPrevPage(){if(_leadsPage>0){_leadsPage--;render();}}
function leadsSetPerPage(n){_leadsPage=0;_leadsPerPage=parseInt(n);render();}
var _leadsPage=0, _leadsPerPage=200;

// FIX 5: renderLeads with 200-10000 page options + full address column
renderLeads = function() {
  var all = APP.filtered || APP.leads || [];
  var total = all.length, page = _leadsPage, perPage = _leadsPerPage;
  var pageLeads = all.slice(page * perPage, (page+1) * perPage);
  var totalPages = Math.ceil(total / perPage);
  var statuses = ['All','New Lead','Contacted','Follow-Up','Qualified','Not Interested','Dead','Archived'];
  var sc = {}; all.forEach(function(l){var s=l.status||'New Lead';sc[s]=(sc[s]||0)+1;});
  var cf = APP._leadsStatusFilter || 'All';
  var tabs = statuses.map(function(s){
    var cnt = s==='All' ? total : (sc[s]||0);
    if (cnt===0 && s!=='All') return '';
    var active = cf===s;
    return '<button data-status="' + s + '" onclick="setLeadsFilter(this.dataset.status)" style="padding:6px 12px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:' + (active?'700':'400') + ';background:' + (active?'#1a1a2e':'#f5f5f7') + ';color:' + (active?'#fff':'#1d1d1f') + '">' + s + (cnt?' ('+cnt.toLocaleString()+')':'') + '</button>';
  }).join('');
  var prevDis = page===0 ? ' disabled' : '';
  var nextDis = page>=totalPages-1 ? ' disabled' : '';
  var opts = [200,500,1000,2000,5000,10000].map(function(n){return '<option value="'+n+'"'+(n===perPage?' selected':'')+'>'+n+' per page</option>';}).join('');
  var pager = totalPages>1 ?
    '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;flex-wrap:wrap">' +
    '<button onclick="leadsPrevPage()"' + prevDis + ' style="padding:5px 12px;border:1px solid #e5e5ea;border-radius:8px;background:#fff;cursor:pointer;font-size:12px">&#8592; Prev</button>' +
    '<span style="font-size:12px;color:#86868b">Page ' + (page+1) + ' of ' + totalPages + ' (' + total.toLocaleString() + ' leads)</span>' +
    '<button onclick="leadsNextPage()"' + nextDis + ' style="padding:5px 12px;border:1px solid #e5e5ea;border-radius:8px;background:#fff;cursor:pointer;font-size:12px">Next &#8594;</button>' +
    '<select onchange="leadsSetPerPage(this.value)" style="padding:5px;border:1px solid #e5e5ea;border-radius:8px;font-size:12px">' + opts + '</select>' +
    '</div>' : '';
  var scMap={'New Lead':'#ff9500','Contacted':'#0071e3','Follow-Up':'#5e5ce6','Qualified':'#34c759','Not Interested':'#86868b','Dead':'#ff3b30','Archived':'#86868b'};
  var rows = pageLeads.map(function(l){
    var rid = l.ref_id||getDealRefId(l);
    var fa = fullAddress(l);
    var statusColor = scMap[l.status||'New Lead']||'#86868b';
    var mc = typeof matchBuyersToLead==='function' ? matchBuyersToLead(l,APP.buyers||[]).length : 0;
    return '<tr style="cursor:pointer;border-bottom:1px solid #f5f5f7" data-lid="' + l.id + '" onclick="openLeadDetailFixed(this.dataset.lid)">' +
      '<td style="padding:9px 12px;font-size:10px;white-space:nowrap"><span style="background:#1a1a2e;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">' + rid + '</span></td>' +
      '<td style="padding:9px 8px;font-size:12px;max-width:280px">' + fa + '</td>' +
      '<td style="padding:9px 8px;font-size:12px">' + (l.state||'') + '</td>' +
      '<td style="padding:9px 8px;font-size:12px">' + (l.type||'SFR') + '</td>' +
      '<td style="padding:9px 8px"><span style="font-size:10px;font-weight:700;color:' + statusColor + ';background:' + statusColor + '22;padding:2px 8px;border-radius:10px">' + (l.status||'New Lead') + '</span></td>' +
      '<td style="padding:9px 8px;font-size:12px;font-weight:700;color:#34c759">$' + (l.spread||0).toLocaleString() + '</td>' +
      '<td style="padding:9px 8px;font-size:11px;color:#0071e3">' + (mc?mc+' buyers':'') + '</td>' +
    '</tr>';
  }).join('');
  var headers = ['REF #','FULL ADDRESS','STATE','TYPE','STATUS','SPREAD','BUYERS'].map(function(h){
    return '<th style="padding:9px 8px;text-align:left;font-size:11px;color:#86868b">' + h + '</th>';
  }).join('');
  return '<div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;align-items:center">' + tabs +
    '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">' +
    '<span style="font-size:11px;color:#86868b">' + total.toLocaleString() + ' total</span>' +
    '<button class="btn btn-dark btn-sm" onclick="openAddLead()">+ Add Lead</button></div></div>' +
    pager +
    '<div style="overflow-x:auto;border:1px solid #f0f0f0;border-radius:10px">' +
    '<table style="width:100%;border-collapse:collapse">' +
    '<thead><tr style="background:#f5f5f7">' + headers + '</tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>' +
    (totalPages>1?pager:'') + '</div>';
};

// FIX 8: Outreach Hub - clicks work
function renderOutreachHub() {
  var leads = APP.leads || [];
  var buyers = APP.buyers || [];
  var newLeads = leads.filter(function(l){return !l.status||l.status==='New Lead';}).slice(0,60);
  var contacted = leads.filter(function(l){return l.status==='Contacted'||l.status==='Follow-Up';}).slice(0,30);

  var leadRows = newLeads.map(function(l){
    var fa = fullAddress(l);
    var rid = getDealRefId(l);
    return '<div data-lid="' + l.id + '" onclick="openLeadDetailFixed(this.dataset.lid)" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #f5f5f7;cursor:pointer" onmouseover="this.style.background=\'#f9f9fb\'" onmouseout="this.style.background=\'\'">' +
      '<div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<span style="background:#1a1a2e;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700">' + rid + '</span>' +
          '<span style="font-size:13px;font-weight:600">' + fa + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:#86868b;margin-top:2px">' + (l.phone||'No phone') + ' - ' + (l.type||'SFR') + '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0;margin-left:12px">' +
        '<div style="font-size:14px;font-weight:700;color:#34c759">$' + (l.spread||0).toLocaleString() + '</div>' +
        '<div style="font-size:10px;color:#86868b">spread</div>' +
      '</div>' +
    '</div>';
  }).join('');

  var buyerRows = buyers.map(function(b){
    var mc = typeof matchBuyersToLead==='function' ? leads.filter(function(l){return matchBuyersToLead(l,[b]).length>0;}).length : 0;
    return '<div data-bid="' + b.id + '" onclick="openBulkSendToBuyer(this.dataset.bid)" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #f5f5f7;cursor:pointer" onmouseover="this.style.background=\'#f9f9fb\'" onmouseout="this.style.background=\'\'">' +
      '<div>' +
        '<div style="font-size:13px;font-weight:600">' + b.name + '</div>' +
        '<div style="font-size:11px;color:#86868b">' + (b.city||'') + (b.state?' '+b.state:'') + ' - ' + (b.email||'No email') + '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0;margin-left:12px">' +
        '<div style="font-size:14px;font-weight:700;color:#0071e3">' + mc + '</div>' +
        '<div style="font-size:10px;color:#86868b">matches</div>' +
      '</div>' +
    '</div>';
  }).join('');

  var followRows = contacted.map(function(l){
    var fa = fullAddress(l);
    var rid = getDealRefId(l);
    return '<div data-lid="' + l.id + '" onclick="openLeadDetailFixed(this.dataset.lid)" style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #f5f5f7;cursor:pointer" onmouseover="this.style.background=\'#f9f9fb\'" onmouseout="this.style.background=\'\'">' +
      '<div><div style="font-size:13px;font-weight:600">' + rid + ' ' + fa + '</div>' +
      '<div style="font-size:11px;color:#0071e3">' + (l.status||'') + '</div></div>' +
      '<div style="font-size:13px;font-weight:700;color:#34c759;flex-shrink:0;margin-left:12px">$' + (l.spread||0).toLocaleString() + '</div>' +
    '</div>';
  }).join('');

  return '<div style="max-width:1100px">' +
    '<div style="font-size:18px;font-weight:700;margin-bottom:4px">Outreach Hub</div>' +
    '<div style="font-size:12px;color:#86868b;margin-bottom:20px">Click any lead or buyer to take action</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
      '<div style="background:#fff;border:1px solid #e5e5ea;border-radius:14px;overflow:hidden">' +
        '<div style="padding:14px 16px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">' +
          '<div style="font-weight:700;font-size:14px">New Leads (' + newLeads.length + ')</div>' +
          '<div style="font-size:11px;color:#86868b">click to open</div>' +
        '</div>' +
        '<div style="max-height:500px;overflow-y:auto">' + (leadRows||'<div style="padding:40px;text-align:center;color:#86868b">No new leads</div>') + '</div>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #e5e5ea;border-radius:14px;overflow:hidden">' +
        '<div style="padding:14px 16px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">' +
          '<div style="font-weight:700;font-size:14px">Buyers (' + buyers.length + ')</div>' +
          '<div style="font-size:11px;color:#86868b">click to send deals</div>' +
        '</div>' +
        '<div style="max-height:500px;overflow-y:auto">' + (buyerRows||'<div style="padding:40px;text-align:center;color:#86868b">No buyers</div>') + '</div>' +
      '</div>' +
    '</div>' +
    (contacted.length ?
      '<div style="margin-top:16px;background:#fff;border:1px solid #e5e5ea;border-radius:14px;overflow:hidden">' +
        '<div style="padding:14px 16px;border-bottom:1px solid #f0f0f0;font-weight:700;font-size:14px">Follow-Up Queue (' + contacted.length + ')</div>' +
        '<div style="max-height:200px;overflow-y:auto">' + followRows + '</div>' +
      '</div>' : '') +
  '</div>';
}

// Hook outreach into render
if (window.APP && !window._outreachHooked) {
  window._outreachHooked = true;
  var _origRender = render;
  render = function() {
    if (APP.page === 'outreach') {
      var el = document.getElementById('content');
      if (el) { el.innerHTML = renderOutreachHub(); return; }
    }
    return _origRender.apply(this, arguments);
  };
}

// Buyer matching
function matchBuyersToLead(lead,buyers){
  buyers=buyers||APP.buyers||[];
  if(!lead||!buyers.length)return[];
  return buyers.map(function(b){
    var score=0,reasons=[];
    var bs=(b.states&&b.states.length)?b.states:(b.state?[b.state]:[]);
    if(bs.length&&bs.indexOf(lead.state)===-1)return{buyer:b,score:0,reasons:[]};
    score+=30;reasons.push('state');
    if(!(b.buyTypes||[]).length||(b.buyTypes||[]).indexOf(lead.type)>-1){score+=25;reasons.push('type');}
    var op=lead.offer||(lead.arv?Math.round(lead.arv*0.7):0);
    if(op>=(b.minPrice||0)&&op<=(b.maxPrice||999999999)){score+=25;reasons.push('price');}
    return{buyer:b,score:score,reasons:reasons};
  }).filter(function(m){return m.score>=30;}).sort(function(a,b){return b.score-a.score;});
}

// Bulk send
function openBulkSendToBuyer(buyerId){
  var buyer=(APP.buyers||[]).find(function(b){return b.id===buyerId;});
  if(!buyer)return toast('Buyer not found','error');
  var matches=(APP.leads||[]).filter(function(l){return matchBuyersToLead(l,[buyer]).length>0;}).sort(function(a,b){return(b.spread||0)-(a.spread||0);}).slice(0,30);
  if(!matches.length)return toast('No matching deals for '+buyer.name,'error');
  var ex=document.getElementById('bulk-send-modal');if(ex)ex.remove();
  var rows=matches.map(function(l){
    var rid=l.ref_id||getDealRefId(l);
    var fa=fullAddress(l);
    var roi=l.arv&&l.offer?Math.round(((l.arv-l.offer-(l.repairs||0))/l.offer)*100):0;
    return '<tr style="border-bottom:1px solid #f0f0f0">' +
      '<td style="padding:8px 6px;text-align:center"><input type="checkbox" checked data-deal-id="' + l.id + '" style="width:15px;height:15px"></td>' +
      '<td style="padding:8px 6px"><span style="background:#1a1a2e;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700">' + rid + '</span></td>' +
      '<td style="padding:8px 6px;font-size:11px;max-width:200px">' + fa + '</td>' +
      '<td style="padding:8px 6px;font-size:12px;color:#0071e3;font-weight:600">$' + (l.arv||0).toLocaleString() + '</td>' +
      '<td style="padding:8px 6px;font-size:12px;color:#ff9500;font-weight:600">$' + (l.offer||0).toLocaleString() + '</td>' +
      '<td style="padding:8px 6px;font-size:13px;font-weight:700;color:#34c759">$' + (l.spread||0).toLocaleString() + '</td>' +
      '<td style="padding:8px 6px;font-size:12px;color:#5e5ce6">' + roi + '%</td>' +
    '</tr>';
  }).join('');
  var modal=document.createElement('div');
  modal.id='bulk-send-modal';
  modal.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick=function(e){if(e.target===modal)modal.remove();};
  modal.innerHTML='<div style="background:#fff;border-radius:16px;width:95vw;max-width:1100px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,.4)">' +
    '<div style="padding:18px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">' +
      '<div><div style="font-size:17px;font-weight:700">Send Deals to ' + buyer.name + '</div>' +
      '<div style="font-size:12px;color:#86868b">' + matches.length + ' best deals - select - click Send</div></div>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        '<button onclick="toggleAllBulkDeals()" style="padding:7px 14px;border:1px solid #e5e5ea;border-radius:8px;background:#fff;cursor:pointer;font-size:12px">All</button>' +
        '<button onclick="confirmBulkSendToBuyer(\'' + buyer.id + '\')" style="padding:9px 20px;background:#1a1a2e;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700">Send</button>' +
        '<button onclick="closeBulkModal()" style="background:none;border:none;font-size:28px;cursor:pointer;color:#86868b;line-height:1">&#x2715;</button>' +
      '</div>' +
    '</div>' +
    (!buyer.email?'<div style="background:#fff3cd;border:1px solid #ff9500;border-radius:8px;padding:10px 16px;font-size:12px;color:#8a6400;margin:0 24px 12px">No email for ' + buyer.name + ' - edit buyer to add email before sending</div>':'') +
    '<div style="overflow-y:auto;flex:1"><table style="width:100%;border-collapse:collapse">' +
      '<thead style="position:sticky;top:0;background:#f5f5f7;z-index:1"><tr>' +
        '<th style="padding:9px 6px;font-size:10px;color:#86868b;text-align:left">CHK</th>' +
        '<th style="padding:9px 6px;font-size:10px;color:#86868b;text-align:left">REF#</th>' +
        '<th style="padding:9px 6px;font-size:10px;color:#86868b;text-align:left">ADDRESS</th>' +
        '<th style="padding:9px 6px;font-size:10px;color:#86868b;text-align:left">ARV</th>' +
        '<th style="padding:9px 6px;font-size:10px;color:#86868b;text-align:left">OFFER</th>' +
        '<th style="padding:9px 6px;font-size:10px;color:#86868b;text-align:left">SPREAD</th>' +
        '<th style="padding:9px 6px;font-size:10px;color:#86868b;text-align:left">ROI</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div>' +
    '<div style="padding:12px 24px;border-top:1px solid #f0f0f0;background:#f9f9fb;border-radius:0 0 16px 16px;font-size:11px;color:#86868b">Address revealed only after buyer confirms interest</div>' +
  '</div>';
  document.body.appendChild(modal);
}
function toggleAllBulkDeals(){var b=document.querySelectorAll('#bulk-send-modal input[type=checkbox]');var a=Array.from(b).every(function(x){return x.checked;});b.forEach(function(x){x.checked=!a;});}
async function confirmBulkSendToBuyer(id){
  var b=(APP.buyers||[]).find(function(x){return x.id===id;});
  if(!b)return;
  if(!b.email){toast('Add email for '+b.name+' first','error');return;}
  var c=Array.from(document.querySelectorAll('#bulk-send-modal input[type=checkbox]:checked'));
  if(!c.length){toast('Select at least one deal','error');return;}
  var ds=c.map(function(x){return x.dataset.dealId;});
  toast('Sending '+ds.length+' deals...','');
  try{
    await fetch('/api/buyers/'+id+'/send-deals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dealIds:ds})});
    closeBulkModal();
    toast('Sent '+ds.length+' deals to '+b.name,'success');
  }catch(e){toast('Error: '+e.message,'error');}
}

// Buyer finder helpers
function doFindBuyers(btn){var state=btn.dataset.state;var cities=btn.dataset.cities?btn.dataset.cities.split('|'):[state];populateBuyersForState(state,cities);}
async function populateBuyersForState(state,cities){toast('Finding buyers in '+state+'...','');await runBuyerFinder(state,cities&&cities.length?cities:[state]);}
function populateLeadsForState(state){toast('Scanning leads for '+state+'...','');fetch('/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({states:[state],limit:50})}).then(function(r){return r.json();}).then(function(d){toast((d.added||0)+' leads added for '+state,'success');loadLeadsFromAPI();}).catch(function(){toast('Scan queued','');});}

var _bfRunning=false;
async function runBuyerFinder(state,cities){
  if(_bfRunning){toast('Finder already running','');return;}
  _bfRunning=true;
  var el=document.getElementById('buyer-finder-status');
  var qs=['we buy houses','cash home buyers','real estate investors','wholesale real estate','fix and flip buyers'];
  var found=[],saved=0;
  for(var ci=0;ci<cities.length;ci++){
    var city=cities[ci];
    for(var qi=0;qi<qs.length;qi++){
      var q=qs[qi]+' '+city+' '+state;
      if(el)el.textContent='Searching: '+q+'...';
      try{
        var res=await fetch('/api/buyer-search?q='+encodeURIComponent(q)+'&state='+state+'&city='+encodeURIComponent(city));
        if(!res.ok)continue;
        var data=await res.json();
        (data.results||[]).forEach(function(s){
          var txt=(s.snippet||'')+' '+(s.title||'');
          if(!['cash','investor','wholesale','buyers list','we buy'].some(function(k){return txt.toLowerCase().includes(k);}))return;
          var ph=(txt.match(/\(?\d{3}\)?[.\-\s]?\d{3}[.\-\s]?\d{4}/g)||[]);
          var em=(txt.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g)||[]);
          found.push({name:s.title||q,phone:ph[0]||'',email:em[0]||'',city:city,state:state,website:s.url||''});
        });
      }catch(e){}
      await new Promise(function(r){setTimeout(r,200);});
    }
  }
  var seen={},deduped=[];
  found.forEach(function(b){
    var k=b.phone||b.email||(b.website.split('/')[2]||b.name).replace('www.','');
    if(k&&!seen[k]){seen[k]=true;deduped.push(b);}
  });
  if(el)el.textContent='Saving '+deduped.length+' buyers...';
  for(var i=0;i<deduped.length;i++){
    try{
      var r=await fetch('/api/buyers',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:deduped[i].name,phone:deduped[i].phone,email:deduped[i].email,
          city:deduped[i].city,state:deduped[i].state,states:[deduped[i].state],
          buyTypes:['SFR','Multi'],website:deduped[i].website})});
      if(r.ok)saved++;
    }catch(e){}
  }
  _bfRunning=false;
  if(typeof loadMatchingData==='function')await loadMatchingData();
  if(el)el.textContent='Done! Saved '+saved+' buyers for '+state;
  toast('Found '+saved+' buyers in '+state,'success');
}

// FIX: renderBuyers with Send Deals buttons
renderBuyers = function(){
  var buyers=APP.buyers||[];
  if(!buyers.length)return '<div style="text-align:center;padding:60px;color:#86868b"><div style="font-size:40px;margin-bottom:12px">&#128101;</div><div style="font-size:15px;font-weight:600;margin-bottom:12px">No buyers yet</div><button class="btn btn-dark" onclick="openAddBuyer()">+ Add First Buyer</button></div>';
  var cards=buyers.map(function(b){
    var states=(b.states&&b.states.length)?b.states.join(', '):(b.state||'Any');
    var types=(b.buyTypes||[]).join(', ')||'Any';
    var maxP=b.maxPrice?'$'+Number(b.maxPrice).toLocaleString():'Any';
    var minP=b.minPrice?'$'+Number(b.minPrice).toLocaleString():'$0';
    var sc=b.score||75,scC=sc>=80?'#34c759':sc>=50?'#ff9500':'#ff3b30';
    var mc=typeof matchBuyersToLead==='function'?(APP.leads||[]).filter(function(l){return matchBuyersToLead(l,[b]).length>0;}).length:0;
    return '<div style="background:#fff;border:1px solid #e5e5ea;border-radius:14px;padding:16px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">' +
        '<div><div style="font-size:14px;font-weight:700">'+b.name+'</div>' +
        '<div style="font-size:11px;color:#86868b">'+(b.city||'')+(b.state?', '+b.state:'')+(b.strategy?' - '+b.strategy:'')+'</div></div>' +
        '<div style="text-align:right"><div style="font-size:14px;font-weight:700;color:'+scC+'">'+sc+'</div><div style="font-size:9px;color:#86868b">trust</div></div>' +
      '</div>' +
      '<div style="background:#f9f9fb;border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px;line-height:1.8">' +
        '<div>Phone: '+(b.phone?'<strong>'+b.phone+'</strong>':'<span style="color:#86868b">No phone</span>')+'</div>' +
        '<div>Email: '+(b.email?'<strong>'+b.email+'</strong>':'<span style="color:#ff9500;font-weight:600">No email</span> <button data-bid="'+b.id+'" onclick="openBuyerDetail(this.dataset.bid)" style="background:none;border:none;color:#0071e3;cursor:pointer;font-size:11px;padding:0">Add &#8594;</button>')+'</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px;font-size:11px">' +
        '<div>Types: <strong>'+types+'</strong></div>' +
        '<div>Budget: <strong>'+minP+'-'+maxP+'</strong></div>' +
        '<div>States: <strong>'+states+'</strong></div>' +
        '<div style="color:'+(mc>0?'#0071e3':'#86868b')+'">'+(mc>0?mc+' deals match':'No matches')+'</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px">' +
        '<button data-bid="'+b.id+'" onclick="editBuyer(this.dataset.bid)" style="flex:1;padding:7px;background:#f5f5f7;border:none;border-radius:8px;cursor:pointer;font-size:11px">Edit</button>' +
        '<button data-bid="'+b.id+'" onclick="openBulkSendToBuyer(this.dataset.bid)" style="flex:2;padding:7px;background:#1a1a2e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600">Send '+Math.min(mc,30)+' Deals</button>' +
      '</div>' +
    '</div>';
  }).join('');
  return '<div style="max-width:1100px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
      '<div><div style="font-size:18px;font-weight:700">Buyers Database</div>' +
      '<div style="font-size:12px;color:#86868b">'+buyers.length+' buyers - '+(APP.leads||[]).length.toLocaleString()+' leads</div></div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn btn-dark" onclick="openAddBuyer()">+ Add Buyer</button>' +
        '<button class="btn btn-sm" style="background:#f5f5f7" onclick="loadMatchingData()">Sync</button>' +
      '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">'+cards+'</div>' +
  '</div>';
};

// All States tab
renderAllStates = function(){
  var leads=APP.leads||[],buyers=APP.buyers||[];
  var lc={},bc={};
  leads.forEach(function(l){if(l.state)lc[l.state]=(lc[l.state]||0)+1;});
  buyers.forEach(function(b){if(b.state)bc[b.state]=(bc[b.state]||0)+1;});
  var states=[['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']];
  var topCities={TX:['Dallas','Houston','Austin','San Antonio'],CA:['Los Angeles','San Diego','San Francisco'],FL:['Miami','Orlando','Tampa','Jacksonville'],GA:['Atlanta','Augusta','Savannah'],AZ:['Phoenix','Tucson','Scottsdale'],OH:['Columbus','Cleveland','Cincinnati'],NC:['Charlotte','Raleigh','Durham'],TN:['Nashville','Memphis','Knoxville'],IL:['Chicago','Rockford','Peoria'],NV:['Las Vegas','Reno'],CO:['Denver','Colorado Springs'],NY:['New York','Buffalo','Albany'],PA:['Philadelphia','Pittsburgh'],VA:['Richmond','Virginia Beach'],WA:['Seattle','Spokane'],MO:['Kansas City','St. Louis'],MI:['Detroit','Grand Rapids'],IN:['Indianapolis','Fort Wayne'],KY:['Louisville','Lexington'],OK:['Oklahoma City','Tulsa'],MS:['Jackson','Gulfport'],AL:['Birmingham','Montgomery'],NE:['Omaha','Lincoln'],MN:['Minneapolis','Saint Paul'],NJ:['Newark','Jersey City'],MD:['Baltimore','Annapolis']};
  var search=APP._stateSearch||'';
  var filtered=states.filter(function(s){if(!search)return true;return s[0].toLowerCase().includes(search.toLowerCase())||s[1].toLowerCase().includes(search.toLowerCase());});
  var cards=filtered.map(function(s){
    var code=s[0],name=s[1];
    var ll=lc[code]||0,bb=bc[code]||0;
    var cities=(topCities[code]||[name]).join('|');
    return '<div style="background:#fff;border:1px solid '+(ll>0?'#34c759':'#e5e5ea')+';border-radius:12px;padding:14px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">' +
        '<div><div style="font-size:20px;font-weight:800;color:#1a1a2e">'+code+'</div>' +
        '<div style="font-size:10px;color:#86868b">'+name+'</div></div>' +
        '<div style="text-align:right">' +
          '<div style="font-size:11px;font-weight:600;color:'+(ll>0?'#34c759':'#86868b')+'">'+ll.toLocaleString()+' leads</div>' +
          '<div style="font-size:11px;color:'+(bb>0?'#0071e3':'#86868b')+'">'+bb+' buyers</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px">' +
        '<button data-state="'+code+'" onclick="populateLeadsForState(this.dataset.state)" style="padding:6px 4px;background:#1a1a2e;color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:10px;font-weight:600">Get Leads</button>' +
        '<button data-state="'+code+'" data-cities="'+cities+'" onclick="doFindBuyers(this)" style="padding:6px 4px;background:#f0f6ff;color:#0071e3;border:1px solid #c8deff;border-radius:7px;cursor:pointer;font-size:10px;font-weight:600">Find Buyers</button>' +
      '</div>' +
    '</div>';
  }).join('');
  return '<div style="max-width:1200px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
      '<div><div style="font-size:18px;font-weight:700">All 50 States</div>' +
      '<div style="font-size:12px;color:#86868b">'+leads.length.toLocaleString()+' leads - '+buyers.length+' buyers</div></div>' +
      '<input placeholder="Search states..." oninput="APP._stateSearch=this.value;render()" value="'+(search||'')+'" style="padding:8px 14px;border:1px solid #e5e5ea;border-radius:20px;font-size:12px;outline:none;width:180px">' +
    '</div>' +
    '<div id="buyer-finder-status" style="min-height:20px;font-size:12px;color:#5e5ce6;margin-bottom:10px;font-weight:500"></div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px">'+cards+'</div>' +
  '</div>';
};

// FIX 7: Daily auto-scan
function scheduleDailyScan() {
  if (window._dailyScanTimer) clearInterval(window._dailyScanTimer);
  window._dailyScanTimer = setInterval(function(){
    var last = parseInt(localStorage.getItem('lastAutoScan')||'0');
    if (Date.now() - last > 23*60*60*1000) {
      localStorage.setItem('lastAutoScan', String(Date.now()));
      toast('Running daily lead scan...', '');
      fetch('/api/scan', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nationwide:true,limit:200})})
        .then(function(r){return r.json();})
        .then(function(d){toast((d.added||0)+' new leads in daily scan', 'success');loadLeadsFromAPI();})
        .catch(function(){});
    }
  }, 60*60*1000);
}
scheduleDailyScan();

// Buy Boxes nav removal
function removeBuyBoxesNav(){document.querySelectorAll('[onclick*=buyboxes],.nav-item').forEach(function(el){var t=(el.textContent||'').toLowerCase().trim();if((t==='buy boxes'||t.includes('buy box manager'))&&!t.includes('buyers&'))el.style.display='none';});}
removeBuyBoxesNav();
if(!window._bbo){window._bbo=new MutationObserver(removeBuyBoxesNav);window._bbo.observe(document.body,{childList:true,subtree:true});}

// Boot
if(APP&&APP.leads&&APP.leads.length){APP.leads=assignRefIds(APP.leads);APP.filtered=APP.filtered||APP.leads;}
if(typeof updateLeadsBadge==='function')updateLeadsBadge();
if(['buyers','states','outreach'].indexOf(APP&&APP.page)>-1)render();
console.log('WholesaleOS Patch v5 loaded - all 9 issues addressed');
