// wos-public-deals.js - "Best Public Deals" queue section on the main Dashboard.
// Reads/refreshes the deal-board snapshot cache (never saved leads).
'use strict';

(function () {
  var API_LATEST = '/api/dashboard/free-public-deal-board/latest';
  var API_RUN = '/api/dashboard/free-public-deal-board/run';

  function headers() {
    return { 'Content-Type': 'application/json', 'x-user-id': window._uid || 'admin' };
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function link(label, url) {
    if (!url) return '';
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:underline;margin-right:8px;">' + esc(label) + '</a>';
  }

  function chip(label, value, color) {
    return '<span style="display:inline-block;margin:2px 6px 2px 0;padding:3px 10px;border-radius:12px;background:' + (color || '#eef2ff') + ';color:#111;font-size:12px;font-weight:600;">' + esc(label) + ': ' + esc(value) + '</span>';
  }

  function statusColor(status) {
    if (status === 'CALL_READY') return '#bbf7d0';
    if (status === 'OUTREACH_READY') return '#bfdbfe';
    if (/BLOCKED/.test(status || '')) return '#fecaca';
    return '#e5e7eb';
  }

  function rowCard(row) {
    var title = row.normalized_address || row.headline || 'Source proof row';
    var lines = [];
    lines.push('<div style="font-weight:700;font-size:14px;margin-bottom:4px;">' + esc(title) +
      ' <span style="font-weight:500;font-size:11px;padding:2px 8px;border-radius:10px;background:' + statusColor(row.contact_status) + ';">' + esc(row.contact_status || row.quality_bucket || '') + '</span></div>');
    if (row.owner_clue) lines.push('<div style="font-size:12px;">Owner clue: <b>' + esc(row.owner_clue) + '</b>' + (row.official_lookup_status ? ' <span style="color:#6b7280;">(' + esc(row.official_lookup_status) + ')</span>' : '') + '</div>');
    var links = link('Source proof', row.source_document_url || row.source_url) + link('Best click', row.best_link_to_click_first) +
      link('Maps', row.maps_url) + link('Zillow', row.zillow_url) + link('Redfin', row.redfin_url) + link('Realtor', row.realtor_url) + link('Auction', row.auction_url) + link('County record', row.official_property_record_url);
    if (links) lines.push('<div style="font-size:12px;margin:3px 0;">' + links + '</div>');
    if (row.best_contact) lines.push('<div style="font-size:12px;">Contact route: <b>' + esc(row.best_contact) + '</b></div>');
    lines.push('<div style="font-size:11px;color:#374151;margin-top:3px;">Comps: ' + esc(row.comp_status || 'not run') +
      ' | ARV: ' + esc(row.ARV_lock_state || 'unknown') + ' | MAO: ' + esc(row.MAO_lock_state || 'unknown') +
      (row.appraisal_clue ? ' | County appraisal clue: ' + esc(row.appraisal_clue) + ' (not ARV)' : '') + '</div>');
    lines.push('<div style="font-size:12px;margin-top:3px;">Next action: <b>' + esc(row.next_best_action || 'review') + '</b>' +
      (row.missing_fields && row.missing_fields.length ? ' <span style="color:#6b7280;">Missing: ' + esc(row.missing_fields.join(', ')) + '</span>' : '') + '</div>');
    if (row.seller_questions && row.seller_questions.length) {
      lines.push('<details style="margin-top:4px;font-size:12px;"><summary style="cursor:pointer;color:#2563eb;">Seller questions (' + row.seller_questions.length + ')</summary><ul style="margin:4px 0 0 18px;padding:0;">' +
        row.seller_questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></details>');
    }
    if (row.blocked_sources && row.blocked_sources.length) {
      lines.push('<div style="font-size:11px;color:#991b1b;margin-top:3px;">Blocked: ' + esc(row.blocked_sources.map(function (b) { return b.source + ' (' + b.reason + ')'; }).join('; ')) + '</div>');
    }
    return '<div class="wos-public-deal-row" style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff;">' + lines.join('') + '</div>';
  }

  function summaryBar(data) {
    var c = data.counts || {};
    var batch = data.batch;
    var parts = [
      chip('Rows', c.total_rows || 0),
      chip('Addresses', c.address_rows || 0),
      chip('CALL_READY', c.call_ready || 0, '#bbf7d0'),
      chip('OUTREACH_READY', c.outreach_ready || 0, '#bfdbfe'),
      chip('INSPECT_NOW', c.inspect_now || 0, '#fde68a'),
      chip('Needs contact', c.needs_contact || 0),
      chip('Needs comps', c.needs_comps || 0),
      chip('Owner clues', c.owner_clues || 0)
    ];
    var meta = batch
      ? 'Last batch ' + esc(String(batch.run_at).replace('T', ' ').slice(0, 16)) + ' - ' + esc(batch.new_rows) + ' new, ' + esc(batch.refreshed_rows) + ' refreshed, ' + esc(batch.rejected_generic_count || 0) + ' generic rejected' + (batch.board_blocker_summary ? ' - blocker: ' + esc(batch.board_blocker_summary) : '')
      : 'No batch yet - click Refresh batch to pull free public deals.';
    return '<div style="margin-bottom:6px;">' + parts.join('') + '</div><div style="font-size:12px;color:#4b5563;margin-bottom:8px;">' + meta + '</div>';
  }

  function render(container, data, note) {
    var rows = Array.isArray(data.rows) ? data.rows : [];
    var addressRows = rows.filter(function (r) { return r.normalized_address; });
    var proofRows = rows.filter(function (r) { return !r.normalized_address; });
    container.querySelector('.wos-public-deals-body').innerHTML =
      (note ? '<div style="font-size:12px;color:#6b7280;margin-bottom:6px;">' + esc(note) + '</div>' : '') +
      summaryBar(data) +
      (rows.length
        ? addressRows.map(rowCard).join('') +
          (proofRows.length ? '<details style="margin-top:6px;"><summary style="cursor:pointer;font-size:13px;color:#2563eb;">Source-proof rows without address yet (' + proofRows.length + ')</summary>' + proofRows.map(rowCard).join('') + '</details>' : '')
        : '<div style="font-size:13px;color:#6b7280;">No public deal rows yet. Run a batch.</div>');
  }

  function fetchLatest(container) {
    fetch(API_LATEST, { headers: headers() })
      .then(function (res) { return res.json(); })
      .then(function (data) { render(container, data || {}, data && data.has_snapshot ? '' : 'Snapshot cache only - nothing here is a saved lead.'); })
      .catch(function (err) {
        container.querySelector('.wos-public-deals-body').innerHTML = '<div style="color:#991b1b;font-size:13px;">Could not load public deals: ' + esc(err.message) + '</div>';
      });
  }

  function runBatch(container, button) {
    button.disabled = true;
    button.textContent = 'Running free batch (30-90s)...';
    fetch(API_RUN, { method: 'POST', headers: headers(), body: JSON.stringify({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, limit: 25 }) })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error((data && data.error) || 'batch failed');
        render(container, data, 'Batch complete - ' + (data.batch ? data.batch.new_rows + ' new rows' : 'done') + '.');
      })
      .catch(function (err) {
        container.querySelector('.wos-public-deals-body').innerHTML = '<div style="color:#991b1b;font-size:13px;">Batch failed: ' + esc(err.message) + '</div>';
      })
      .then(function () {
        button.disabled = false;
        button.textContent = 'Refresh batch (free, capped)';
      });
  }

  function mount() {
    if (document.getElementById('wos-public-deals')) return;
    var host = document.getElementById('content') || document.getElementById('app') || document.body;
    var section = document.createElement('section');
    section.id = 'wos-public-deals';
    section.style.cssText = 'margin:12px;padding:14px 16px;border:1px solid #d1d5db;border-radius:12px;background:#f9fafb;font-family:inherit;';
    section.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:8px;">' +
      '<h2 style="margin:0;font-size:17px;">Best Public Deals <span style="font-size:11px;font-weight:500;color:#6b7280;">free sources - preview snapshot, not saved leads</span></h2>' +
      '<button id="wos-public-deals-run" style="padding:7px 14px;border-radius:8px;border:1px solid #2563eb;background:#2563eb;color:#fff;font-size:13px;cursor:pointer;">Refresh batch (free, capped)</button>' +
      '</div><div class="wos-public-deals-body" style="max-height:520px;overflow:auto;">Loading public deals...</div>';
    host.insertBefore(section, host.firstChild);
    document.getElementById('wos-public-deals-run').addEventListener('click', function () {
      runBatch(section, this);
    });
    fetchLatest(section);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
