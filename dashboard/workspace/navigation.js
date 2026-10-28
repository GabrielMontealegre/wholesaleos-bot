'use strict';
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root) return;
  root.WOSWorkspaceNavigation = api;
  if (root.document.documentElement.dataset.wosWorkspace === 'preview') return;
  var query = new URLSearchParams(root.location.search);
  var view = api.page(query.get('workspace'));
  if (!view || api.recordHref(query.get('record_ref'))) return;
  function install() {
    var observer = new MutationObserver(open);
    var opened = false;
    function open() {
      if (opened || !root.APP || !root.APP.unlocked || root.APP.currentUser?.role !== 'admin' || typeof root.navigate !== 'function') return;
      opened = true;
      observer.disconnect();
      root.navigate(view, null);
    }
    observer.observe(root.document.body, { childList: true, subtree: true });
    open();
  }
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : null, function () {
  var pages = Object.freeze({ today: 'dashboard', email: 'gmail', leads: 'leads', deals: 'todays_deals',
    buyers: 'buyers_found', calendar: 'calendar', pipeline: 'pipeline', approvals: 'approvals', settings: 'settings' });
  // Screens rebuilt in this shell (#412). Every other key opens its classic view and is labeled so (#429).
  var shellPages = Object.freeze({ today: '/app?preview=1', email: '/app?preview=1&view=email' });
  var home = '/app';
  function page(key) { return Object.hasOwn(pages, key) ? pages[key] : null; }
  function href(key) { return page(key) ? '/dashboard/?workspace=' + encodeURIComponent(key) : null; }
  function shellHref(key) { return Object.hasOwn(shellPages, key) ? shellPages[key] : null; }
  function isClassic(key) { return Boolean(page(key)) && !shellHref(key); }
  function navHref(key) { return shellHref(key) || href(key); }
  function recordHref(ref) {
    return typeof ref === 'string' && /^(?:WOS-[A-Z]{2}|BUY|M)-\d{4}$/.test(ref) ? '/dashboard/?record_ref=' + encodeURIComponent(ref) : null;
  }
  return { home: home, page: page, href: href, shellHref: shellHref, isClassic: isClassic, navHref: navHref, recordHref: recordHref };
});
