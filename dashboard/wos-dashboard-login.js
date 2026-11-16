'use strict';
(function (root) {
  function mount(host, options) {
    var disposed = false, pending = false;
    host.innerHTML = '<main class="ws-login" aria-label="Dashboard sign in"><h1>WholesaleOS</h1><h2>Unlock your workspace</h2>' +
      '<form id="login"><label for="pin">Dashboard PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="current-password" required>' +
      '<label class="ws-check wos-remember-choice" for="remember-device"><input id="remember-device" type="checkbox" autocomplete="off"><span>Remember this device for 30 days</span></label>' +
      '<button type="submit" class="ws-button ws-button--green" id="unlock"><img class="ws-icon" src="/dashboard/workspace/vendor/lucide-1.60.0/check.svg" width="20" height="20" alt="" aria-hidden="true"><span>Unlock</span></button>' +
      '<p role="alert" class="ws-error" id="login-error"></p></form></main>';
    var form = host.querySelector('#login'), input = host.querySelector('#pin'), button = host.querySelector('#unlock'), remember = host.querySelector('#remember-device'), note = host.querySelector('#login-error');
    note.textContent = options.message || '';
    function availableTools() {
      if (host.querySelector('#login-tools')) return;
      var link = host.ownerDocument.createElement('a'); link.id = 'login-tools'; link.href = '/dashboard/'; link.textContent = 'Open available tools';
      host.querySelector('.ws-login').appendChild(link);
    }
    if (options.classicTools === true) availableTools();
    async function submit(event) {
      event.preventDefault();
      if (disposed || pending || !input.value) return;
      pending = true; button.disabled = true;
      var value = input.value, selected = remember.checked;
      input.value = ''; remember.disabled = true;
      try {
        var result = await root.WOSDashboardAuth.authenticate(value, { remember_device: selected });
        value = '';
        if (disposed || !host.contains(form)) return;
        if (result.ok && options.onAuthenticated(result.user) !== false) return;
        if (result.ok) availableTools();
        note.textContent = result.ok ? 'This workspace requires an admin session.' : result.code === 'ADMIN_LOGIN_NOT_CONFIGURED' ? 'Dashboard login is not configured.' : 'Could not unlock. Check your PIN and connection.';
      } catch (_) {
        if (!disposed && host.contains(form)) note.textContent = 'Could not unlock. Check your PIN and connection.';
      } finally {
        value = '';
        if (!disposed && host.contains(form)) { pending = false; button.disabled = false; remember.disabled = false; }
      }
    }
    form.addEventListener('submit', submit);
    return function destroy() { disposed = true; input.value = ''; remember.checked = false; form.removeEventListener('submit', submit); };
  }
  root.WOSDashboardLogin = { mount: mount };
})(window);
