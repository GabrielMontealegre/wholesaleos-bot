// dashboard/wos-comms.js v1
// Communications Hub — Email + SMS + Dialer unified tab
// New standalone file — never modifies index.html logic
'use strict';
(function() {

var _lead = null; // currently selected lead context
var _activeTab = 'email';

// ── Called when Communications section becomes visible ──────────────────
window.wosCommsInit = function(leadId) {
  var container = document.getElementById('wosCommsHub');
  if (!container) { _buildHub(); container = document.getElementById('wosCommsHub'); }
  if (!container) return;
  container.style.display = 'block';
  if (leadId) _loadLead(leadId);
  _switchTab(_activeTab);
};

window.wosCommsClose = function() {
  var c = document.getElementById('wosCommsHub');
  if (c) c.style.display = 'none';
};

window.wosCommsSetLead = function(lead) {
  _lead = lead;
  _prefillFromLead();
};

// ── Build the full Communications Hub UI ─────────────────────────────────
function _buildHub() {
  // Remove existing if present
  var old = document.getElementById('wosCommsHub');
  if (old) old.remove();

  var hub = document.createElement('div');
  hub.id = 'wosCommsHub';
  hub.style.cssText = [
    'display:none',
    'position:fixed',
    'top:0','left:0','right:0','bottom:0',
    'background:rgba(0,0,0,0.55)',
    'z-index:9000',
    'align-items:center',
    'justify-content:center',
  ].join(';');
  hub.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:820px;max-width:96vw;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <!-- Header -->
      <div style="display:flex;align-items:center;padding:16px 20px;border-bottom:1px solid #e5e7eb;background:linear-gradient(135deg,#1e1b4b,#3730a3);">
        <span style="font-size:20px;font-weight:700;color:#fff;flex:1;">📡 Communications Hub</span>
        <span id="wosCommsLeadName" style="font-size:13px;color:#c7d2fe;margin-right:16px;"></span>
        <button onclick="wosCommsClose()" style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px;">✕ Close</button>
      </div>
      <!-- Tab bar -->
      <div style="display:flex;border-bottom:2px solid #f3f4f6;background:#fafafa;">
        <button id="wosCommsTabEmail" onclick="wosCommsTab('email')" style="flex:1;padding:12px;border:none;background:none;cursor:pointer;font-weight:600;font-size:13px;color:#7c3aed;border-bottom:3px solid #7c3aed;">✉️ Email</button>
        <button id="wosCommsTabSms" onclick="wosCommsTab('sms')" style="flex:1;padding:12px;border:none;background:none;cursor:pointer;font-weight:500;font-size:13px;color:#6b7280;border-bottom:3px solid transparent;">💬 SMS</button>
        <button id="wosCommsTabDialer" onclick="wosCommsTab('dialer')" style="flex:1;padding:12px;border:none;background:none;cursor:pointer;font-weight:500;font-size:13px;color:#6b7280;border-bottom:3px solid transparent;">📞 Dialer</button>
        <button id="wosCommsTabHistory" onclick="wosCommsTab('history')" style="flex:1;padding:12px;border:none;background:none;cursor:pointer;font-weight:500;font-size:13px;color:#6b7280;border-bottom:3px solid transparent;">🕐 History</button>
      </div>
      <!-- Content area -->
      <div id="wosCommsContent" style="flex:1;overflow-y:auto;padding:20px;"></div>
    </div>
  `;
  document.body.appendChild(hub);
  // Click outside to close
  hub.addEventListener('click', function(e){ if(e.target===hub) wosCommsClose(); });
}

// ── Tab switcher ──────────────────────────────────────────────────────────
window.wosCommsTab = function(tab) {
  _activeTab = tab;
  ['email','sms','dialer','history'].forEach(function(t) {
    var btn = document.getElementById('wosCommsTab'+t.charAt(0).toUpperCase()+t.slice(1));
    if (!btn) return;
    var active = t === tab;
    btn.style.color = active ? '#7c3aed' : '#6b7280';
    btn.style.fontWeight = active ? '600' : '500';
    btn.style.borderBottom = active ? '3px solid #7c3aed' : '3px solid transparent';
  });
  var c = document.getElementById('wosCommsContent');
  if (!c) return;
  if (tab==='email')   c.innerHTML = _emailPanel();
  if (tab==='sms')     c.innerHTML = _smsPanel();
  if (tab==='dialer')  c.innerHTML = _dialerPanel();
  if (tab==='history') { c.innerHTML = '<div style="color:#9ca3af;text-align:center;padding:40px;">Loading history...</div>'; _loadHistory(); }
};

// ── Email panel ───────────────────────────────────────────────────────────
function _emailPanel() {
  var to = _lead ? (_lead.email||'') : '';
  var name = _lead ? (_lead.owner_name||_lead.address||'Property Owner') : '';
  var addr = _lead ? (_lead.address+', '+(_lead.city||'')+' '+(_lead.state||'')) : '';
  return `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:12px;color:#166534;">
        ✅ Gmail OAuth connected — emails send from your Gmail account
      </div>
      <div style="display:flex;gap:10px;">
        <div style="flex:1;">
          <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">TO</label>
          <input id="wosEmailTo" value="${to}" placeholder="owner@email.com" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;">
        </div>
        <div style="flex:1;">
          <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">SUBJECT</label>
          <input id="wosEmailSubj" value="Quick question about your property at ${addr}" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;">
        </div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <label style="font-size:11px;font-weight:600;color:#374151;">MESSAGE</label>
          <button onclick="wosCommsGenEmail()" style="background:#7c3aed;color:#fff;border:none;border-radius:5px;padding:4px 10px;font-size:11px;cursor:pointer;">🤖 AI Draft</button>
        </div>
        <textarea id="wosEmailBody" rows="8" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;resize:vertical;" placeholder="Type your message or click AI Draft...">Hi ${name},

I came across your property and wanted to reach out. I'm a local real estate investor interested in making a fair cash offer.

Would you be open to a quick conversation?

Best regards</textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="wosCommsGenEmail()" style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:13px;">🤖 Generate AI Draft</button>
        <button onclick="wosCommsSendEmail()" style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;border-radius:6px;padding:8px 20px;cursor:pointer;font-size:13px;font-weight:600;">Send Email ✉️</button>
      </div>
      <div id="wosEmailStatus" style="font-size:12px;text-align:center;color:#6b7280;"></div>
    </div>
  `;
}

// ── SMS panel ─────────────────────────────────────────────────────────────
function _smsPanel() {
  var phone = _lead ? (_lead.phone||'') : '';
  var addr  = _lead ? _lead.address : '';
  return `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div id="wosSmsTwilioStatus" style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400e;">
        ⚠️ Twilio credentials needed in Railway env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
      </div>
      <div>
        <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">TO (phone number)</label>
        <input id="wosSmsTo" value="${phone}" placeholder="+1 (555) 000-0000" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;">
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <label style="font-size:11px;font-weight:600;color:#374151;">MESSAGE <span style="color:#9ca3af;">(160 chars for 1 SMS)</span></label>
          <button onclick="wosCommsGenSms()" style="background:#7c3aed;color:#fff;border:none;border-radius:5px;padding:4px 10px;font-size:11px;cursor:pointer;">🤖 AI Draft</button>
        </div>
        <textarea id="wosSmsBody" rows="4" maxlength="320" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;resize:vertical;" placeholder="Hi, I'm interested in your property at ${addr}. Cash offer, quick close. Call me?"></textarea>
        <div id="wosSmsCount" style="text-align:right;font-size:11px;color:#9ca3af;margin-top:3px;">0/320</div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="wosCommsGenSms()" style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:13px;">🤖 AI Draft</button>
        <button onclick="wosCommsSendSms()" style="background:linear-gradient(135deg,#059669,#047857);color:#fff;border:none;border-radius:6px;padding:8px 20px;cursor:pointer;font-size:13px;font-weight:600;">Send SMS 💬</button>
      </div>
      <div id="wosSmsStatus" style="font-size:12px;text-align:center;color:#6b7280;"></div>
    </div>
  `;
}

// ── Dialer panel ──────────────────────────────────────────────────────────
function _dialerPanel() {
  var phone = _lead ? (_lead.phone||'') : '';
  var name  = _lead ? (_lead.owner_name||'Owner') : 'Owner';
  var mot   = _lead ? (_lead.motivation||'unknown').replace(/_/g,' ') : '';
  return `
    <div style="display:flex;gap:20px;">
      <div style="flex:1;display:flex;flex-direction:column;gap:12px;">
        <div style="background:#1e1b4b;border-radius:12px;padding:20px;text-align:center;color:#fff;">
          <div style="font-size:13px;color:#c7d2fe;margin-bottom:6px;">Calling</div>
          <div style="font-size:22px;font-weight:700;">${name}</div>
          <div id="wosDialerNum" style="font-size:18px;color:#a5b4fc;margin:8px 0;">${phone||'No phone on file'}</div>
          <input id="wosDialerInput" value="${phone}" placeholder="+1 555 000 0000" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#fff;padding:8px;width:80%;text-align:center;font-size:16px;margin:8px 0;">
          <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;">
            <a href="tel:${phone}" id="wosCallBtn" style="background:#059669;color:#fff;border:none;border-radius:8px;padding:10px 24px;text-decoration:none;font-size:14px;font-weight:600;">📞 Call Now</a>
          </div>
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:12px;font-size:12px;color:#6b7280;">
          <strong>Skip Trace:</strong> ${phone ? '✅ Phone on file' : '❌ No phone — run skip trace first'}<br>
          <strong>Motivation:</strong> ${mot||'Unknown'}<br>
          <strong>Best time to call:</strong> 9AM–11AM or 4PM–6PM local
        </div>
      </div>
      <div style="flex:1;">
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">📋 Call Script</div>
        <div id="wosDialerScript" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;font-size:13px;line-height:1.7;color:#374151;min-height:200px;">
          Loading AI script for this lead type...
        </div>
        <button onclick="wosCommsGenScript()" style="margin-top:8px;background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;width:100%;">🤖 Regenerate Script for ${mot||'this lead'}</button>
        <div style="margin-top:10px;">
          <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">CALL NOTES</label>
          <textarea id="wosCallNotes" rows="3" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;box-sizing:border-box;" placeholder="Notes from this call..."></textarea>
          <button onclick="wosSaveCallNote()" style="margin-top:4px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;">💾 Save Call Note</button>
        </div>
      </div>
    </div>
  `;
}

// ── History panel ─────────────────────────────────────────────────────────
function _loadHistory() {
  if (!_lead) { document.getElementById('wosCommsContent').innerHTML = '<div style="color:#9ca3af;text-align:center;padding:40px;">Open a lead to see comms history.</div>'; return; }
  fetch('/api/leads/'+_lead.id+'/notes').then(function(r){return r.json();}).then(function(d){
    var notes = d.notes || d || [];
    var html = notes.length ? notes.map(function(n){
      return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;"><div style="font-size:11px;color:#9ca3af;">'+n.date+'</div><div style="font-size:13px;margin-top:4px;">'+n.content+'</div></div>';
    }).join('') : '<div style="color:#9ca3af;text-align:center;padding:40px;">No communications history yet.</div>';
    var c = document.getElementById('wosCommsContent');
    if(c) c.innerHTML = html;
  }).catch(function(){ document.getElementById('wosCommsContent').innerHTML = '<div style="color:#9ca3af;text-align:center;padding:40px;">History unavailable.</div>'; });
}

// ── Load lead context ─────────────────────────────────────────────────────
function _loadLead(id) {
  fetch('/api/leads/'+id).then(function(r){return r.json();}).then(function(lead){
    _lead = lead;
    var nameEl = document.getElementById('wosCommsLeadName');
    if(nameEl) nameEl.textContent = (lead.address||'')+' — '+(lead.owner_name||'');
    _switchTab(_activeTab);
    // Auto-gen dialer script
    if(_activeTab==='dialer') setTimeout(wosCommsGenScript, 300);
  }).catch(function(){});
}

function _prefillFromLead() {
  if(!_lead) return;
  var nameEl = document.getElementById('wosCommsLeadName');
  if(nameEl) nameEl.textContent = (_lead.address||'')+' — '+(_lead.owner_name||'');
}

function _switchTab(tab) {
  window.wosCommsTab(tab);
  if(tab==='dialer') setTimeout(wosCommsGenScript, 400);
}

// ── AI generators ─────────────────────────────────────────────────────────
window.wosCommsGenEmail = function() {
  if(!_lead){ alert('Open a lead first.'); return; }
  var btn = event&&event.target; if(btn){btn.textContent='Generating...';btn.disabled=true;}
  fetch('/api/outreach/generate-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leadId:_lead.id,type:'email'})})
  .then(function(r){return r.json();}).then(function(d){
    var body = document.getElementById('wosEmailBody');
    if(body && d.message) body.value = d.message;
    if(btn){btn.textContent='🤖 AI Draft';btn.disabled=false;}
  }).catch(function(){ if(btn){btn.textContent='🤖 AI Draft';btn.disabled=false;} });
};

window.wosCommsGenSms = function() {
  if(!_lead){ alert('Open a lead first.'); return; }
  fetch('/api/outreach/generate-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leadId:_lead.id,type:'sms'})})
  .then(function(r){return r.json();}).then(function(d){
    var body = document.getElementById('wosSmsBody');
    if(body && d.message) body.value = d.message;
    var cnt = document.getElementById('wosSmsCount');
    if(cnt && body) cnt.textContent = body.value.length+'/320';
  }).catch(function(){});
};

window.wosCommsGenScript = function() {
  var el = document.getElementById('wosDialerScript');
  if(!el) return;
  if(!_lead){ el.innerHTML='<em>Open a lead to generate a call script.</em>'; return; }
  el.innerHTML = '<div style="color:#9ca3af;">⏳ Generating script for '+(_lead.motivation||'this lead').replace(/_/g,' ')+'...</div>';
  fetch('/api/outreach/generate-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leadId:_lead.id,type:'call_script'})})
  .then(function(r){return r.json();}).then(function(d){
    if(d.message && el) el.innerHTML = d.message.replace(/\n/g,'<br>');
  }).catch(function(){ if(el) el.innerHTML='<em style="color:#ef4444;">Script generation failed. Check AI API key.</em>'; });
};

// ── Send functions ────────────────────────────────────────────────────────
window.wosCommsSendEmail = function() {
  var to   = (document.getElementById('wosEmailTo')||{}).value||'';
  var subj = (document.getElementById('wosEmailSubj')||{}).value||'';
  var body = (document.getElementById('wosEmailBody')||{}).value||'';
  var st   = document.getElementById('wosEmailStatus');
  if(!to){ alert('Enter a recipient email.'); return; }
  if(st) st.textContent = 'Sending...';
  fetch('/api/email/send',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({to:to,subject:subj,body:body,leadId:_lead&&_lead.id})})
  .then(function(r){return r.json();}).then(function(d){
    if(st) st.textContent = d.ok ? '✅ Email sent!' : '❌ Failed: '+(d.error||'unknown');
    if(d.ok && _lead) _logComm('email','Sent email: '+subj);
  }).catch(function(e){ if(st) st.textContent='❌ Error: '+e.message; });
};

window.wosCommsSendSms = function() {
  var to   = (document.getElementById('wosSmsTo')||{}).value||'';
  var body = (document.getElementById('wosSmsBody')||{}).value||'';
  var st   = document.getElementById('wosSmsStatus');
  if(!to){ alert('Enter a phone number.'); return; }
  if(st) st.textContent = 'Sending...';
  fetch('/api/sms/send',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({to:to,body:body,leadId:_lead&&_lead.id})})
  .then(function(r){return r.json();}).then(function(d){
    if(st) st.textContent = d.ok ? '✅ SMS sent!' : '❌ Failed: '+(d.error||'Need Twilio keys in Railway');
    if(d.ok && _lead) _logComm('sms','Sent SMS: '+body.slice(0,50));
  }).catch(function(e){ if(st) st.textContent='❌ Error: '+e.message; });
};

window.wosSaveCallNote = function() {
  var note = (document.getElementById('wosCallNotes')||{}).value||'';
  if(!note || !_lead) return;
  fetch('/api/leads/'+_lead.id+'/note',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({note:note,type:'call'})})
  .then(function(r){return r.json();}).then(function(){
    var el = document.getElementById('wosCallNotes');
    if(el) el.value='';
    _logComm('call','Call note: '+note.slice(0,60));
    alert('✅ Call note saved.');
  }).catch(function(e){alert('Error saving note: '+e.message);});
};

function _logComm(type, summary) {
  if(!_lead) return;
  fetch('/api/leads/'+_lead.id+'/note',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({note:'['+type.toUpperCase()+'] '+summary,type:type,auto:true})}).catch(function(){});
}

// ── Wire into lead modal — expose global opener ───────────────────────────
// Call wosOpenComms(leadId) from anywhere to open the comms hub for a lead
window.wosOpenComms = function(leadId) {
  _buildHub();
  var hub = document.getElementById('wosCommsHub');
  if(hub) hub.style.display = 'flex';
  if(leadId) _loadLead(leadId);
  else _switchTab(_activeTab);
};

// Also wire SMS char counter
document.addEventListener('input', function(e) {
  if(e.target && e.target.id==='wosSmsBody') {
    var cnt = document.getElementById('wosSmsCount');
    if(cnt) cnt.textContent = e.target.value.length+'/320';
  }
});

console.log('[wos-comms] v1 loaded');
})();
