(function() {
'use strict';
// wos-pipeline.js — Kanban Pipeline Board
// Stages: New Lead → Contacted → Interested → Offer Made → Under Contract → Closed → Dead
// Uses PATCH /api/pipeline/:id/stage to move leads
// Loaded as separate script — never injects into index.html

var STAGES = ['New Lead','Contacted','Interested','Offer Made','Under Contract','Closed','Dead'];
var STAGE_COLORS = {
  'New Lead':       '#6b7280',
  'Contacted':      '#3b82f6',
  'Interested':     '#8b5cf6',
  'Offer Made':     '#f59e0b',
  'Under Contract': '#10b981',
  'Closed':         '#059669',
  'Dead':           '#ef4444'
};
var _pipelineData = {};
var _initialized = false;

// Called when Pipeline tab is clicked
window.wosPipelineInit = function() {
  if (_initialized) { _loadPipeline(); return; }
  _initialized = true;
  _loadPipeline();
};

// Watch for Pipeline tab click
document.addEventListener('click', function(e) {
  var t = e.target.closest('a,button,[data-tab],[onclick]');
  if (!t) return;
  var txt = (t.textContent||'').trim();
  if (txt === 'Pipeline' || (t.href && t.href.indexOf('pipeline') > -1)) {
    setTimeout(function() { window.wosPipelineInit && wosPipelineInit(); }, 500);
  }
});

function _loadPipeline() {
  var container = _findPipelineContainer();
  if (!container) return;

  container.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;">Loading pipeline...</div>';

  fetch('/api/pipeline')
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (!d.ok) throw new Error(d.error);
    _pipelineData = d.stages || {};
    _renderKanban(container);
  })
  .catch(function(e) {
    container.innerHTML = '<div style="padding:20px;color:#ef4444;">Pipeline error: '+e.message+'</div>';
  });
}

function _renderKanban(container) {
  container.innerHTML = '';

  // Header
  var hdr = document.createElement('div');
  hdr.style.cssText = 'padding:14px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:12px;background:#fff;';
  var total = Object.values(_pipelineData).reduce(function(s,a){return s+a.length;},0);
  hdr.innerHTML = '<h2 style="margin:0;font-size:17px;font-weight:700;">Pipeline</h2>' +
    '<span style="font-size:12px;color:#6b7280;">'+total+' leads tracked</span>' +
    '<button onclick="wosPipelineRefresh()" style="margin-left:auto;padding:6px 12px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:7px;font-size:12px;cursor:pointer;">Refresh</button>';
  container.appendChild(hdr);

  // Kanban board
  var board = document.createElement('div');
  board.style.cssText = 'display:flex;gap:12px;padding:16px;overflow-x:auto;min-height:calc(100vh - 100px);align-items:flex-start;background:#f8f8fb;';

  STAGES.forEach(function(stage) {
    var leads = _pipelineData[stage] || [];
    var color = STAGE_COLORS[stage] || '#6b7280';

    var col = document.createElement('div');
    col.className = 'wos-pipeline-col';
    col.dataset.stage = stage;
    col.style.cssText = 'min-width:220px;max-width:240px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;display:flex;flex-direction:column;max-height:calc(100vh - 120px);';

    // Column header
    var colHdr = document.createElement('div');
    colHdr.style.cssText = 'padding:10px 12px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:6px;';
    colHdr.innerHTML =
      '<div style="width:10px;height:10px;border-radius:50%;background:'+color+';flex-shrink:0;"></div>' +
      '<span style="font-size:12px;font-weight:700;color:#111;">'+stage+'</span>' +
      '<span style="font-size:11px;color:#9ca3af;margin-left:auto;">'+leads.length+'</span>';
    col.appendChild(colHdr);

    // Cards container (scrollable)
    var cards = document.createElement('div');
    cards.style.cssText = 'padding:8px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:6px;';
    cards.dataset.stage = stage;

    // Drag and drop target events
    cards.addEventListener('dragover', function(e) {
      e.preventDefault();
      cards.style.background = '#f0f4ff';
    });
    cards.addEventListener('dragleave', function() {
      cards.style.background = '';
    });
    cards.addEventListener('drop', function(e) {
      e.preventDefault();
      cards.style.background = '';
      var leadId = e.dataTransfer.getData('text/plain');
      var newStage = cards.dataset.stage;
      if (leadId && newStage) _moveLeadToStage(leadId, newStage);
    });

    // Render lead cards
    leads.forEach(function(lead) {
      cards.appendChild(_makeCard(lead, stage));
    });

    col.appendChild(cards);
    board.appendChild(col);
  });

  container.appendChild(board);
}

function _makeCard(lead, currentStage) {
  var card = document.createElement('div');
  card.draggable = true;
  card.dataset.leadId = lead.id;
  card.style.cssText = 'background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px;cursor:grab;transition:box-shadow .15s;font-size:12px;';

  var addr = [lead.address, lead.city, lead.state].filter(Boolean).join(', ');
  var score = lead.hot_score || 0;
  var scoreColor = score>=70?'#ef4444':score>=45?'#f59e0b':'#9ca3af';
  var src = lead.source_details || lead.source || lead.category || '';
  var arv = lead.arv ? '$'+Math.round(lead.arv/1000)+'K' : 'TBD';
  var mao = lead.mao ? '$'+Math.round(lead.mao/1000)+'K' : '—';

  card.innerHTML =
    '<div style="font-weight:600;color:#111;margin-bottom:4px;line-height:1.3;">'+addr+'</div>' +
    (src ? '<div style="color:#6b7280;margin-bottom:6px;font-size:11px;">'+src+'</div>' : '') +
    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
    '<div style="display:flex;gap:8px;">' +
    '<span style="color:#059669;">'+arv+'</span>' +
    '<span style="color:#9ca3af;">→</span>' +
    '<span style="color:#7c3aed;">'+mao+'</span>' +
    '</div>' +
    (score > 0 ? '<span style="font-weight:700;color:'+scoreColor+';font-size:11px;">'+score+'/100</span>' : '') +
    '</div>' +
    '<div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;">' +
    STAGES.filter(function(s){return s!==currentStage;}).map(function(s) {
      var c = STAGE_COLORS[s]||'#6b7280';
      return '<button onclick="wosMoveStage(\"'+lead.id+'\",\"'+s+'\")" title="Move to '+s+'" style="font-size:9px;padding:2px 5px;border-radius:4px;border:1px solid '+c+';color:'+c+';background:#fff;cursor:pointer;">→ '+s.split(' ')[0]+'</button>';
    }).join('') +
    '</div>';

  card.addEventListener('mouseenter', function() { card.style.boxShadow='0 2px 8px rgba(0,0,0,.12)'; });
  card.addEventListener('mouseleave', function() { card.style.boxShadow=''; });

  card.addEventListener('dragstart', function(e) {
    e.dataTransfer.setData('text/plain', lead.id);
    card.style.opacity = '0.5';
  });
  card.addEventListener('dragend', function() {
    card.style.opacity = '1';
  });

  // Click opens lead modal (but only if not dragging)
  card.addEventListener('click', function(e) {
    if (e.target.tagName === 'BUTTON') return; // stage buttons handle themselves
    if (typeof openLeadModal === 'function') openLeadModal(lead.id);
  });

  return card;
}

function _moveLeadToStage(leadId, stage) {
  fetch('/api/pipeline/'+leadId+'/stage', {
    method: 'PATCH',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({stage: stage})
  })
  .then(function(r){return r.json();})
  .then(function(d) {
    if (d.ok) {
      console.log('[pipeline] moved '+leadId+' to '+stage);
      _loadPipeline(); // Refresh
    } else {
      alert('Error moving lead: '+(d.error||'unknown'));
    }
  })
  .catch(function(e){ alert('Error: '+e.message); });
}

window.wosMoveStage = function(leadId, stage) {
  _moveLeadToStage(leadId, stage);
};

window.wosPipelineRefresh = function() {
  _loadPipeline();
};

function _findPipelineContainer() {
  // Try to find pipeline section in the SPA
  var selectors = ['#pipelineContent','#pipeline-content','.pipeline-content','[data-section="pipeline"]'];
  for (var i=0; i<selectors.length; i++) {
    var el = document.querySelector(selectors[i]);
    if (el && el.offsetParent) return el;
  }
  // Find visible element with pipeline in id/class
  var all = document.querySelectorAll('[id*=pipeline],[class*=pipeline]');
  for (var j=0; j<all.length; j++) {
    if (all[j].offsetParent && !all[j].querySelector('.wos-pipeline-col')) return all[j];
  }
  return null;
}

})();
