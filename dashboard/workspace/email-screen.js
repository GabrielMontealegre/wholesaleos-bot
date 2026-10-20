'use strict';
(function (root) {
  var c = root.WOSComponents, model = root.WOSEmailModel;
  var extraFolders = { drafts: 'Drafts', starred: 'Starred', buyers: 'WOS/Buyers', jv_deals: 'WOS/JV Deals', lead_alerts: 'WOS/Lead Alerts', title: 'WOS/Title', templates: 'WOS/Templates', bounced: 'WOS/Bounced', billing: 'WOS/Billing' };
  function create(options) {
    var host = options.host, state = { folder: 'inbox', category: 'people', threads: [], unavailable: [], selected: '', body: [], busy: false, error: '', composing: false };
    var sequence = 0, folderSequence = 0, metadataBusy = false, disposed = false, drafts = new Map();
    function now() { return options.now ? options.now() : new Date().toISOString(); }
    function time(value) { return root.wosCardClock.formatTime(value, now()); }
    function visible() { return state.threads.filter(function (thread) { return thread.category === state.category; }); }
    function chosen() { return state.threads.find(function (thread) { return thread.key === state.selected; }); }
    function gmail() {
      var thread = chosen(), key = thread && thread.latest.threadId;
      var folder = ['inbox', 'sent', 'drafts', 'starred'].includes(state.folder) ? state.folder : 'label/' + encodeURIComponent(extraFolders[state.folder] || '');
      return 'https://mail.google.com/mail/u/0/#' + folder + (/^[a-f0-9]{8,64}$/i.test(key || '') ? '/' + key : '');
    }
    function roleChip(role) { return c.roleBadge(role); }
    function remember() {
      var form = host.querySelector('.ws-composer');
      if (form && state.selected) drafts.set(state.selected, { to: form.elements.to.value, subject: form.elements.subject.value, body: form.elements.body.value });
    }
    function bodyMarkup() {
      if (!chosen()) return c.empty('Select a conversation', 'Choose a message to read it.');
      if (!state.body.length) return state.busy ? c.skeleton('Loading conversation') : c.empty('Message unavailable', 'Refresh the folder or open it in Gmail.');
      return state.body.map(function (message, index) {
        var header = '<strong>' + c.escape(message.from || 'Sender not recorded') + '</strong><time>' + c.escape(time(message.date)) + '</time>';
        var content = '<p class="ws-mail-body">' + c.escape(message.body || '(No readable text)') + '</p>';
        return index === state.body.length - 1 ? '<article class="ws-mail-message"><header>' + header + '</header>' + content + '</article>' :
          '<details class="ws-mail-earlier"><summary aria-keyshortcuts="e">' + header + c.icon('chevron-down') + '</summary>' + content + '</details>';
      }).join('');
    }
    function paint() {
      if (disposed) return;
      host.classList.add('ws-content--mail');
      host.setAttribute('aria-busy', String(state.busy));
      var thread = chosen(), items = visible();
      host.innerHTML = '<section class="ws-mail' + (thread ? ' ws-mail--open' : '') + (state.composing ? ' ws-mail--composing' : '') + '" aria-label="Email workspace">' +
        '<header class="ws-mail-toolbar"><div class="ws-mail-folders" role="group" aria-label="Email folders">' + ['inbox', 'sent'].map(function (folder) {
          return '<button type="button" class="ws-button" data-mail-folder="' + folder + '" aria-pressed="' + (state.folder === folder) + '">' + (folder === 'inbox' ? 'Inbox' : 'Sent') + '</button>';
        }).join('') + '<select aria-label="Other email folders" data-mail-folder-select><option value="">More folders</option>' + Object.keys(extraFolders).map(function (key) { return '<option value="' + key + '"' + (key === state.folder ? ' selected' : '') + '>' + extraFolders[key] + '</option>'; }).join('') + '</select></div>' + c.tabs('mail', [{ key: 'people', label: 'People' }, { key: 'alerts', label: 'Alerts' }], state.category) + '</header>' +
        '<p class="ws-mail-status" role="status">' + c.escape(state.error || (state.busy ? 'Loading email...' : 'Latest ' + state.threads.reduce(function (sum, row) { return sum + row.messages.length; }, 0) + ' messages in this folder')) +
        (state.unavailable.length ? ' / ' + state.unavailable.length + ' references need a refresh' : '') + '</p>' +
        '<div class="ws-mail-panes"><section class="ws-mail-list" id="mail-panel-' + state.category + '" role="tabpanel" aria-labelledby="mail-' + state.category + '" aria-label="Email conversations">' +
        items.map(function (row) { return '<button type="button" class="ws-mail-row' + (row.unread ? ' ws-mail-row--unread' : '') + '" data-mail-key="' + c.escape(row.key) + '" aria-pressed="' + (row.key === state.selected) + '">' +
          '<span class="ws-mail-row-top"><strong>' + c.escape(row.sender) + '</strong><time>' + c.escape(time(row.latest.date)) + '</time></span><span class="ws-mail-subject">' + c.escape(row.latest.subject || '(No subject)') + '</span><span>' + roleChip(row.role) + (row.messages.length > 1 ? ' ' + row.messages.length + ' messages' : '') + '</span></button>'; }).join('') +
        (!items.length && !state.busy ? c.empty(state.error ? 'Email unavailable' : 'No conversations in this view', state.error ? 'Use Refresh or open Gmail.' : 'Check the other view or folder.') : '') +
        '</section><section class="ws-mail-reading" aria-label="Open conversation">' +
        '<header class="ws-mail-reading-head">' + (thread ? c.button({ label: 'Back to messages', icon: 'chevron-down', id: 'mail-back' }) + '<h2>' + c.escape(thread.latest.subject || '(No subject)') + '</h2>' + roleChip(thread.role) : '') +
        '<div class="ws-mail-reading-actions">' + (thread ? c.button({ label: 'Reply', icon: 'mail', id: 'mail-reply', disabled: !state.body.length || state.busy }) : '') +
        '<a class="ws-button" href="' + gmail() + '" target="_blank" rel="noopener noreferrer">Open in Gmail' + c.icon('arrow-up-right') + '</a></div></header>' +
        '<div class="ws-mail-thread">' + bodyMarkup() + '</div>' +
        (thread && state.composing ? '<section class="ws-mail-composer" aria-label="Reply composer"><header><h3>Reply</h3>' + c.button({ label: 'Close reply', icon: 'x', iconOnly: true, id: 'mail-close-reply' }) + '</header>' + c.composer('mail-draft') +
          '<p class="ws-muted">Not sent. Reply sending is unavailable; use Gmail.</p></section>' : '') + '</section>' +
        '<section id="mail-panel-' + (state.category === 'people' ? 'alerts' : 'people') + '" role="tabpanel" aria-labelledby="mail-' + (state.category === 'people' ? 'alerts' : 'people') + '" hidden></section></div></section>';
      // The tab controller switches the list projection, not a second nested pane.
      host.querySelectorAll('[data-tab]').forEach(function (button) {
        function select(key) { remember(); sequence++; state.category = key; state.selected = ''; state.body = []; state.composing = false; state.busy = metadataBusy; paint(); host.querySelector('[data-tab="' + key + '"]').focus(); }
        button.addEventListener('click', function () { select(button.dataset.tab); });
        button.addEventListener('keydown', function (event) { if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) { event.preventDefault(); select(event.key === 'Home' ? 'people' : event.key === 'End' ? 'alerts' : button.dataset.tab === 'people' ? 'alerts' : 'people'); } });
      });
      host.querySelectorAll('[data-mail-folder]').forEach(function (button) {
        button.addEventListener('click', function () { if (state.folder !== button.dataset.mailFolder) { remember(); state.folder = button.dataset.mailFolder; state.category = 'people'; load(); } });
      });
      host.querySelectorAll('[data-mail-key]').forEach(function (button) { button.addEventListener('click', function () { open(button.dataset.mailKey); }); });
      host.querySelector('[data-mail-folder-select]').addEventListener('change', function (event) { if (Object.hasOwn(extraFolders, event.target.value)) { remember(); state.folder = event.target.value; state.category = 'people'; load(); } });
      var back = host.querySelector('#mail-back');
      if (back) back.addEventListener('click', function () { remember(); sequence++; state.busy = metadataBusy; state.selected = ''; state.body = []; state.composing = false; paint(); var first = host.querySelector('.ws-mail-row'); if (first) first.focus(); });
      var reply = host.querySelector('#mail-reply');
      if (reply) { reply.setAttribute('aria-keyshortcuts', 'r'); reply.addEventListener('click', function () { remember(); state.composing = true; paint(); host.querySelector('[name="body"]').focus(); }); }
      var form = host.querySelector('.ws-composer');
      if (form) {
        var draft = drafts.get(state.selected);
        var latestBody = state.body[state.body.length - 1];
        form.elements.to.value = draft ? draft.to : thread.latest.direction === 'out' ? latestBody.to || '' : thread.latest.direction === 'in' ? latestBody.from || '' : '';
        form.elements.subject.value = draft ? draft.subject : (/^re:/i.test(thread.latest.subject || '') ? thread.latest.subject : 'Re: ' + (thread.latest.subject || '(No subject)'));
        form.elements.body.value = draft ? draft.body : '';
        form.elements.to.type = 'text';
        form.querySelector('.ws-check').hidden = true;
        c.bindComposer(form);
        form.querySelector('footer').insertAdjacentHTML('afterbegin', '<a class="ws-button" href="' + gmail() + '" target="_blank" rel="noopener noreferrer">Open in Gmail' + c.icon('arrow-up-right') + '</a>');
        host.querySelector('#mail-close-reply').addEventListener('click', function () { remember(); state.composing = false; paint(); host.querySelector('#mail-reply').focus(); });
      }
    }
    async function request(url, ticket, folderRead) {
      var response = await root.fetch(url, { credentials: 'include', cache: 'no-store' });
      if (disposed || ticket !== (folderRead ? folderSequence : sequence)) return null;
      if (response.status === 401 || response.status === 403) { destroy(); options.onUnauthorized(); return null; }
      if (!response.ok) throw Error('unavailable');
      var value = await response.json();
      return disposed || ticket !== (folderRead ? folderSequence : sequence) ? null : value;
    }
    async function load() {
      // Changing People/Alerts cancels body selection, not this folder's metadata.
      var ticket = ++folderSequence;
      sequence++; metadataBusy = true;
      state.threads = []; state.unavailable = []; state.selected = ''; state.body = []; state.composing = false; state.busy = true; state.error = ''; paint();
      try {
        var value = await request('/api/gmail/messages?folder=' + state.folder + '&limit=30', ticket, true);
        if (!value) return;
        if (value.ok !== true) throw Error('unavailable');
        var projected = model.list(value.messages, { now: now() });
        state.threads = projected.threads; state.unavailable = projected.unavailable;
      } catch (_) { if (ticket === folderSequence && !disposed) state.error = 'Email could not be loaded.'; }
      finally { if (ticket === folderSequence && !disposed) { metadataBusy = false; state.busy = false; paint(); } }
    }
    async function open(key) {
      remember();
      var thread = state.threads.find(function (row) { return row.key === key; });
      if (!thread) return;
      var ticket = ++sequence;
      state.selected = key; state.body = []; state.composing = false; state.busy = true; state.error = ''; paint();
      var ids = thread.messages.map(function (row) { return row.id; });
      try {
        var value = await request(ids.length === 1 ? '/api/gmail/message/' + encodeURIComponent(ids[0]) : '/api/gmail/thread?ids=' + encodeURIComponent(JSON.stringify(ids)), ticket);
        if (!value) return;
        var messages = Array.isArray(value.messages) ? value.messages : [value];
        if (messages.length !== ids.length || messages.some(function (row) { return !row || !ids.includes(row.id) || row.source_kind !== 'connected_mailbox' || typeof row.body !== 'string'; }) || new Set(messages.map(function (row) { return row.id; })).size !== ids.length) throw Error('invalid');
        // Body transport order cannot change the canonical metadata chronology.
        state.body = ids.map(function (id) { return messages.find(function (row) { return row.id === id; }); });
      } catch (_) { if (ticket === sequence && !disposed) state.error = 'This conversation could not be read. Your list is still available.'; }
      finally { if (ticket === sequence && !disposed) { state.busy = false; paint(); var heading = host.querySelector('.ws-mail-reading-head h2'); if (heading) { heading.tabIndex = -1; heading.focus(); } } }
    }
    function keydown(event) {
      if (!disposed && event.key === 'Escape' && state.composing && !event.target.closest('dialog')) { event.preventDefault(); remember(); state.composing = false; paint(); host.querySelector('#mail-reply').focus(); return; }
      if (disposed || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,textarea,select,dialog,[contenteditable=true]')) return;
      var items = visible(), index = items.findIndex(function (row) { return row.key === state.selected; });
      if (event.key === 'j' || event.key === 'k') { var next = index < 0 ? 0 : Math.max(0, Math.min(items.length - 1, index + (event.key === 'j' ? 1 : -1))); if (items[next]) { event.preventDefault(); open(items[next].key); } }
      else if (event.key === 'r' && host.querySelector('#mail-reply') && !host.querySelector('#mail-reply').disabled) { event.preventDefault(); host.querySelector('#mail-reply').click(); }
      else if (event.key === 'e') { event.preventDefault(); var earlier = host.querySelectorAll('.ws-mail-earlier'); earlier.forEach(function (item) { item.open = !item.open; }); }
    }
    function beforeUnload(event) { remember(); if (Array.from(drafts.values()).some(function (draft) { return draft.body.trim(); })) { event.preventDefault(); event.returnValue = ''; } }
    function destroy() { disposed = true; sequence++; folderSequence++; metadataBusy = false; drafts.clear(); state.threads = []; state.body = []; host.classList.remove('ws-content--mail'); document.removeEventListener('keydown', keydown); root.removeEventListener('beforeunload', beforeUnload); host.replaceChildren(); }
    document.addEventListener('keydown', keydown);
    root.addEventListener('beforeunload', beforeUnload);
    return { mount: load, refresh: function () { remember(); return load(); }, destroy: destroy };
  }
  root.WOSEmailScreen = { create: create };
})(window);
