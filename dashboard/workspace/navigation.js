'use strict';
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root) return;
  root.WOSWorkspaceNavigation = api;
  if (root.document.documentElement.dataset.wosWorkspace === 'preview') return;
  var query = new URLSearchParams(root.location.search);
  var embedded = false;
  try { embedded = query.get('embedded') === '1' && root.parent !== root && root.parent.location.origin === root.location.origin; } catch (_) {}
  if (embedded) root.document.documentElement.dataset.wosEmbedded = 'true';
  var view = api.page(query.get('workspace'));
  function install() {
    var observer = new MutationObserver(open);
    var opened = false;
    function open() {
      if (opened || !root.APP || !root.APP.unlocked || root.APP.currentUser?.role !== 'admin' || typeof root.navigate !== 'function') return;
      opened = true;
      observer.disconnect();
      if (view && !api.recordHref(query.get('record_ref'))) root.navigate(view, null);
      if (embedded) {
        var original = root.navigate;
        root.navigate = function (page, el) {
          var key = api.key(page);
          if (key) { root.parent.postMessage({ type: 'wos-workspace-navigation', key: key }, root.location.origin); return; }
          return original.apply(this, arguments);
        };
        root.document.addEventListener('click', function (event) {
          var anchor = event.target.closest('a[href]');
          if (!anchor || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || anchor.target === '_blank') return;
          var url = new URL(anchor.href, root.location.href);
          if (url.origin !== root.location.origin || !/^\/dashboard\/?$/.test(url.pathname)) return;
          var ref = url.searchParams.get('record_ref'), key = url.searchParams.get('workspace');
          if (!api.recordHref(ref) && !api.page(key)) return;
          event.preventDefault();
          root.parent.postMessage({ type: 'wos-workspace-navigation', key: key, ref: ref }, root.location.origin);
        });
      }
    }
    observer.observe(root.document.body, { childList: true, subtree: true });
    open();
  }
  if (!embedded && (!view || api.recordHref(query.get('record_ref')))) return;
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : null, function () {
  var pages = Object.freeze({ today: 'dashboard', email: 'gmail', leads: 'leads', deals: 'todays_deals',
    buyers: 'buyers_found', calendar: 'calendar', pipeline: 'pipeline', approvals: 'approvals', settings: 'settings' });
  function page(key) { return Object.hasOwn(pages, key) ? pages[key] : null; }
  function href(key) { return page(key) ? '/dashboard/?workspace=' + encodeURIComponent(key) : null; }
  function key(value) { return Object.keys(pages).find(function (key) { return pages[key] === value; }) || null; }
  function route(search) {
    var query = new URLSearchParams(search), ref = query.get('record_ref');
    if (recordHref(ref)) return { key: 'leads', ref: ref, native: false };
    var value = query.get('workspace') || query.get('view');
    if (!page(value)) value = 'today';
    return { key: value, ref: null, native: value === 'email' || value === 'today' && query.get('preview') === '1' && !query.has('workspace') };
  }
  function embeddedHref(key, ref) {
    if (ref != null) return recordHref(ref) ? recordHref(ref) + '&embedded=1' : null;
    return href(key) ? href(key) + '&embedded=1' : null;
  }
  function recordHref(ref) {
    return typeof ref === 'string' && /^(?:WOS-[A-Z]{2}|BUY|M)-\d{4}$/.test(ref) ? '/dashboard/?record_ref=' + encodeURIComponent(ref) : null;
  }
  return { page: page, key: key, href: href, recordHref: recordHref, route: route, embeddedHref: embeddedHref };
});
