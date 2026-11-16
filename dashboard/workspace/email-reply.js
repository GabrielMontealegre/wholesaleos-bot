'use strict';
(function (root) {
  var c = root.WOSComponents, base = '/api/dashboard/email/thread-replies';
  function bind(options) {
    var form = options.form, stopped = false, context = null, preview = null, pending = false;
    var fields = ['to', 'cc', 'subject', 'body'], touched = new Set(), terminal = options.terminal || '';
    var note = options.note, sendOptions = { canSend: false, onSend: send };
    var binding = c.bindComposer(form, sendOptions), footer = form.querySelector('footer');
    footer.insertAdjacentHTML('afterbegin', c.button({ label: 'Preview reply', icon: 'list-checks', id: 'mail-preview', disabled: true }) + c.button({ label: 'Edit reply', icon: 'mail', id: 'mail-edit', disabled: true }));
    var previewButton = form.querySelector('#mail-preview'), editButton = form.querySelector('#mail-edit'), review = form.querySelector('.ws-check');
    review.hidden = true; editButton.hidden = true;
    function say(text) { if (!stopped) note.textContent = text; }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function addresses(value) {
      if (!value.trim()) return [];
      var rows = value.split(',').map(function (v) { return v.trim(); });
      if (rows.some(function (v) { return !v || /[\s\x00-\x1f<>]/.test(v) || !/^[^@]+@[^@]+\.[^@]+$/.test(v); }) || new Set(rows.map(function (v) { return v.toLowerCase(); })).size !== rows.length) throw Error('recipients');
      return rows;
    }
    function content() {
      var to = addresses(form.elements.to.value), cc = addresses(form.elements.cc.value);
      var allowed = context.participants.map(function (v) { return v.toLowerCase(); });
      return { message_ids: options.messageIds, thread_key: options.threadKey, to: to, cc: cc,
        added_recipients: to.concat(cc).filter(function (v) { return !allowed.includes(v.toLowerCase()); }),
        subject: form.elements.subject.value, body: form.elements.body.value };
    }
    function freeze(value) { fields.forEach(function (key) { form.elements[key].readOnly = value; }); }
    function invalidate() {
      preview = null; sendOptions.canSend = false; form.elements.reviewed.checked = false; review.hidden = true;
      editButton.hidden = true; previewButton.hidden = false; freeze(false); binding.sync();
    }
    function finish(text) {
      terminal = text; options.onTerminal(text); sendOptions.canSend = false; previewButton.disabled = true; editButton.disabled = true;
      freeze(true); binding.sync(); say(text);
    }
    async function request(path, body) {
      var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 35000), response;
      try { response = await root.fetch(base + path, { credentials: 'include', cache: 'no-store', signal: controller.signal,
        method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', 'X-WOS-Reply-Request': '1' } : {},
        ...(body ? { body: JSON.stringify(body) } : {}) });
      if (stopped) return null;
      if (response.status === 401 || response.status === 403) { stopped = true; options.onUnauthorized(); return null; }
      var result = await response.json();
      if (stopped) return null;
      if (!response.ok) { var error = Error('unavailable'); error.code = result.code; throw error; }
      return result;
      } finally { clearTimeout(timer); }
    }
    function edited(event) {
      if (!fields.includes(event.target.name)) return;
      touched.add(event.target.name);
      if (!terminal && !pending) { invalidate(); say('Not sent. Preview this exact reply before sending.'); }
    }
    form.addEventListener('input', edited);
    previewButton.addEventListener('click', async function () {
      if (!context || pending || terminal || !form.checkValidity()) return;
      var input;
      try { input = content(); } catch (_) { say('Enter complete email addresses separated by commas.'); return; }
      pending = true; previewButton.disabled = true; freeze(true); say('Checking this reply...');
      try {
        var result = await request('/preview', input);
        if (!result) return;
        if (result.status !== 'preview' || result.reviewed !== false || !result.enabled || !result.configured || !/^[a-f0-9-]{36}$/.test(result.id || '') || !/^[a-f0-9]{64}$/.test(result.version || '') || result.thread_key !== options.threadKey || !same(result.message_ids, options.messageIds.slice().sort()) || ['to', 'cc', 'added_recipients', 'subject', 'body'].some(function (key) { return !same(result[key], input[key]); })) throw Error('preview mismatch');
        preview = result; review.hidden = false; previewButton.hidden = true; editButton.hidden = false; editButton.disabled = false;
        sendOptions.canSend = true; binding.sync(); say('Not sent. Review the exact recipients and message, then check the box.');
      } catch (e) {
        if (['thread_reply_send_uncertain', 'thread_reply_already_accepted'].includes(e.code)) finish('Check Sent in Gmail before doing anything else. This reply cannot be retried here.');
        else { invalidate(); say('Reply preview unavailable. Refresh the conversation or use Gmail.'); }
      } finally { pending = false; if (!stopped && !terminal) previewButton.disabled = false; }
    });
    editButton.addEventListener('click', function () { if (!pending && !terminal) { invalidate(); say('Not sent. Changes need a new preview.'); form.elements.body.focus(); } });
    async function send() {
      if (stopped || pending || terminal || !preview) return;
      var exact = preview, input;
      try { input = content(); } catch (_) { invalidate(); return; }
      if (['to', 'cc', 'added_recipients', 'subject', 'body'].some(function (key) { return !same(input[key], exact[key]); }) || !form.elements.reviewed.checked || Date.parse(exact.created_at) > Date.now() || Date.now() - Date.parse(exact.created_at) > 300000 || !Number.isFinite(Date.parse(exact.created_at))) { invalidate(); say('Reply changed or preview expired. Preview it again.'); return; }
      pending = true; sendOptions.canSend = false; editButton.disabled = true; previewButton.disabled = true; binding.sync(); say('Sending this reviewed reply...');
      try {
        var result = await request('/send', { preview_id: exact.id, version: exact.version, reviewed: true });
        if (!result) return;
        if (result.status !== 'accepted' || result.preview_id !== exact.id || result.version !== exact.version || typeof result.message_id !== 'string' || !result.message_id) throw Error('receipt mismatch');
        finish('Accepted by the mail server. Delivery is not confirmed. Check Sent in Gmail.');
      } catch (_) { finish('May have sent. Check Sent in Gmail; do not retry.'); }
      finally { pending = false; }
    }
    async function start() {
      if (terminal) { finish(terminal); return; }
      say('Not sent. Checking reply availability...');
      try {
        var status = await request('/status'); if (!status) return;
        if (status.enabled !== true || status.configured !== true) { say('Not sent. Reply sending is unavailable; use Gmail.'); return; }
        var result = await request('/context?message_ids=' + encodeURIComponent(JSON.stringify(options.messageIds)) + '&thread_key=' + encodeURIComponent(options.threadKey));
        if (!result) return;
        if (result.thread_key !== options.threadKey || !same(result.message_ids, options.messageIds.slice().sort()) || !Array.isArray(result.participants) || !Array.isArray(result.to) || !Array.isArray(result.cc) || typeof result.subject !== 'string') throw Error('context mismatch');
        context = result;
        ['to', 'cc', 'subject'].forEach(function (key) { if (!touched.has(key) && !options.hasDraft) form.elements[key].value = key === 'subject' ? result[key] : result[key].join(', '); });
        previewButton.disabled = false; say('Not sent. Preview this exact reply before sending.');
      } catch (_) { say('Not sent. Reply sending is unavailable; use Gmail.'); }
    }
    start();
    return { destroy: function () { stopped = true; sendOptions.canSend = false; binding.sync(); } };
  }
  root.WOSEmailReply = { bind: bind };
})(window);
