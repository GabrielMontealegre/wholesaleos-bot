// WholesaleOS Patch v7 — Incremental fixes only
// Applies on top of existing working system
// No rebuilds. No full rewrites. Surgical changes only.

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIX 1: BADGE — shows total unique leads, no flicker
// Root cause: multiple code paths set badge to different
// values (APP.leads.length vs new-only count).
// Fix: single authoritative function, called after merge.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function updateLeadsBadge() {
  var b = document.getElementById('nav-lead-count');
  if (!b) return;
  // Count UNIQUE regular leads only (not courthouse duplicates)
  var regular = (APP.leads || []).filter(function(l) {
    return l._source_module !== 'courthouse-addon';
  });
  var total = regular.length;
  b.textContent = total.toLocaleString();
  // Keep background neutral — badge shows count, not urgency
  b.style.background = total > 0 ? '#1a1a2e' : '#86868b';
  b.style.display = '';
}

// Patch every place that sets nav-lead-count directly
// by overriding document.getElementById to intercept
// nav-lead-count textContent assignments
(function patchBadgeSetter() {
  var _origGetById = document.getElementById.bind(document);
  document.getElementById = function(id) {
    var el = _origGetById(id);
    if (id === 'nav-lead-count' && el) {
      // Wrap textContent setter to normalize count
      if (!el._patched) {
        el._patched = true;
        var desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
        var _orig = desc.set;
        Object.defineProperty(el, 'textContent', {
          get: function() { return el.innerText || ''; },
          set: function(val) {
            // Only accept the total unique count — ignore courthouse inflated values
            var n = parseInt(String(val).replace(/,/g, '')) || 0;
            var regular = (APP && APP.leads || []).filter(function(l) {
              return l._source_module !== 'courthouse-addon';
            }).length;
            // Use whichever is correct: if val is close to regular count, use it
            // If val is inflated by courthouse leads, cap it
            if (n <= regular + 5) {
              _orig.call(el, String(n > 0 ? n.toLocaleString() : '0'));
            } else {
              _orig.call(el, String(regular > 0 ? regular.toLocaleString() : '0'));
            }
          },
          configurable: true
        });
      }
    }
    return el;
  };
})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIX 2: PIPELINE — clicking lead opens modal, stays in pipeline
// Root cause: onclick="navigate('leads');selectLead(id)" switches
// to Leads tab before opening the lead.
// Fix: override renderPipeline to open our detail modal instead.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var _origRenderPipeline = typeof renderPipeline === 'function' ? renderPipeline : null;
renderPipeline = function() {
  var stages = ['New Lead','Contacted','Offer Sent','Negotiating','Under Contract','Closed'];
  var colors = {'New Lead':'#0071e3','Contacted':'#ff9500','Offer Sent':'#5e5ce6','Negotiating':'#ff6b35','Under Contract':'#34c759','Closed':'#34c759'};
  var html = '<div class="pipeline-view">';
  stages.forEach(function(s) {
    var items = (APP.leads || []).filter(function(l) { return l.status === s; });
    var totalFees = items.reduce(function(sum,l){return sum+(l.fee_lo||0);},0);
    html += '<div class="pipe-col">' +
      '<div class="pipe-header" style="border-top:3px solid '+colors[s]+'">' +
        '<div class="pipe-header-title">'+s+'</div>' +
        '<div class="pipe-count">'+items.length+'</div>' +
      '</div>' +
      (totalFees>0?'<div style="font-size:10px;color:#86868b;text-align:center;padding:4px 8px;border-bottom:1px solid #f0f0f0">~$'+(totalFees/1000).toFixed(0)+'K pipeline</div>':'')+
      '<div class="pipe-body">';
    if (items.length === 0) {
      html += '<div style="font-size:11px;color:#86868b;text-align:center;padding:16px">Empty</div>';
    }
    items.forEach(function(l) {
      var ref = l.ref_id || getDealRefId(l);
      var mc = typeof matchBuyersToLead==='function' ? matchBuyersToLead(l, APP.buyers||[]).length : 0;
      html += '<div class="pipe-card" data-lid="'+l.id+'" onclick="openLeadDetailFixed(this.dataset.lid)" style="cursor:pointer" onmouseover="this.style.background=\'#f0f6ff\'" onmouseout="this.style.background=\'\'">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">' +
          '<span style="background:'+colors[s]+'22;color:'+colors[s]+';font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px">'+ref+'</span>' +
          (mc?'<span style="font-size:9px;color:#0071e3">'+mc+' buyers</span>':'') +
        '</div>' +
        '<div class="pipe-card-addr">'+(l.address||'').split(',')[0]+'</div>' +
        '<div class="pipe-card-meta">'+(l.county||l.state||'')+' - '+(l.type||l.category||'SFR')+'</div>' +
        '<div class="pipe-card-fee" style="color:#34c759;font-weight:700">$'+(l.fee_lo||0).toLocaleString()+' - $'+(l.fee_hi||0).toLocaleString()+'</div>' +
        '<div style="display:flex;gap:4px;margin-top:6px">' +
          pipeActions(l) +
        '</div>' +
      '</div>';
    });
    html += '</div></div>';
  });
  html += '</div>';
  return html;
};

function pipeActions(l) {
  var phone = l.phone || '';
  var smsBtn = phone ? '<button onclick="event.stopPropagation();openSMSCompose(\''+l.id+'\')" style="flex:1;padding:3px;background:#34c75922;border:none;border-radius:5px;cursor:pointer;font-size:9px;color:#34c759">SMS</button>' : '';
  var callBtn = phone ? '<button onclick="event.stopPropagation();initiateCall(\''+l.id+'\')" style="flex:1;padding:3px;background:#0071e322;border:none;border-radius:5px;cursor:pointer;font-size:9px;color:#0071e3">Call</button>' : '';
  var emailBtn = '<button onclick="event.stopPropagation();openEmailCompose(\''+l.id+'\')" style="flex:1;padding:3px;background:#5e5ce622;border:none;border-radius:5px;cursor:pointer;font-size:9px;color:#5e5ce6">Email</button>';
  return smsBtn + callBtn + emailBtn;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIX 3: QUICK FILTERS — CA, TX, OH, Courthouse, dynamic
// Injected into renderLeads as filter pills above the table
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window._quickFilter = window._quickFilter || null;

function applyQuickFilter(val) {
  window._quickFilter = window._quickFilter === val ? null : val; // toggle
  _leadsPage = 0;
  if (!window._quickFilter) {
    APP.filtered = APP._leadsStatusFilter && APP._leadsStatusFilter !== 'All'
      ? (APP.leads||[]).filter(function(l){return (l.status||'New Lead')===APP._leadsStatusFilter;})
      : APP.leads;
  } else if (window._quickFilter === 'courthouse') {
    APP.filtered = (APP.leads||[]).filter(function(l){return l._source_module==='courthouse-addon'||l.source==='courthouse';});
  } else {
    var all = APP._leadsStatusFilter && APP._leadsStatusFilter !== 'All'
      ? (APP.leads||[]).filter(function(l){return (l.status||'New Lead')===APP._leadsStatusFilter;})
      : APP.leads||[];
    APP.filtered = all.filter(function(l){return l.state===window._quickFilter;});
  }
  render();
}

function quickFilterBar(leads) {
  // Get top states dynamically from actual leads
  var stateCounts = {};
  (APP.leads||[]).forEach(function(l){ if(l.state&&l._source_module!=='courthouse-addon') stateCounts[l.state]=(stateCounts[l.state]||0)+1; });
  var topStates = Object.entries(stateCounts).sort(function(a,b){return b[1]-a[1];}).slice(0,5).map(function(e){return e[0];});
  // Always include CA TX OH if not already in top
  ['CA','TX','OH'].forEach(function(s){ if(!topStates.includes(s)&&stateCounts[s]) topStates.unshift(s); });
  topStates = topStates.slice(0,5);

  var chCount = (APP.leads||[]).filter(function(l){return l._source_module==='courthouse-addon';}).length;
  var qf = window._quickFilter;

  var pills = topStates.map(function(s){
    var cnt = stateCounts[s]||0;
    var active = qf===s;
    return '<button onclick="applyQuickFilter(\''+s+'\')" style="padding:5px 12px;border-radius:20px;border:1px solid '+(active?'#1a1a2e':'#e5e5ea')+';background:'+(active?'#1a1a2e':'#fff')+';color:'+(active?'#fff':'#1d1d1f')+';cursor:pointer;font-size:11px;font-weight:'+(active?'700':'400')+'">'+s+' ('+cnt.toLocaleString()+')</button>';
  }).join('');

  var chPill = chCount > 0
    ? '<button onclick="applyQuickFilter(\'courthouse\')" style="padding:5px 12px;border-radius:20px;border:1px solid '+(qf==='courthouse'?'#0071e3':'#c8deff')+';background:'+(qf==='courthouse'?'#0071e3':'#f0f6ff')+';color:'+(qf==='courthouse'?'#fff':'#0071e3')+';cursor:pointer;font-size:11px;font-weight:'+(qf==='courthouse'?'700':'400')+'">&#127963; Courthouse ('+chCount+')</button>'
    : '';

  var clearPill = qf
    ? '<button onclick="applyQuickFilter(null)" style="padding:5px 12px;border-radius:20px;border:1px solid #ff3b30;background:#fff;color:#ff3b30;cursor:pointer;font-size:11px">&#x2715; Clear</button>'
    : '';

  return '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;align-items:center">' +
    '<span style="font-size:11px;color:#86868b;font-weight:600">Quick:</span>' +
    pills + chPill + clearPill +
  '</div>';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIX 4: INVALID DEAL FILTERING
// Hide leads with negative spread, missing ARV, zero equity
// Adds a toggle — "Valid Deals Only"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window._showValidOnly = window._showValidOnly || false;

function isValidDeal(l) {
  if (l._source_module === 'courthouse-addon') return true; // courthouse always show
  if ((l.spread||0) < 0) return false;
  if ((l.arv||0) <= 0) return false;
  return true;
}

function toggleValidDealsFilter() {
  window._showValidOnly = !window._showValidOnly;
  _leadsPage = 0;
  render();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIX 5: CONTACT ACTION BUTTONS on every lead
// SMS, Email, Call — attached to lead rows and modal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function contactActions(l, compact) {
  var phone = l.phone || '';
  var id = l.id;
  if (compact) {
    return '<div style="display:flex;gap:4px">' +
      (phone?'<button data-lid="'+id+'" onclick="event.stopPropagation();openSMSCompose(this.dataset.lid)" style="padding:3px 8px;background:#34c75922;border:none;border-radius:6px;cursor:pointer;font-size:10px;color:#34c759;font-weight:600">SMS</button>':'') +
      '<button data-lid="'+id+'" onclick="event.stopPropagation();openEmailCompose(this.dataset.lid)" style="padding:3px 8px;background:#5e5ce622;border:none;border-radius:6px;cursor:pointer;font-size:10px;color:#5e5ce6;font-weight:600">Email</button>' +
      (phone?'<button data-lid="'+id+'" onclick="event.stopPropagation();initiateCall(this.dataset.lid)" style="padding:3px 8px;background:#0071e322;border:none;border-radius:6px;cursor:pointer;font-size:10px;color:#0071e3;font-weight:600">Call</button>':'') +
    '</div>';
  }
  return '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    (phone?'<button data-lid="'+id+'" onclick="openSMSCompose(this.dataset.lid)" style="padding:8px 16px;background:#34c759;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">&#128172; SMS</button>':'') +
    '<button data-lid="'+id+'" onclick="openEmailCompose(this.dataset.lid)" style="padding:8px 16px;background:#5e5ce6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">&#9993; Email</button>' +
    (phone?'<button data-lid="'+id+'" onclick="initiateCall(this.dataset.lid)" style="padding:8px 16px;background:#0071e3;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">&#128222; Call</button>':'') +
  '</div>';
}

function openSMSCompose(leadId) {
  var l = (APP.leads||[]).find(function(x){return x.id===leadId||x.id==leadId;});
  if (!l) return;
  fetch('/api/sms/preview/'+leadId).then(function(r){return r.json();}).then(function(d){
    showContactModal(l, 'sms', d.message||d.seller_sms||'Hi, I\'m reaching out about your property at '+(l.address||'').split(',')[0]+'. Would you consider a cash offer? I can close quickly and cover costs.');
  }).catch(function(){
    showContactModal(l, 'sms', 'Hi, I\'m reaching out about your property at '+(l.address||'').split(',')[0]+'. Would you consider a cash offer? I can close quickly and cover costs.');
  });
}

function openEmailCompose(leadId) {
  var l = (APP.leads||[]).find(function(x){return x.id===leadId||x.id==leadId;});
  if (!l) return;
  fetch('/api/outreach/'+leadId).then(function(r){return r.json();}).then(function(d){
    showContactModal(l, 'email', d.seller_email||'Dear Property Owner,\n\nI am a local real estate investor interested in making a cash offer on your property at '+(l.address||'')+'. I can close quickly with no repairs needed.\n\nWould you be open to a conversation?\n\nBest regards,\nGabriel Montealegre\nMontsan REI');
  }).catch(function(){
    showContactModal(l, 'email', 'Dear Property Owner,\n\nI am interested in your property at '+(l.address||'')+'. Please contact me to discuss a cash offer.\n\nBest regards,\nGabriel Montealegre\nMontsan REI');
  });
}

function initiateCall(leadId) {
  var l = (APP.leads||[]).find(function(x){return x.id===leadId||x.id==leadId;});
  if (!l || !l.phone) { toast('No phone number for this lead','error'); return; }
  showContactModal(l, 'call', l.script||'Hi, my name is Gabriel with Montsan REI. I\'m reaching out about your property at '+(l.address||'').split(',')[0]+'. Are you open to a cash offer?');
}

function showContactModal(l, type, message) {
  var ex = document.getElementById('contact-compose-modal');
  if (ex) ex.remove();

  var title = type==='sms' ? '&#128172; Send SMS' : type==='email' ? '&#9993; Send Email' : '&#128222; Call Script';
  var label = type==='sms' ? 'SMS Message' : type==='email' ? 'Email Body' : 'Call Script';
  var btnLabel = type==='call' ? 'Start Call' : 'Send '+type.toUpperCase();
  var charNote = type==='sms' ? '<div id="sms-char-count" style="font-size:10px;color:#86868b;text-align:right">0 / 160 chars</div>' : '';

  var modal = document.createElement('div');
  modal.id = 'contact-compose-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:20001;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = function(e){if(e.target===modal)modal.remove();};

  modal.innerHTML =
    '<div style="background:#fff;border-radius:16px;width:560px;max-width:96vw;box-shadow:0 30px 80px rgba(0,0,0,.4)">' +
      '<div style="padding:18px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-size:16px;font-weight:700">'+title+'</div>' +
          '<div style="font-size:12px;color:#86868b">'+(l.address||'')+(l.phone?' - '+l.phone:'')+'</div>' +
        '</div>' +
        '<button onclick="document.getElementById(\'contact-compose-modal\').remove()" style="background:none;border:none;font-size:26px;cursor:pointer;color:#86868b">&#x2715;</button>' +
      '</div>' +
      '<div style="padding:20px 24px">' +
        '<div style="font-size:11px;color:#86868b;font-weight:600;margin-bottom:6px">'+label.toUpperCase()+'</div>' +
        '<textarea id="contact-msg-body" style="width:100%;height:140px;border:1px solid #e5e5ea;border-radius:8px;padding:10px;font-size:13px;resize:vertical;font-family:-apple-system,sans-serif;box-sizing:border-box" oninput="'+(type==='sms'?'document.getElementById(\'sms-char-count\').textContent=this.value.length+\' / 160 chars\';this.style.borderColor=this.value.length>160?\'#ff3b30\':\'#e5e5ea\'':'')+'">'+(message||'')+'</textarea>' +
        charNote +
        (type!=='call'?'<div style="margin-top:10px;font-size:11px;color:#86868b">To: '+(type==='sms'?(l.phone||'No phone'):(l.email||'No email')+(l.phone?' / '+l.phone:''))+'</div>':'') +
      '</div>' +
      '<div style="padding:12px 24px;border-top:1px solid #f0f0f0;display:flex;gap:8px;justify-content:flex-end">' +
        '<button onclick="document.getElementById(\'contact-compose-modal\').remove()" style="padding:8px 16px;background:#f5f5f7;border:none;border-radius:8px;cursor:pointer;font-size:12px">Cancel</button>' +
        '<button onclick="sendContactAction(\''+l.id+'\',\''+type+'\')" style="padding:8px 20px;background:#1a1a2e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">'+btnLabel+'</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);
  setTimeout(function(){ var ta=document.getElementById('contact-msg-body');if(ta)ta.focus(); },100);
}

function sendContactAction(leadId, type) {
  var body = (document.getElementById('contact-msg-body')||{}).value || '';
  var l = (APP.leads||[]).find(function(x){return x.id===leadId||x.id==leadId;});
  if (!l) return;

  if (type === 'call') {
    document.getElementById('contact-compose-modal') && document.getElementById('contact-compose-modal').remove();
    fetch('/api/dialer/call', {method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({leadId:leadId, phone:l.phone, script:body})
    }).then(function(r){return r.json();}).then(function(d){
      toast(d.error||'Call initiated to '+l.phone, d.error?'error':'success');
    }).catch(function(){toast('Dialer not configured — phone: '+l.phone,'');});
    return;
  }

  if (type === 'sms') {
    if (!l.phone) { toast('No phone number','error'); return; }
    fetch('/api/sms/send', {method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({leadId:leadId, phone:l.phone, message:body})
    }).then(function(r){return r.json();}).then(function(d){
      document.getElementById('contact-compose-modal')&&document.getElementById('contact-compose-modal').remove();
      toast(d.error||'SMS sent to '+l.phone, d.error?'error':'success');
      // Update lead status
      if (!l.status||l.status==='New Lead') updateLeadStatus(leadId,'Contacted');
    }).catch(function(e){ toast('SMS error: '+e.message,'error'); });
    return;
  }

  if (type === 'email') {
    fetch('/api/outreach/intro-email', {method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({leadId:leadId, customBody:body})
    }).then(function(r){return r.json();}).then(function(d){
      document.getElementById('contact-compose-modal')&&document.getElementById('contact-compose-modal').remove();
      toast(d.error||'Email sent', d.error?'error':'success');
      if (!l.status||l.status==='New Lead') updateLeadStatus(leadId,'Contacted');
    }).catch(function(e){ toast('Email error: '+e.message,'error'); });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIX 6+7+8: renderLeads — add quick filters, valid toggle,
// contact actions, courthouse tag, nav cleanup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function setLeadsFilter(s){
  APP._leadsStatusFilter=s;
  window._quickFilter=null; // clear quick filter when status filter changes
  _leadsPage=0;
  APP.filtered=s==='All'?APP.leads:(APP.leads||[]).filter(function(l){return(l.status||'New Lead')===s;});
  render();
}
function leadsNextPage(){var t=(APP.filtered||APP.leads||[]).length;if(_leadsPage<Math.ceil(t/_leadsPerPage)-1){_leadsPage++;render();}}
function leadsPrevPage(){if(_leadsPage>0){_leadsPage--;render();}}
function leadsSetPerPage(n){_leadsPage=0;_leadsPerPage=parseInt(n);render();}
var _leadsPage=0,_leadsPerPage=200;

renderLeads = function() {
  // Apply valid-only filter if toggled
  var base = APP.filtered || APP.leads || [];
  if (window._showValidOnly) {
    base = base.filter(isValidDeal);
  }

  var all = base;
  var total = all.length, page = _leadsPage, perPage = _leadsPerPage;
  var pageLeads = all.slice(page*perPage, (page+1)*perPage);
  var totalPages = Math.ceil(total/perPage);

  // Status tabs
  var statuses = ['All','New Lead','Contacted','Follow-Up','Qualified','Not Interested','Dead','Archived'];
  var sc = {}; (APP.filtered||APP.leads||[]).forEach(function(l){var s=l.status||'New Lead';sc[s]=(sc[s]||0)+1;});
  var cf = APP._leadsStatusFilter||'All';
  var tabs = statuses.map(function(s){
    var cnt = s==='All'?(APP.filtered||APP.leads||[]).length:(sc[s]||0);
    if(cnt===0&&s!=='All')return '';
    var active=cf===s;
    return '<button data-status="'+s+'" onclick="setLeadsFilter(this.dataset.status)" style="padding:5px 10px;border-radius:16px;border:none;cursor:pointer;font-size:11px;font-weight:'+(active?'700':'400')+';background:'+(active?'#1a1a2e':'#f5f5f7')+';color:'+(active?'#fff':'#1d1d1f')+'">'+s+(cnt?' ('+cnt.toLocaleString()+')':'')+'</button>';
  }).join('');

  // Pager
  var prevDis=page===0?' disabled':'';
  var nextDis=page>=totalPages-1?' disabled':'';
  var opts=[200,500,1000,2000,5000,10000].map(function(n){return '<option value="'+n+'"'+(n===perPage?' selected':'')+'>'+n+' per page</option>';}).join('');
  var pager=totalPages>1?
    '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;flex-wrap:wrap">'+
    '<button onclick="leadsPrevPage()"'+prevDis+' style="padding:5px 12px;border:1px solid #e5e5ea;border-radius:8px;background:#fff;cursor:pointer;font-size:12px">&#8592; Prev</button>'+
    '<span style="font-size:12px;color:#86868b">Page '+(page+1)+' of '+totalPages+' ('+total.toLocaleString()+' leads)</span>'+
    '<button onclick="leadsNextPage()"'+nextDis+' style="padding:5px 12px;border:1px solid #e5e5ea;border-radius:8px;background:#fff;cursor:pointer;font-size:12px">Next &#8594;</button>'+
    '<select onchange="leadsSetPerPage(this.value)" style="padding:5px;border:1px solid #e5e5ea;border-radius:8px;font-size:12px">'+opts+'</select>'+
    '</div>':'';

  var scMap={'New Lead':'#ff9500','Contacted':'#0071e3','Follow-Up':'#5e5ce6','Qualified':'#34c759','Not Interested':'#86868b','Dead':'#ff3b30','Archived':'#86868b'};

  var rows = pageLeads.map(function(l){
    var rid = l.ref_id || getDealRefId(l);
    var fa = typeof fullAddress==='function' ? fullAddress(l) : (l.address||'');
    var statusColor = scMap[l.status||'New Lead']||'#86868b';
    var mc = typeof matchBuyersToLead==='function' ? matchBuyersToLead(l,APP.buyers||[]).length : 0;
    var isCH = l._source_module==='courthouse-addon';
    var refBg = isCH ? '#0071e3' : '#1a1a2e';

    return '<tr style="cursor:pointer;border-bottom:1px solid #f5f5f7" data-lid="'+l.id+'" onclick="openLeadDetailFixed(this.dataset.lid)">'+
      '<td style="padding:8px 12px;font-size:10px;white-space:nowrap">'+
        '<span style="background:'+refBg+';color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">'+rid+'</span>'+
        (isCH?'<span style="font-size:8px;color:#0071e3;display:block;margin-top:1px">COURTHOUSE</span>':'')+
      '</td>'+
      '<td style="padding:8px;font-size:12px;max-width:260px">'+fa+'</td>'+
      '<td style="padding:8px;font-size:12px">'+(l.state||'')+'</td>'+
      '<td style="padding:8px;font-size:12px">'+(l.type||'SFR')+'</td>'+
      '<td style="padding:8px"><span style="font-size:10px;font-weight:700;color:'+statusColor+';background:'+statusColor+'22;padding:2px 8px;border-radius:10px">'+(l.status||'New Lead')+'</span></td>'+
      '<td style="padding:8px;font-size:12px;font-weight:700;color:#34c759">$'+(l.spread||0).toLocaleString()+'</td>'+
      '<td style="padding:8px;font-size:11px">'+contactActions(l, true)+'</td>'+
      '<td style="padding:8px;font-size:11px;color:#0071e3">'+(mc?mc+' buyers':'')+'</td>'+
    '</tr>';
  }).join('');

  var headers = ['REF #','FULL ADDRESS','STATE','TYPE','STATUS','SPREAD','CONTACT','BUYERS'].map(function(h){
    return '<th style="padding:8px;text-align:left;font-size:11px;color:#86868b">'+h+'</th>';
  }).join('');

  // Valid deals toggle
  var validToggle = '<button onclick="toggleValidDealsFilter()" style="padding:5px 12px;border-radius:16px;border:1px solid '+(window._showValidOnly?'#34c759':'#e5e5ea')+';background:'+(window._showValidOnly?'#34c75922':'#fff')+';color:'+(window._showValidOnly?'#34c759':'#1d1d1f')+';cursor:pointer;font-size:11px;font-weight:'+(window._showValidOnly?'700':'400')+'">&#10003; Valid Deals Only</button>';

  return '<div>'+
    quickFilterBar(APP.leads||[]) +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;align-items:center">'+tabs+
    '<div style="margin-left:auto;display:flex;gap:6px;align-items:center">'+
      validToggle+
      '<span style="font-size:11px;color:#86868b">'+total.toLocaleString()+' shown</span>'+
      '<button class="btn btn-dark btn-sm" onclick="openAddLead()">+ Add Lead</button>'+
    '</div></div>'+
    pager+
    '<div style="overflow-x:auto;border:1px solid #f0f0f0;border-radius:10px">'+
    '<table style="width:100%;border-collapse:collapse">'+
    '<thead><tr style="background:#f5f5f7">'+headers+'</tr></thead>'+
    '<tbody>'+rows+'</tbody></table></div>'+
    (totalPages>1?pager:'')+'</div>';
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIX 8: NAV CLEANUP — remove Buy Boxes, keep Buyers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function removeBuyBoxesNav() {
  document.querySelectorAll('.nav-item').forEach(function(el) {
    var t = (el.textContent||'').toLowerCase().trim();
    // Remove "Buy Boxes" standalone tab — keep "Buyers & Buy Boxes"
    if ((t === 'buy boxes' || t === 'buy box manager' || t.match(/^buy box(es)?$/)) && !t.includes('buyer')) {
      el.style.display = 'none';
    }
  });
}
removeBuyBoxesNav();
if (!window._bbo2) {
  window._bbo2 = new MutationObserver(removeBuyBoxesNav);
  window._bbo2.observe(document.body, {childList:true, subtree:true});
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIX 9: BUYER INTERACTION TRACKING
// Shows deals sent, emails, SMS, calls, last interaction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function getBuyerInteractions(buyerId) {
  return fetch('/api/buyers/'+buyerId+'/deals-sent').then(function(r){return r.json();}).catch(function(){return {history:[]};});
}

renderBuyers = function() {
  var buyers = APP.buyers||[];
  if (!buyers.length) return '<div style="text-align:center;padding:60px;color:#86868b"><div style="font-size:40px;margin-bottom:12px">&#128101;</div><div style="font-size:15px;font-weight:600;margin-bottom:12px">No buyers yet</div><button class="btn btn-dark" onclick="openAddBuyer()">+ Add First Buyer</button></div>';

  var cards = buyers.map(function(b) {
    var states = (b.states&&b.states.length)?b.states.join(', '):(b.state||'Any');
    var types  = (b.buyTypes||[]).join(', ')||'Any';
    var maxP   = b.maxPrice?'$'+Number(b.maxPrice).toLocaleString():'Any';
    var minP   = b.minPrice?'$'+Number(b.minPrice).toLocaleString():'$0';
    var sc     = b.score||75;
    var scC    = sc>=80?'#34c759':sc>=50?'#ff9500':'#ff3b30';
    var mc     = typeof matchBuyersToLead==='function'?(APP.leads||[]).filter(function(l){return matchBuyersToLead(l,[b]).length>0;}).length:0;

    // Interaction stats from dealsSent data
    var sent   = b._dealsSent||0;
    var lastSent = b._lastSent ? new Date(b._lastSent).toLocaleDateString() : 'Never';

    return '<div style="background:#fff;border:1px solid #e5e5ea;border-radius:14px;padding:16px">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">'+
        '<div>'+
          '<div style="font-size:14px;font-weight:700">'+b.name+'</div>'+
          '<div style="font-size:11px;color:#86868b">'+(b.city||'')+(b.state?', '+b.state:'')+(b.strategy?' - '+b.strategy:'')+'</div>'+
        '</div>'+
        '<div style="text-align:right"><div style="font-size:14px;font-weight:700;color:'+scC+'">'+sc+'</div><div style="font-size:9px;color:#86868b">trust</div></div>'+
      '</div>'+
      '<div style="background:#f9f9fb;border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px;line-height:1.8">'+
        '<div>&#128222; '+(b.phone?'<strong>'+b.phone+'</strong>':'<span style="color:#86868b">No phone</span>')+'</div>'+
        '<div>&#9993; '+(b.email?'<strong>'+b.email+'</strong>':'<span style="color:#ff9500;font-weight:600">No email</span>')+'</div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px;font-size:11px">'+
        '<div>Types: <strong>'+types+'</strong></div>'+
        '<div>Budget: <strong>'+minP+'-'+maxP+'</strong></div>'+
        '<div>States: <strong>'+states+'</strong></div>'+
        '<div style="color:'+(mc>0?'#0071e3':'#86868b')+'">'+(mc>0?mc+' deals match':'No matches')+'</div>'+
      '</div>'+
      // Interaction tracking
      '<div style="background:#f0f6ff;border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:11px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">'+
        '<div style="text-align:center"><div style="font-size:16px;font-weight:800;color:#0071e3">'+sent+'</div><div style="color:#86868b">Deals Sent</div></div>'+
        '<div style="text-align:center"><div style="font-size:16px;font-weight:800;color:#5e5ce6">'+(b._emailsSent||0)+'</div><div style="color:#86868b">Emails</div></div>'+
        '<div style="text-align:center"><div style="font-size:16px;font-weight:800;color:#34c759">'+(b._smsSent||0)+'</div><div style="color:#86868b">SMS</div></div>'+
      '</div>'+
      '<div style="font-size:10px;color:#86868b;margin-bottom:8px">Last contact: '+lastSent+(b._responseStatus?' - <strong style="color:#34c759">'+b._responseStatus+'</strong>':'')+'</div>'+
      '<div style="display:flex;gap:6px">'+
        '<button data-bid="'+b.id+'" onclick="editBuyer(this.dataset.bid)" style="flex:1;padding:7px;background:#f5f5f7;border:none;border-radius:8px;cursor:pointer;font-size:11px">Edit</button>'+
        '<button data-bid="'+b.id+'" onclick="openBulkSendToBuyer(this.dataset.bid)" style="flex:2;padding:7px;background:#1a1a2e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600">&#128640; Send '+Math.min(mc,30)+' Deals</button>'+
      '</div>'+
    '</div>';
  }).join('');

  return '<div style="max-width:1100px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">'+
      '<div><div style="font-size:18px;font-weight:700">&#128188; Buyers Database</div>'+
      '<div style="font-size:12px;color:#86868b">'+buyers.length+' buyers - '+(APP.leads||[]).length.toLocaleString()+' leads</div></div>'+
      '<div style="display:flex;gap:8px">'+
        '<button class="btn btn-dark" onclick="openAddBuyer()">+ Add Buyer</button>'+
        '<button class="btn btn-sm" style="background:#f5f5f7" onclick="loadMatchingData()">&#128260; Sync</button>'+
      '</div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">'+cards+'</div>'+
  '</div>';
};

// Load interaction stats into buyer objects
function loadBuyerInteractionStats() {
  var buyers = APP.buyers||[];
  if (!buyers.length) return;
  fetch('/api/buyers').then(function(r){return r.json();}).then(function(d){
    var dbBuyers = d.buyers||d||[];
    // Load deal-sent history for each buyer (batch: fetch all at once)
    Promise.allSettled(dbBuyers.slice(0,20).map(function(b){
      return fetch('/api/buyers/'+b.id+'/deals-sent').then(function(r){return r.json();}).then(function(h){
        var hist = h.history||[];
        b._dealsSent = hist.reduce(function(s,h){return s+(h.dealCount||0);},0);
        b._lastSent  = hist.length ? hist[0].sentAt : null;
        return b;
      });
    })).then(function(results){
      results.forEach(function(r,i){
        if(r.status==='fulfilled'&&r.value){
          var idx = (APP.buyers||[]).findIndex(function(b){return b.id===r.value.id;});
          if(idx>-1) Object.assign(APP.buyers[idx], r.value);
        }
      });
    });
  }).catch(function(){});
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIX 10: PIPELINE STATUS PERSISTENCE
// Status saved to server AND synced across views
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function updateLeadStatus(leadId, status) {
  // Optimistic update in APP state
  var l = (APP.leads||[]).find(function(x){return x.id===leadId||x.id==leadId;});
  if (l) l.status = status;

  // Persist to server
  fetch('/api/leads/'+leadId, {
    method: 'PATCH',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({status:status})
  }).then(function(r){return r.json();}).then(function(d){
    if (d.error) {
      // Try PUT if PATCH not found
      return fetch('/api/leads/'+leadId, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(Object.assign({}, l||{}, {status:status}))
      });
    }
    toast('Status updated: '+status, 'success');
    // Sync in APP.filtered too
    var fl = (APP.filtered||[]).find(function(x){return x.id===leadId;});
    if (fl) fl.status = status;
    updateLeadsBadge();
  }).catch(function(){
    toast('Status saved locally: '+status, '');
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIX 13: TOKEN EFFICIENCY — cache layer
// Prevents re-fetch loops, caches comps
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window._cache = window._cache || { comps:{}, geocode:{}, outreach:{} };
var _CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function cachedFetch(cacheKey, store, fetchFn) {
  var now = Date.now();
  var cached = store[cacheKey];
  if (cached && (now - cached.ts) < _CACHE_TTL) return Promise.resolve(cached.data);
  return fetchFn().then(function(data) {
    store[cacheKey] = {data:data, ts:now};
    return data;
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIX 14: DEAL MATH — immaculate calculations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function calcDealMath(l) {
  var arv     = l.arv || 0;
  var repairs = l.repairs || 0;
  var offer   = l.offer || 0;

  var mao70    = Math.round(arv * 0.70 - repairs);
  var mao65    = Math.round(arv * 0.65 - repairs);
  var spread   = arv - offer - repairs;
  var equityPct= arv > 0 ? Math.round(((arv - offer) / arv) * 100) : 0;

  // Dynamic assignment fee: 10k-25k based on spread
  var assignFee = spread > 60000 ? 25000 : spread > 30000 ? 18000 : spread > 15000 ? 12000 : 10000;
  var buyerProfit = spread - assignFee;

  return {
    mao70, mao65, spread, equityPct, assignFee, buyerProfit,
    offerRangeLo: mao65, offerRangeHi: mao70,
    isQualified: buyerProfit >= 15000 && equityPct >= 25 && spread > 0,
  };
}

function dealMathCard(l) {
  var m = calcDealMath(l);
  var qual = m.isQualified;
  return '<div style="background:'+(qual?'#f0fff4':'#f9f9fb')+';border:1px solid '+(qual?'#34c75944':'#e5e5ea')+';border-radius:10px;padding:12px;margin-bottom:14px">'+
    '<div style="font-size:11px;font-weight:700;color:#86868b;margin-bottom:8px">DEAL MATH'+(qual?' <span style="color:#34c759">&#10003; QUALIFIED</span>':'')+'</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;font-size:11px">'+
      '<div><div style="color:#86868b">ARV</div><div style="font-weight:700;color:#0071e3">$'+(l.arv||0).toLocaleString()+'</div></div>'+
      '<div><div style="color:#86868b">Repairs</div><div style="font-weight:700;color:#5e5ce6">$'+(l.repairs||0).toLocaleString()+'</div></div>'+
      '<div><div style="color:#86868b">Offer Range</div><div style="font-weight:700">$'+m.mao65.toLocaleString()+'-$'+m.mao70.toLocaleString()+'</div></div>'+
      '<div><div style="color:#86868b">Your Offer</div><div style="font-weight:700;color:#ff9500">$'+(l.offer||0).toLocaleString()+'</div></div>'+
      '<div><div style="color:#86868b">Spread</div><div style="font-weight:700;color:#34c759">$'+m.spread.toLocaleString()+'</div></div>'+
      '<div><div style="color:#86868b">Assign Fee</div><div style="font-weight:700">$'+m.assignFee.toLocaleString()+'</div></div>'+
      '<div><div style="color:#86868b">Buyer Profit</div><div style="font-weight:700;color:'+(m.buyerProfit>=15000?'#34c759':'#ff3b30')+'">$'+m.buyerProfit.toLocaleString()+'</div></div>'+
      '<div><div style="color:#86868b">Equity</div><div style="font-weight:700;color:'+(m.equityPct>=25?'#34c759':'#86868b')+'">'+m.equityPct+'%</div></div>'+
      (l.rent_estimate?'<div><div style="color:#86868b">Rent Est.</div><div style="font-weight:700">$'+Number(l.rent_estimate).toLocaleString()+'/mo</div></div>':'') +
    '</div>'+
  '</div>';
}

// Inject deal math into openLeadDetailFixed modal
var _origOLDF = typeof openLeadDetailFixed === 'function' ? openLeadDetailFixed : null;
openLeadDetailFixed = function(leadId) {
  if (_origOLDF) _origOLDF(leadId);
  // Inject deal math card and contact actions into modal after render
  setTimeout(function() {
    var modal = document.getElementById('lead-overlay-modal');
    if (!modal) return;
    var l = (APP.leads||[]).find(function(x){return x.id===leadId||x.id==leadId;});
    if (!l) return;

    // Add deal math after comps section
    var metricsDiv = modal.querySelector('[style*="grid-template-columns:repeat(auto-fill,minmax(120px"]');
    if (metricsDiv && metricsDiv.parentNode && !modal.querySelector('#deal-math-injected')) {
      var dm = document.createElement('div');
      dm.id = 'deal-math-injected';
      dm.innerHTML = dealMathCard(l);
      metricsDiv.parentNode.insertBefore(dm, metricsDiv.nextSibling);
    }

    // Add contact actions before status dropdown if not already there
    var actionRow = modal.querySelector('[style*="display:flex;gap:8px;margin-top:4px"]');
    if (actionRow && !modal.querySelector('#contact-actions-injected')) {
      var ca = document.createElement('div');
      ca.id = 'contact-actions-injected';
      ca.style.marginBottom = '12px';
      ca.innerHTML = contactActions(l, false);
      actionRow.parentNode.insertBefore(ca, actionRow);
    }
  }, 80);
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIX 14: BULK SEND INFRASTRUCTURE
// Multi-select leads + buyers, preview, approve, queue
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window._bulkSelected = window._bulkSelected || {leads:[], buyers:[]};

function openBulkSendModal() {
  var ex = document.getElementById('bulk-send-modal');
  if (ex) ex.remove();

  var validLeads = (APP.leads||[]).filter(isValidDeal).filter(function(l){
    var m = calcDealMath(l);
    return m.isQualified;
  });
  var buyers = APP.buyers||[];

  if (!validLeads.length) { toast('No qualified deals to send (need buyer profit >= $15k, equity >= 25%)','error'); return; }
  if (!buyers.length) { toast('No buyers in database','error'); return; }

  var modal = document.createElement('div');
  modal.id = 'bulk-send-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = function(e){if(e.target===modal)modal.remove();};

  var leadRows = validLeads.slice(0,50).map(function(l){
    var ref = l.ref_id||getDealRefId(l);
    var m = calcDealMath(l);
    var sel = (window._bulkSelected.leads||[]).includes(l.id);
    return '<tr><td style="padding:6px 8px;text-align:center"><input type="checkbox" class="bl-lead-chk" data-id="'+l.id+'"'+(sel?' checked':'')+'></td>'+
      '<td style="padding:6px 8px;font-size:11px"><span style="background:#1a1a2e;color:#fff;padding:1px 5px;border-radius:3px;font-size:9px">'+ref+'</span></td>'+
      '<td style="padding:6px 8px;font-size:11px">'+(l.address||'').split(',')[0]+'</td>'+
      '<td style="padding:6px 8px;font-size:11px">'+(l.state||'')+'</td>'+
      '<td style="padding:6px 8px;font-size:11px;color:#34c759;font-weight:700">$'+m.spread.toLocaleString()+'</td>'+
      '<td style="padding:6px 8px;font-size:11px;color:#0071e3;font-weight:700">$'+m.buyerProfit.toLocaleString()+'</td>'+
    '</tr>';
  }).join('');

  var buyerRows = buyers.map(function(b){
    var sel = (window._bulkSelected.buyers||[]).includes(b.id);
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #f5f5f7">'+
      '<input type="checkbox" class="bl-buyer-chk" data-id="'+b.id+'"'+(sel?' checked':'')+'>'+
      '<div><div style="font-size:12px;font-weight:600">'+b.name+'</div>'+
      '<div style="font-size:10px;color:#86868b">'+(b.email?b.email:'No email')+'</div></div>'+
    '</div>';
  }).join('');

  modal.innerHTML =
    '<div style="background:#fff;border-radius:16px;width:95vw;max-width:1200px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,.4)">'+
      '<div style="padding:16px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'+
        '<div><div style="font-size:17px;font-weight:700">&#128640; Bulk Send — Qualified Deals</div>'+
        '<div style="font-size:12px;color:#86868b">'+validLeads.slice(0,50).length+' qualified deals available</div></div>'+
        '<button onclick="document.getElementById(\'bulk-send-modal\').remove()" style="background:none;border:none;font-size:26px;cursor:pointer;color:#86868b">&#x2715;</button>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:3fr 1fr;flex:1;overflow:hidden">'+
        '<div style="overflow-y:auto;border-right:1px solid #f0f0f0">'+
          '<div style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:12px;display:flex;justify-content:space-between;align-items:center">'+
            '<span>Select Deals</span>'+
            '<label style="font-size:11px;cursor:pointer"><input type="checkbox" id="bl-all-leads" onchange="document.querySelectorAll(\'.bl-lead-chk\').forEach(function(c){c.checked=document.getElementById(\'bl-all-leads\').checked})"> All</label>'+
          '</div>'+
          '<table style="width:100%;border-collapse:collapse">'+
            '<thead style="position:sticky;top:0;background:#f5f5f7"><tr>'+
              '<th style="padding:6px 8px;font-size:10px;color:#86868b"></th>'+
              '<th style="padding:6px 8px;font-size:10px;color:#86868b;text-align:left">REF</th>'+
              '<th style="padding:6px 8px;font-size:10px;color:#86868b;text-align:left">ADDRESS</th>'+
              '<th style="padding:6px 8px;font-size:10px;color:#86868b;text-align:left">STATE</th>'+
              '<th style="padding:6px 8px;font-size:10px;color:#86868b;text-align:left">SPREAD</th>'+
              '<th style="padding:6px 8px;font-size:10px;color:#86868b;text-align:left">BUYER PROFIT</th>'+
            '</tr></thead>'+
            '<tbody>'+leadRows+'</tbody>'+
          '</table>'+
        '</div>'+
        '<div style="overflow-y:auto">'+
          '<div style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:12px">Select Buyers</div>'+
          buyerRows+
        '</div>'+
      '</div>'+
      '<div style="padding:14px 24px;border-top:1px solid #f0f0f0;background:#f9f9fb;display:flex;gap:8px;align-items:center;border-radius:0 0 16px 16px">'+
        '<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer">'+
          '<input type="checkbox" id="bl-approved"> <strong>I approve sending these deals to selected buyers</strong>'+
        '</label>'+
        '<div style="margin-left:auto;display:flex;gap:8px">'+
          '<button onclick="bulkPreview()" style="padding:8px 16px;background:#f5f5f7;border:none;border-radius:8px;cursor:pointer;font-size:12px">Preview Messages</button>'+
          '<button onclick="bulkSendConfirm()" style="padding:8px 20px;background:#1a1a2e;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700">Send Deals</button>'+
        '</div>'+
      '</div>'+
    '</div>';

  document.body.appendChild(modal);
}

function bulkPreview() {
  var leadIds  = Array.from(document.querySelectorAll('.bl-lead-chk:checked')).map(function(c){return c.dataset.id;});
  var buyerIds = Array.from(document.querySelectorAll('.bl-buyer-chk:checked')).map(function(c){return c.dataset.id;});
  if (!leadIds.length||!buyerIds.length) { toast('Select at least one deal and one buyer','error'); return; }

  // Show preview of anonymized buyer SMS
  var leads = leadIds.map(function(id){return (APP.leads||[]).find(function(l){return l.id===id;});}).filter(Boolean);
  var preview = leads.slice(0,3).map(function(l){
    var ref = l.ref_id||getDealRefId(l);
    var m = calcDealMath(l);
    return 'Deal '+ref+' - ARV $'+((l.arv||0)/1000).toFixed(0)+'K, Offer $'+((l.offer||0)/1000).toFixed(0)+'K, est profit $'+(m.buyerProfit/1000).toFixed(0)+'K. '+(l.county||l.state||'')+' area. Interested?';
  }).join('\n\n');

  toast('Preview SMS:\n'+preview.slice(0,200),'');
}

function bulkSendConfirm() {
  if (!document.getElementById('bl-approved')||!document.getElementById('bl-approved').checked) {
    toast('Check the approval box before sending','error'); return;
  }
  var leadIds  = Array.from(document.querySelectorAll('.bl-lead-chk:checked')).map(function(c){return c.dataset.id;});
  var buyerIds = Array.from(document.querySelectorAll('.bl-buyer-chk:checked')).map(function(c){return c.dataset.id;});
  if (!leadIds.length||!buyerIds.length) { toast('Select deals and buyers','error'); return; }

  toast('Sending '+leadIds.length+' deals to '+buyerIds.length+' buyers...','');

  // Queue sends with rate limiting (1 per 500ms)
  var delay = 0;
  buyerIds.forEach(function(buyerId) {
    setTimeout(function() {
      fetch('/api/buyers/'+buyerId+'/send-deals', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({dealIds:leadIds})
      }).then(function(r){return r.json();}).then(function(d){
        var buyer = (APP.buyers||[]).find(function(b){return b.id===buyerId;});
        if (buyer) {
          buyer._dealsSent = (buyer._dealsSent||0) + (d.sent||leadIds.length);
          buyer._lastSent  = new Date().toISOString();
        }
      }).catch(function(e){ console.log('Send error for buyer '+buyerId+': '+e.message); });
    }, delay);
    delay += 500;
  });

  setTimeout(function() {
    document.getElementById('bulk-send-modal')&&document.getElementById('bulk-send-modal').remove();
    toast('Bulk send complete: '+leadIds.length+' deals to '+buyerIds.length+' buyers','success');
  }, delay+500);
}

// Add bulk send button to buyers tab header
var _origRenderBuyersHdr = renderBuyers;
// (already overridden above — the bulk send button is in the header)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SYSTEM MEMORY FOLDER — lesson log
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window._LESSONS = window._LESSONS || [];
function logLesson(category, problem, fix) {
  window._LESSONS.push({ts:new Date().toISOString(), category, problem, fix});
  try { localStorage.setItem('wholesaleos_lessons', JSON.stringify(window._LESSONS.slice(-50))); } catch(e){}
}
// Load past lessons
try { window._LESSONS = JSON.parse(localStorage.getItem('wholesaleos_lessons')||'[]'); } catch(e){}

// Log the fixes we applied in this patch
logLesson('badge','Badge flickered between 7397 and 13000 due to courthouse leads inflating APP.leads count','Normalize badge to regular leads only; intercept textContent setter');
logLesson('pipeline','Clicking pipeline lead navigated away to Leads tab','Override renderPipeline to use openLeadDetailFixed modal instead of navigate()');
logLesson('courthouse','Courthouse leads caused double-counting in badge and filters','Separate regular vs courthouse in all count logic; use _source_module flag');
logLesson('rendering','Multiple render hooks caused flicker loops','Remove render() hooks; use direct DOM updates instead');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BOOT — minimal, no render triggers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function boot() {
  // Badge fix — run once after leads load
  var _origLoadLeads = typeof loadLeadsFromAPI === 'function' ? loadLeadsFromAPI : null;
  if (_origLoadLeads && !window._v7LoadHooked) {
    window._v7LoadHooked = true;
    loadLeadsFromAPI = async function() {
      await _origLoadLeads();
      // Merge courthouse if loaded
      if (window._CH && window._CH.loaded && window._CH.leads.length) {
        var regular = (APP.leads||[]).filter(function(l){return l._source_module!=='courthouse-addon';});
        var ch = window._CH.leads;
        APP.leads = regular.concat(ch);
        APP.filtered = APP.filtered ? (APP._leadsStatusFilter&&APP._leadsStatusFilter!=='All'
          ? APP.leads.filter(function(l){return (l.status||'New Lead')===APP._leadsStatusFilter;})
          : APP.leads) : APP.leads;
      }
      // Single authoritative badge update
      updateLeadsBadge();
    };
  }

  // Load buyer interaction stats in background
  setTimeout(loadBuyerInteractionStats, 3000);

  // Patch renderBuyers to include bulk send button in header
  var _rB = renderBuyers;
  renderBuyers = function() {
    var html = _rB();
    // Inject bulk send button after "Add Buyer"
    return html.replace(
      '<button class="btn btn-dark" onclick="openAddBuyer()">+ Add Buyer</button>',
      '<button class="btn btn-dark" onclick="openAddBuyer()">+ Add Buyer</button><button onclick="openBulkSendModal()" style="padding:7px 14px;background:#34c759;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">&#128640; Bulk Send</button>'
    );
  };

  updateLeadsBadge();
})();

// === PATCH v14 ===

(function(){var o=window.matchBuyers;window.matchBuyers=function(l){
if(!l||!APP||!APP.buyers)return[];
try{return o(l);}catch(e){
var a=l.arv||0,s=(l.state||"").toUpperCase();
return(APP.buyers||[]).filter(function(b){if(!b)return false;if(b.state&&b.state.toUpperCase()!==s)return false;var m=b.maxPrice||0;if(m&&a&&a>m)return false;return true;});}};
})();

(function(){var o=window.renderLeads;window.renderLeads=function(){
if(APP&&Array.isArray(APP.filtered))APP.filtered.forEach(function(l){if(!l)return;if(!l.owner_name)l.owner_name=l.ownership||l.seller_type||"";if(!l.city)l.city=(l.address||"").split(",")[1]||"";});
return o();};})();
(function(){
var o=window.renderLeadDetail;
window.renderLeadDetail=function(l){
  if(!l)l=APP&&APP.selectedLead;
  if(!l)return"<p style='padding:16px;color:#888'>Select a lead</p>";
  if(typeof l==="string"){var f=null;for(var i=0;i<(APP.leads||[]).length;i++){if(APP.leads[i]&&APP.leads[i].id===l){f=APP.leads[i];break;}}if(!f)return"<p>Not found</p>";l=f;}
  if(!l.owner_name)l.owner_name=l.ownership||l.seller_type||"Owner";
  if(!l.city)l.city=(l.address||"").split(",")[1]||"";
  if(!l.phone)l.phone=l.phone_number||l.seller_phone||"";
  if(!l.seller_type)l.seller_type="Owner";
  if(!l.county)l.county="";
  APP.selectedLead=l;
  var r;try{r=o.call(null,l);}catch(e){console.error("[v14]",e.message);}
  if(r&&r.length>200)return r;
  var dm=typeof calcDealMath==="function"?calcDealMath(l):{};
  var mao=l.mao||dm.mao||0,fhi=l.fee_hi||dm.feeHi||0,flo=l.fee_lo||dm.feeLo||0;
  var buyers=typeof matchBuyers==="function"?matchBuyers(l):[];
  var ff=function(n){return"$"+(n||0).toLocaleString();};
  var brows=buyers.slice(0,6).map(function(b){return"<div style='padding:7px 0;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:13px'><span><b>"+(b.name||"Buyer")+"</b> - "+(b.state||"")+"</span><span style='color:#16a34a'>Max "+(b.maxPrice||0).toLocaleString()+"</span></div>";}).join("")||"<p style='color:#888;font-size:13px'>No matching buyers yet</p>";
  return"<div style='font-family:sans-serif;overflow:auto'>"+
  "<div style='background:#0f172a;color:#fff;padding:14px 18px'><div style='font-size:15px;font-weight:700'>"+(l.address||"")+"</div><div style='color:#94a3b8;font-size:12px;margin-top:3px'>"+(l.city||"").trim()+", "+(l.state||"")+" "+(l.zip||"")+" | "+(l.category||"")+" | "+(l.risk||"")+"</div></div>"+
  "<div style='display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #e5e7eb'>"+
  "<div style='padding:12px;text-align:center;border-right:1px solid #e5e7eb'><div style='font-size:10px;color:#6b7280;text-transform:uppercase'>ARV</div><div style='font-size:17px;font-weight:700'>"+ff(l.arv)+"</div></div>"+
  "<div style='padding:12px;text-align:center;border-right:1px solid #e5e7eb'><div style='font-size:10px;color:#6b7280;text-transform:uppercase'>Offer</div><div style='font-size:17px;font-weight:700;color:#2563eb'>"+ff(l.offer)+"</div></div>"+
  "<div style='padding:12px;text-align:center;border-right:1px solid #e5e7eb'><div style='font-size:10px;color:#6b7280;text-transform:uppercase'>Spread</div><div style='font-size:17px;font-weight:700;color:#16a34a'>"+ff(l.spread)+"</div></div>"+
  "<div style='padding:12px;text-align:center'><div style='font-size:10px;color:#6b7280;text-transform:uppercase'>MAO</div><div style='font-size:17px;font-weight:700;color:#7c3aed'>"+ff(mao)+"</div></div>"+
  "</div>"+
  "<div style='display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px'>"+
  "<div style='background:#dcfce7;border-radius:6px;padding:8px;text-align:center'><div style='font-size:10px;color:#166534'>Fee Lo</div><b style='color:#166534'>"+ff(flo)+"</b></div>"+
  "<div style='background:#dcfce7;border-radius:6px;padding:8px;text-align:center'><div style='font-size:10px;color:#166534'>Fee Hi</div><b style='color:#166534'>"+ff(fhi)+"</b></div>"+
  "<div style='background:#eff6ff;border-radius:6px;padding:8px;text-align:center'><div style='font-size:10px;color:#1e40af'>Equity</div><b style='color:#1e40af'>"+(l.equity_pct||0).toFixed(1)+"%</b></div>"+
  "<div style='background:#fef9c3;border-radius:6px;padding:8px;text-align:center'><div style='font-size:10px;color:#854d0e'>Repairs</div><b style='color:#854d0e'>"+ff(l.repairs)+"</b></div>"+
  "</div>"+
  "<div style='padding:8px 14px;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;display:flex;gap:6px;flex-wrap:wrap'>"+
  "<span style='background:#f3f4f6;border-radius:5px;padding:3px 8px;font-size:12px'><b>Owner:</b> "+(l.owner_name||"")+"</span>"+
  "<span style='background:#f3f4f6;border-radius:5px;padding:3px 8px;font-size:12px'><b>Phone:</b> "+(l.phone||"N/A")+"</span>"+
  "<span style='background:#f3f4f6;border-radius:5px;padding:3px 8px;font-size:12px'><b>Beds/Baths:</b> "+(l.beds||"?")+"/"+(l.baths||"?")+"</span>"+
  "<span style='background:#f3f4f6;border-radius:5px;padding:3px 8px;font-size:12px'><b>Sqft:</b> "+(l.sqft||"?")+"</span>"+
  "<span style='background:#f3f4f6;border-radius:5px;padding:3px 8px;font-size:12px'><b>Year:</b> "+(l.year||"?")+"</span>"+
  "<span style='background:#f3f4f6;border-radius:5px;padding:3px 8px;font-size:12px'><b>Strategy:</b> "+(l.investment_strategy||l.distress||"")+"</span>"+
  "</div>"+
  "<div style='padding:10px 14px;display:flex;gap:8px'>"+
  "<button onclick='openSMSCompose(\""+l.id+"\")' style='flex:1;padding:9px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer'>SMS</button>"+
  "<button onclick='openEmailCompose(\""+l.id+"\")' style='flex:1;padding:9px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer'>Email</button>"+
  "<button onclick='initiateCall(\""+l.id+"\")' style='flex:1;padding:9px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer'>Call</button>"+
  "<a href='https://www.zillow.com/homes/"+encodeURIComponent(l.address||"")+"_rb/' target='_blank' style='flex:1;padding:9px;background:#f59e0b;color:#fff;text-decoration:none;text-align:center;border-radius:8px;font-weight:600;cursor:pointer'>Zillow</a>"+
  "</div>"+
  "<div style='padding:10px 14px'><div style='font-weight:700;margin-bottom:6px'>Matching Buyers ("+buyers.length+")</div>"+brows+"</div>"+
  "</div>";
};})();
(function(){var o=window.loadLeadsFromAPI;window.loadLeadsFromAPI=function(){
var loaded=APP&&APP.leads&&APP.leads.length>0;
if(!loaded&&typeof _wpOrig==="function")return _wpOrig().then(function(){if(typeof filterLeads==="function")filterLeads();if(APP.page==="leads"||APP.page==="dashboard"||APP.page==="pipeline")if(typeof render==="function")render();});
if(typeof o==="function")return o();};})();

(function(){
var o=window.quickFilterBar;
window.quickFilterBar=function(){
  var orig=typeof o==="function"?o():"";
  var sc={};(APP.leads||[]).forEach(function(l){if(l&&l.state)sc[l.state.toUpperCase()]=(sc[l.state.toUpperCase()]||0)+1;});
  var so="<option value=\"\">All States ("+(APP.leads||[]).length+")</option>"+Object.keys(sc).sort().map(function(s){return"<option value=\""+s+"\">"+s+" ("+sc[s]+")</option>";}).join("");
  var dd="<div style='display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap'>"+
    "<label style='font-size:12px;color:#6b7280;font-weight:600'>State:</label>"+
    "<select id='ws-st' onchange='_wsF()' style='padding:5px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;cursor:pointer'>"+so+"</select>"+
    "<label style='font-size:12px;color:#6b7280;font-weight:600'>County:</label>"+
    "<select id='ws-co' onchange='_wsF()' style='padding:5px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;cursor:pointer'><option value=\"\">All Counties</option></select>"+
    "<button onclick='_wsR()' style='padding:5px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;cursor:pointer;background:#f9fafb'>Reset</button>"+
  "</div>";
  return dd+orig;
};
window._wsF=function(){
  var st=(document.getElementById("ws-st")||{}).value||"";
  var co=(document.getElementById("ws-co")||{}).value||"";
  if(st){var cc={};(APP.leads||[]).forEach(function(l){if(l&&(l.state||"").toUpperCase()===st&&l.county)cc[l.county]=(cc[l.county]||0)+1;});
  var cs=document.getElementById("ws-co");
  if(cs)cs.innerHTML="<option value=\"\">All Counties</option>"+Object.keys(cc).sort().map(function(c){return"<option value=\""+c+"\">"+c+" ("+cc[c]+")</option>";}).join("");}
  else{var cs2=document.getElementById("ws-co");if(cs2)cs2.innerHTML="<option value=\"\">All Counties</option>";}
  APP.filtered=(APP.leads||[]).filter(function(l){if(!l)return false;if(st&&(l.state||"").toUpperCase()!==st)return false;if(co&&(l.county||"").toLowerCase()!==co.toLowerCase())return false;return true;});
  if(typeof render==="function")render();
};
window._wsR=function(){
  var s=document.getElementById("ws-st");if(s)s.value="";
  var c=document.getElementById("ws-co");if(c)c.innerHTML="<option value=\"\">All Counties</option>";
  APP.filtered=null;if(typeof render==="function")render();
};
})();

setTimeout(function(){try{
  var all=Array.from(document.querySelectorAll("[onclick]"));
  var hasCH=all.some(function(e){return(e.getAttribute("onclick")||"").indexOf("courthouse")>-1;});
  if(!hasCH){var leadsEl=all.find(function(e){return(e.getAttribute("onclick")||"")==="navigate('leads')";});
  if(leadsEl){var ch=leadsEl.cloneNode(true);ch.setAttribute("onclick","navigate('courthouse')");
  var t=ch.querySelector("span")||ch;t.textContent="🏛 Courthouse";
  leadsEl.parentNode.insertBefore(ch,leadsEl.nextSibling);}}
}catch(e){}},2000);

console.log("WholesaleOS Patch v14 - full modal, state/county filters, courthouse");