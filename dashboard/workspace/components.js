'use strict';

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WOSComponents = api;
})(typeof window !== 'undefined' ? window : null, function () {
  var ICONS = new Set(['menu', 'x', 'house', 'mail', 'users', 'handshake', 'bell',
    'settings', 'search', 'log-out', 'arrow-up-right', 'refresh-cw', 'check', 'send',
    'calendar-days', 'list-checks', 'layout-dashboard', 'layers', 'chevron-down']);
  var TONES = new Set(['neutral', 'green', 'blue', 'red', 'amber']);

  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function id(value) {
    if (!/^[a-z][a-z0-9_-]{0,79}$/i.test(String(value || ''))) throw new TypeError('Invalid component id');
    return String(value);
  }

  function tone(value) { return TONES.has(value) ? value : 'neutral'; }

  function icon(name) {
    if (!ICONS.has(name)) throw new TypeError('Unknown icon');
    return '<img class="ws-icon" src="/dashboard/workspace/vendor/lucide-1.60.0/' + name + '.svg" width="20" height="20" alt="" aria-hidden="true">';
  }

  function button(options) {
    var o = options || {};
    if (!o.label) throw new TypeError('A button needs a label');
    return '<button type="button" class="ws-button ws-button--' + tone(o.tone) +
      (o.iconOnly ? ' ws-button--icon' : '') + '"' + (o.id ? ' id="' + id(o.id) + '"' : '') +
      ' aria-label="' + escape(o.label) + '"' + (o.disabled ? ' disabled' : '') +
      (o.help ? ' data-help="' + escape(o.help) + '"' : '') + '>' +
      (o.icon ? icon(o.icon) : '') + (o.iconOnly ? '' : '<span>' + escape(o.label) + '</span>') + '</button>';
  }

  function badge(label, color) {
    return '<span class="ws-badge ws-badge--' + tone(color) + '">' + escape(label) + '</span>';
  }

  function roleBadge(value) {
    var roles = { buyer: 'Buyer', seller: 'Seller', holder: 'JV partner', partner: 'JV partner', title: 'Title', attorney: 'Attorney', lender: 'Lender', agent: 'Agent', other: 'Other' };
    return Object.hasOwn(roles, value) ? '<span class="ws-badge ws-role--' + value + '">' + roles[value] + '</span>' : badge('Not linked', 'neutral');
  }

  function card(options) {
    var o = options || {};
    return '<article class="ws-card"><h3>' + escape(o.title) + '</h3>' +
      (o.detail ? '<p>' + escape(o.detail) + '</p>' : '') +
      (o.status ? badge(o.status, o.tone) : '') + '</article>';
  }

  function listRow(options) {
    var o = options || {};
    return '<li class="ws-row"><button type="button" class="ws-row-button" data-row="' +
      escape(o.key) + '"><span class="ws-row-main"><strong>' + escape(o.title) + '</strong>' +
      (o.detail ? '<span class="ws-muted">' + escape(o.detail) + '</span>' : '') +
      '</span>' + (o.status ? badge(o.status, o.tone) : '') + icon('arrow-up-right') + '</button></li>';
  }

  function tabs(componentId, items, selected) {
    var name = id(componentId);
    if (!Array.isArray(items) || !items.length || !items.some(function (item) { return item.key === selected; })) {
      throw new TypeError('Tabs need an existing selected item');
    }
    var seen = new Set();
    return '<div class="ws-tabs" role="tablist" aria-label="' + escape(name.replace(/[-_]/g, ' ')) + '">' +
      items.map(function (item) {
        var key = id(item.key);
        if (seen.has(key)) throw new TypeError('Duplicate tab');
        seen.add(key);
        var active = key === selected;
        return '<button type="button" role="tab" id="' + name + '-' + key + '" aria-controls="' +
          name + '-panel-' + key + '" aria-selected="' + active + '" tabindex="' + (active ? '0' : '-1') +
          '" data-tab="' + key + '">' + escape(item.label) + '</button>';
      }).join('') + '</div>';
  }

  function empty(title, detail) {
    return '<div class="ws-empty"><h3>' + escape(title) + '</h3><p>' + escape(detail) + '</p></div>';
  }

  function skeleton(label) {
    return '<div class="ws-skeleton" role="status"><span>' + escape(label || 'Loading') +
      '</span><div aria-hidden="true"></div><div aria-hidden="true"></div><div aria-hidden="true"></div></div>';
  }

  function drawer(componentId, title) {
    var name = id(componentId);
    return '<dialog class="ws-drawer" id="' + name + '" aria-labelledby="' + name + '-title">' +
      '<header class="ws-dialog-header"><h2 id="' + name + '-title">' + escape(title) + '</h2>' +
      button({ label: 'Close ' + title, icon: 'x', iconOnly: true, id: name + '-close' }) +
      '</header><div class="ws-dialog-body" data-dialog-body></div></dialog>';
  }

  function composer(componentId, options) {
    var name = id(componentId);
    return '<form class="ws-composer" id="' + name + '"><label for="' + name + '-to">To</label>' +
      '<input id="' + name + '-to" name="to" type="email" required autocomplete="off">' +
      (options && options.cc ? '<label for="' + name + '-cc">Cc</label><input id="' + name + '-cc" name="cc" type="text" autocomplete="off">' : '') +
      '<label for="' + name + '-subject">Subject</label><input id="' + name + '-subject" name="subject" required>' +
      '<label for="' + name + '-body">Message</label><textarea id="' + name + '-body" name="body" rows="8" required></textarea>' +
      '<footer><label class="ws-check"><input type="checkbox" name="reviewed">I reviewed this message</label>' +
      button({ label: 'Send', icon: 'send', tone: 'green', disabled: true, id: name + '-send' }) +
      '</footer><p class="ws-error" role="alert" data-composer-error></p></form>';
  }

  function bindDialog(dialog) {
    var opener = null;
    var closeButton = dialog.querySelector('.ws-dialog-header button');
    closeButton.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('close', function () {
      var active = dialog.ownerDocument.activeElement;
      if (opener && opener.isConnected &&
          (active === dialog.ownerDocument.body || dialog.contains(active))) opener.focus();
      opener = null;
    });
    return {
      open: function () {
        if (dialog.open) return;
        opener = dialog.ownerDocument.activeElement;
        dialog.showModal();
        closeButton.focus();
      },
      close: function () { if (dialog.open) dialog.close(); }
    };
  }

  function bindTabs(container, onChange) {
    var buttons = Array.from(container.querySelectorAll('[role="tab"]'));
    function select(button) {
      buttons.forEach(function (item) {
        var active = item === button;
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
        var panel = container.ownerDocument.getElementById(item.getAttribute('aria-controls'));
        if (panel) panel.hidden = !active;
      });
      if (typeof onChange === 'function') onChange(button.dataset.tab);
    }
    buttons.forEach(function (button, index) {
      button.addEventListener('click', function () { select(button); });
      button.addEventListener('keydown', function (event) {
        var next;
        if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
        else if (event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else return;
        event.preventDefault();
        select(buttons[next]);
        buttons[next].focus();
      });
    });
  }

  // The component owns interaction only. A caller must explicitly supply permission
  // and a reviewed-send callback; rendering or pressing Enter cannot send anything.
  function bindComposer(form, options) {
    var o = options || {};
    var send = form.querySelector('button');
    var busy = false;
    function allowed() {
      return o.canSend === true && typeof o.onSend === 'function' && !busy &&
        form.elements.reviewed.checked && form.checkValidity();
    }
    function sync() { send.disabled = !allowed(); }
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);
    form.addEventListener('submit', function (event) { event.preventDefault(); });
    send.addEventListener('click', async function () {
      if (!allowed()) return;
      busy = true;
      form.querySelector('[data-composer-error]').textContent = '';
      sync();
      try {
        await o.onSend({ to: form.elements.to.value, subject: form.elements.subject.value, body: form.elements.body.value });
      } catch (_) {
        form.querySelector('[data-composer-error]').textContent = 'Send could not be completed. Check the message status before trying again.';
      } finally {
        busy = false;
        form.elements.reviewed.checked = false;
        sync();
      }
    });
    sync();
    return { sync: sync };
  }

  return { escape: escape, icon: icon, button: button, badge: badge, roleBadge: roleBadge, card: card, listRow: listRow,
    tabs: tabs, empty: empty, skeleton: skeleton, drawer: drawer, composer: composer,
    bindDialog: bindDialog, bindTabs: bindTabs, bindComposer: bindComposer };
});
