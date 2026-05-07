// dashboard/wos-theme-a1.js v1
// Theme: Deep Navy + Gold (Option A1)
// Pure CSS injection — zero backend changes, zero data risk
// Remove script tag from index.html to revert to default theme
(function(){
'use strict';
var css = [
'/* ── WOS THEME A1: NAVY + GOLD ─────────────────── */'
,'body { background: #080f1e !important; color: #94a3b8 !important; }'
,'* { scrollbar-color: #1e2d4a #080f1e; }'
,'/* Sidebar base */'
,'#app { background: #080f1e !important; }'
,'#app .sidebar { background: #080f1e !important; border-right: 0.5px solid #1e2d4a !important; }'
,'#app .sidebar-overlay { background: rgba(8,15,30,0.85) !important; }'
,'#app .sidebar-header { background: #080f1e !important; border-bottom: 0.5px solid #1e2d4a !important; padding: 14px 16px !important; }'
,'#app .sidebar-logo { display: flex; align-items: center; gap: 8px !important; }'
,'#app .sidebar-logo-text { color: #f4c542 !important; font-weight: 500 !important; font-size: 14px !important; letter-spacing: -0.01em !important; }'
,'#app .sidebar-logo svg, #app .sidebar-logo img { filter: brightness(0) saturate(100%) invert(79%) sepia(55%) saturate(600%) hue-rotate(5deg) brightness(103%) !important; }'
,'#app .user-role-label { color: #475569 !important; font-size: 10px !important; }'
,'#app .nav-section { color: #334155 !important; font-size: 9px !important; text-transform: uppercase !important; letter-spacing: 0.07em !important; padding: 10px 16px 4px !important; font-weight: 600 !important; }'
,'#app .nav-item { color: #64748b !important; border-radius: 7px !important; margin: 1px 8px !important; padding: 8px 10px !important; transition: background 0.12s, color 0.12s !important; }'
,'#app .nav-item:hover { background: #0e1a2d !important; color: #94a3b8 !important; }'
,'#app .nav-item.active { background: #1a2744 !important; color: #f4c542 !important; font-weight: 500 !important; }'
,'#app .nav-item.active .nav-icon { color: #f4c542 !important; }'
,'#app .nav-icon { color: #475569 !important; font-size: 16px !important; }'
,'#app .nav-badge { background: #f4c542 !important; color: #080f1e !important; font-size: 10px !important; font-weight: 600 !important; }'
,'#app .nav-badge.green { background: #10b981 !important; color: #022c22 !important; }'
,'#app .sidebar-footer { background: #080f1e !important; border-top: 0.5px solid #1e2d4a !important; }'
,'#app .sidebar-stats { background: #080f1e !important; }'
,'#app .sidebar-stats .stat-mini { background: transparent !important; }'
,'#app .sidebar-stats .stat-mini-card { background: #0c1422 !important; border: 0.5px solid #1e2d4a !important; border-radius: 6px !important; }'
,'#app .sidebar-stats .stat-mini-label { color: #475569 !important; }'
,'#app .sidebar-stats .stat-mini-value { color: #f4c542 !important; font-weight: 500 !important; }'
,'#app .topbar { background: #0a1220 !important; border-bottom: 0.5px solid #1e2d4a !important; }'
,'#app .topbar-title { color: #e2e8f0 !important; font-weight: 500 !important; }'
,'#app .topbar-search { background: #1a2744 !important; border: 0.5px solid #233553 !important; color: #94a3b8 !important; border-radius: 8px !important; }'
,'#app .topbar-search::placeholder { color: #475569 !important; }'
,'#app .topbar-search:focus { border-color: #f4c542 !important; outline: none !important; }'
,'#app .notif-bell { color: #64748b !important; }'
,'#app .notif-bell:hover { color: #f4c542 !important; }'
,'#app .notif-badge { background: #f4c542 !important; color: #080f1e !important; }'
,'#app .main { background: #080f1e !important; }'
,'#content { background: #080f1e !important; }'
,'#app .kpi-card, #app .stat-card, #app .dashboard-card { background: #0c1422 !important; border: 0.5px solid #1e2d4a !important; border-radius: 10px !important; }'
,'#app .kpi-label, #app .stat-label, #app .card-label { color: #475569 !important; font-size: 10px !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; }'
,'#app .kpi-value, #app .stat-value, #app .card-value { color: #e2e8f0 !important; font-weight: 500 !important; }'
,'#app .kpi-delta.positive, #app .stat-delta.up { color: #10b981 !important; }'
,'#app .kpi-delta.negative, #app .stat-delta.down { color: #ef4444 !important; }'
,'#app .section-header, #app .section-title, #app h2, #app h3 { color: #94a3b8 !important; }'
,'#app .dashboard-section { background: #0c1422 !important; border: 0.5px solid #1e2d4a !important; border-radius: 10px !important; }'
,'#app table { background: #080f1e !important; border-collapse: collapse !important; }'
,'#app thead { background: #0c1422 !important; }'
,'#app thead th { background: #0c1422 !important; color: #334155 !important; font-size: 10px !important; font-weight: 600 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; border-bottom: 0.5px solid #1e2d4a !important; padding: 8px 12px !important; }'
,'#app tbody tr { background: #080f1e !important; border-bottom: 0.5px solid #0e1a2d !important; transition: background 0.1s !important; }'
,'#app tbody tr:hover { background: #0e1a2d !important; }'
,'#app tbody tr.selected, #app tbody tr.highlighted { background: #1a2744 !important; }'
,'#app tbody td { color: #94a3b8 !important; border: none !important; padding: 9px 12px !important; }'
,'#app tbody td:first-child { color: #e2e8f0 !important; }'
,'#app .lead-address, #app .lead-addr, #app td.address { color: #e2e8f0 !important; font-weight: 500 !important; }'
,'#app .lead-city, #app td.city { color: #475569 !important; font-size: 11px !important; }'
,'#app .ref-num, #app .lead-ref { color: #f4c542 !important; font-family: monospace !important; font-size: 10px !important; }'
,'#app .score-hot, #app .badge-hot, #app [class*="hot"] { background: #2d1010 !important; color: #fca5a5 !important; border: 0.5px solid #7f1d1d !important; }'
,'#app .score-warm, #app .badge-warm, #app [class*="warm"] { background: #2d1f06 !important; color: #fcd34d !important; border: 0.5px solid #78350f !important; }'
,'#app .score-cold, #app [class*="cold"] { background: #0c1422 !important; color: #64748b !important; border: 0.5px solid #1e2d4a !important; }'
,'#app .badge-probate, #app [data-type="probate"] .type-badge { background: #1a1040 !important; color: #a78bfa !important; border: 0.5px solid #3b1d8a !important; }'
,'#app .badge-tax, #app [data-type="tax"] .type-badge { background: #1c1800 !important; color: #fbbf24 !important; border: 0.5px solid #78350f !important; }'
,'#app .badge-foreclosure { background: #0a1828 !important; color: #60a5fa !important; border: 0.5px solid #1e3a5f !important; }'
,'#app .badge-code { background: #1c1000 !important; color: #fb923c !important; border: 0.5px solid #7c2d12 !important; }'
,'#app .spread-value, #app .deal-spread, #app td.spread { color: #10b981 !important; font-weight: 500 !important; }'
,'#app tbody tr[data-score="hot"], #app tbody tr.lead-hot, #app tbody tr.hot-lead { border-left: 3px solid #f4c542 !important; }'
,'#wosToolbar { background: #0a1220 !important; border-bottom: 0.5px solid #1e2d4a !important; padding: 9px 16px !important; }'
,'#wosToolbar button { background: #1e2d4a !important; color: #94a3b8 !important; border: 0.5px solid #334155 !important; border-radius: 6px !important; font-size: 11px !important; font-weight: 500 !important; transition: all 0.12s !important; }'
,'#wosToolbar button:hover { background: #233553 !important; color: #e2e8f0 !important; }'
,'#wosToolbar button:first-child { background: #f4c542 !important; color: #080f1e !important; border-color: #f4c542 !important; font-weight: 600 !important; }'
,'#wosToolbar button:first-child:hover { background: #e8b332 !important; }'
,'#wosToolbar .bulk-delete-btn, #wosToolbar button[onclick*="Delete"], #wosToolbar button[onclick*="delete"] { background: #2d1010 !important; color: #ef4444 !important; border-color: #7f1d1d !important; }'
,'#wosToolbar .score-btn, #wosToolbar button[onclick*="Score"] { background: #0a2010 !important; color: #10b981 !important; border-color: #0f4020 !important; }'
,'#wosToolbar input[type="text"], #wosToolbar input[type="search"] { background: #1a2744 !important; border: 0.5px solid #233553 !important; color: #94a3b8 !important; border-radius: 6px !important; }'
,'#wosToolbar .lead-count-badge, #wosToolbar span[id*="count"] { color: #64748b !important; font-size: 11px !important; }'
,'#wosFilterPanel { background: #0c1422 !important; border-bottom: 0.5px solid #1e2d4a !important; }'
,'#wosFilterPanel label { color: #64748b !important; font-size: 11px !important; }'
,'#wosFilterPanel select, #wosFilterPanel input { background: #1a2744 !important; border: 0.5px solid #233553 !important; color: #94a3b8 !important; border-radius: 6px !important; }'
,'#wosBulkBar { background: #1a2744 !important; border: 0.5px solid #233553 !important; }'
,'#app .modal-box, #app .modal-content, #app .lead-modal, .modal-overlay .modal { background: #0c1422 !important; border: 0.5px solid #1e2d4a !important; border-radius: 12px !important; color: #94a3b8 !important; }'
,'#app .modal-header, #app .modal-title { color: #e2e8f0 !important; border-bottom: 0.5px solid #1e2d4a !important; }'
,'#app .modal-footer { border-top: 0.5px solid #1e2d4a !important; background: #080f1e !important; }'
,'#app .field-label, #app .form-label { color: #64748b !important; font-size: 11px !important; }'
,'#app input, #app select, #app textarea { background: #1a2744 !important; border: 0.5px solid #233553 !important; color: #e2e8f0 !important; border-radius: 7px !important; }'
,'#app input:focus, #app select:focus, #app textarea:focus { border-color: #f4c542 !important; outline: none !important; box-shadow: 0 0 0 2px rgba(244,197,66,0.15) !important; }'
,'#app .btn-primary, #app .btn.primary, #app button.primary { background: #f4c542 !important; color: #080f1e !important; border-color: #f4c542 !important; font-weight: 600 !important; }'
,'#app .btn-primary:hover { background: #e8b332 !important; }'
,'#app .btn-secondary, #app .btn.secondary, #app button.secondary { background: #1e2d4a !important; color: #94a3b8 !important; border: 0.5px solid #334155 !important; }'
,'#app .btn-danger, #app button.danger, #app .delete-btn { background: #2d1010 !important; color: #ef4444 !important; border-color: #7f1d1d !important; }'
,'#app .btn-success, #app button.success, #app .save-btn { background: #10b981 !important; color: #022c22 !important; border-color: #10b981 !important; }'
,'#app .kanban-board, #app .pipeline-board { background: #080f1e !important; }'
,'#app .kanban-col, #app .pipeline-col { background: #0c1422 !important; border: 0.5px solid #1e2d4a !important; border-radius: 10px !important; }'
,'#app .kanban-col-header, #app .pipeline-stage-title { color: #94a3b8 !important; border-bottom: 0.5px solid #1e2d4a !important; font-size: 11px !important; font-weight: 600 !important; }'
,'#app .kanban-card, #app .pipeline-card { background: #1a2744 !important; border: 0.5px solid #233553 !important; border-radius: 7px !important; color: #94a3b8 !important; }'
,'#app .kanban-card:hover { border-color: #f4c542 !important; }'
,'#app ::-webkit-scrollbar { width: 4px !important; height: 4px !important; }'
,'#app ::-webkit-scrollbar-track { background: #080f1e !important; }'
,'#app ::-webkit-scrollbar-thumb { background: #1e2d4a !important; border-radius: 2px !important; }'
,'#app ::-webkit-scrollbar-thumb:hover { background: #334155 !important; }'
,'#wosOutreachPanel, #wosCommsHub, #wosBuyerImportHub { --modal-bg: #0c1422; }'
,'#app .outreach-panel, #app .comms-panel { background: #0c1422 !important; border: 0.5px solid #1e2d4a !important; }'
,'#wosLeadDetailPanel { border-color: #1e2d4a !important; }'
,'#app .notif-panel { background: #0c1422 !important; border: 0.5px solid #1e2d4a !important; }'
,'#app .notif-item { border-bottom: 0.5px solid #0e1a2d !important; color: #94a3b8 !important; }'
,'#app .notif-item:hover { background: #1a2744 !important; }'
,'#wosToastEl { font-family: -apple-system, BlinkMacSystemFont, sans-serif !important; }'
,'#pin-screen { background: #080f1e !important; }'
,'#pin-screen .pin-box, #pin-screen .pin-container { background: #0c1422 !important; border: 0.5px solid #1e2d4a !important; border-radius: 14px !important; }'
,'#pin-screen .pin-title { color: #f4c542 !important; }'
,'#pin-screen .pin-subtitle { color: #475569 !important; }'
,'#pin-screen .pin-display, #pin-screen .pin-dots { color: #f4c542 !important; }'
,'#pin-screen button { background: #1a2744 !important; color: #e2e8f0 !important; border: 0.5px solid #233553 !important; border-radius: 8px !important; transition: all 0.1s !important; }'
,'#pin-screen button:hover { background: #233553 !important; border-color: #f4c542 !important; color: #f4c542 !important; }'
,'#pin-screen button.ok-btn, #pin-screen button[onclick*="ok"] { background: #f4c542 !important; color: #080f1e !important; font-weight: 600 !important; border-color: #f4c542 !important; }'
].join(' ');
function injectTheme() {
  var existing = document.getElementById('wos-theme-a1');
  if (existing) return;
  var style = document.createElement('style');
  style.id = 'wos-theme-a1';
  style.textContent = css;
  document.head.appendChild(style);
  console.log('[wos-theme-a1] Navy+Gold theme injected');
}
function patchElements() {
  document.querySelectorAll('tr[data-lead-id]').forEach(function(row) {
    var score = parseInt(row.dataset.score || row.dataset.hotScore || '0');
    if (score >= 85) row.style.borderLeft = '3px solid #f4c542';
    else if (score >= 65) row.style.borderLeft = '3px solid #f59e0b';
    else row.style.borderLeft = '';
  });
  var tb = document.getElementById('wosToolbar');
  if (tb) {
    var btns = tb.querySelectorAll('button');
    if (btns.length > 0) {
      btns[0].style.cssText = 'background:#f4c542!important;color:#080f1e!important;border:none!important;font-weight:600!important;';
    }
  }
}
injectTheme();
patchElements();
setInterval(patchElements, 2000);
var _themeObs = new MutationObserver(function(muts) {
  var hasNew = muts.some(function(m){ return m.addedNodes.length > 0; });
  if (hasNew) { injectTheme(); }
});
_themeObs.observe(document.head, {childList:true});
console.log('[wos-theme-a1] v1 loaded — Deep Navy + Gold');
})();