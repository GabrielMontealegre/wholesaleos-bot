// enrichment-queue.js — Phase 3B stable (Phase 3C rollback)
// Connectors disabled pending investigation. Mock pipeline active.
'use strict';

const db = require('./db');
const axios = require('axios');

// ── Queue state ───────────────────────────────────────────────────────────────
var _queue   = [];
var _running = false;
const RETRY_LIMIT   = 2;
const MAX_QUEUE_SIZE = 50;
const FETCH_TIMEOUT  = 28000;

// ── Owner type classifier ─────────────────────────────────────────────────────
function classifyOwnerType(name) {
  if (!name) return null;
  var n = name.toUpperCase().trim();
  if (/\b(LLC|L\.L\.C|LIMITED LIABILITY)\b/.test(n)) return 'LLC';
  if (/\b(INC|INCORPORATED|CORP|CORPORATION)\b/.test(n)) return 'corporation';
  if (/\b(TRUST|TRUSTEE|REVOCABLE|IRREVOCABLE)\b/.test(n)) return 'trust';
  if (/\b(ESTATE|HEIR|HEIRS|EXECUTOR)\b/.test(n)) return 'estate';
  if (/\b(BANK|SAVINGS|FEDERAL|MORTGAGE|FINANCIAL)\b/.test(n)) return 'bank';
  if (/\b(CITY OF|COUNTY OF|COMMONWEALTH|STATE OF|AUTHORITY|HUD)\b/.test(n)) return 'government';
  if (/\b(ASSOC|ASSO\b|ASSOCIATION|CHURCH|COMMUNITY|FOUNDATION|DEMOCRATIC)/.test(n)) return 'organization';
  if (/^[A-Z]+\s+[A-Z]/.test(n)) return 'individual';
  return null;
}

// ── Enrichment fetcher — Philly OPA only (others return null safely) ──────────
async function fetchOwnerData(lead) {
  var state  = (lead.state  || '').toUpperCase().trim();
  var source = (lead.source || '').toLowerCase();

  if (state === 'PA' || /philadelphia|l.?i/i.test(source)) {
    return fetchPhillyOPA(lead);
  }
  // Nashville TN — lazy require inside function, wrapped in try/catch (Phase 3C)
  if (state === 'TN' || /nashville/i.test(source)) {
    try {
      var nashConn = require('./modules/enrichment/connectors/nashville-arcgis');
      return nashConn.lookup(lead);
    } catch(connErr) {
      console.error('[EnrichQ] Nashville connector error:', connErr.message);
      return { owner_name: null, source_name: 'nashville_arcgis', notes: 'Connector error: ' + connErr.message };
    }
  }
  // Other cities: no connector active — return null safely
  return {
    owner_name: null,
    source_name: 'no_connector',
    notes: 'Owner lookup not configured for ' + (lead.city || state)
  };
}

async function fetchPhillyOPA(lead) {
  var addr = (lead.address || '').trim();
  if (!addr) return { owner_name: null, source_name: 'philly_opa', notes: 'No address' };
  var resp = await axios.get('https://data.phila.gov/resource/w7rb-qrn8.json', {
    params: { location: addr, $limit: 1 },
    timeout: FETCH_TIMEOUT,
    headers: { Accept: 'application/json' }
  });
  var rec = (resp.data || [])[0];
  if (!rec) return { owner_name: null, source_name: 'philly_opa', notes: 'No OPA record found' };
  return {
    owner_name: rec.owner_1 || null,
    owner_2: rec.owner_2 || null,
    parcel_number: rec.parcel_number || null,
    market_value: rec.market_value || null,
    source_name: 'philly_opa',
    notes: 'Philadelphia OPA open data'
  };
}

// ── Queue persistence ─────────────────────────────────────────────────────────
function _persistQueue() {
  try {
    var dbData = db.readDB();
    dbData._enrichment_queue = _queue.map(function(item) {
      return { leadId: item.leadId, attempts: item.attempts };
    });
    db.writeDB(dbData);
  } catch(e) { console.error('[EnrichQ] persist error:', e.message); }
}

function restoreQueue() {
  try {
    var dbData = db.readDB();
    var saved  = dbData._enrichment_queue || [];
    if (!saved.length) return;
    var leads = db.getLeads();
    saved.forEach(function(item) {
      var lead = leads.find(function(l) { return l.id === item.leadId; });
      if (!lead) return;
      if (['queued','in_progress'].indexOf(lead.enrichment_status) === -1) return;
      if (_queue.find(function(q) { return q.leadId === item.leadId; })) return;
      if (lead.enrichment_status === 'in_progress') {
        db.updateEnrichmentStatus(item.leadId, { enrichment_status: 'queued' });
      }
      _queue.push({ leadId: item.leadId, attempts: item.attempts || 0 });
    });
    if (_queue.length > 0 && !_running) _processNext();
    console.log('[EnrichQ] Restored', _queue.length, 'jobs');
  } catch(e) { console.error('[EnrichQ] restore error:', e.message); }
}

// ── Enqueue ───────────────────────────────────────────────────────────────────
function enqueue(leadId) {
  if (_queue.length >= MAX_QUEUE_SIZE) return { queued: false, reason: 'queue_full', max: MAX_QUEUE_SIZE };
  var already = _queue.find(function(item) { return item.leadId === leadId; });
  if (already) return { queued: false, reason: 'already_queued' };
  _queue.push({ leadId: leadId, attempts: 0 });
  _persistQueue();
  db.updateEnrichmentStatus(leadId, { enrichment_status: 'queued', last_enrichment_attempt: new Date().toISOString() });
  if (!_running) _processNext();
  return { queued: true, leadId: leadId, position: _queue.length };
}

// ── Process ───────────────────────────────────────────────────────────────────
function _processNext() {
  if (_queue.length === 0) { _running = false; _persistQueue(); return; }
  _running = true;
  var item = _queue.shift();
  _persistQueue();
  var leadId = item.leadId;
  db.updateEnrichmentStatus(leadId, { enrichment_status: 'in_progress' });

  var done = false;
  var timeout = setTimeout(function() {
    if (done) return;
    done = true;
    console.error('[EnrichQ] Timeout:', leadId);
    try { db.updateEnrichmentStatus(leadId, { enrichment_status: 'failed', enrichment_notes: 'Timeout', enrichment_date: new Date().toISOString() }); } catch(e) {}
    setTimeout(_processNext, 200);
  }, FETCH_TIMEOUT + 2000);

  _runEnrichment(leadId)
    .then(function(result) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      _applyResult(leadId, item, result, null);
    })
    .catch(function(err) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      _applyResult(leadId, item, null, err);
    });
}

function _applyResult(leadId, item, result, err) {
  if (err) {
    item.attempts++;
    if (item.attempts < RETRY_LIMIT) {
      db.updateEnrichmentStatus(leadId, { enrichment_status: 'queued' });
      _queue.unshift(item);
      _persistQueue();
    } else {
      try { db.updateEnrichmentStatus(leadId, { enrichment_status: 'failed', enrichment_notes: 'Failed: ' + err.message, enrichment_date: new Date().toISOString() }); } catch(e) {}
      try { db.addEnrichmentHistory(leadId, { status: 'failed', source: null, fields_updated: [], notes: err.message }); } catch(e) {}
    }
  } else {
    var updates = { enrichment_status: 'complete', enrichment_date: new Date().toISOString() };
    var fieldsUpdated = [];
    if (result.source_name) updates.enrichment_source = result.source_name;
    if (result.notes)       updates.enrichment_notes  = result.notes;
    if (result.owner_name)  { updates.owner_name = result.owner_name; updates.owner_type = classifyOwnerType(result.owner_name); fieldsUpdated.push('owner_name','owner_type'); }
    if (result.parcel_number) { updates.parcel_number = result.parcel_number; fieldsUpdated.push('parcel_number'); }
    if (result.market_value)  { updates.market_value  = result.market_value;  fieldsUpdated.push('market_value'); }
    try { db.updateEnrichmentStatus(leadId, updates); } catch(e) {}
    try { db.addEnrichmentHistory(leadId, { status: 'complete', source: result.source_name || null, fields_updated: fieldsUpdated, notes: result.notes || null }); } catch(e) {}
    console.log('[EnrichQ] Complete:', leadId, fieldsUpdated.join(',') || 'no_owner_data');
  }
  setTimeout(_processNext, 200);
}

async function _runEnrichment(leadId) {
  var leads = db.getLeads();
  var lead  = leads.find(function(l) { return l.id === leadId; });
  if (!lead) throw new Error('Lead not found: ' + leadId);
  return fetchOwnerData(lead);
}

function getStatus() {
  return { queue_length: _queue.length, running: _running, pending: _queue.map(function(item) { return { leadId: item.leadId, attempts: item.attempts }; }) };
}

module.exports = { enqueue: enqueue, getStatus: getStatus, restoreQueue: restoreQueue };
