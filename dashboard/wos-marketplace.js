'use strict';
(function (root) {
  if (document.body.dataset.wosDesign !== 'marketplace') return;
  var mobile = root.matchMedia('(max-width:900px)');
  var originalGrids = new WeakMap();
  var pending = false;
  var semanticText = { '#991b1b':'--danger','#b91c1c':'--danger','#dc2626':'--danger','#ef4444':'--danger','#166534':'--good','#15803d':'--good','#047857':'--good','#34c759':'--good' };
  function colorKey(value) {
    var rgb = value.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    return rgb ? '#' + rgb.slice(1).map(function(part) { return Number(part).toString(16).padStart(2,'0'); }).join('') : value.toLowerCase();
  }
  function button(label, action) {
    var element = document.createElement('button');
    element.type = 'button'; element.textContent = label;
    element.addEventListener('click', action); return element;
  }
  function installHeader() {
    var header = document.querySelector('.topbar');
    var sidebar = document.querySelector('.sidebar');
    if (!header || !sidebar) return;
    if (!sidebar.querySelector('.marketplace-menu-close')) {
      var close = button('\u00d7', function () { root.closeMobileMenu(); header.querySelector('.mobile-menu-btn').focus(); });
      close.className = 'marketplace-menu-close'; close.setAttribute('aria-label','Close navigation menu'); close.title = 'Close navigation menu'; sidebar.prepend(close);
    }
    if (!header.querySelector('.marketplace-brand')) {
      var brand = document.createElement('span'); brand.className = 'marketplace-brand'; brand.textContent = 'Montsan REI'; header.prepend(brand);
      var nav = document.createElement('nav'); nav.className = 'marketplace-topnav'; nav.setAttribute('aria-label', 'Main workspace');
      [['Today\'s Deals','todays_deals'],['JV','jv'],['Buyers','buyers_found'],['Activity','record_activity'],['Email','gmail']].forEach(function (item) {
        nav.appendChild(button(item[0], function () { root.navigate(item[1], null); }));
      });
      header.appendChild(nav);
      var search = button('\u2315', function () {
        var open = header.dataset.searchOpen !== 'true';
        header.dataset.searchOpen = String(open); search.setAttribute('aria-expanded', String(open));
        if (open) document.getElementById('global-search').focus();
      });
      search.className = 'marketplace-search-button'; search.setAttribute('aria-label', 'Search references, cities and ZIP codes');
      search.setAttribute('aria-controls', 'global-search'); search.setAttribute('aria-expanded', 'false'); header.appendChild(search);
      document.getElementById('global-search').setAttribute('aria-label', 'Search references, cities and ZIP codes');
    }
    var tools = sidebar.querySelector('.marketplace-tools');
    if (!tools) { tools = document.createElement('div'); tools.className = 'marketplace-tools'; sidebar.appendChild(tools); }
    header.querySelectorAll('button[onclick*="showAIChat"],button[onclick*="signOutDashboard"],button[onclick*="openAddLead"],#guide-btn,.notif-bell').forEach(function (element) { tools.appendChild(element); });
    sidebar.querySelectorAll('.nav-item').forEach(function (item) { item.setAttribute('role', 'button'); item.tabIndex = 0; });
    var menu = header.querySelector('.mobile-menu-btn'); if (menu) menu.setAttribute('aria-label', 'Open navigation menu');
  }
  function normalizePresentation(container) {
    var elements = [container].concat(Array.from(container.querySelectorAll('[style]')));
    elements.forEach(function (element) {
      if (!element.style || ['SVG','PATH','IMG','CANVAS','STYLE','SCRIPT'].includes(element.tagName.toUpperCase())) return;
      ['color','background','background-color','border-color'].forEach(function (property) {
        var value = element.style.getPropertyValue(property);
        if (!value || value.includes('var(') || value === 'transparent' || value === 'none') return;
        var danger = /error|danger|b-red|delete/.test(element.className || '');
        var warning = /warning|caution|b-yellow|b-orange/.test(element.className || '');
        var token = property === 'color' ? (semanticText[colorKey(value)] || (danger ? '--danger' : '--ink')) : property === 'border-color' ? '--line' : danger ? '--danger-bg' : warning ? '--warn-bg' : '--card';
        element.style.setProperty(property, 'var(' + token + ')', element.style.getPropertyPriority(property));
      });
      var size = parseFloat(element.style.fontSize); if (size && size < 14) element.style.fontSize = 'var(--body-size)';
      if (element.style.fontWeight && !['400','600'].includes(element.style.fontWeight)) element.style.fontWeight = /bold|[5-9]00/.test(element.style.fontWeight) ? '600' : '400';
      if (element.style.display === 'grid' && /\d+px/.test(element.style.gridTemplateColumns)) {
        if (!originalGrids.has(element)) originalGrids.set(element, element.style.gridTemplateColumns);
        element.style.gridTemplateColumns = mobile.matches ? 'minmax(0,1fr)' : originalGrids.get(element);
      } else if (originalGrids.has(element)) element.style.gridTemplateColumns = mobile.matches ? 'minmax(0,1fr)' : originalGrids.get(element);
    });
  }
  function refresh() {
    pending = false; installHeader();
    var app = document.getElementById('app'); if (app) normalizePresentation(app);
    var modal = document.getElementById('modal-content'); if (modal) normalizePresentation(modal);
    document.querySelectorAll('.td-filter-bar').forEach(function(element) {
      if (!element.dataset.mobileInitialized) { element.open = !mobile.matches; element.dataset.mobileInitialized = 'true'; }
    });
  }
  function schedule() { if (!pending) { pending = true; root.requestAnimationFrame(refresh); } }
  var observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  mobile.addEventListener('change', schedule);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      var header = document.querySelector('.topbar'); if (header) header.dataset.searchOpen = 'false';
      var menu = document.querySelector('.marketplace-search-button'); if (menu) menu.setAttribute('aria-expanded', 'false');
      var drawer = document.querySelector('.sidebar.mobile-open'); if(drawer) { root.closeMobileMenu(); document.querySelector('.mobile-menu-btn').focus(); }
    }
    if(event.key==='Tab' && mobile.matches) {
      var openDrawer=document.querySelector('.sidebar.mobile-open');
      if(openDrawer) {
        var stops=Array.from(openDrawer.querySelectorAll('button,a,input,select,textarea,[tabindex="0"]')).filter(function(element){return element.getClientRects().length&&!element.disabled;});
        if(stops.length && event.shiftKey && (document.activeElement===stops[0] || !openDrawer.contains(document.activeElement))){event.preventDefault();stops[stops.length-1].focus();}
        else if(stops.length && !event.shiftKey && (document.activeElement===stops[stops.length-1] || !openDrawer.contains(document.activeElement))){event.preventDefault();stops[0].focus();}
      }
    }
    if (event.target.matches('.nav-item') && ['Enter',' '].includes(event.key)) { event.preventDefault(); event.target.click(); }
  });
  document.addEventListener('click',function(event) { if(event.target.closest('.mobile-menu-btn') && document.querySelector('.sidebar.mobile-open'))document.querySelector('.marketplace-menu-close').focus(); });
  refresh();
})(window);
