// dashboard/wos-buyers.js v1
// Bulk buyer paste import + duplicate detection UI
(function() {
'use strict';
window.wosBuyerImportOpen = function() {
  var old = document.getElementById('wosBuyerImportHub');
  if (old) old.remove();
  var hub = document.createElement('div');
  hub.id = 'wosBuyerImportHub';
  hub.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:9500;display:flex;align-items:center;justify-content:center;';
  hub.innerHTML = _buildModal();
  document.body.appendChild(hub);
  hub.addEventListener('click', function(e){ if(e.target===hub) wosBuyerImportClose(); });
  document.getElementById('wosBiText').addEventListener('input', _liveCount);
};
window.wosBuyerImportClose = function() {
  var h = document.getElementById('wosBuyerImportHub');
  if (h) h.remove();
};
function _liveCount() {
  var txt = document.getElementById('wosBiText').value;
  var lines = txt.split('\n').filter(function(l){return l.trim().length>3;}).length;
  var el = document.getElementById('wosBiLineCount');
  if (el) el.textContent = lines + ' lines detected';
}
function _buildModal() {
  return '<div style="background:#fff;border-radius:14px;width:780px;max-width:96vw;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;font-family:system-ui,sans-serif;">' +
    '<div style="background:#1e1b4b;color:#fff;padding:14px 18px;display:flex;align-items:center;">' +
    '<div style="flex:1;"><div style="font-size:16px;font-weight:600;">Bulk Buyer Import</div><div style="font-size:12px;color:#c7d2fe;margin-top:2px;">Paste any format — one buyer per line</div></div>' +
    '<button onclick="wosBuyerImportClose()" style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:7px;padding:5px 12px;cursor:pointer;font-size:13px;">Close</button>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 280px;flex:1;overflow:hidden;">' +
    '<div style="padding:16px;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;gap:10px;overflow-y:auto;">' +
    '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;font-size:12px;color:#065f46;line-height:1.7;">' +
    '<strong>Accepted formats (one buyer per line):</strong><br>' +
    'John Smith | john@email.com | 214-555-0192 | TX<br>' +
    'Sarah Lee, sarah@realty.com, 312-555-0134, Illinois<br>' +
    'Mike Torres -- mike@invest.com -- 713-555-0177 -- TX' +
    '</div>' +
    '<div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">' +
    '<label style="font-size:12px;font-weight:600;color:#374151;">Paste buyers here</label>' +
    '<span id="wosBiLineCount" style="font-size:11px;color:#6b7280;">0 lines detected</span>' +
    '</div>' +
    '<textarea id="wosBiText" rows="10" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;font-family:monospace;box-sizing:border-box;resize:vertical;" placeholder="John Smith | john@email.com | 214-555-0192 | TX&#10;Sarah Lee, sarah@realty.com, 312-555-0134, IL"></textarea>' +
    '</div>' +
    '<div style="display:flex;gap:8px;">' +
    '<button onclick="wosBiPreview()" style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:7px;padding:8px 16px;font-size:13px;cursor:pointer;">Preview</button>' +
    '<button onclick="wosBiImport()" style="background:#059669;color:#fff;border:none;border-radius:7px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">Import All</button>' +
    '</div>' +
    '<div id="wosBiPreviewArea"></div>' +
    '</div>' +
    '<div style="padding:16px;background:#fafafa;overflow-y:auto;">' +
    '<div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:10px;">Result</div>' +
    '<div id="wosBiResult"><div style="color:#9ca3af;font-size:12px;">Click Preview or Import to see results.</div></div>' +
    '</div>' +
    '</div></div>';
}
window.wosBiPreview = function() {
  var txt = (document.getElementById('wosBiText')||{}).value||'';
  if(!txt.trim()){ alert('Paste some buyer data first.'); return; }
  var res = document.getElementById('wosBiPreviewArea');
  if(res) res.innerHTML = '<div style="color:#6b7280;font-size:12px;padding:8px 0;">Parsing...</div>';
  fetch('/api/buyers/parse-paste',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:txt})})
  .then(function(r){return r.json();})
  .then(function(d){
    _showResult(d, false);
    _showPreview(d);
  }).catch(function(e){ if(res) res.innerHTML='<div style="color:#ef4444;font-size:12px;">Error: '+e.message+'</div>'; });
};
window.wosBiImport = function() {
  var txt = (document.getElementById('wosBiText')||{}).value||'';
  if(!txt.trim()){ alert('Paste some buyer data first.'); return; }
  var res = document.getElementById('wosBiResult');
  if(res) res.innerHTML = '<div style="color:#6b7280;font-size:12px;">Importing...</div>';
  fetch('/api/buyers/parse-paste',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:txt})})
  .then(function(r){return r.json();})
  .then(function(d){
    var toImport = d.buyers.filter(function(b){return !b.duplicate;});
    if(!toImport.length){ _showResult(d,true); return; }
    return fetch('/api/buyers/bulk-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({buyers:toImport})})
    .then(function(r){return r.json();})
    .then(function(imp){
      _showResult({ok:true,parsed:d.parsed,buyers:d.buyers,imported:imp.imported,skipped:imp.skipped,duplicates:d.duplicates,importResult:imp},true);
    });
  }).catch(function(e){ if(res) res.innerHTML='<div style="color:#ef4444;font-size:12px;">Error: '+e.message+'</div>'; });
};
function _showPreview(d) {
  var el = document.getElementById('wosBiPreviewArea');
  if(!el) return;
  var html = '<div style="margin-top:10px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 60px 60px 70px;gap:6px;padding:7px 10px;background:#f9fafb;font-size:11px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;"><span>Name</span><span>Email</span><span>Phone</span><span>State</span><span>Status</span></div>';
  d.buyers.slice(0,20).forEach(function(b){
    var st = b.duplicate ?
      '<span style="color:#b45309;font-size:11px;">Dupe</span>' :
      '<span style="color:#059669;font-size:11px;">New</span>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 60px 60px 70px;gap:6px;padding:6px 10px;font-size:12px;border-bottom:0.5px solid #f3f4f6;align-items:center;">' +
      '<span style="font-weight:500;">'+b.name+'</span><span style="color:#6b7280;">'+b.email+'</span><span>'+b.phone.slice(0,10)+'</span><span>'+b.state+'</span>'+st+'</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}
function _showResult(d, didImport) {
  var el = document.getElementById('wosBiResult');
  if(!el) return;
  var newCount = d.buyers ? d.buyers.filter(function(b){return !b.duplicate;}).length : 0;
  var dupeCount = d.duplicates || 0;
  var importedCount = d.imported || 0;
  var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">';
  html += '<div style="background:#f0fdf4;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:22px;font-weight:600;color:#059669;">'+(didImport?importedCount:newCount)+'</div><div style="font-size:11px;color:#6b7280;">'+(didImport?'Imported':'Ready to import')+'</div></div>';
  html += '<div style="background:#fffbeb;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:22px;font-weight:600;color:#b45309;">'+dupeCount+'</div><div style="font-size:11px;color:#6b7280;">Duplicates skipped</div></div>';
  html += '</div>';
  if(dupeCount > 0) {
    var dupes = d.buyers.filter(function(b){return b.duplicate;});
    html += '<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px;margin-bottom:10px;">';
    html += '<div style="font-size:11px;font-weight:600;color:#92400e;margin-bottom:5px;">Duplicates detected (skipped):</div>';
    dupes.forEach(function(b){ html += '<div style="font-size:11px;color:#92400e;padding:2px 0;">'+b.name+(b.email?' ('+b.email+')':'')+'</div>'; });
    html += '</div>';
  }
  if(didImport && importedCount > 0) {
    html += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;font-size:12px;color:#065f46;">Done! '+importedCount+' buyers added to your database.</div>';
  }
  el.innerHTML = html;
}
console.log('[wos-buyers] v1 loaded');
})();