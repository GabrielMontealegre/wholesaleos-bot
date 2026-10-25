'use strict';
(function (root) {
  var c = root.WOSComponents, model = root.WOSEmailModel, layout = root.WOSMailLayoutModel;
  var categories = [{ key: 'primary', label: 'Primary' }, { key: 'buyers', label: 'Buyers' }, { key: 'sellers_agents', label: 'Sellers & agents' }, { key: 'alerts', label: 'Alerts' }, { key: 'reports', label: 'WOS reports' }];
  var roleNames = { buyer: 'Buyer', seller: 'Seller / owner', holder: 'JV partner', partner: 'JV partner', title: 'Title', attorney: 'Attorney', lender: 'Lender', agent: 'Agent', other: 'Other' };
  var extraFolders = { drafts: 'Drafts', starred: 'Starred', buyers: 'WOS/Buyers', jv_deals: 'WOS/JV Deals', lead_alerts: 'WOS/Lead Alerts', title: 'WOS/Title', templates: 'WOS/Templates', bounced: 'WOS/Bounced', billing: 'WOS/Billing' };
  function create(options) {
    var host = options.host, state = { folder: 'inbox', category: 'primary', messages: [], threads: [], unavailable: [], selected: '', body: [], busy: false, error: '', composing: false, query: '', role: '', contextOpen: false };
    var sequence = 0, folderSequence = 0, metadataBusy = false, disposed = false, drafts = new Map(), outcomes = new Map(), replyBinding = null;
    var selectedRows = new Set(), openedSnippets = new Map();
    function now() { return options.now ? options.now() : new Date().toISOString(); }
    function time(value) { return root.wosCardClock.formatTime(value, now()); }
    function projection() { return layout.project(state.messages, { now: now(), category: state.category, query: state.query, role: state.role, openedSnippets: openedSnippets }); }
    function visible() { return projection().rows; }
    function chosen() { return state.threads.find(function (thread) { return thread.key === state.selected; }); }
    function gmail() {
      var thread = chosen(), key = thread && thread.latest.threadId;
      var folder = ['inbox', 'sent', 'drafts', 'starred'].includes(state.folder) ? state.folder : 'label/' + encodeURIComponent(extraFolders[state.folder] || '');
      return 'https://mail.google.com/mail/u/0/#' + folder + (/^[a-f0-9]{8,64}$/i.test(key || '') ? '/' + key : '');
    }
    function roleChip(role) { return c.roleBadge(role); }
    function unavailable(label, icon) {
      return '<span class="ws-mail-unavailable" title="Not available yet: open in Gmail">' + c.button({ label: label, icon: icon, iconOnly: true, disabled: true, help: 'Not available yet: open in Gmail' }) + '</span>';
    }
    function folderMarkup() {
      var folders = [['inbox', 'Inbox', 'inbox'], ['starred', 'Starred', 'star'], ['sent', 'Sent', 'send'], ['drafts', 'Drafts', 'mail'], ['bounced', 'Bounces', 'mail']];
      var labels = [['buyer', 'Buyers'], ['seller', 'Sellers / owners'], ['jv', 'JV partners'], ['title', 'Title'], ['attorney', 'Attorneys'], ['lender', 'Lenders'], ['agent', 'Agents']];
      return '<div class="ws-mail-compose-entry">' + unavailable('Compose', 'mail') + '</div>' +
        '<div role="group" aria-label="Email folders">' + folders.map(function (folder) { return '<button type="button" class="ws-mail-folder" data-mail-folder="' + folder[0] + '" aria-pressed="' + (state.folder === folder[0]) + '" title="' + folder[1] + '">' + c.icon(folder[2]) + '<span>' + folder[1] + '</span></button>'; }).join('') +
        '<label class="ws-mail-extra"><span class="ws-sr-only">Other email folders</span><select aria-label="Other email folders" data-mail-folder-select><option value="">More folders</option>' + Object.keys(extraFolders).map(function (key) { return '<option value="' + key + '"' + (key === state.folder ? ' selected' : '') + '>' + extraFolders[key] + '</option>'; }).join('') + '</select></label></div>' +
        '<h3 class="ws-mail-label-heading" title="Filters only the messages currently loaded">Labels in loaded mail</h3><div role="group" aria-label="Recorded person roles">' + labels.map(function (entry) {
          return '<button type="button" class="ws-mail-folder" data-mail-role="' + entry[0] + '" aria-pressed="' + (state.role === entry[0]) + '" title="' + entry[1] + ' in loaded mail"><span class="ws-mail-label-dot ws-role--' + (entry[0] === 'jv' ? 'partner' : entry[0]) + '" aria-hidden="true"></span><span>' + entry[1] + '</span></button>';
        }).join('') + '<button type="button" class="ws-mail-folder" data-mail-category="reports" title="Explicit report labels in loaded mail"><span class="ws-mail-label-dot ws-role--agent" aria-hidden="true"></span><span>WOS Action</span></button></div>';
    }
    function rowMarkup(row) {
      var role = roleNames[row.role] || 'Role not recorded';
      return '<div class="ws-mail-row-wrap"><input type="checkbox" data-mail-select="' + c.escape(row.key) + '" aria-label="Select conversation from ' + c.escape(row.sender) + '"' + (selectedRows.has(row.key) ? ' checked' : '') + '>' +
        '<span class="ws-mail-star">' + unavailable('Star state and changes unavailable', 'star') + '</span>' +
        '<button type="button" class="ws-mail-row' + (row.unread ? ' ws-mail-row--unread' : '') + '" data-mail-key="' + c.escape(row.key) + '" aria-pressed="' + (row.key === state.selected) + '" title="' + c.escape(role) + '">' +
        '<strong class="ws-mail-sender">' + c.escape(row.sender) + (row.messages.length > 1 ? '<small> ' + row.messages.length + '</small>' : '') + '</strong>' +
        '<span class="ws-mail-subject">' + c.escape(row.latest.subject || '(No subject)') + (row.snippet ? ' <span class="ws-mail-snippet"> - ' + c.escape(row.snippet) + '</span>' : '') + '</span><time>' + c.escape(time(row.latest.date)) + '</time></button></div>';
    }
    function contextMarkup(thread) {
      var records = thread && thread.role && thread.latest.link_status === 'linked' && thread.latest.conversation && thread.latest.conversation.records;
      var record = Array.isArray(records) && records.length === 1 ? records[0] : null;
      var href = record && ['deal', 'buyer'].includes(record.kind) && typeof record.id === 'string' && record.id.length > 0 && record.id.length <= 200 && !/[\x00-\x1f\x7f]/.test(record.id) ? root.WOSWorkspaceNavigation.recordHref(record.ref) : '';
      return '<aside class="ws-mail-context" aria-label="Conversation context"' + (state.contextOpen ? '' : ' hidden') + '><header><h3>Conversation context</h3>' + c.button({ label: 'Close conversation context', icon: 'x', iconOnly: true, id: 'mail-context-close' }) + '</header>' +
        (thread ? roleChip(thread.role) : '') + '<p class="ws-muted">' + (thread && thread.role ? 'Role comes from the linked recorded conversation.' : 'A person role has not been recorded.') + '</p>' +
        (href ? '<a class="ws-button" href="' + c.escape(href) + '">Open linked record' + c.icon('arrow-up-right') + '</a>' : '<p class="ws-muted">No unique record link is available.</p>') + '</aside>';
    }
    function remember() {
      var form = host.querySelector('.ws-composer');
      if (form && state.selected) drafts.set(state.selected, { to: form.elements.to.value, cc: form.elements.cc.value, subject: form.elements.subject.value, body: form.elements.body.value });
    }
    function bodyMarkup() {
      if (!chosen()) return c.empty('Select a conversation', 'Choose a message to read it.');
      if (!state.body.length) return state.busy ? c.skeleton('Loading conversation') : c.empty('Message unavailable', 'Refresh the folder or open it in Gmail.');
      return state.body.map(function (message, index) {
        var header = '<strong>' + c.escape(message.from || 'Sender not recorded') + '</strong><time>' + c.escape(time(message.date)) + '</time>';
        var content = '<p class="ws-mail-body">' + c.escape(message.body || '(No readable text)') + '</p>';
        var metadata = chosen().messages.find(function (row) { return row.id === message.id; });
        var attachments = layout.attachmentManifest(metadata, message, { now: now() });
        if (attachments && attachments.length) content += '<section class="ws-mail-attachments" aria-label="Message attachments"><h3>Attachments</h3><ul>' + attachments.map(function (part) {
          return '<li>' + c.badge(part.filename || 'Name not recorded', 'neutral') + '<p class="ws-muted">' + c.escape([
            part.content_type ? 'Reported type: ' + part.content_type : 'Type not recorded',
            part.size_bytes === null ? 'Size not recorded' : part.size_bytes.toLocaleString('en-US') + ' bytes',
            part.disposition === 'inline' || part.related === true ? 'Inline content' : ''
          ].filter(Boolean).join(' | ')) + '</p></li>';
        }).join('') + '</ul></section>';
        return index === state.body.length - 1 ? '<article class="ws-mail-message"><header>' + header + '</header>' + content + '</article>' :
          '<details class="ws-mail-earlier"><summary aria-keyshortcuts="e">' + header + c.icon('chevron-down') + '</summary>' + content + '</details>';
      }).join('');
    }
    function paint() {
      if (disposed) return;
      if (replyBinding) { replyBinding.destroy(); replyBinding = null; }
      host.classList.add('ws-content--mail');
      host.setAttribute('aria-busy', String(state.busy));
      var thread = chosen(), view = projection(), items = view.rows;
      host.innerHTML = '<section class="ws-mail' + (thread ? ' ws-mail--open' : '') + (state.composing ? ' ws-mail--composing' : '') + '" aria-label="Email workspace">' +
        '<aside class="ws-mail-rail" aria-label="Mail folders and labels">' + folderMarkup() + c.button({ label: 'Mail labels', icon: 'users', iconOnly: true, id: 'mail-labels-open' }) + '</aside><div class="ws-mail-canvas"><header class="ws-mail-toolbar"><div class="ws-mail-list-tools">' +
        c.button({ label: 'Mail folders', icon: 'folder', iconOnly: true, id: 'mail-folders-open' }) + '<label class="ws-mail-select-all" title="Select conversations in this loaded view"><input type="checkbox" id="mail-select-all" aria-label="Select all loaded conversations"' + (!items.length ? ' disabled' : '') + '></label>' +
        c.button({ label: 'Refresh mailbox', icon: 'refresh-cw', iconOnly: true, id: 'mail-refresh' }) + '<span class="ws-mail-selection" aria-live="polite"></span><span class="ws-mail-range"' + (state.busy || state.error ? ' hidden' : '') + ' title="Only loaded threads; the full folder total is unavailable">' + view.range.start + '-' + view.range.end + ' of ' + view.range.total + ' loaded</span>' +
        unavailable('Newer mail unavailable', 'chevron-left') + unavailable('Older mail unavailable', 'chevron-right') + '</div>' + c.tabs('mail', categories, state.category) + '</header>' +
        '<p class="ws-mail-status" role="status" data-mail-status-important="' + Boolean(state.error || state.busy || state.unavailable.length) + '">' + c.escape(state.error || (state.busy ? 'Loading email...' : 'Latest ' + state.threads.reduce(function (sum, row) { return sum + row.messages.length; }, 0) + ' messages in this folder')) +
        (state.unavailable.length ? ' / ' + state.unavailable.length + ' references need a refresh' : '') + '</p>' +
        '<div class="ws-mail-panes"><section class="ws-mail-list" id="mail-panel-' + state.category + '" role="tabpanel" aria-labelledby="mail-' + state.category + '" aria-label="Email conversations">' +
        items.map(rowMarkup).join('') +
        (!items.length && !state.busy ? c.empty(state.error ? 'Email unavailable' : 'No conversations in this view', state.error ? 'Use Refresh or open Gmail.' : 'Check the other view or folder.') : '') +
        '</section><section class="ws-mail-reading" aria-label="Open conversation">' +
        '<header class="ws-mail-reading-head">' + (thread ? c.button({ label: 'Back to messages', icon: 'chevron-down', iconOnly: true, id: 'mail-back' }) + '<div class="ws-mail-heading"><h2>' + c.escape(thread.latest.subject || '(No subject)') + '</h2>' + roleChip(thread.role) + '</div>' : '') +
        '<div class="ws-mail-reading-actions">' + (thread ? c.button({ label: 'Conversation context', icon: 'users', iconOnly: true, id: 'mail-context' }) : '') + '<a class="ws-button" href="' + gmail() + '" target="_blank" rel="noopener noreferrer">Open in Gmail' + c.icon('arrow-up-right') + '</a></div></header>' +
        '<div class="ws-mail-thread">' + bodyMarkup() +
        (thread && !state.composing ? '<footer class="ws-mail-reply-actions">' + c.button({ label: 'Reply', icon: 'mail', id: 'mail-reply', disabled: !state.body.length || state.busy }) + '</footer>' : '') + '</div>' +
        (thread && state.composing ? '<section class="ws-mail-composer" aria-label="Reply composer"><header><h3>Reply</h3>' + c.button({ label: 'Close reply', icon: 'x', iconOnly: true, id: 'mail-close-reply' }) + '</header>' + c.composer('mail-draft', { cc: true }) +
          '<p class="ws-muted" role="status" data-reply-status>Not sent. Reply sending is unavailable; use Gmail.</p></section>' : '') + '</section>' +
        contextMarkup(thread) + categories.filter(function (item) { return item.key !== state.category; }).map(function (item) { return '<section id="mail-panel-' + item.key + '" role="tabpanel" aria-labelledby="mail-' + item.key + '" hidden></section>'; }).join('') + '</div></div>' + c.drawer('mail-folder-dialog', 'Mail folders') + '</section>';
      // The tab controller switches the list projection, not a second nested pane.
      host.querySelectorAll('[data-tab]').forEach(function (button) {
        function select(key) { remember(); sequence++; openedSnippets.clear(); state.category = key; state.role = ''; state.selected = ''; state.body = []; state.composing = false; state.contextOpen = false; state.busy = metadataBusy; selectedRows.clear(); paint(); host.querySelector('[data-tab="' + key + '"]').focus(); }
        button.addEventListener('click', function () { select(button.dataset.tab); });
        button.addEventListener('keydown', function (event) { if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) { event.preventDefault(); var index = categories.findIndex(function (item) { return item.key === button.dataset.tab; }); select(categories[event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : categories.length - 1)) % categories.length].key); } });
      });
      var folderDialog = host.querySelector('#mail-folder-dialog');
      folderDialog.querySelector('[data-dialog-body]').innerHTML = folderMarkup();
      var folderWidget = c.bindDialog(folderDialog);
      host.querySelector('#mail-folders-open').addEventListener('click', folderWidget.open);
      host.querySelector('#mail-labels-open').addEventListener('click', folderWidget.open);
      host.querySelector('#mail-labels-open').title = 'Mail labels';
      host.querySelector('#mail-refresh').addEventListener('click', function () { remember(); load(); });
      host.querySelectorAll('[data-mail-folder]').forEach(function (button) {
        button.addEventListener('click', function () { folderWidget.close(); if (state.folder !== button.dataset.mailFolder) { remember(); state.folder = button.dataset.mailFolder; state.category = 'primary'; state.role = ''; load(); } });
      });
      host.querySelectorAll('[data-mail-key]').forEach(function (button) { button.addEventListener('click', function () { open(button.dataset.mailKey); }); });
      host.querySelectorAll('[data-mail-folder-select]').forEach(function (select) { select.addEventListener('change', function (event) { if (Object.hasOwn(extraFolders, event.target.value)) { folderWidget.close(); remember(); state.folder = event.target.value; state.category = 'primary'; state.role = ''; load(); } }); });
      host.querySelectorAll('[data-mail-role], [data-mail-category]').forEach(function (button) { button.addEventListener('click', function () { remember(); sequence++; openedSnippets.clear(); state.role = button.dataset.mailRole || ''; state.category = button.dataset.mailCategory || (state.role === 'buyer' ? 'buyers' : ['seller', 'agent'].includes(state.role) ? 'sellers_agents' : 'primary'); state.selected = ''; state.body = []; state.composing = false; state.contextOpen = false; state.busy = metadataBusy; selectedRows.clear(); paint(); }); });
      function selectionStatus() {
        var count = items.filter(function (row) { return selectedRows.has(row.key); }).length, checkbox = host.querySelector('#mail-select-all');
        checkbox.checked = !!items.length && count === items.length; checkbox.indeterminate = count > 0 && count < items.length;
        host.querySelector('.ws-mail-selection').textContent = count ? count + ' selected' : '';
      }
      host.querySelectorAll('[data-mail-select]').forEach(function (input) { input.addEventListener('change', function () { if (input.checked) selectedRows.add(input.dataset.mailSelect); else selectedRows.delete(input.dataset.mailSelect); selectionStatus(); }); });
      host.querySelector('#mail-select-all').addEventListener('change', function (event) { items.forEach(function (row) { if (event.target.checked) selectedRows.add(row.key); else selectedRows.delete(row.key); }); paint(); });
      selectionStatus();
      var contextButton = host.querySelector('#mail-context'), contextPanel = host.querySelector('.ws-mail-context');
      function contextVisibility(value) { state.contextOpen = value; contextPanel.hidden = !value; host.querySelector('.ws-mail-panes').classList.toggle('ws-mail-panes--context', value); if (contextButton) contextButton.setAttribute('aria-expanded', String(value)); }
      if (contextButton) contextButton.addEventListener('click', function () { contextVisibility(!state.contextOpen); });
      host.querySelector('#mail-context-close').addEventListener('click', function () { contextVisibility(false); if (contextButton) contextButton.focus(); });
      contextPanel.addEventListener('keydown', function (event) { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); contextVisibility(false); if (contextButton) contextButton.focus(); } });
      contextVisibility(state.contextOpen);
      var back = host.querySelector('#mail-back');
      if (back) back.title = 'Back to messages';
      if (back) back.addEventListener('click', function () { remember(); sequence++; state.busy = metadataBusy; state.selected = ''; state.body = []; state.composing = false; paint(); var first = host.querySelector('.ws-mail-row'); if (first) first.focus(); });
      var reply = host.querySelector('#mail-reply');
      if (reply) { reply.setAttribute('aria-keyshortcuts', 'r'); reply.addEventListener('click', function () { remember(); state.composing = true; state.contextOpen = false; paint(); host.querySelector('[name="body"]').focus(); }); }
      var form = host.querySelector('.ws-composer');
      if (form) {
        var draft = drafts.get(state.selected);
        var latestBody = state.body[state.body.length - 1];
        form.elements.to.value = draft ? draft.to : thread.latest.direction === 'out' ? latestBody.to || '' : thread.latest.direction === 'in' ? latestBody.from || '' : '';
        form.elements.subject.value = draft ? draft.subject : (/^re:/i.test(thread.latest.subject || '') ? thread.latest.subject : 'Re: ' + (thread.latest.subject || '(No subject)'));
        form.elements.cc.value = draft ? draft.cc || '' : '';
        form.elements.body.value = draft ? draft.body : '';
        form.elements.to.type = 'text';
        form.querySelector('.ws-check').hidden = true;
        replyBinding = root.WOSEmailReply.bind({ form: form, note: host.querySelector('[data-reply-status]'), messageIds: thread.messages.map(function (row) { return row.id; }), threadKey: thread.key, hasDraft: !!draft,
          terminal: outcomes.get(thread.key), onTerminal: function (value) { outcomes.set(thread.key, value); }, onUnauthorized: function () { destroy(); options.onUnauthorized(); } });
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
      openedSnippets.clear();
      selectedRows.clear(); state.messages = []; state.threads = []; state.unavailable = []; state.selected = ''; state.body = []; state.composing = false; state.contextOpen = false; state.busy = true; state.error = ''; paint();
      try {
        var value = await request('/api/gmail/messages?folder=' + state.folder + '&limit=50', ticket, true);
        if (!value) return;
        if (value.ok !== true) throw Error('unavailable');
        var projected = model.list(value.messages, { now: now() });
        state.messages = value.messages; state.threads = projected.threads; state.unavailable = projected.unavailable;
      } catch (_) { if (ticket === folderSequence && !disposed) state.error = 'Email could not be loaded.'; }
      finally { if (ticket === folderSequence && !disposed) { metadataBusy = false; state.busy = false; paint(); } }
    }
    async function open(key) {
      remember();
      var thread = state.threads.find(function (row) { return row.key === key; });
      if (!thread) return;
      var ticket = ++sequence;
      state.selected = key; state.body = []; state.composing = false; state.contextOpen = false; state.busy = true; state.error = ''; paint();
      var ids = thread.messages.map(function (row) { return row.id; });
      ids.forEach(function (id) { openedSnippets.delete(id); });
      try {
        var value = await request(ids.length === 1 ? '/api/gmail/message/' + encodeURIComponent(ids[0]) : '/api/gmail/thread?ids=' + encodeURIComponent(JSON.stringify(ids)), ticket);
        if (!value) return;
        var messages = Array.isArray(value.messages) ? value.messages : [value];
        if (messages.length !== ids.length || messages.some(function (row) { return !row || !ids.includes(row.id) || row.source_kind !== 'connected_mailbox' || typeof row.body !== 'string'; }) || new Set(messages.map(function (row) { return row.id; })).size !== ids.length) throw Error('invalid');
        // Body transport order cannot change the canonical metadata chronology.
        state.body = ids.map(function (id) { return messages.find(function (row) { return row.id === id; }); });
        state.body.forEach(function (body) {
          var metadata = thread.messages.find(function (row) { return row.id === body.id; });
          var preview = layout.openedSnippet(metadata, body, { now: now() });
          if (preview) openedSnippets.set(body.id, preview); else openedSnippets.delete(body.id);
        });
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
    function destroy() { disposed = true; sequence++; folderSequence++; metadataBusy = false; if (replyBinding) replyBinding.destroy(); drafts.clear(); outcomes.clear(); selectedRows.clear(); openedSnippets.clear(); state.messages = []; state.threads = []; state.body = []; state.query = ''; state.role = ''; host.classList.remove('ws-content--mail'); document.removeEventListener('keydown', keydown); root.removeEventListener('beforeunload', beforeUnload); host.replaceChildren(); }
    document.addEventListener('keydown', keydown);
    root.addEventListener('beforeunload', beforeUnload);
    return { mount: load, refresh: function () { remember(); return load(); }, search: function (query) {
      if (typeof query !== 'string' || query.length > 300 || /[\x00-\x1f\x7f]/.test(query)) return false;
      if (disposed || query === state.query) return true;
      remember(); sequence++; openedSnippets.clear(); state.query = query; state.selected = ''; state.body = []; state.composing = false; state.contextOpen = false; state.busy = metadataBusy; selectedRows.clear(); paint(); return true;
    }, destroy: destroy };
  }
  root.WOSEmailScreen = { create: create };
})(window);
