// dashboard/wos-leads-detail.js v1
// Lead Source Transparency Panel + AI Seller Guidance
// Injects a panel at the TOP of every lead modal — no index.html changes
'use strict';
(function() {

// ── Lead type config — badges, colors, approach guidance ─────────────────
var LEAD_TYPES = {
  pre_foreclosure: {
    label:'Pre-Foreclosure', icon:'⚠️', color:'#dc2626', bg:'#fef2f2', border:'#fecaca',
    urgency:'HIGH — Owner facing foreclosure, motivated to sell fast',
    approach:'Empathetic and fast. They need relief, not negotiation.',
    questions:[
      'How far behind are you on payments?',
      'Have you received a Notice of Default or sale date?',
      'Have you spoken to your lender about options?',
      'How much do you owe on the mortgage?',
      'Is the property your primary residence?',
      'Are there any other liens or judgments on the property?',
    ],
    lookFor:'Redemption period window, auction date, total debt vs ARV',
    risks:'Short timeline, title issues, possible 2nd liens',
    opportunity:'Massive discount if you can close before auction date',
  },
  probate: {
    label:'Probate', icon:'⚖️', color:'#7c3aed', bg:'#faf5ff', border:'#e9d5ff',
    urgency:'MEDIUM — Estate must sell, heirs want liquidity',
    approach:'Compassionate and patient. Deal with executor or attorney.',
    questions:[
      'Are you the executor or personal representative of the estate?',
      'Has the probate court issued Letters Testamentary?',
      'Are all heirs in agreement to sell?',
      'Is there a mortgage on the property?',
      'How long has the property been vacant?',
      'Is the property in need of repairs?',
      'What is the estate's timeline for closing?',
    ],
    lookFor:'Court approval required, multiple heirs = delays, vacant = deferred maintenance',
    risks:'Probate can take 6–12 months, heirs may disagree',
    opportunity:'Properties often priced below market, motivated executor',
  },
  tax_lien: {
    label:'Tax Delinquent', icon:'🏛️', color:'#b45309', bg:'#fffbeb', border:'#fde68a',
    urgency:'HIGH — Owner may lose property to tax sale',
    approach:'Educational. Many owners don't realize they can sell.',
    questions:[
      'Do you know how far behind you are on property taxes?',
      'Have you received a tax sale notice?',
      'Do you still live in the property or is it vacant?',
      'Are there any other debts on the property?',
      'Would you consider selling for cash to avoid losing it?',
      'How long have you owned the property?',
    ],
    lookFor:'Amount of taxes owed, redemption period, property condition',
    risks:'Tax buyer may already have a lien, title cleanup needed',
    opportunity:'Owner often highly motivated, may accept near-payoff price',
  },
  fire_damaged: {
    label:'Fire Damaged', icon:'🔥', color:'#ea580c', bg:'#fff7ed', border:'#fed7aa',
    urgency:'HIGH — Insurance headaches, owner wants out',
    approach:'Direct and solution-focused. They want the problem gone.',
    questions:[
      'Was there an insurance claim filed?',
      'Has the insurance payout been received?',
      'What is the current status of the property?',
      'Are there any permits pulled for repair work?',
      'How long ago did the fire occur?',
      'Is the property livable in any part?',
    ],
    lookFor:'Insurance settlement amount, structural damage extent, permits/violations',
    risks:'Demolition required, environmental hazards, contractor liens',
    opportunity:'Deep discount possible, no competing retail buyers',
  },
  code_violation: {
    label:'Code Violation', icon:'🚨', color:'#d97706', bg:'#fffbeb', border:'#fde68a',
    urgency:'MEDIUM — Fines accumulating, owner stressed',
    approach:'Problem-solver. Position yourself as relief from city pressure.',
    questions:[
      'Do you know what specific violations were cited?',
      'How long has the property had these violations?',
      'Have you received any fines or daily penalties?',
      'Is the property occupied or vacant?',
      'Have you gotten any repair estimates?',
      'Are you the owner of record or an heir/representative?',
    ],
    lookFor:'Violation severity, fine accumulation rate, owner occupancy status',
    risks:'City may have placed liens, inspector relationship needed',
    opportunity:'Owner embarrassed/stressed, often accepts discount for quick relief',
  },
  bankruptcy: {
    label:'Bankruptcy', icon:'📋', color:'#6b7280', bg:'#f9fafb', border:'#e5e7eb',
    urgency:'HIGH — Trustee controls timeline',
    approach:'Professional and quick. Trustee needs documented offers.',
    questions:[
      'Is this a Chapter 7 or Chapter 13 bankruptcy?',
      'Who is the bankruptcy trustee?',
      'Has the automatic stay been lifted for the property?',
      'What is the estimated value the trustee expects?',
      'Are there other creditors with claims on the property?',
    ],
    lookFor:'Trustee motivation, stay status, creditor waterfall',
    risks:'Court approval required, cannot move fast without judge',
    opportunity:'Trustee has fiduciary duty to sell — motivated party',
  },
  foreclosure: {
    label:'Foreclosure/Auction', icon:'🔨', color:'#1d4ed8', bg:'#eff6ff', border:'#bfdbfe',
    urgency:'VERY HIGH — Property going to auction',
    approach:'Fast and factual. Numbers matter, not emotion.',
    questions:[
      'What is the auction date?',
      'What is the opening bid?',
      'Is there a right of redemption period in this state?',
      'Are there any occupants currently in the property?',
      'Can I access the property for inspection before auction?',
    ],
    lookFor:'Opening bid vs ARV, title search, occupied/vacant status',
    risks:'Buy as-is, no inspections, may have occupants',
    opportunity:'Steep discount if opening bid is below ARV',
  },
};

var DEFAULT_TYPE = {
  label:'Lead', icon:'📍', color:'#374151', bg:'#f9fafb', border:'#e5e7eb',
  urgency:'UNKNOWN — Research needed',
  approach:'Gather information first before making any assumptions.',
  questions:['How long have you owned the property?','Are you looking to sell?','What is your timeline?','Is the property occupied?'],
  lookFor:'Motivation level, ownership situation, property condition',
  risks:'Unknown situation — qualify before committing',
  opportunity:'TBD after initial conversation',
};

function getTypeConfig(lead) {
  var mot = (lead.motivation||lead.source_details||'').toLowerCase();
  if(mot.indexOf('foreclos')>-1||mot.indexOf('auction')>-1) return LEAD_TYPES.foreclosure;
  if(mot.indexOf('pre_foreclos')>-1||mot.indexOf('pre-foreclos')>-1) return LEAD_TYPES.pre_foreclosure;
  if(mot.indexOf('probate')>-1) return LEAD_TYPES.probate;
  if(mot.indexOf('tax')>-1||mot.indexOf('lien')>-1||mot.indexOf('delinqu')>-1) return LEAD_TYPES.tax_lien;
  if(mot.indexOf('fire')>-1) return LEAD_TYPES.fire_damaged;
  if(mot.indexOf('code')>-1||mot.indexOf('violation')>-1) return LEAD_TYPES.code_violation;
  if(mot.indexOf('bankrupt')>-1) return LEAD_TYPES.bankruptcy;
  return DEFAULT_TYPE;
}

// ── Build the transparency panel HTML ──────────────────────────────────────
function buildLeadDetailPanel(lead) {
  var tc = getTypeConfig(lead);
  var pullDate = lead.created_at || lead.createdAt || lead.created || '';
  if(pullDate) { try { pullDate = new Date(pullDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); } catch(e){} }
  var sourceUrl  = lead.source_url || lead.zillow_url || '';
  var sourceName = lead.source || lead.county || 'Unknown source';
  var score = lead.hot_score || lead.motivation_score || lead.score || 0;
  var scoreColor = score>=85?'#dc2626':score>=65?'#d97706':'#374151';
  var scoreBadge = score>=85?'🔥 HOT':score>=65?'⚡ WARM':'❄️ COLD';

  return `
    <div id="wosLeadDetailPanel" style="margin-bottom:20px;border-radius:12px;overflow:hidden;border:2px solid ${tc.border};font-family:system-ui,sans-serif;">

      <!-- Lead type header bar -->
      <div style="background:${tc.color};color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px;">
        <span style="font-size:22px;">${tc.icon}</span>
        <div style="flex:1;">
          <div style="font-size:16px;font-weight:700;">${tc.label}</div>
          <div style="font-size:12px;opacity:0.85;">${tc.urgency}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:18px;font-weight:700;color:#fff;">${scoreBadge}</div>
          <div style="font-size:11px;opacity:0.8;">Score: ${score}/100</div>
        </div>
      </div>

      <!-- Source info row -->
      <div style="background:${tc.bg};padding:12px 16px;display:flex;gap:16px;flex-wrap:wrap;border-bottom:1px solid ${tc.border};">
        <div style="flex:1;min-width:140px;">
          <div style="font-size:10px;font-weight:700;color:${tc.color};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Source</div>
          <div style="font-size:13px;color:#1f2937;font-weight:500;">${sourceName}</div>
          ${sourceUrl ? '<a href="'+sourceUrl+'" target="_blank" style="font-size:11px;color:#6b7280;text-decoration:none;word-break:break-all;">🔗 View Source</a>' : ''}
        </div>
        <div style="flex:1;min-width:120px;">
          <div style="font-size:10px;font-weight:700;color:${tc.color};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Date Pulled</div>
          <div style="font-size:13px;color:#1f2937;font-weight:500;">${pullDate||'Unknown'}</div>
        </div>
        <div style="flex:1;min-width:120px;">
          <div style="font-size:10px;font-weight:700;color:${tc.color};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Lead Type</div>
          <div style="font-size:13px;color:#1f2937;font-weight:500;">${tc.label}</div>
        </div>
        <div style="flex:1;min-width:140px;">
          <div style="font-size:10px;font-weight:700;color:${tc.color};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Property Links</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${lead.zillow_url ? '<a href="'+lead.zillow_url+'" target="_blank" style="font-size:11px;background:#1277e1;color:#fff;padding:2px 7px;border-radius:4px;text-decoration:none;">Zillow</a>' : ''}
            ${lead.maps_url ? '<a href="'+lead.maps_url+'" target="_blank" style="font-size:11px;background:#34a853;color:#fff;padding:2px 7px;border-radius:4px;text-decoration:none;">Maps</a>' : ''}
            ${lead.redfin_url ? '<a href="'+lead.redfin_url+'" target="_blank" style="font-size:11px;background:#cc0000;color:#fff;padding:2px 7px;border-radius:4px;text-decoration:none;">Redfin</a>' : ''}
          </div>
        </div>
      </div>

      <!-- AI guidance section -->
      <div style="background:#fff;padding:14px 16px;">
        <div style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">🤖 AI Seller Approach Guide — ${tc.label}</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div style="background:#f8fafc;border-radius:8px;padding:10px;">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:5px;">How to Approach</div>
            <div style="font-size:12px;color:#1f2937;line-height:1.5;">${tc.approach}</div>
          </div>
          <div style="background:#f8fafc;border-radius:8px;padding:10px;">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:5px;">Opportunity Signal</div>
            <div style="font-size:12px;color:#1f2937;line-height:1.5;">${tc.opportunity}</div>
          </div>
        </div>

        <div style="margin-bottom:12px;">
          <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px;">❓ Key Questions to Ask</div>
          <ol style="margin:0;padding-left:18px;display:grid;grid-template-columns:1fr 1fr;gap:3px;">
            ${tc.questions.map(function(q){return '<li style="font-size:12px;color:#374151;line-height:1.5;">'+q+'</li>';}).join('')}
          </ol>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div style="background:#fef3c7;border-radius:8px;padding:10px;">
            <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:4px;">⚠️ Watch Out For</div>
            <div style="font-size:12px;color:#78350f;line-height:1.5;">${tc.risks}</div>
          </div>
          <div style="background:#f0fdf4;border-radius:8px;padding:10px;">
            <div style="font-size:10px;font-weight:700;color:#166534;text-transform:uppercase;margin-bottom:4px;">✅ What to Look For</div>
            <div style="font-size:12px;color:#14532d;line-height:1.5;">${tc.lookFor}</div>
          </div>
        </div>

        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
          <button onclick="wosOpenComms('${lead.id}')" style="background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer;font-weight:600;">📡 Open Communications</button>
          <button onclick="wosCommsGenScript&&wosOpenComms('${lead.id}')" style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer;">📞 Get Call Script</button>
          ${!lead.phone ? '<button onclick="alert(\'Skip trace this lead to get phone number. BatchData API key needed in Railway.\')" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer;">📱 Skip Trace Needed</button>' : ''}
        </div>
      </div>
    </div>
  `;
}

// ── Inject panel into lead modal when it opens ────────────────────────────
// Hook into the existing lead modal — watch for it to appear
var _lastLeadId = null;
var _observer = null;

function _injectIfNeeded() {
  // Look for the lead modal — various selectors the dashboard might use
  var modal = document.querySelector('.modal.show .modal-body, #leadModal .modal-body, [id*="lead-detail"], .lead-detail-panel, #leadDetailContent');
  if (!modal) return;

  // Avoid re-injecting for same lead
  var leadId = modal.dataset.leadId || modal.getAttribute('data-lead-id');
  if (document.getElementById('wosLeadDetailPanel')) return; // already injected

  // Get lead data from the page if available
  var lead = window._currentLead || window._openLead;
  if (!lead) return;

  // Build and prepend
  var div = document.createElement('div');
  div.innerHTML = buildLeadDetailPanel(lead);
  modal.insertBefore(div.firstChild, modal.firstChild);
}

// Watch for lead modal opening
function _startWatcher() {
  if (_observer) return;
  _observer = new MutationObserver(function(muts) {
    var changed = muts.some(function(m){ return m.addedNodes.length>0||m.attributeName==='class'; });
    if (changed) setTimeout(_injectIfNeeded, 150);
  });
  _observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class','style'] });
}

// Expose global function so lead modal can call it directly
window.wosShowLeadDetail = function(lead) {
  window._currentLead = lead;
  window._openLead = lead;
  var existing = document.getElementById('wosLeadDetailPanel');
  if (existing) existing.remove();
  setTimeout(_injectIfNeeded, 100);
};

// Also expose panel builder for direct use
window.wosLeadDetailHTML = function(lead) {
  return buildLeadDetailPanel(lead);
};

_startWatcher();

// Hook into existing selectLead / openLead functions if they exist
var _origSelectLead = window.selectLead;
if (typeof _origSelectLead === 'function') {
  window.selectLead = function(id) {
    _origSelectLead.apply(this, arguments);
    // After lead loads, inject panel
    setTimeout(function() {
      fetch('/api/leads/'+id).then(function(r){return r.json();}).then(function(lead){
        window._currentLead = lead;
        var existing = document.getElementById('wosLeadDetailPanel');
        if (existing) existing.remove();
        _injectIfNeeded();
      }).catch(function(){});
    }, 400);
  };
}

console.log('[wos-leads-detail] v1 loaded');
})();
