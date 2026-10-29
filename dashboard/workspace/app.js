'use strict';
(function (root) {
  var c = root.WOSComponents, nav = root.WOSWorkspaceNavigation, auth = root.WOSDashboardAuth;
  var app = {}, generation = 0, current = null, pageSize = 25, helpTimer = null, detailWidget = null;
  var host = document.getElementById('workspace-root');
  var screen = new URLSearchParams(root.location.search).get('view') === 'email' ? 'email' : 'today', emailScreen = null;
  var assistantSheet = null, assistantHost = null, disposeLogin = null;
  document.title = 'WholesaleOS | ' + (screen === 'email' ? 'Email' : 'Today');
  var groups = [
    ['Today', [['today', 'Today', 'layout-dashboard', 'Your recorded actions and activity'], ['email', 'Email', 'mail', 'Read messages in your current Email workspace']]],
    ['Find', [['leads', 'Leads', 'house', 'Source records and property evidence'], ['deals', 'Deals', 'handshake', 'Reviewed properties and matching buyers']]],
    ['People', [['buyers', 'Buyers', 'users', 'Recorded buyers and buying criteria'], ['calendar', 'Calendar', 'calendar-days', 'Recorded dates and follow-ups']]],
    ['Close', [['pipeline', 'Pipeline', 'layers', 'Recorded stages and next steps'], ['approvals', 'Approvals', 'list-checks', 'Items waiting for your review']]]
  ];

  function navigation() {
    return '<nav class="ws-nav" aria-label="Main navigation"><section class="ws-nav-group">' +
      '<h2>Today</h2>' + groups[0][1].map(function (item) { return link(item[0], item[1], item[2], item[3]); }).join('') +
      '</section>' + c.button({ label: 'More', icon: 'menu' }).replace('<button ', '<button data-open-more aria-haspopup="dialog" aria-controls="more-tools" title="More" ').replace('class="ws-button ', 'class="ws-button ws-nav-more ') + '</nav>';
  }

  function moreNavigation() {
    return '<nav class="ws-nav" aria-label="More tools">' + groups.slice(1).map(function (group) {
      return '<section class="ws-nav-group"><h2>' + c.escape(group[0]) + '</h2>' + group[1].map(function (item) {
        return link(item[0], item[1], item[2], item[3]);
      }).join('') + '</section>';
    }).join('') + link('settings', 'Settings', 'settings', 'Settings') + '</nav>';
  }

  function link(key, label, icon, help) {
    return '<a href="' + nav.navHref(key) + '"' +
      (key === screen ? ' aria-current="page"' : '') +
      ' data-help="' + c.escape(help) + '">' + c.icon(icon) + '<span>' + c.escape(label) + '</span></a>';
  }

  function clearPrivate() {
    if (disposeLogin) { disposeLogin(); disposeLogin = null; }
    generation++;
    if (assistantSheet) assistantSheet.destroy();
    assistantSheet = null; assistantHost = null;
    if (emailScreen) { emailScreen.destroy(); emailScreen = null; }
    current = null;
    detailWidget = null;
    clearTimeout(helpTimer);
    document.querySelectorAll('dialog[open]').forEach(function (dialog) { dialog.close(); });
    host.replaceChildren();
  }

  function locked(message, classicTools) {
    clearPrivate();
    auth.lockIdentity(app);
    disposeLogin = root.WOSDashboardLogin.mount(host, { message: message, classicTools: classicTools === true, onAuthenticated: function (user) {
      if (user.role !== 'admin') return false;
      auth.applyAuthenticatedUser(app, user); shell(); load(); return true;
    } });
  }

  function shell() {
    clearPrivate();
    host.innerHTML = '<div class="ws-shell' + (screen === 'email' ? ' ws-shell--mail' : '') + '"><aside class="ws-sidebar"><a class="ws-brand" href="/app?preview=1" aria-label="WholesaleOS">' + (screen === 'email' ? 'W' : 'WholesaleOS') + '</a>' + navigation() +
      '<div class="ws-sidebar-footer"><a class="ws-button" href="' + nav.home + '" data-help="Open Today">' + (screen === 'email' ? c.icon('house') + '<span class="ws-sr-only">Home - Today</span>' : 'Home - Today') + '</a></div></aside>' +
      '<div class="ws-workspace' + (screen === 'email' ? ' ws-workspace--mail' : '') + '"><header class="ws-topbar">' +
      c.button({ label: 'Open navigation', icon: 'menu', iconOnly: true, id: 'menu-open' }).replace('ws-button--icon', 'ws-button--icon ws-mobile-menu') +
      '<h1' + (screen === 'email' ? ' class="ws-sr-only"' : '') + '>' + (screen === 'email' ? 'Email' : 'Today') + '</h1>' +
      (screen === 'email' ? '<form class="ws-mail-search" role="search"><label class="ws-sr-only" for="mail-search">Search loaded mail</label>' + c.icon('search') + '<input id="mail-search" type="search" maxlength="300" placeholder="Search loaded mail" autocomplete="off" title="Searches the messages currently loaded; global mail, lead and buyer search is not connected"></form>' : '') + '<div class="ws-topbar-actions">' + c.button({ label: screen === 'email' ? 'Refresh email' : 'Refresh recorded work', icon: 'refresh-cw', iconOnly: true, id: 'refresh', help: 'Reload recorded work without running a batch' }) +
      c.button({ label: 'Account', icon: 'users', iconOnly: true, id: 'account-open' }) +
      '</div></header><div class="ws-help" id="help"' + (screen === 'email' ? ' hidden' : '') + '></div><main class="ws-content" id="today-content" aria-busy="true">' +
      c.skeleton('Loading recorded work') + '</main></div></div>' +
      c.drawer('mobile-nav', 'Navigation') + c.drawer('more-tools', 'More') + c.drawer('account', 'Account') + c.drawer('detail', 'Record');
    var mobile = document.getElementById('mobile-nav'), account = document.getElementById('account'), moreNode = document.getElementById('more-tools');
    moreNode.classList.add('ws-more-tools');
    mobile.querySelector('[data-dialog-body]').innerHTML = navigation();
    moreNode.querySelector('[data-dialog-body]').innerHTML = moreNavigation();
    if (screen === 'email') host.querySelectorAll('[data-help]').forEach(function (element) { element.title = element.dataset.help; });
    account.querySelector('[data-dialog-body]').innerHTML = '<p>Admin session</p>' + c.button({ label: 'Sign out', icon: 'log-out', id: 'signout' });
    var menu = c.bindDialog(mobile), user = c.bindDialog(account), more = c.bindDialog(moreNode);
    mobile.classList.add('ws-mobile-navigation');
    mobile.addEventListener('click', function (event) {
      var bounds = mobile.getBoundingClientRect();
      if (event.target === mobile && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) menu.close();
    });
    mobile.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
      var controls = Array.from(mobile.querySelectorAll('a[href],button:not([disabled])')).filter(function (element) { return element.getClientRects().length; });
      var first = controls[0], last = controls[controls.length - 1];
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    });
    host.querySelectorAll('[data-open-more]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (mobile.open) { menu.close(); document.getElementById('menu-open').focus(); }
        more.open();
      });
    });
    moreNode.addEventListener('click', function (event) {
      if (event.target.closest('a')) { more.close(); return; }
      var bounds = moreNode.getBoundingClientRect();
      if (event.target === moreNode && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) more.close();
    });
    moreNode.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
      var controls = Array.from(moreNode.querySelectorAll('a[href],button:not([disabled])')).filter(function (element) { return element.getClientRects().length; });
      var first = controls[0], last = controls[controls.length - 1];
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    });
    detailWidget = c.bindDialog(document.getElementById('detail'));
    document.getElementById('menu-open').addEventListener('click', menu.open);
    document.getElementById('account-open').addEventListener('click', user.open);
    document.getElementById('signout').addEventListener('click', async function () {
      clearPrivate();
      var result = await auth.logout(app);
      locked(result.ok ? 'Signed out.' : 'Signed out here. Device revocation could not be confirmed. Sign in to review remembered devices.');
    });
    document.getElementById('refresh').addEventListener('click', load);
    var mailSearch = document.getElementById('mail-search');
    if (mailSearch) {
      mailSearch.form.addEventListener('submit', function (event) { event.preventDefault(); });
      mailSearch.addEventListener('input', function () { if (emailScreen) mailSearch.setCustomValidity(emailScreen.search(mailSearch.value) ? '' : 'Use a single-line search up to 300 characters.'); });
    }
  }

  function helpIn(event) {
    if (screen === 'email') return;
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

  function money(value) { return typeof value === 'number' && Number.isFinite(value) ? '$' + Math.round(value).toLocaleString('en-US') : ''; }
  function quantity(value, singular, plural) { var n = Number.isSafeInteger(value) && value >= 0 ? String(value) : 'Unknown'; return n + ' ' + (n === '1' ? singular : plural); }
  function urgencyLabel(group) { return ({ overdue: 'Overdue', due_today: 'Due today', review: 'Needs review', waiting: 'Waiting', upcoming: 'Coming up' })[group] || 'Recorded'; }
  function urgencyTone(group) { return ({ overdue: 'red', due_today: 'amber', review: 'neutral', waiting: 'blue', upcoming: 'neutral' })[group] || 'neutral'; }

  function actionRow(entry, group) {
    var item = entry.action, index = entry.index;
    var detail = [item.label, item.action_label].filter(Boolean);
    if (item.recorded_at) detail.push('Recorded ' + time(item.recorded_at));
    if (item.due_date) detail.push('Due ' + root.wosCardClock.formatDate(item.due_date));
    if (item.waiting_days != null) detail.push('Waiting ' + item.waiting_days + (item.waiting_days === 1 ? ' day' : ' days'));
    else if (item.label === 'Waiting on someone else') detail.push('Waiting time not recorded');
    var label = item.heading || item.label || 'Recorded item';
    return '<li><button type="button" class="ws-today-action ws-today-action--' + group + '" data-row="actions:' + index + '" aria-label="Open ' + c.escape(label + ', ' + (item.action_label || 'record')) + '">' +
      '<span class="ws-today-action-main"><strong>' + c.escape(label) + '</strong><span>' + c.escape(detail.join(' · ')) + '</span>' +
      '</span>' + c.badge(urgencyLabel(group), urgencyTone(group)) + c.icon('arrow-up-right') + '</button></li>';
  }

  function actionGroup(group, entries, title) {
    if (!entries.length) return '';
    return '<section class="ws-today-group" data-urgency-group="' + group + '"><header><h3>' + title + '</h3>' + c.badge(String(entries.length), urgencyTone(group)) + '</header><ul class="ws-list">' +
      entries.map(function (entry) { return actionRow(entry, group); }).join('') + '</ul></section>';
  }

  function bestDeal(item) {
    var facts = [];
    if (money(item.asking)) facts.push('<span>Asking ' + c.escape(money(item.asking)) + '</span>');
    if (item.value_range && money(item.value_range.low) && money(item.value_range.high)) {
      facts.push('<span>Reviewed value ' + c.escape(money(item.value_range.low)) + ' to ' + c.escape(money(item.value_range.high)) + ' (' + count(item.comp_count) + ' comps)</span>');
    }
    if (money(item.spread)) facts.push('<span>Estimated spread ' + c.escape(money(item.spread)) + ' before closing costs</span>');
    if (Number.isSafeInteger(item.buyer_count) && item.buyer_count >= 0) facts.push('<span>' + count(item.buyer_count) + ' approved buyers match</span>');
    if (item.deadline) facts.push('<span>Deadline ' + c.escape(root.wosCardClock.formatDate(item.deadline)) + '</span>');
    var heading = item.heading || item.location || 'Property details needed', href = nav.recordHref(item.ref);
    var body = '<strong class="ws-today-deal-heading">' + c.escape(heading) + '</strong><span class="ws-today-deal-facts">' + facts.join('') + '</span>';
    return '<li>' + (href ? '<a class="ws-today-deal" href="' + c.escape(href) + '" aria-label="Open best deal: ' + c.escape(heading) + '">' + body + '</a>' :
      '<button type="button" class="ws-today-deal" data-best-deal="' + c.escape(item.id || '') + '" aria-label="Review best deal: ' + c.escape(heading) + '">' + body + '</button>') + '</li>';
  }

  function activityRow(item, index) {
    var when = time(item.at);
    var title = item.label || 'Recorded activity';
    var body = '<span><strong>' + c.escape(title) + '</strong><small>' + c.escape(when || 'Recorded time not available') +
      '</small></span>' + c.badge(item.source_kind === 'verified_release_record' ? 'Verified release' : 'Reported activity', 'green');
    if (item.source_url) return '<li><a class="ws-today-event" href="' + c.escape(item.source_url) + '" target="_blank" rel="noopener noreferrer">' + body + '</a></li>';
    return '<li><button type="button" class="ws-today-event" data-row="activity:' + index + '">' + body + c.icon('arrow-up-right') + '</button></li>';
  }

  function pendingPanel(pending) {
    if (!pending) return '<section class="ws-today-panel ws-today-pending"><header><h2>Hey Gabriel</h2></header>' + c.empty('Pending summary unavailable', 'Refresh recorded work to check pending items.') + '</section>';
    function pendingRow(item, group, index) {
      var detail = [item.reason];
      if (item.due_date) detail.push('Due ' + root.wosCardClock.formatDate(item.due_date));
      if (item.waiting_since) detail.push('Waiting since ' + time(item.waiting_since));
      return '<li><button type="button" class="ws-row-button" data-pending-group="' + group + '" data-pending-index="' + index + '" aria-label="Review ' + c.escape(item.heading || item.label) + '">' +
        '<span class="ws-row-main"><strong>' + c.escape(item.heading || item.label) + '</strong><span>' + c.escape(detail.filter(Boolean).join(' · ')) + '</span></span>' + c.icon('arrow-up-right') + '</button></li>';
    }
    return '<section class="ws-today-panel ws-today-pending"><header><h2>Hey Gabriel</h2>' + c.badge('Recorded pending work', 'blue') + '</header><div class="ws-pending-grid">' +
      [['drafts', 'Drafts not sent'], ['waiting', 'Waiting on others'], ['bounced', 'Bounces reported'], ['reminders', "Don't forget"]].map(function (entry) {
        var items = Array.isArray(pending[entry[0]]) ? pending[entry[0]] : null;
        return '<section><header><h3>' + entry[1] + '</h3>' + c.badge(items ? String(items.length) : 'Unavailable', entry[0] === 'bounced' ? 'red' : 'neutral') + '</header>' +
          (items && items.length ? '<ul class="ws-list">' + items.slice(0, 5).map(function (item, i) { return pendingRow(item, entry[0], i); }).join('') + '</ul>' +
            (items.length > 5 ? '<details><summary>' + (items.length - 5) + ' more</summary><ul class="ws-list">' + items.slice(5).map(function (item, i) { return pendingRow(item, entry[0], i + 5); }).join('') + '</ul></details>' : '') :
            '<p class="ws-muted">' + (items ? 'None in the connected records.' : 'Not available.') + '</p>') + '</section>';
      }).join('') + '</div><p class="ws-muted ws-pending-coverage">Saved drafts and conversation reminders only. Bounces are recorded reports; current mailbox delivery status is not connected.</p></section>';
  }

  function render() {
    var data = current, content = document.getElementById('today-content');
    if (!content || !data) return;
    if (assistantHost) assistantHost.remove();
    var groups = root.WOSTodayModel.groupActions(data.actions, data.today), events = data.last_24h.slice(0, pageSize);
    content.setAttribute('aria-busy', 'false');
    var actionCount = data.actions.length;
    content.innerHTML = '<section class="ws-today"><header class="ws-today-header"><div><h2>Today</h2><p>Updated ' + c.escape(time(data.now)) + '</p></div>' +
      '<div class="ws-today-stats">' + c.badge(quantity(data.counts.replies, 'reply waiting', 'replies waiting'), 'blue') + c.badge(quantity(data.counts.approvals, 'approval', 'approvals'), 'neutral') +
      c.badge(quantity(data.counts.followups, 'follow-up due', 'follow-ups due'), 'amber') + c.badge(quantity(data.counts.deadlines, 'deadline this week', 'deadlines this week'), 'neutral') + '</div></header>' +
      pendingPanel(data.pending) + '<div class="ws-today-grid"><section class="ws-today-panel ws-today-queue"><header><h2>Your action queue</h2>' + c.badge(String(actionCount) + ' open', actionCount ? 'blue' : 'neutral') + '</header>' +
      (actionCount ? actionGroup('overdue', groups.overdue, 'Overdue') + actionGroup('due_today', groups.due_today, 'Due today') + actionGroup('review', groups.review, 'Needs review') +
        actionGroup('waiting', groups.waiting, 'Waiting on someone else') + actionGroup('upcoming', groups.upcoming, 'Coming up') : c.empty('No open work recorded', 'Replies, approvals, follow-ups and deal deadlines will appear here.')) + '</section>' +
      '<section class="ws-today-panel ws-today-best"><header><h2>Best deals</h2>' + c.badge(String(data.best_deals.length), 'green') + '</header><ul class="ws-list">' +
      (data.best_deals.map(bestDeal).join('') || '<li>' + c.empty('No reviewed deals are ready yet', 'Deals appear here after review and buyer-match checks.') + '</li>') + '</ul></section>' +
      '<section class="ws-today-panel ws-today-activity"><header><h2>Last 24 hours</h2>' + c.badge(String(data.last_24h.length), 'neutral') + '</header><ul class="ws-list">' +
      (events.map(activityRow).join('') || '<li>' + c.empty('No activity recorded in the last 24 hours', 'Recorded changes will appear here.') + '</li>') +
      (data.last_24h.length > events.length ? '<li>' + c.button({ label: 'Show more activity', id: 'more-activity', icon: 'chevron-down' }) + '</li>' : '') + '</ul></section></div></section>';
    content.querySelectorAll('[data-row]').forEach(function (button) {
      button.addEventListener('click', function () {
        var parts = button.dataset.row.split(':'), list = parts[0] === 'actions' ? data.actions : data.last_24h;
        openRecord(list[Number(parts[1])]);
      });
    });
    content.querySelectorAll('[data-pending-group]').forEach(function (button) {
      button.addEventListener('click', function () { openRecord(data.pending[button.dataset.pendingGroup][Number(button.dataset.pendingIndex)]); });
    });
    var more = document.getElementById('more-activity');
    if (more) more.addEventListener('click', function () { pageSize += 25; render(); more = document.getElementById('more-activity'); if (more) more.focus(); });
    content.querySelectorAll('[data-best-deal]').forEach(function (button) {
      button.addEventListener('click', function () { var deal = data.best_deals.find(function (item) { return item.id === button.dataset.bestDeal; }); if (deal) openRecord(deal); });
    });
    if (data.capabilities && data.capabilities.assistant_snapshot_import === true && root.WOSAssistantSheet) {
      if (!assistantHost) {
        content.querySelector('.ws-today').hidden = true;
        assistantHost = document.createElement('div'); assistantHost.id = 'assistant-slot'; content.prepend(assistantHost);
        function revealRecorded(scroll) { var recorded = content.querySelector('.ws-today'); if (recorded) { recorded.hidden = false; if (scroll) recorded.scrollIntoView({ block: 'start' }); } }
        assistantSheet = root.WOSAssistantSheet.create({ host: assistantHost, onReady: function () { revealRecorded(false); }, onRecordedWork: function () { revealRecorded(true); }, onUnauthorized: function () { locked('Your session expired. Unlock to continue.'); } });
        assistantSheet.refresh();
      } else content.prepend(assistantHost);
    }
  }

  function openRecord(item) {
    var dialog = document.getElementById('detail'), body = dialog.querySelector('[data-dialog-body]');
    var refs = item.conversation?.refs || [item.ref], links = refs.map(nav.recordHref).filter(Boolean);
    body.innerHTML = '<h3>' + c.escape(item.heading || item.label || 'Recorded item') + '</h3><p>' + c.escape(item.label || item.grade || 'Recorded work') + '</p>' +
      (item.reason ? '<p>' + c.escape(item.reason) + '</p>' : '') + '<dl class="ws-detail"><div><dt>Source</dt><dd>' + c.escape(item.source_kind === 'recorded_activity' ? 'Recorded activity' : item.source_kind === 'verified_release_record' ? 'Verified release record' : 'Recorded workflow') +
      '</dd></div><div><dt>Recorded</dt><dd>' + c.escape(time(item.recorded_at || item.at)) + '</dd></div></dl>' +
      links.map(function (href) { return '<a class="ws-button" href="' + href + '">Open full record' + c.icon('arrow-up-right') + '</a>'; }).join('') +
      (!links.length ? '<p class="ws-muted">No unique property or buyer reference is attached. Open the relevant workspace to review the source record.</p>' : '');
    detailWidget.open();
  }

  async function load() {
    if (screen === 'email') {
      if (!app.unlocked) return;
      if (!emailScreen) emailScreen = root.WOSEmailScreen.create({ host: document.getElementById('today-content'), onUnauthorized: function () { locked('Your session expired. Unlock to continue.'); } });
      return emailScreen.refresh();
    }
    var sequence = ++generation, content = document.getElementById('today-content');
    if (!content || !app.unlocked) return;
    if (assistantSheet) assistantSheet.destroy();
    assistantSheet = null; assistantHost = null;
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
      content.innerHTML = c.empty('Recorded work is unavailable', 'Try loading your recorded work again.') + c.button({ label: 'Retry', icon: 'refresh-cw', id: 'today-retry' });
      content.querySelector('#today-retry').addEventListener('click', load);
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
    if (result.user.role !== 'admin') return locked('This workspace requires an admin session.', true);
    shell();
    load();
  });
})(window);
