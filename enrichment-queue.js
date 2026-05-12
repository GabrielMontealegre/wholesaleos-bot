// enrichment-queue.js — Phase 3B
// In-memory queue with db.json persistence, real owner lookup (Philly OPA),
// owner type classifier, enrichment_history logging.
// Concurrency: 1 | Retry: 2 | Timeout: 30s

'use strict';

const db    = require('./db');
const axios = require('axios');

// ── Queue state ───────────────────────────────────────────────────────────────
let   _queue   = [];
let   _running = false;
const RETRY_LIMIT  = 2;
const MOCK_DELAY   = 800;
const FETCH_TIMEOUT= 28000;

// ── Owner type classifier (rule-based, Phase 3B Task 4) ───────────────────────
function classifyOwnerType(name) {
  if (!name) return null;
  var n = name.toUpperCase().trim();
  if (/\b(LLC|L\.L\.C|LTD LIABILITY|LIMITED LIABILITY)\b/.test(n)) return 'LLC';
  if (/\b(INC|INCORPORATED|CORP|CORPORATION|CO\.)\b/.test(n)) return 'corporation';
  if (/\b(TRUST|TR\.|TRUSTEE|REVOCABLE|IRREVOCABLE)\b/.test(n)) return 'trust';
  if (/\b(ESTATE|EST\.|HEIR|HEIRS|EXECUTOR)\b/.test(n)) return 'estate';
  if (/\b(BANK|SAVINGS|FEDERAL|NA\b|FSB\b|MORTGAGE|FINANCIAL)\b/.test(n)) return 'bank';
  if (/\b(CITY OF|COUNTY OF|COMMONWEALTH|STATE OF|AUTHORITY|HOUSING|HUD|PHILA\b)\b/.test(n)) return 'government';
  if (/\b(ASSOC|ASSO\b|ASSOCIATION|DEMOCRATIC|REPUBLICAN|CHURCH|COMMUNITY|CENTER|FOUNDATION|PARK ASSO)/.test(n)) return 'organization';
  // Multiple distinct words with no entity markers = likely individual
  if (/^[A-Z]+\s+[A-Z]/.test(n)) return 'individual';
  return null;
}

// ── Source-aware enrichment fetcher (Phase 3B Task 3) ────────────────────────
async function fetchOwnerData(lead) {
  var source = (lead.source || '').toLowerCase();
  var state  = (lead.state  || '').toUpperCase().trim();

  // Philadelphia PA — OPA public API (no auth)
  if (state === 'PA' || /philadelphia|phila|l.?i/i.test(source)) {
    return await fetchPhillyOPA(lead);
  }

  // Other cities: no verified open API yet — return null cleanly
  return { owner_name: null, owner_2: null, parcel_number: null,
           source_name: 'no_api_configured', notes: 'Owner lookup not configured for ' + (lead.city || state) };
}

// ── Philadelphia OPA (Office of Property Assessment) ─────────────────────────
async function fetchPhillyOPA(lead) {
  var addr = (lead.address || '').trim();
  if (!addr) throw new Error('No address');

  var url = 'https://data.phila.gov/resource/w7rb-qrn8.json';
  var resp = await axios.get(url, {
    params: { location: addr, $limit: 1 },
    timeout: FETCH_TIMEOUT,
    headers: { 'Accept': 'application/json' }
  });

  var records = resp.data;
  if (!records || !records.length) {
    return { owner_name: null, owner_2: null, parcel_number: null,
             source_name: 'philly_opa', notes: 'No OPA record found for address' };
  }

  var rec = records[0];
  return {
    owner_name:    rec.owner_1 || null,
    owner_2:       rec.owner_2 || null,
    parcel_number: rec.parcel_number || null,
    market_value:  rec.market_value || null,
    sale_date:     rec.sale_date || null,
    sale_price:    rec.sale_price || null,
    source_name:   'philly_opa',
    notes:         'Fetched from Philadelphia OPA open data'
  };
}

// ── Persist queue to db.json ──────────────────────────────────────────────────
function _persistQueue() {
  try {
    var dbData = db.readDB();
    dbData._enrichment_queue = _queue.map(function(item) {
      return { leadId: item.leadId, attempts: item.attempts };
    });
    db.writeDB(dbData);
  } catch(e) {
    console.error('[EnrichQ] persist error:', e.message);
  }
}

// ── Restore queue from db.json on startup ─────────────────────────────────────
function restoreQueue() {
  try {
    var dbData = db.readDB();
    var saved  = dbData._enrichment_queue || [];
    if (!saved.length) return;
    // Only restore items whose leads are still in queued/in_progress state
    var leads = db.getLeads();
    saved.forEach(function(item) {
      var lead = leads.find(function(l) { return l.id === item.leadId; });
      if (!lead) return;
      if (['queued','in_progress'].indexOf(lead.enrichment_status) === -1) return;
      if (_queue.find(function(q) { return q.leadId === item.leadId; })) return;
      // Reset in_progress → queued on restore (process died mid-flight)
      if (lead.enrichment_status === 'in_progress') {
        db.updateEnrichmentStatus(item.leadId, { enrichment_status: 'queued' });
      }
      _queue.push({ leadId: item.leadId, attempts: item.attempts || 0 });
    });
    if (_queue.length > 0 && !_running) _processNext();
    console.log('[EnrichQ] Restored', _queue.length, 'queued jobs from db.json');
  } catch(e) {
    console.error('[EnrichQ] restore error:', e.message);
  }
}

// ── Enqueue — Phase 3B: single increment only ─────────────────────────────────
function enqueue(leadId) {
  var already = _queue.find(function(item) { return item.leadId === leadId; });
  if (already) return { queued: false, reason: 'already_queued' };

  _queue.push({ leadId: leadId, attempts: 0 });
  _persistQueue();

  // Mark queued in DB — do NOT increment attempts here (route already does it)
  db.updateEnrichmentStatus(leadId, {
    enrichment_status: 'queued',
    last_enrichment_attempt: new Date().toISOString()
  });

  if (!_running) _processNext();
  return { queued: true, leadId: leadId, position: _queue.length };
}

// ── Process next item ─────────────────────────────────────────────────────────
function _processNext() {
  if (_queue.length === 0) { _running = false; _persistQueue(); return; }
  _running = true;

  var item = _queue.shift();
  _persistQueue();
  var leadId = item.leadId;

  db.updateEnrichmentStatus(leadId, { enrichment_status: 'in_progress' });

  var timeout = setTimeout(function() {
    console.error('[EnrichQ] Timeout:', leadId);
    _finalizeResult(leadId, item, null, new Error('Timeout'));
  }, FETCH_TIMEOUT + 2000);

  _runEnrichment(leadId)
    .then(function(result) {
      clearTimeout(timeout);
      _finalizeResult(leadId, item, result, null);
    })
    .catch(function(err) {
      clearTimeout(timeout);
      _finalizeResult(leadId, item, null, err);
    });
}

// ── Finalize enrichment result ────────────────────────────────────────────────
function _finalizeResult(leadId, item, result, err) {
  if (err) {
    item.attempts++;
    if (item.attempts < RETRY_LIMIT) {
      console.warn('[EnrichQ] Retry', item.attempts, 'for', leadId);
      db.updateEnrichmentStatus(leadId, { enrichment_status: 'queued' });
      _queue.unshift(item);
      _persistQueue();
    } else {
      console.error('[EnrichQ] Failed:', leadId, err.message);
      db.updateEnrichmentStatus(leadId, {
        enrichment_status: 'failed',
        enrichment_notes:  'Failed: ' + err.message,
        enrichment_date:   new Date().toISOString()
      });
      db.addEnrichmentHistory(leadId, {
        status: 'failed', source: null, fields_updated: [], notes: err.message
      });
    }
  } else {
    // Apply owner data — only if real data found
    var fieldsUpdated = [];
    var updates = { enrichment_status: 'complete', enrichment_date: new Date().toISOString() };

    if (result.source_name) updates.enrichment_source = result.source_name;
    if (result.notes)       updates.enrichment_notes  = result.notes;

    // Populate owner fields only if real data exists — NEVER fake
    if (result.owner_name) {
      updates.owner_name  = result.owner_name;
      updates.owner_type  = classifyOwnerType(result.owner_name);
      fieldsUpdated.push('owner_name', 'owner_type');
    }
    if (result.owner_2 && !updates.owner_name) {
      updates.owner_name = result.owner_2;
      updates.owner_type = classifyOwnerType(result.owner_2);
      fieldsUpdated.push('owner_name', 'owner_type');
    }
    // Additional property data as source context
    if (result.parcel_number) { updates.parcel_number  = result.parcel_number; fieldsUpdated.push('parcel_number'); }
    if (result.market_value)  { updates.market_value   = result.market_value;  fieldsUpdated.push('market_value'); }

    db.updateEnrichmentStatus(leadId, updates);
    db.addEnrichmentHistory(leadId, {
      status: 'complete',
      source: result.source_name || null,
      fields_updated: fieldsUpdated,
      notes: result.notes || null
    });
    console.log('[EnrichQ] Complete:', leadId, 'fields:', fieldsUpdated.join(',') || 'none');
  }
  setTimeout(_processNext, 200);
}

// ── Run enrichment (calls source-aware fetcher) ───────────────────────────────
async function _runEnrichment(leadId) {
  var leads = db.getLeads();
  var lead  = leads.find(function(l) { return l.id === leadId; });
  if (!lead) throw new Error('Lead not found: ' + leadId);
  return await fetchOwnerData(lead);
}

// ── Queue status ──────────────────────────────────────────────────────────────
function getStatus() {
  return {
    queue_length: _queue.length,
    running:      _running,
    pending: _queue.map(function(item) { return { leadId: item.leadId, attempts: item.attempts }; })
  };
}

module.exports = { enqueue: enqueue, getStatus: getStatus, restoreQueue: restoreQueue };
