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
    var zipReview = row.quality_bucket === 'NEEDS_ZIP_REVIEW';
    var title = row.normalized_address || row.partial_address || row.headline || 'Source proof row';
    var lines = [];
    lines.push('<div style="font-weight:700;font-size:14px;margin-bottom:4px;">' + esc(title) +
      (zipReview ? ' <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#fed7aa;">ZIP MISSING - verify in document</span>' : '') +
      (row.county ? ' <span style="font-weight:500;font-size:11px;color:#6b7280;">(' + esc(row.county) + ' County)</span>' : '') +
      ' <span style="font-weight:500;font-size:11px;padding:2px 8px;border-radius:10px;background:' + statusColor(row.contact_status) + ';">' + esc(row.contact_status || row.quality_bucket || '') + '</span></div>');
    if (zipReview && row.maps_search_url_review_needed) {
      lines.push('<div style="font-size:12px;">' + link('Maps search (zip unverified - review)', row.maps_search_url_review_needed) + '</div>');
    }
    if (row.owner_clue) lines.push('<div style="font-size:12px;">Owner clue: <b>' + esc(row.owner_clue) + '</b>' + (row.official_lookup_status ? ' <span style="color:#6b7280;">(' + esc(row.official_lookup_status) + ')</span>' : '') + '</div>');
    var links = link('Source proof', row.source_document_url || row.source_url) + link('Best click', row.best_link_to_click_first) +
      link('Maps', row.maps_url) + link('Zillow', row.zillow_url) + link('Redfin', row.redfin_url) + link('Realtor', row.realtor_url) + link('Auction', row.auction_url) + link('County record', row.official_property_record_url);
    if (links) lines.push('<div style="font-size:12px;margin:3px 0;">' + links + '</div>');
    if (row.best_contact) lines.push('<div style="font-size:12px;">Contact route: <b>' + esc(row.best_contact) + '</b></div>');
    lines.push('<div style="font-size:11px;color:#374151;margin-top:3px;">Comps: ' + esc(row.screenshot_comp_status || row.comp_status || 'not run') +
      (row.verified_sold_comp_count ? ' (' + esc(row.verified_sold_comp_count) + ' verified)' : '') +
      ' | ARV: ' + esc(row.ARV_lock_state || 'unknown') + ' | MAO: ' + esc(row.MAO_lock_state || 'unknown') +
      (row.appraisal_clue ? ' | County appraisal clue: ' + esc(row.appraisal_clue) + ' (not ARV)' : '') + '</div>');
    if (row.verified_comps && row.verified_comps.length) {
      lines.push('<div style="font-size:11px;color:#065f46;margin-top:2px;">Verified comps: ' +
        row.verified_comps.map(function (c) { return esc(c.comp_address) + ' $' + esc(String(c.sold_price)) + ' (' + esc(c.sold_date) + ') ' + link('src', c.source_url); }).join(' | ') + '</div>');
    }
    if (row.next_comp_action) lines.push('<div style="font-size:11px;color:#374151;">Comp action: ' + esc(row.next_comp_action) + '</div>');
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

  function panelBox(title, subtitle, bodyHtml, accent) {
    return '<div style="border:1px solid ' + (accent || '#d1d5db') + ';border-radius:10px;padding:10px 12px;margin-bottom:10px;background:#fff;">' +
      '<div style="font-weight:700;font-size:14px;margin-bottom:2px;">' + title + '</div>' +
      (subtitle ? '<div style="font-size:11px;color:#6b7280;margin-bottom:6px;">' + subtitle + '</div>' : '') +
      bodyHtml + '</div>';
  }

  function isActionableRow(row) {
    return row.quality_bucket === 'INSPECT_NOW' || row.quality_bucket === 'NEEDS_ZIP_REVIEW' ||
      row.contact_status === 'CALL_READY' || row.contact_status === 'OUTREACH_READY';
  }

  function minutesUntil(iso) {
    if (!iso) return null;
    var diff = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
    return isNaN(diff) ? null : diff;
  }

  function dailyMachinePanel(data, rows) {
    var c = data.counts || {};
    var batch = data.batch;
    var daily = data.daily || {};
    var autoRun = data.auto_run || {};
    var today = new Date().toISOString().slice(0, 10);
    var actionableToday = rows.filter(function (r) {
      return isActionableRow(r) && String(r.first_seen_at || '').slice(0, 10) === today;
    }).length;
    var eta = minutesUntil(autoRun.next_run_at);
    var statusChip = autoRun.enabled
      ? chip('AUTO-RUN', 'ON every ' + (autoRun.interval_minutes || 20) + ' min', '#bbf7d0') +
        (eta != null ? chip('Next run', eta <= 0 ? 'due now' : 'in ~' + eta + ' min', '#bfdbfe') : '') +
        chip('Runs today', (autoRun.runs_today || 0) + '/' + (autoRun.daily_cap || 24))
      : chip('AUTO-RUN', 'OFF - flip the switch above to collect deals all day', '#fecaca');
    var statChips = [
      chip('Batches today', daily.batches_today || 0),
      chip('New rows today', c.today_rows || 0, '#ddd6fe'),
      chip('Address rows today', daily.address_rows_today || 0, '#ddd6fe'),
      chip('Actionable today', actionableToday, '#fde68a'),
      chip('OCR rows today', daily.ocr_address_rows_today || 0),
      chip('CALL_READY', c.call_ready || 0, '#bbf7d0'),
      chip('ZIP review', c.needs_zip_review || 0, '#fed7aa'),
      chip('INSPECT_NOW', c.inspect_now || 0, '#fde68a'),
      chip('Rows total', c.total_rows || 0)
    ].join('');
    var meta = batch
      ? '<div style="font-size:12px;color:#4b5563;margin-top:6px;">Last batch ' + esc(String(batch.run_at).replace('T', ' ').slice(0, 16)) + ' - ' + esc(batch.new_rows) + ' new, ' + esc(batch.refreshed_rows) + ' refreshed, ' + esc(batch.rejected_generic_count || 0) + ' generic rejected' + (batch.board_blocker_summary ? ' - blocker: ' + esc(batch.board_blocker_summary) : '') + '</div>'
      : '<div style="font-size:12px;color:#4b5563;margin-top:6px;">No batch yet - click "Run next free batch" or turn auto-run on.</div>';
    var ocrLine = '';
    if (batch && batch.ocr) {
      ocrLine = '<div style="font-size:11px;color:#4b5563;margin-top:4px;">OCR: ' +
        esc(batch.ocr.ocr_documents_attempted) + ' scanned docs attempted, ' +
        esc(batch.ocr.ocr_documents_succeeded) + ' read, ' +
        esc(batch.ocr.ocr_rows_with_address) + ' address rows (review recommended), ' +
        (batch.ocr.ocr_retry_documents ? esc(batch.ocr.ocr_retry_documents) + ' retried at higher scale, ' : '') +
        'quality ' + esc(batch.ocr.ocr_text_quality_score || 0) + '/100, ' +
        esc(batch.ocr.ocr_skipped_oversize) + ' oversize skipped, ' +
        esc(batch.ocr.ocr_failures) + ' failed.</div>';
    }
    var errLine = autoRun.last_error
      ? '<div style="font-size:11px;color:#991b1b;margin-top:4px;">Last auto-run error: ' + esc(autoRun.last_error) + '</div>' : '';
    var blockers = '';
    var coverage = batch && batch.source_coverage;
    if (coverage && coverage.length) {
      var blocked = coverage.filter(function (item) { return item.blocked_reason; });
      if (blocked.length) {
        blockers = '<div style="font-size:11px;color:#991b1b;margin-top:4px;">Source blockers: ' +
          blocked.map(function (item) { return esc((item.county || item.source_id) + ' (' + item.blocked_reason + ')'); }).join(', ') + '</div>';
      }
    }
    return panelBox('Daily Deal Machine',
      'Free public sources only - snapshot cache, not saved leads.',
      '<div style="margin-bottom:4px;">' + statusChip + '</div><div>' + statChips + '</div>' + meta + ocrLine + errLine + blockers + coverageTable(batch),
      autoRun.enabled ? '#86efac' : '#fca5a5');
  }

  function zipReviewCard(row) {
    return '<div style="border:1px solid #fed7aa;border-radius:10px;padding:8px 12px;margin-bottom:6px;background:#fff;">' +
      '<div style="font-weight:700;font-size:13px;">' + esc(row.partial_address || row.headline || '') +
      ' <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#fed7aa;">ZIP MISSING</span>' +
      (row.county ? ' <span style="font-weight:500;font-size:11px;color:#6b7280;">(' + esc(row.county) + ' County)</span>' : '') + '</div>' +
      '<div style="font-size:12px;margin-top:3px;">' +
      link('Open official document (find the zip here)', row.source_document_url || row.source_url) +
      link('Maps search (zip unverified - review)', row.maps_search_url_review_needed) + '</div>' +
      (row.census_zip_suggestion
        ? '<div style="font-size:12px;margin-top:3px;color:#065f46;">US Census geocoder suggests zip <b>' + esc(row.census_zip_suggestion) + '</b>' +
          (row.census_matched_address ? ' (' + esc(row.census_matched_address) + ')' : '') + ' - confirm it in the document.</div>'
        : '') +
      '<div style="font-size:12px;margin-top:3px;">Next action: <b>' + esc(row.next_best_action || 'VERIFY_ZIP_FROM_SOURCE_DOCUMENT') + '</b></div>' +
      '</div>';
  }

  function zipReviewPanel(rows) {
    var zipRows = rows.filter(function (r) { return r.quality_bucket === 'NEEDS_ZIP_REVIEW'; });
    var body = zipRows.length
      ? zipRows.map(zipReviewCard).join('')
      : '<div style="font-size:12px;color:#6b7280;">No zip-review rows right now. New ones appear when OCR reads a street + city but the zip is unreadable.</div>';
    return panelBox('ZIP Review <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#fed7aa;">' + zipRows.length + '</span>',
      'Real addresses from official documents with an unreadable zip. Open the document, read the zip yourself, then search. Never guess or fake a zip.',
      body, '#fdba74');
  }

  function coverageTable(batch) {
    var coverage = batch && batch.source_coverage;
    if (!coverage || !coverage.length) return '';
    var rows = coverage.map(function (item) {
      var ok = item.candidate_count > 0;
      return '<tr>' +
        '<td style="padding:2px 8px;border-bottom:1px solid #f3f4f6;">' + esc(item.county || '') + '</td>' +
        '<td style="padding:2px 8px;border-bottom:1px solid #f3f4f6;">' + esc(item.source_name || item.source_id) + '</td>' +
        '<td style="padding:2px 8px;border-bottom:1px solid #f3f4f6;">' + esc(item.status || 'unknown') + '</td>' +
        '<td style="padding:2px 8px;border-bottom:1px solid #f3f4f6;text-align:right;' + (ok ? 'color:#065f46;font-weight:600;' : '') + '">' + esc(item.candidate_count) + '</td>' +
        '<td style="padding:2px 8px;border-bottom:1px solid #f3f4f6;color:#991b1b;">' + esc(item.blocked_reason || '') + '</td>' +
        '</tr>';
    }).join('');
    return '<details style="margin-bottom:8px;"><summary style="cursor:pointer;font-size:12px;color:#2563eb;">Source coverage (' + coverage.length + ' lanes)</summary>' +
      '<table style="font-size:11px;border-collapse:collapse;margin-top:4px;"><tr>' +
      '<th style="text-align:left;padding:2px 8px;">County</th><th style="text-align:left;padding:2px 8px;">Source</th><th style="text-align:left;padding:2px 8px;">Status</th><th style="text-align:right;padding:2px 8px;">Rows</th><th style="text-align:left;padding:2px 8px;">Blocked reason</th></tr>' +
      rows + '</table></details>';
  }

  function topDealsPanel(rows) {
    var topRows = rows.filter(function (r) { return isActionableRow(r) || r.normalized_address; });
    var proofRows = rows.filter(function (r) { return topRows.indexOf(r) === -1; });
    var callReadyFirst = topRows.slice().sort(function (a, b) {
      function rank(r) {
        if (r.contact_status === 'CALL_READY') return 0;
        if (r.quality_bucket === 'INSPECT_NOW') return 1;
        if (r.quality_bucket === 'NEEDS_ZIP_REVIEW') return 2;
        return 3;
      }
      return rank(a) - rank(b);
    });
    var body = (callReadyFirst.length
      ? callReadyFirst.map(rowCard).join('')
      : '<div style="font-size:12px;color:#6b7280;">No actionable rows yet. Run a batch or wait for the next auto-run.</div>') +
      (proofRows.length ? '<details style="margin-top:6px;"><summary style="cursor:pointer;font-size:13px;color:#2563eb;">Source-proof rows without address yet (' + proofRows.length + ')</summary>' + proofRows.map(rowCard).join('') + '</details>' : '');
    return panelBox('Top Deals <span style="font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px;background:#fde68a;">' + callReadyFirst.length + '</span>',
      'CALL_READY first, then INSPECT_NOW, then ZIP review. Every link goes to the real public source.',
      body, '#fcd34d');
  }

  var lastData = null;
  var lastNote = '';

  function render(container, data, note) {
    lastData = data;
    lastNote = note || '';
    // The dashboard app rewrites #content.innerHTML on every page render,
    // which can replace our section - always target the live one.
    container = document.getElementById('wos-public-deals') || container;
    var body = container.querySelector('.wos-public-deals-body');
    if (!body) return;
    var rows = Array.isArray(data.rows) ? data.rows : [];
    body.innerHTML =
      (note ? '<div style="font-size:12px;color:#6b7280;margin-bottom:6px;">' + esc(note) + '</div>' : '') +
      dailyMachinePanel(data, rows) +
      zipReviewPanel(rows) +
      topDealsPanel(rows);
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
    button.textContent = 'Starting background batch...';
    var pollCount = 0;
    function finish(note) {
      button.disabled = false;
      button.textContent = 'Run next free batch';
      if (note) fetchLatestWithNote(container, note);
      else fetchLatest(container);
    }
    function fail(message) {
      container.querySelector('.wos-public-deals-body').innerHTML = '<div style="color:#991b1b;font-size:13px;">Batch failed: ' + esc(message) + '</div>';
      button.disabled = false;
      button.textContent = 'Run next free batch';
    }
    function poll(jobId) {
      pollCount += 1;
      if (pollCount > 100) return finish('Batch still running in the background - refresh later.');
      fetch(API_RUN.replace('/run', '/job/') + jobId, { headers: headers() })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var job = data && data.job;
          if (!job) return fail((data && data.error) || 'job lost');
          if (job.status === 'running') {
            button.textContent = 'Batch running (' + esc(job.stage || 'working') + ')... ' + pollCount * 6 + 's';
            setTimeout(function () { poll(jobId); }, 6000);
            return;
          }
          if (job.status === 'failed') return fail(job.error || 'batch failed');
          var summary = job.result_summary && job.result_summary.batch;
          finish('Batch complete - ' + (summary ? summary.new_rows + ' new rows' : 'done') + '.');
        })
        .catch(function (err) { fail(err.message); });
    }
    fetch(API_RUN, { method: 'POST', headers: headers(), body: JSON.stringify({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, limit: 25 }) })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.ok === false || !data.job) throw new Error((data && data.error) || 'could not start batch');
        button.textContent = data.already_running ? 'Joining running batch...' : 'Batch running in background...';
        poll(data.job.job_id);
      })
      .catch(function (err) { fail(err.message); });
  }

  function fetchLatestWithNote(container, note) {
    fetch(API_LATEST, { headers: headers() })
      .then(function (res) { return res.json(); })
      .then(function (data) { render(container, data || {}, note); })
      .catch(function () { fetchLatest(container); });
  }

  function mount() {
    if (document.getElementById('wos-public-deals')) return;
    var host = document.getElementById('content') || document.getElementById('app') || document.body;
    var section = document.createElement('section');
    section.id = 'wos-public-deals';
    section.style.cssText = 'margin:12px;padding:14px 16px;border:1px solid #d1d5db;border-radius:12px;background:#f9fafb;font-family:inherit;';
    section.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:8px;gap:8px;">' +
      '<h2 style="margin:0;font-size:17px;">Best Public Deals <span style="font-size:11px;font-weight:500;color:#6b7280;">free sources - preview snapshot, not saved leads</span></h2>' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
      '<label style="font-size:12px;color:#374151;display:flex;align-items:center;gap:4px;cursor:pointer;">' +
      '<input type="checkbox" id="wos-public-deals-auto"> Auto-refresh every 20 min</label>' +
      '<button id="wos-public-deals-run" style="padding:7px 14px;border-radius:8px;border:1px solid #2563eb;background:#2563eb;color:#fff;font-size:13px;cursor:pointer;">Run next free batch</button>' +
      '</div>' +
      '</div><div class="wos-public-deals-body" style="max-height:520px;overflow:auto;">Loading public deals...</div>';
    host.insertBefore(section, host.firstChild);
    var runButton = document.getElementById('wos-public-deals-run');
    runButton.addEventListener('click', function () { runBatch(section, this); });
    // Server-side scheduler (survives closing the tab); default OFF,
    // capped daily; 20 * 60 * 1000 ms minimum interval enforced server-side.
    var autoBox = document.getElementById('wos-public-deals-auto');
    autoBox.addEventListener('change', function () {
      var box = this;
      fetch(API_RUN.replace('/run', '/auto-run'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, enabled: box.checked, interval_minutes: 20 })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || data.ok === false) throw new Error((data && data.error) || 'auto-run update failed');
          fetchLatestWithNote(section, 'Auto-run ' + (data.auto_run && data.auto_run.enabled ? 'enabled (every ' + data.auto_run.interval_minutes + ' min, capped daily).' : 'disabled.'));
        })
        .catch(function (err) {
          box.checked = !box.checked;
          fetchLatestWithNote(section, 'Auto-run change failed: ' + err.message);
        });
    });
    if (lastData) {
      // Re-mount after the app wiped us: render the cached snapshot instantly.
      if (lastData.auto_run && lastData.auto_run.enabled) autoBox.checked = true;
      render(section, lastData, lastNote);
      return;
    }
    fetch(API_LATEST, { headers: headers() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.auto_run && data.auto_run.enabled) autoBox.checked = true;
        render(section, data || {}, data && data.has_snapshot ? '' : 'Snapshot cache only - nothing here is a saved lead.');
      })
      .catch(function () { fetchLatest(section); });
  }

  function keepMounted() {
    // The app does `content.innerHTML = ...` on every page render, destroying
    // anything mounted inside - watch for that and re-mount from cache.
    var observer = new MutationObserver(function () {
      if (!document.getElementById('wos-public-deals')) mount();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(function () {
      if (!document.getElementById('wos-public-deals')) mount();
    }, 3000);
  }

  function boot() {
    mount();
    keepMounted();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
