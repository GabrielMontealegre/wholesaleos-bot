'use strict';
(function (root) {
  var glossary = {}; var serial = 0;
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function help(term) {
    if (!glossary[term]) return '';
    var id = 'wos-tip-' + (++serial);
    return '<span class="wos-help"><button type="button" class="wos-help-button" data-help-term="' + esc(term) + '" aria-label="Explain ' + esc(term) + '" aria-describedby="' + id + '" aria-expanded="false">(?)</button><span role="tooltip" id="' + id + '">' + esc(glossary[term]) + '</span></span>';
  }
  root.wosHelp = help;
  root.renderGlossary = function () { return '<section class="wos-glossary"><h2>Glossary</h2>' + Object.keys(glossary).sort().map(function (key) { return '<div><h3>' + esc(key) + '</h3><p>' + esc(glossary[key]) + '</p></div>'; }).join('') + '</section>'; };
  var aliases = { 'today': 'Today’s Deals', 'today\'s deals': 'Today’s Deals', 'joint venture': 'JV', 'estimated spread': 'Spread', 'asking': 'Buyer max', 'source': 'Open source', 'approve': 'Approval', 'reject': 'Approval', 'mark': 'JV status', 'pending': 'Approval', 'approved': 'Approval', 'sold': 'Comps', 'price': 'Buyer max', 'sq ft': 'Comps', 'beds': 'Comps', 'baths': 'Comps', 'state': 'Filters', 'county': 'Filters', 'city': 'Filters', 'save': 'Approval', 'draft': 'Copy message', 'review': 'Approval', 'count': 'Leads', 'total': 'Leads', 'new today': 'Daily target' };
  function decorate() {
    if (!Object.keys(glossary).length) return;
    var content = document.getElementById('content'); if (!content) return;
    content.querySelectorAll('h1,h2,h3,h4,th,dt,label,button,.badge,.pill,.stat-label,.bf-stats span,.td-counts span').forEach(function (el) {
      if (el.closest('.wos-help,.wos-glossary') || el.querySelector('.wos-help') || el.dataset.helpDecorated) return;
      var value = el.textContent.trim().toLowerCase();
      var term = Object.keys(glossary).find(function (k) { return value === k.toLowerCase() || value.split(/[^a-z0-9]+/).includes(k.toLowerCase()); }) || Object.keys(aliases).find(function (k) { return value.includes(k); });
      if (!term) return;
      term = glossary[term] ? term : aliases[term]; el.dataset.helpDecorated = 'true';
      if (el.tagName === 'BUTTON' || el.tagName === 'LABEL') el.insertAdjacentHTML('afterend', help(term)); else el.insertAdjacentHTML('beforeend', help(term));
    });
  }
  document.addEventListener('click', function (e) {
    var button = e.target.closest('[data-help-term]');
    document.querySelectorAll('.wos-help-button[aria-expanded="true"]').forEach(function (b) { if (b !== button) b.setAttribute('aria-expanded', 'false'); });
    if (button) { e.preventDefault(); e.stopPropagation(); button.setAttribute('aria-expanded', button.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.querySelectorAll('.wos-help-button').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); b.blur(); }); });
  fetch('/dashboard/glossary.json').then(function (r) { if (!r.ok) throw new Error('Glossary unavailable'); return r.json(); }).then(function (v) { glossary = v; decorate(); }).catch(function () {});
  var observer = new MutationObserver(decorate); observer.observe(document.getElementById('content') || document.body, { childList: true, subtree: true });
  var style = document.createElement('style'); style.textContent = '.wos-help{display:inline-flex;position:relative;vertical-align:middle;margin:0 4px}.wos-help-button{width:28px!important;height:28px!important;min-width:28px;padding:0!important;border:1px solid #637891!important;background:#132139!important;color:#f1f5f9!important;border-radius:4px!important;font:12px Arial!important;cursor:pointer}.wos-help [role=tooltip]{display:none;position:fixed;bottom:20px;left:16px;right:16px;max-width:480px;background:#132139;color:#f1f5f9;padding:14px;border:1px solid #637891;border-radius:6px;font:14px/1.5 Arial;z-index:10000;white-space:normal;overflow-wrap:anywhere}.wos-help:hover [role=tooltip],.wos-help:focus-within [role=tooltip],.wos-help:has([aria-expanded=true]) [role=tooltip]{display:block}.wos-glossary{max-width:900px;color:#e2e8f0}.wos-glossary div{border-bottom:1px solid #42516a;padding:12px 0}.wos-glossary h3{font-size:16px}.wos-glossary p{font-size:14px;line-height:1.5}'; document.head.appendChild(style);
})(window);
