'use strict';
(function (root) {
  var c = root.WOSComponents, nav = root.WOSWorkspaceNavigation, auth = root.WOSDashboardAuth;
  var app = {}, generation = 0, current = null, pageSize = 25, helpTimer = null, detailWidget = null;
  var host = document.getElementById('workspace-root');
  var groups = [
    ['Today', [['today', 'Today', 'layout-dashboard', 'Your recorded actions and activity'], ['email', 'Email', 'mail', 'Read messages in your current Email workspace']]],
    ['Find', [['leads', 'Leads', 'house', 'Source records and property evidence'], ['deals', 'Deals', 'handshake', 'Reviewed properties and matching buyers']]],
    ['People', [['buyers', 'Buyers', 'users', 'Recorded buyers and buying criteria'], ['calendar', 'Calendar', 'calendar-days', 'Recorded dates and follow-ups']]],
    ['Close', [['pipeline', 'Pipeline', 'layers', 'Recorded stages and next steps'], ['approvals', 'Approvals', 'list-checks', 'Items waiting for your review']]]
  ];

  function navigation() {
    return '<nav class="ws-nav" aria-label="Main navigation">' + groups.map(function (group) {
      return '<section class="ws-nav-group"><h2>' + c.escape(group[0]) + '</h2>' + group[1].map(function (item) {
        return '<a href="' + (item[0] === 'today' ? '/app?preview=1' : nav.href(item[0])) + '"' +
          (item[0] === 'today' ? ' aria-current="page"' : '') + ' data-help="' + c.escape(item[3]) + '">' +
          c.icon(item[2]) + '<span>' + c.escape(item[1]) + '</span></a>';
      }).join('') + '</section>';
    }).join('') + '</nav>';
  }

  function clearPrivate() {
    generation++;
    current = null;
    detailWidget = null;
    clearTimeout(helpTimer);
    document.querySelectorAll('dialog[open]').forEach(function (dialog) { dialog.close(); });
    host.replaceChildren();
  }

  function locked(message) {
    clearPrivate();
    auth.lockIdentity(app);
    host.innerHTML = '<main class="ws-login"><h1>WholesaleOS</h1><h2>Unlock your workspace</h2>' +
      '<form id="login"><label for="pin">Dashboard PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="current-password" required>' +
      c.button({ label: 'Unlock', icon: 'check', tone: 'green', id: 'unlock' }) +
      '<p role="alert" class="ws-error" id="login-error">' + c.escape(message || '') + '</p></form>' +
      '<a href="/dashboard/">Open classic dashboard</a></main>';
    var form = document.getElementById('login');
    async function login(event) {
      event.preventDefault();
      var input = document.getElementById('pin'), button = document.getElementById('unlock');
      if (button.disabled || !input.value) return;
      button.disabled = true;
      var value = input.value;
      input.value = '';
      var result = await auth.authenticate(value);
      value = '';
      if (result.ok && result.user.role === 'admin') {
        auth.applyAuthenticatedUser(app, result.user);
        shell();
        load();
      } else {
        document.getElementById('login-error').textContent = result.ok ? 'This workspace requires an admin session.' : 'Could not unlock. Check your PIN and connection.';
        button.disabled = false;
      }
    }
    form.addEventListener('submit', login);
    document.getElementById('unlock').addEventListener('click', login);
  }

  function shell() {
    clearPrivate();
    host.innerHTML = '<div class="ws-shell"><aside class="ws-sidebar"><a class="ws-brand" href="/app?preview=1">WholesaleOS</a>' + navigation() +
      '<div class="ws-sidebar-footer"><a class="ws-button" href="/dashboard/">Classic dashboard</a></div></aside>' +
      '<div class="ws-workspace"><header class="ws-topbar">' +
      c.button({ label: 'Open navigation', icon: 'menu', iconOnly: true, id: 'menu-open' }).replace('ws-button--icon', 'ws-button--icon ws-mobile-menu') +
      '<h1>Today</h1><div class="ws-topbar-actions">' + c.button({ label: 'Refresh recorded work', icon: 'refresh-cw', iconOnly: true, id: 'refresh', help: 'Reload recorded work without running a batch' }) +
      '<a class="ws-button ws-button--icon" href="' + nav.href('settings') + '" aria-label="Settings" data-help="Open your current settings">' + c.icon('settings') + '</a>' +
      c.button({ label: 'Account', icon: 'users', iconOnly: true, id: 'account-open' }) +
      '</div></header><div class="ws-help" id="help"></div><main class="ws-content" id="today-content" aria-busy="true">' +
      c.skeleton('Loading recorded work') + '</main></div></div>' +
      c.drawer('mobile-nav', 'Navigation') + c.drawer('account', 'Account') + c.drawer('detail', 'Record');
    var mobile = document.getElementById('mobile-nav'), account = document.getElementById('account');
    mobile.querySelector('[data-dialog-body]').innerHTML = navigation();
    account.querySelector('[data-dialog-body]').innerHTML = '<p>Admin session</p><a class="ws-button" href="' + nav.href('settings') + '">Settings</a>' + c.button({ label: 'Sign out', icon: 'log-out', id: 'signout' });
    var menu = c.bindDialog(mobile), user = c.bindDialog(account);
    detailWidget = c.bindDialog(document.getElementById('detail'));
    document.getElementById('menu-open').addEventListener('click', menu.open);
    document.getElementById('account-open').addEventListener('click', user.open);
    document.getElementById('signout').addEventListener('click', async function () {
      clearPrivate();
      await auth.logout(app);
      locked();
    });
    document.getElementById('refresh').addEventListener('click', load);
  }

  function helpIn(event) {
    var target = event.target.closest('[data-help]');
    if (!target) return;
    clearTimeout(helpTimer);
    helpTimer = setTimeout(function () {
      var region = document.getElementById('help');
      if (region && target.isConnected) region.textContent = target.dataset.help;
    }, 400);
  }
  function helpOut(event) {
    if (!event.target.closest('[data-help]')) return;
    clearTimeout(helpTimer);
    var region = document.getElementById('help');
    if (region) region.textContent = '';
  }
  function time(value) { return value ? root.wosCardClock.formatTime(value, current && current.now) : 'Not recorded'; }
  function count(value) { return Number.isSafeInteger(value) && value >= 0 ? String(value) : 'Unknown'; }

  function row(item, kind, index) {
    return c.listRow({ key: kind + ':' + index, title: item.heading || item.label || 'Recorded item',
      detail: kind === 'activity' ? time(item.at) : item.recorded_at ? time(item.recorded_at) : 'Recorded date not available',
      status: item.label || item.grade || '', tone: kind === 'actions' ? 'blue' : 'neutral' });
  }

  function render() {
    var data = current, content = document.getElementById('today-content');
    if (!content || !data) return;
    var actions = data.actions.slice(0, pageSize), events = data.last_24h.slice(0, pageSize);
    content.setAttribute('aria-busy', 'false');
    content.innerHTML = '<section class="ws-section"><div class="ws-section-header"><h2>Recorded work</h2>' + c.badge('Workflow summary', 'neutral') + '</div>' +
      '<div class="ws-stats">' + [['replies', 'replies'], ['approvals', 'approvals'], ['followups', 'follow-ups'], ['deadlines', 'deadlines']].map(function (entry) {
        return '<span><strong>' + count(data.counts[entry[0]]) + '</strong> ' + entry[1] + '</span>';
      }).join('') + '</div>' + c.tabs('today', [{ key: 'actions', label: 'Actions' }, { key: 'deals', label: 'Best deals' }, { key: 'activity', label: 'Last 24 hours' }], 'actions') +
      '<section id="today-panel-actions" role="tabpanel" aria-labelledby="today-actions"><ul class="ws-list">' + actions.map(function (item, i) { return row(item, 'actions', i); }).join('') + '</ul>' +
      (actions.length ? '' : c.empty('No actions recorded', 'Open Leads or Email to review your recorded work.')) +
      (data.actions.length > actions.length ? c.button({ label: 'Show more actions', id: 'more-actions', icon: 'chevron-down' }) : '') + '</section>' +
      '<section id="today-panel-deals" role="tabpanel" aria-labelledby="today-deals" hidden><ul class="ws-list">' + data.best_deals.map(function (item, i) { return row(item, 'deals', i); }).join('') + '</ul>' +
      (data.best_deals.length ? '' : c.empty('No best deals recorded', 'Open Deals to review property evidence and buyer matches.')) + '</section>' +
      '<section id="today-panel-activity" role="tabpanel" aria-labelledby="today-activity" hidden><ul class="ws-list">' + events.map(function (item, i) { return row(item, 'activity', i); }).join('') + '</ul>' +
      (events.length ? '' : c.empty('No activity recorded in the last 24 hours', 'Recorded actions will appear here.')) +
      (data.last_24h.length > events.length ? c.button({ label: 'Show more activity', id: 'more-activity', icon: 'chevron-down' }) : '') + '</section></section>';
    c.bindTabs(content.querySelector('[role="tablist"]'));
    content.querySelectorAll('[data-row]').forEach(function (button) {
      button.addEventListener('click', function () {
        var parts = button.dataset.row.split(':'), list = parts[0] === 'actions' ? data.actions : parts[0] === 'deals' ? data.best_deals : data.last_24h;
        openRecord(list[Number(parts[1])]);
      });
    });
    ['more-actions', 'more-activity'].forEach(function (name) {
      var button = document.getElementById(name);
      if (button) button.addEventListener('click', function () {
        var active = content.querySelector('[aria-selected="true"]').dataset.tab;
        pageSize += 25;
        render();
        document.querySelector('[data-tab="' + active + '"]').click();
        document.querySelector('[data-tab="' + active + '"]').focus();
      });
    });
  }

  function openRecord(item) {
    var dialog = document.getElementById('detail'), body = dialog.querySelector('[data-dialog-body]');
    var refs = item.conversation?.refs || [item.ref], links = refs.map(nav.recordHref).filter(Boolean);
    body.innerHTML = '<h3>' + c.escape(item.heading || item.label || 'Recorded item') + '</h3><p>' + c.escape(item.label || item.grade || 'Recorded work') + '</p>' +
      '<dl class="ws-detail"><div><dt>Source</dt><dd>' + c.escape(item.source_kind === 'recorded_activity' ? 'Recorded activity' : item.source_kind === 'verified_release_record' ? 'Verified release record' : 'Recorded workflow') +
      '</dd></div><div><dt>Recorded</dt><dd>' + c.escape(time(item.recorded_at || item.at)) + '</dd></div></dl>' +
      links.map(function (href) { return '<a class="ws-button" href="' + href + '">Open full record' + c.icon('arrow-up-right') + '</a>'; }).join('') +
      (!links.length ? '<p class="ws-muted">No unique property or buyer reference is attached. Open the relevant workspace to review the source record.</p>' : '');
    detailWidget.open();
  }

  async function load() {
    var sequence = ++generation, content = document.getElementById('today-content');
    if (!content || !app.unlocked) return;
    var refresh = document.getElementById('refresh');
    refresh.disabled = true;
    if (detailWidget) detailWidget.close();
    document.getElementById('detail').querySelector('[data-dialog-body]').replaceChildren();
    current = null;
    content.innerHTML = c.skeleton('Loading recorded work');
    content.setAttribute('aria-busy', 'true');
    try {
      var response = await root.fetch('/api/dashboard/today-workspace', { credentials: 'include', cache: 'no-store' });
      if (sequence !== generation || !app.unlocked) return;
      if (!response.ok) throw Error('unavailable');
      var data = await response.json();
      if (sequence !== generation || !app.unlocked) return;
      if (!data || data.source_kind !== 'derived_workflow' || !Array.isArray(data.actions) || !Array.isArray(data.best_deals) || !Array.isArray(data.last_24h) || !data.counts) throw Error('invalid');
      current = data;
      pageSize = 25;
      render();
    } catch (_) {
      if (sequence !== generation || !app.unlocked) return;
      content.setAttribute('aria-busy', 'false');
      content.innerHTML = c.empty('Recorded work is unavailable', 'Use Refresh to try again, or open the classic dashboard.');
    } finally {
      if (sequence === generation && document.getElementById('refresh')) document.getElementById('refresh').disabled = false;
    }
  }

  host.addEventListener('pointerover', helpIn);
  host.addEventListener('focusin', helpIn);
  host.addEventListener('pointerout', helpOut);
  host.addEventListener('focusout', helpOut);
  auth.installFetchGuard(app, { onUnauthorized: function () { locked('Your session expired. Unlock to continue.'); } });
  auth.restoreSession(app).then(function (result) {
    if (!result.ok) return locked();
    if (result.user.role !== 'admin') return locked('This workspace requires an admin session.');
    shell();
    load();
  });
})(window);
