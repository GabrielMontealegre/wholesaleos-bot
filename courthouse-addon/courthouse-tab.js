// ══════════════════════════════════════════════════════════════
//  Courthouse Deals Tab — Dashboard Add-on Patch
//  Drop this file in dashboard/ and add ONE script tag to index.html:
//  <script src="/dashboard/courthouse-tab.js"></script>
//
//  Does NOT modify any existing dashboard code.
// ══════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ── Inject nav tab ──────────────────────────────────────────────
  function injectNavTab() {
    // Find the nav container
    var nav = document.querySelector('nav, .nav, [class*="nav-item"]:last-child')
      || document.querySelector('[onclick*="page"]')?.parentElement;
    if (!nav || document.getElementById('ch-nav-tab')) return;

    var tab = document.createElement('button');
    tab.id = 'ch-nav-tab';
    tab.className = 'nav-item';
    tab.innerHTML = '\uD83C\uDFDB\uFE0F Courthouse';
    tab.style.cssText = 'position:relative';
    tab.onclick = function() { renderCourthouseTab(); };

    // Badge for expiring leads
    var badge = document.createElement('span');
    badge.id = 'ch-badge';
    badge.style.cssText = 'position:absolute;top:-6px;right:-6px;background:#ff3b30;color:#fff;border-radius:10px;font-size:9px;font-weight:700;padding:1px 5px;display:none';
    tab.appendChild(badge);
    nav.appendChild(tab);

    // Update badge count
    updateBadge();
  }

  function updateBadge() {
    fetch('/api/courthouse/stats').then(function(r){return r.json();}).then(function(s){
      var badge = document.getElementById('ch-badge');
      if (!badge) return;
      if (s.expiring > 0) {
        badge.textContent = s.expiring;
        badge.style.display = '';
      }
    }).catch(function(){});
  }

  // ── Main render function ─────────────────────────────────────────
  function renderCourthouseTab() {
    var content = document.getElementById('content');
    if (!content) return;

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(function(el){ el.classList.remove('active'); });
    var tab = document.getElementById('ch-nav-tab');
    if (tab) tab.classList.add('active');

    content.innerHTML = '<div id="courthouse-root" style="max-width:1200px;padding:0 4px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
        '<div>' +
          '<div style="font-size:18px;font-weight:700">\uD83C\uDFDB\uFE0F Courthouse Deals</div>' +
          '<div id="ch-subtitle" style="font-size:12px;color:#86868b">Loading...</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button onclick="chFilterExpiring()" id="ch-btn-expiring" style="padding:7px 14px;background:#ff3b3022;color:#ff3b30;border:1px solid #ff3b3044;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">\u23F0 Expiring Soon</button>' +
          '<select id="ch-filter-state" onchange="chFilterState(this.value)" style="padding:7px;border:1px solid #e5e5ea;border-radius:8px;font-size:12px">' +
            '<option value="">All States</option>' +
          '</select>' +
          '<select id="ch-filter-type" onchange="chFilterType(this.value)" style="padding:7px;border:1px solid #e5e5ea;border-radius:8px;font-size:12px">' +
            '<option value="">All Types</option>' +
            '<option value="Foreclosure">Foreclosure</option>' +
            '<option value="Probate">Probate</option>' +
            '<option value="Tax Delinquency">Tax Delinquent</option>' +
            '<option value="Code Violation">Code Violation</option>' +
            '<option value="Fire Damaged">Fire Damaged</option>' +
            '<option value="Lien">Lien</option>' +
            '<option value="Bankruptcy">Bankruptcy</option>' +
          '</select>' +
          '<button onclick="chRunScan()" style="padding:7px 14px;background:#1a1a2e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">\u25B6 Run Scan</button>' +
        '</div>' +
      '</div>' +
      '<div id="ch-stats-row" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:20px"></div>' +
      '<div id="ch-leads-container"><div style="text-align:center;padding:40px;color:#86868b">Loading courthouse leads...</div></div>' +
    '</div>';

    // Load data
    chLoadData({});
  }

  // ── Data loading ─────────────────────────────────────────────────
  window.chLoadData = function(filters) {
    var params = new URLSearchParams();
    if (filters.state)    params.set('state', filters.state);
    if (filters.type)     params.set('type', filters.type);
    if (filters.expiring) params.set('expiring', 'true');
    params.set('limit', '200');

    // Load stats
    fetch('/api/courthouse/stats').then(function(r){return r.json();}).then(function(stats){
      renderStats(stats);
      document.getElementById('ch-subtitle').textContent =
        stats.total + ' total courthouse leads \u00b7 ' +
        (stats.expiring||0) + ' expiring soon \u00b7 Last run: ' + (stats.lastRun ? stats.lastRun.slice(0,10) : 'never');

      // Populate state filter
      var sel = document.getElementById('ch-filter-state');
      if (sel && stats.byState) {
        Object.keys(stats.byState).sort().forEach(function(s){
          var opt = document.createElement('option');
          opt.value = s; opt.textContent = s + ' (' + stats.byState[s] + ')';
          sel.appendChild(opt);
        });
      }
    }).catch(function(){});

    // Load leads
    fetch('/api/courthouse/leads?' + params.toString())
      .then(function(r){return r.json();})
      .then(function(data){ renderLeadsList(data.leads || []); })
      .catch(function(e){
        document.getElementById('ch-leads-container').innerHTML =
          '<div style="text-align:center;padding:40px;color:#86868b">No courthouse data yet. Click Run Scan to fetch leads.</div>';
      });
  };

  // ── Stats cards ───────────────────────────────────────────────────
  function renderStats(stats) {
    var row = document.getElementById('ch-stats-row');
    if (!row) return;
    var cards = [
      { label: 'Total Leads', value: (stats.total||0).toLocaleString(), color: '#1a1a2e' },
      { label: 'Expiring Soon', value: (stats.expiring||0).toLocaleString(), color: '#ff3b30' },
    ];
    if (stats.byType) {
      Object.entries(stats.byType).slice(0,4).forEach(function(kv){
        cards.push({ label: kv[0].split(',')[0], value: kv[1].toLocaleString(), color: '#0071e3' });
      });
    }
    row.innerHTML = cards.map(function(c){
      return '<div style="background:#f9f9fb;border-radius:10px;padding:12px;text-align:center">' +
        '<div style="font-size:20px;font-weight:800;color:' + c.color + '">' + c.value + '</div>' +
        '<div style="font-size:10px;color:#86868b;font-weight:600">' + c.label + '</div>' +
      '</div>';
    }).join('');
  }

  // ── Leads list ───────────────────────────────────────────────────
  function renderLeadsList(leads) {
    var container = document.getElementById('ch-leads-container');
    if (!container) return;

    if (!leads.length) {
      container.innerHTML = '<div style="text-align:center;padding:60px;color:#86868b">' +
        '<div style="font-size:32px;margin-bottom:12px">\uD83C\uDFDB\uFE0F</div>' +
        '<div style="font-size:15px;font-weight:600;margin-bottom:8px">No courthouse leads yet</div>' +
        '<div style="font-size:12px">Click "Run Scan" to fetch courthouse data</div>' +
      '</div>';
      return;
    }

    // Separate into sections
    var expiring   = leads.filter(function(l){ return l.expiring_soon; });
    var bestDeals  = leads.filter(function(l){ return !l.expiring_soon && (l.priority_flags||[]).some(function(f){ return ['foreclosure','high_equity','vacant'].includes(f); }); });
    var remaining  = leads.filter(function(l){ return !l.expiring_soon && !bestDeals.includes(l); });

    var html = '';

    if (expiring.length) {
      html += sectionHeader('\u23F0 Expiring Soon (' + expiring.length + ')', '#ff3b30', '#fff0f0');
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-bottom:24px">' +
        expiring.map(function(l){ return renderLeadCard(l, true); }).join('') + '</div>';
    }

    if (bestDeals.length) {
      html += sectionHeader('\u2B50 Best Deals (' + bestDeals.length + ')', '#ff9500', '#fff8ee');
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-bottom:24px">' +
        bestDeals.map(function(l){ return renderLeadCard(l, false); }).join('') + '</div>';
    }

    if (remaining.length) {
      html += sectionHeader('All Courthouse Leads (' + remaining.length + ')', '#86868b', '#f9f9fb');
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">' +
        remaining.map(function(l){ return renderLeadCard(l, false); }).join('') + '</div>';
    }

    container.innerHTML = html;
  }

  function sectionHeader(title, color, bg) {
    return '<div style="background:' + bg + ';border-left:4px solid ' + color + ';border-radius:8px;padding:10px 16px;margin-bottom:12px;font-weight:700;font-size:13px;color:' + color + '">' + title + '</div>';
  }

  // ── Lead card ────────────────────────────────────────────────────
  function renderLeadCard(l, isExpiring) {
    var flags    = l.priority_flags || [];
    var flagPills= flags.slice(0,3).map(function(f){
      return '<span style="background:' + flagColor(f) + '22;color:' + flagColor(f) + ';font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px">' + f.replace(/_/g,' ').toUpperCase() + '</span>';
    }).join('');
    var border = isExpiring ? '2px solid #ff3b30' : '1px solid #e5e5ea';
    var auctionBadge = l.auction_date ?
      '<div style="background:#ff3b3022;color:#ff3b30;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;margin-bottom:8px">\u23F0 Auction: ' + l.auction_date + '</div>' : '';

    return '<div style="background:#fff;border:' + border + ';border-radius:12px;padding:14px;cursor:pointer" onclick="chOpenLead(this)" data-lead="' + encodeURIComponent(JSON.stringify(l)) + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:700;color:#1a1a2e">' + (l.address||'No address') + '</div>' +
          '<div style="font-size:11px;color:#86868b;margin-top:2px">' + (l.county||l.market||'') + ', ' + l.state + '</div>' +
        '</div>' +
        '<span style="background:#1a1a2e;color:#fff;font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px">' + l.state + '</span>' +
      '</div>' +
      auctionBadge +
      '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">' + flagPills + '</div>' +
      '<div style="font-size:11px;color:#86868b;line-height:1.6">' +
        (l.owner_name ? '<div>Owner: <strong>' + l.owner_name + '</strong></div>' : '') +
        (l.lien_amount ? '<div>Amount: <strong style="color:#ff3b30">' + l.lien_amount + '</strong></div>' : '') +
        (l.case_number ? '<div>Case: ' + l.case_number + '</div>' : '') +
        '<div>Type: ' + (l.lead_type||'').split(',')[0] + '</div>' +
        '<div>Filed: ' + (l.filed_date||l.created||'') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;margin-top:10px">' +
        '<a href="https://www.google.com/maps/search/' + encodeURIComponent(l.address+' '+l.state) + '" target="_blank" style="flex:1;padding:6px;background:#f5f5f7;border:none;border-radius:7px;cursor:pointer;font-size:11px;text-align:center;text-decoration:none;color:#1a1a2e">\uD83D\uDDFA Maps</a>' +
        '<a href="https://www.zillow.com/homes/' + encodeURIComponent((l.address||'')+' '+(l.state||'')) + '_rb/" target="_blank" style="flex:1;padding:6px;background:#f5f5f7;border:none;border-radius:7px;cursor:pointer;font-size:11px;text-align:center;text-decoration:none;color:#1a1a2e">\uD83C\uDFE0 Zillow</a>' +
        (l.source_url ? '<a href="' + l.source_url + '" target="_blank" style="flex:1;padding:6px;background:#0071e322;border:none;border-radius:7px;cursor:pointer;font-size:11px;text-align:center;text-decoration:none;color:#0071e3">\uD83D\uDD17 Source</a>' : '') +
      '</div>' +
    '</div>';
  }

  function flagColor(flag) {
    var map = {
      foreclosure: '#ff3b30', auction_expiring: '#ff3b30',
      probate: '#5e5ce6', tax_delinquent: '#ff9500',
      code_violation: '#ff6b00', fire_damaged: '#dc2626',
      lien: '#0071e3', out_of_state_owner: '#34c759',
      vacant: '#8b5cf6', bankruptcy: '#64748b',
      potential_equity: '#34c759', divorce: '#ec4899',
    };
    return map[flag] || '#86868b';
  }

  // ── Lead detail modal ─────────────────────────────────────────────
  window.chOpenLead = function(el) {
    var lead = JSON.parse(decodeURIComponent(el.dataset.lead));
    var ex = document.getElementById('ch-modal');
    if (ex) ex.remove();

    var modal = document.createElement('div');
    modal.id = 'ch-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px';
    modal.onclick = function(e){ if(e.target===modal) modal.remove(); };

    var meta = lead._courthouse_metadata || {};
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;width:600px;max-width:96vw;max-height:90vh;overflow-y:auto;box-shadow:0 30px 80px rgba(0,0,0,.4)">' +
      '<div style="padding:18px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#fff;border-radius:16px 16px 0 0">' +
        '<div>' +
          '<div style="font-size:16px;font-weight:700">' + (lead.address||'No address') + '</div>' +
          '<div style="font-size:12px;color:#86868b">' + (lead.county||'') + ', ' + lead.state + ' \u00b7 ' + lead.lead_type + '</div>' +
        '</div>' +
        '<button onclick="document.getElementById(\'ch-modal\').remove()" style="background:none;border:none;font-size:26px;cursor:pointer;color:#86868b">\u2715</button>' +
      '</div>' +
      '<div style="padding:20px 24px">' +
        (lead.auction_date ? '<div style="background:#fff0f0;border:1px solid #ff3b3044;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;font-weight:600;color:#ff3b30">\u23F0 AUCTION DATE: ' + lead.auction_date + '</div>' : '') +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;font-size:12px">' +
          infoBlock('Owner', lead.owner_name) +
          infoBlock('Lien/Amount', lead.lien_amount) +
          infoBlock('Case Number', lead.case_number) +
          infoBlock('Parcel/APN', lead.parcel) +
          infoBlock('Filed Date', lead.filed_date) +
          infoBlock('Mailing Address', lead.mailing_addr) +
          infoBlock('County', lead.county) +
          infoBlock('ZIP', lead.zip) +
        '</div>' +
        (lead.why_good_deal ? '<div style="background:#f0fff4;border:1px solid #34c75944;border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px"><div style="font-weight:700;color:#34c759;margin-bottom:4px">Why This Deal</div>' + lead.why_good_deal + '</div>' : '') +
        '<div style="margin-bottom:14px"><div style="font-weight:700;font-size:11px;color:#86868b;margin-bottom:8px">SIGNALS</div><div style="display:flex;flex-wrap:wrap;gap:6px">' +
          (lead.priority_flags||[]).map(function(f){
            return '<span style="background:' + flagColor(f) + '22;color:' + flagColor(f) + ';padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">' + f.replace(/_/g,' ').toUpperCase() + '</span>';
          }).join('') +
        '</div></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<a href="https://www.google.com/maps/search/' + encodeURIComponent((lead.address||'')+' '+lead.state) + '" target="_blank" style="padding:8px 14px;background:#4285f4;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600">\uD83D\uDDFA Maps</a>' +
          '<a href="https://www.zillow.com/homes/' + encodeURIComponent((lead.address||'')+' '+lead.state) + '_rb/" target="_blank" style="padding:8px 14px;background:#006aff;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600">\uD83C\uDFE0 Zillow</a>' +
          '<a href="https://www.redfin.com/search#location=' + encodeURIComponent((lead.address||'')+' '+lead.state) + '" target="_blank" style="padding:8px 14px;background:#cd2026;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600">\uD83D\uDD0D Redfin</a>' +
          (lead.source_url ? '<a href="' + lead.source_url + '" target="_blank" style="padding:8px 14px;background:#f5f5f7;color:#1a1a2e;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600">\uD83D\uDD17 Source Record</a>' : '') +
        '</div>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);
  };

  function infoBlock(label, value) {
    if (!value) return '';
    return '<div style="background:#f9f9fb;border-radius:8px;padding:10px">' +
      '<div style="font-size:10px;color:#86868b;font-weight:600;margin-bottom:2px">' + label.toUpperCase() + '</div>' +
      '<div style="font-size:12px;font-weight:600">' + value + '</div>' +
    '</div>';
  }

  // ── Filter actions ────────────────────────────────────────────────
  window.chFilterExpiring = function() {
    chLoadData({ expiring: true });
    document.getElementById('ch-btn-expiring').style.background = '#ff3b30';
    document.getElementById('ch-btn-expiring').style.color = '#fff';
  };
  window.chFilterState = function(state) { chLoadData({ state }); };
  window.chFilterType  = function(type)  { chLoadData({ type }); };

  window.chRunScan = function() {
    var btn = document.querySelector('[onclick="chRunScan()"]');
    if (btn) { btn.textContent = '\u23F3 Running...'; btn.disabled = true; }
    fetch('/api/courthouse/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function(){ setTimeout(function(){ chLoadData({}); if(btn){btn.textContent='\u25B6 Run Scan';btn.disabled=false;}}, 3000); })
      .catch(function(){ if(btn){btn.textContent='\u25B6 Run Scan';btn.disabled=false;} });
  };

  // ── Boot: inject tab after existing nav renders ──────────────────
  function init() {
    injectNavTab();
    // Re-inject if nav re-renders (MutationObserver)
    if (!window._chNavObs) {
      window._chNavObs = new MutationObserver(function() {
        if (!document.getElementById('ch-nav-tab')) injectNavTab();
      });
      window._chNavObs.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }

  // Expose flag color globally for cards
  window.flagColor = flagColor;

  console.log('Courthouse Deals tab loaded');
})();
