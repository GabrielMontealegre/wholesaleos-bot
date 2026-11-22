'use strict';
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') { root.WOSLeadContact = api; api.install(); }
})(typeof window === 'undefined' ? globalThis : window, function(root) {
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function safeUrl(value) { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch (_) { return ''; } }
  const isAdmin = () => Boolean(root.APP && root.APP.unlocked && root.APP.currentUser && root.APP.currentUser.role === 'admin');
  const canEnhance = row => isAdmin() && row && row.contact_brief && row.contact_brief.source_kind === 'derived_contact_brief';
  const icon = name => '<img src="/dashboard/workspace/vendor/lucide-1.60.0/' + name + '.svg" width="18" height="18" alt="" aria-hidden="true">';
  function addressLine(row) {
    const raw = String(row.full_address || row.address || row.property_address || row.normalized_address || row.site_address || '').trim();
    const city = String(row.city || row.property_city || row.situs_city || '').trim();
    const state = String(row.state || row.property_state || row.situs_state || '').trim();
    const zip = String(row.zip || row.zipcode || row.postal_code || '').trim();
    if (/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?$/.test(raw)) return raw;
    if (/^[A-Z]{2}$/.test(state) && raw.includes(',') && raw.endsWith(', ' + state)) return raw + (zip ? ' ' + zip : '');
    const cityPresent = city && raw.toLowerCase().endsWith(', ' + city.toLowerCase());
    return [raw, cityPresent ? '' : city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }
  function href(brief, channel, message = '') {
    if (!brief || brief.call_allowed !== true || brief.text_allowed !== true || !/^\+1\d{10}$/.test(brief.phone && brief.phone.number)) return '';
    const number = brief.phone.number, prefix = channel === 'call' ? 'tel:' : channel === 'text' ? 'sms:' : '';
    if (!prefix || brief.call_href !== 'tel:' + number || brief.text_href !== 'sms:' + number || typeof message !== 'string' || message.length > 1600) return '';
    return prefix + number + (channel === 'text' ? '?body=' + encodeURIComponent(message) : '');
  }
  function markup(row, sourceMarket) {
    const brief = row.contact_brief || {}, phone = brief.phone, name = brief.owner && brief.owner.name;
    const enabled = Boolean(href(brief, 'call'));
    let actions = '';
    if (enabled) actions = '<div class="lc-actions"><a class="lc-call" style="color:#fff!important;background:#176d4e!important" href="' + esc(brief.call_href) + '" data-lc-channel="call" title="Open the phone app">' + icon('arrow-up-right') + 'Call</a>' +
      '<details class="lc-text"><summary style="color:#fff!important;background:#23549a!important">' + icon('message-circle') + 'Text</summary><label>Message<textarea maxlength="1600" data-lc-message>Hi, I have a question about your property.</textarea></label>' +
      '<a href="' + esc(brief.text_href) + '" data-lc-channel="text">Open Messages</a></details></div>';
    else if (!phone && typeof root.buildEnrichmentLaunchpad === 'function') {
      const searchRow = sourceMarket ? { ...row, address: addressLine(row), city: '', state: '', zip: '', owner_name: name || '' } : row;
      const links = root.buildEnrichmentLaunchpad(searchRow).links.filter(link => ['County Record', 'TruePeopleSearch', 'CyberBackgroundChecks'].includes(link.label) && safeUrl(link.url));
      actions = '<details class="lc-search"><summary>Find the owner\'s phone</summary>' + links.map(link => '<a href="' + esc(safeUrl(link.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(link.label) + '</a>').join('') + '</details>';
    }
    const proof = phone && safeUrl(phone.source_url);
    const sourceContext = sourceMarket ? ' data-lc-queue="' + esc(row.queue_key) + '" data-lc-market="' + esc(JSON.stringify(sourceMarket)) + '"' : '';
    return '<section class="lc-brief" data-lc-id="' + esc(row.id || '') + '"' + sourceContext + ' data-lc-number="' + esc(phone && phone.number || '') + '" aria-label="Owner contact">' +
      '<div class="lc-owner">' + esc(name || 'Owner not found yet') + '</div><div class="lc-phone">' + esc(phone ? phone.number : 'Phone not found yet') + '</div>' +
      (phone ? '<p>' + esc(phone.label) + '</p>' : '') + actions +
      (!enabled ? '<p>' + esc(brief.reason || 'Review the source record before contacting anyone.') + '</p>' : '') +
      (proof ? '<details class="lc-proof"><summary>Phone source</summary><a href="' + esc(proof) + '" target="_blank" rel="noopener noreferrer">Review phone source</a><p>' + esc(phone.evidence_text) + '</p></details>' : '') +
      '<p role="status" data-lc-status></p></section>';
  }
  function createController({ fetchImpl, actor, openLocal, lock, createId, timeout = 20000 }) {
    let sequence = 0, active = null;
    function clear() { sequence++; if (active) active.abort(); active = null; }
    async function request(row, channel, message = '') {
      if (active) return { ok: false, busy: true };
      const identity = actor(), target = href(row.contact_brief, channel, message);
      const source = row.contact_summary_authorized === true && row.queue_key && row.contact_market;
      if (!identity || !target || !(source || row.id)) return { ok: false };
      const ticket = ++sequence, controller = new AbortController(); active = controller;
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetchImpl(source ? '/api/dashboard/free-public-deal-board/contact-workflow' : '/api/dashboard/leads/' + encodeURIComponent(row.id) + '/contact-tap', {
          method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true, channel, number: row.contact_brief.phone.number, request_id: createId(),
            ...(source ? { action: 'local_contact_requested', queue_key: row.queue_key, market: row.contact_market } : {}) })
        });
        if ([401, 403].includes(response.status)) { await response.body?.cancel(); clear(); lock(); return { ok: false, locked: true }; }
        if (!response.ok) { await response.body?.cancel(); return { ok: false }; }
        const result = await response.json();
        if (ticket !== sequence || controller.signal.aborted || actor() !== identity || result.ok !== true) return { ok: false, cancelled: true };
        openLocal(target);
        return { ok: true };
      } catch (_) { return { ok: false }; }
      finally { clearTimeout(timer); if (ticket === sequence) active = null; }
    }
    return { request, clear };
  }
  function install() {
    const controller = createController({ fetchImpl: (...args) => root.fetch(...args),
      actor: () => isAdmin() && root.APP.currentUser.id, createId: () => root.crypto.randomUUID(),
      openLocal: target => root.WOSLeadContact.openLocal(target), lock: () => root.WOSDashboardAuth.lockIdentity(root.APP) });
    const oldDetail = root.renderLeadDetail;
    if (oldDetail) root.renderLeadDetail = function(row) { return (canEnhance(row) ? markup(row) : '') + oldDetail.apply(this, arguments); };
    const oldOpen = root.openLeadModal;
    if (oldOpen) root.openLeadModal = function() {
      const result = oldOpen.apply(this, arguments);
      if (!isAdmin()) return result;
      const content = document.getElementById('modal-content'), header = content && content.querySelector('.lc-brief');
      if (header) {
        if (!header.closest('[data-lc-saved-body]')) content.prepend(header);
        content.querySelectorAll('a[href^="tel:"],a[href^="sms:"]').forEach(link => { if (!link.closest('.lc-brief')) link.remove(); });
        content.querySelectorAll('button[onclick^="compactLeadSms("]').forEach(button => button.remove());
      }
      return result;
    };
    function clear() {
      controller.clear();
      (root.APP && root.APP.leads || []).forEach(row => { if (row && typeof row === 'object') delete row.contact_brief; });
      document.querySelectorAll('.lc-brief').forEach(element => {
        const message = document.createElement('p'); message.textContent = 'Dashboard login required.'; element.replaceWith(message);
      });
    }
    root.addEventListener('wos:session-ended', clear); root.addEventListener('pagehide', clear);
    document.addEventListener('click', async event => {
      const panel = event.target.closest('.lc-brief');
      if (!panel) return;
      event.stopPropagation();
      const button = event.target.closest('[data-lc-channel]');
      if (!button) return;
      event.preventDefault();
      if (!isAdmin()) { clear(); return; }
      const status = panel.querySelector('[data-lc-status]');
      const call = panel.querySelector('[data-lc-channel="call"]'), text = panel.querySelector('[data-lc-channel="text"]');
      if (!button.hasAttribute('href') || !call || !text) { status.textContent = 'Refresh this lead before contacting anyone.'; return; }
      const row = { id: panel.dataset.lcId, contact_brief: { call_allowed: true, text_allowed: true,
        phone: { number: panel.dataset.lcNumber }, call_href: call.getAttribute('href'), text_href: text.getAttribute('href') } };
      if (panel.dataset.lcQueue) {
        try { row.contact_market = JSON.parse(panel.dataset.lcMarket); } catch (_) { return; }
        row.queue_key = panel.dataset.lcQueue; row.contact_summary_authorized = true;
      }
      const message = panel.querySelector('[data-lc-message]'); status.textContent = 'Recording this request...';
      const result = await controller.request(row, button.dataset.lcChannel, message ? message.value : '');
      if (!panel.isConnected || !isAdmin()) return;
      status.textContent = result.ok ? 'Local app requested. No contact outcome recorded.' : result.busy ? 'One request is already in progress.' : 'Could not record this action. Refresh the lead and try again.';
    }, true);
  }
  function openLocal(target) { root.location.href = target; }
  return { markup, href, addressLine, createController, isAdmin, canEnhance, install, openLocal };
});
