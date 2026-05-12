// enrichment-queue.js — Phase 3C
// Thin orchestrator — delegates to city connectors.
// Concurrency: 1 | Retry: 2 | Max queue: 100 | Timeout: 30s per lead
'use strict';

const db = require('./db');

// ── Connector registry ────────────────────────────────────────────────────────
const CONNECTORS = {
  PA:         () => require('./modules/enrichment/connectors/philadelphia'),
  TN:         () => require('./modules/enrichment/connectors/nashville'),
  IN:         () => require('./modules/enrichment/connectors/south-bend'),
  AZ:         () => require('./modules/enrichment/connectors/glendale'),
  NY:         () => require('./modules/enrichment/connectors/syracuse'),
};

// Source keyword → state override (for ambiguous sources)
const SOURCE_STATE_MAP = {
  'philadelphia': 'PA', 'phila': 'PA', 'l&i': 'PA',
  'nashville': 'TN', 'davidson': 'TN',
  'south bend': 'IN', 'southbend': 'IN',
  'glendale': 'AZ', 'maricopa': 'AZ',
  'syracuse': 'NY', 'onondaga': 'NY',
};

function _resolveState(lead) {
  var state  = (lead.state  || '').toUpperCase().trim();
  var source = (lead.source || '').toLowerCase();
  if (CONNECTORS[state]) return state;
  // Try source keyword override
  for (var kw in SOURCE_STATE_MAP) {
    if (source.indexOf(kw) > -1) return SOURCE_STATE_MAP[kw];
  }
  return null;
}

// ── Queue state ───────────────────────────────────────────────────────────────
let _queue   = [];
let _running = false;
const MAX_QUEUE_SIZE = 100;
const RETRY_LIMIT    = 2;
const LEAD_TIMEOUT   = 30000;

// ── Persist queue to db.json ──────────────────────────────────────────────────
function _persistQueue() {
  try {
    var d = db.readDB();
    d._enrichment_queue = _queue.map(function(i){ return {leadId:i.leadId,attempts:i.attempts}; });
    db.writeDB(d);
  } catch(e) { console.error('[EnrichQ] persist:', e.message); }
}

// ── Restore queue on startup ──────────────────────────────────────────────────
function restoreQueue() {
  try {
    var saved = db.readDB()._enrichment_queue || [];
    if (!saved.length) return;
    var leads = db.getLeads();
    saved.forEach(function(item) {
      var lead = leads.find(function(l){ return l.id === item.leadId; });
      if (!lead) return;
      if (['queued','in_progress'].indexOf(lead.enrichment_status) === -1) return;
      if (_queue.find(function(q){ return q.leadId === item.leadId; })) return;
      if (lead.enrichment_status === 'in_progress') {
        db.updateEnrichmentStatus(item.leadId, { enrichment_status: 'queued' });
      }
      _queue.push({ leadId: item.leadId, attempts: item.attempts || 0 });
    });
    if (_queue.length > 0 && !_running) _processNext();
    console.log('[EnrichQ] Restored', _queue.length, 'jobs');
  } catch(e) { console.error('[EnrichQ] restore:', e.message); }
}

// ── Enqueue ───────────────────────────────────────────────────────────────────
function enqueue(leadId) {
  if (_queue.length >= MAX_QUEUE_SIZE) {
    return { queued: false, reason: 'queue_full', max: MAX_QUEUE_SIZE };
  }
  if (_queue.find(function(i){ return i.leadId === leadId; })) {
    return { queued: false, reason: 'already_queued' };
  }
  _queue.push({ leadId: leadId, attempts: 0 });
  _persistQueue();
  db.updateEnrichmentStatus(leadId, {
    enrichment_status: 'queued',
    last_enrichment_attempt: new Date().toISOString()
  });
  if (!_running) _processNext();
  return { queued: true, leadId: leadId, position: _queue.length };
}

// ── Process next ──────────────────────────────────────────────────────────────
function _processNext() {
  if (_queue.length === 0) { _running = false; _persistQueue(); return; }
  _running = true;

  var item   = _queue.shift();
  _persistQueue();
  var leadId = item.leadId;

  db.updateEnrichmentStatus(leadId, { enrichment_status: 'in_progress' });

  var timedOut = false;
  var timer = setTimeout(function() {
    timedOut = true;
    console.error('[EnrichQ] Timeout:', leadId);
    _fail(leadId, item, new Error('Connector timeout'));
  }, LEAD_TIMEOUT);

  _runEnrichment(leadId)
    .then(function(result) {
      if (timedOut) return;
      clearTimeout(timer);
      _succeed(leadId, result);
    })
    .catch(function(err) {
      if (timedOut) return;
      clearTimeout(timer);
      _fail(leadId, item, err);
    });
}

// ── Run enrichment via connector ──────────────────────────────────────────────
async function _runEnrichment(leadId) {
  var leads  = db.getLeads();
  var lead   = leads.find(function(l){ return l.id === leadId; });
  if (!lead) throw new Error('Lead not found: ' + leadId);

  var stateKey = _resolveState(lead);
  if (!stateKey || !CONNECTORS[stateKey]) {
    // Graceful null — no connector for this location
    return {
      owner_name:  null, owner_type: null,
      source_name: 'no_connector',
      notes:       'No enrichment connector configured for state: ' + (lead.state || 'unknown')
    };
  }

  // Load connector — isolated per call, failure contained
  var connector;
  try { connector = CONNECTORS[stateKey](); }
  catch(e) { throw new Error('Connector load error (' + stateKey + '): ' + e.message); }

  return await connector.fetchOwnerData(lead);
}

// ── Finalize success ──────────────────────────────────────────────────────────
function _succeed(leadId, result) {
  var updates      = { enrichment_status: 'complete', enrichment_date: new Date().toISOString() };
  var fieldsUpdated = [];

  if (result.source_name) updates.enrichment_source = result.source_name;
  if (result.notes)       updates.enrichment_notes  = result.notes;

  if (result.owner_name) {
    updates.owner_name  = result.owner_name;
    updates.owner_type  = result.owner_type || null;
    fieldsUpdated.push('owner_name', 'owner_type');
  }
  if (result.parcel_number) { updates.parcel_number = result.parcel_number; fieldsUpdated.push('parcel_number'); }
  if (result.market_value)  { updates.market_value  = result.market_value;  fieldsUpdated.push('market_value'); }

  db.updateEnrichmentStatus(leadId, updates);
  db.addEnrichmentHistory(leadId, {
    status: 'complete', source: result.source_name || null,
    fields_updated: fieldsUpdated, notes: result.notes || null
  });
  console.log('[EnrichQ] OK:', leadId, 'fields:', fieldsUpdated.join(',') || 'none (no data)');
  setTimeout(_processNext, 150);
}

// ── Finalize failure ──────────────────────────────────────────────────────────
function _fail(leadId, item, err) {
  item.attempts++;
  if (item.attempts < RETRY_LIMIT) {
    console.warn('[EnrichQ] Retry', item.attempts, ':', leadId);
    db.updateEnrichmentStatus(leadId, { enrichment_status: 'queued' });
    _queue.unshift(item);
    _persistQueue();
  } else {
    db.updateEnrichmentStatus(leadId, {
      enrichment_status: 'failed',
      enrichment_notes:  'Failed: ' + err.message,
      enrichment_date:   new Date().toISOString()
    });
    db.addEnrichmentHistory(leadId, { status:'failed', source:null, fields_updated:[], notes:err.message });
    console.error('[EnrichQ] Failed:', leadId, err.message);
  }
  setTimeout(_processNext, 150);
}

// ── Queue status ──────────────────────────────────────────────────────────────
function getStatus() {
  return {
    queue_length: _queue.length,
    running:      _running,
    max_size:     MAX_QUEUE_SIZE,
    pending: _queue.map(function(i){ return { leadId:i.leadId, attempts:i.attempts }; })
  };
}

module.exports = { enqueue, getStatus, restoreQueue };// ── Source-aware enrichment — delegate to connector router (Phase 3C) ────────
const connectors = require('./modules/enrichment/connectors/index');

async function fetchOwnerData(lead) {
  // Connector router handles PA/TN/NY — returns null safely for unsupported cities
  return await connectors.lookup(lead);
}

// ── Persist queue to db.jsonC
// Thin orchestrator — delegates to city connectors.
// Concurrency: 1 | Retry: 2 | Max queue: 100 | Timeout: 30s per lead
'use strict';

const db = require('./db');

// ── Connector registry ────────────────────────────────────────────────────────
const CONNECTORS = {
  PA:         () => require('./modules/enrichment/connectors/philadelphia'),
  TN:         () => require('./modules/enrichment/connectors/nashville'),
  IN:         () => require('./modules/enrichment/connectors/south-bend'),
  AZ:         () => require('./modules/enrichment/connectors/glendale'),
  NY:         () => require('./modules/enrichment/connectors/syracuse'),
};

// Source keyword → state override (for ambiguous sources)
const SOURCE_STATE_MAP = {
  'philadelphia': 'PA', 'phila': 'PA', 'l&i': 'PA',
  'nashville': 'TN', 'davidson': 'TN',
  'south bend': 'IN', 'southbend': 'IN',
  'glendale': 'AZ', 'maricopa': 'AZ',
  'syracuse': 'NY', 'onondaga': 'NY',
};

function _resolveState(lead) {
  var state  = (lead.state  || '').toUpperCase().trim();
  var source = (lead.source || '').toLowerCase();
  if (CONNECTORS[state]) return state;
  // Try source keyword override
  for (var kw in SOURCE_STATE_MAP) {
    if (source.indexOf(kw) > -1) return SOURCE_STATE_MAP[kw];
  }
  return null;
}

// ── Queue state ───────────────────────────────────────────────────────────────
let _queue   = [];
let _running = false;
const MAX_QUEUE_SIZE = 100;
const RETRY_LIMIT    = 2;
const LEAD_TIMEOUT   = 30000;

// ── Persist queue to db.json ──────────────────────────────────────────────────
function _persistQueue() {
  try {
    var d = db.readDB();
    d._enrichment_queue = _queue.map(function(i){ return {leadId:i.leadId,attempts:i.attempts}; });
    db.writeDB(d);
  } catch(e) { console.error('[EnrichQ] persist:', e.message); }
}

// ── Restore queue on startup ──────────────────────────────────────────────────
function restoreQueue() {
  try {
    var saved = db.readDB()._enrichment_queue || [];
    if (!saved.length) return;
    var leads = db.getLeads();
    saved.forEach(function(item) {
      var lead = leads.find(function(l){ return l.id === item.leadId; });
      if (!lead) return;
      if (['queued','in_progress'].indexOf(lead.enrichment_status) === -1) return;
      if (_queue.find(function(q){ return q.leadId === item.leadId; })) return;
      if (lead.enrichment_status === 'in_progress') {
        db.updateEnrichmentStatus(item.leadId, { enrichment_status: 'queued' });
      }
      _queue.push({ leadId: item.leadId, attempts: item.attempts || 0 });
    });
    if (_queue.length > 0 && !_running) _processNext();
    console.log('[EnrichQ] Restored', _queue.length, 'jobs');
  } catch(e) { console.error('[EnrichQ] restore:', e.message); }
}

// ── Enqueue ───────────────────────────────────────────────────────────────────
function enqueue(leadId) {
  if (_queue.length >= MAX_QUEUE_SIZE) {
    return { queued: false, reason: 'queue_full', max: MAX_QUEUE_SIZE };
  }
  if (_queue.find(function(i){ return i.leadId === leadId; })) {
    return { queued: false, reason: 'already_queued' };
  }
  _queue.push({ leadId: leadId, attempts: 0 });
  _persistQueue();
  db.updateEnrichmentStatus(leadId, {
    enrichment_status: 'queued',
    last_enrichment_attempt: new Date().toISOString()
  });
  if (!_running) _processNext();
  return { queued: true, leadId: leadId, position: _queue.length };
}

// ── Process next ──────────────────────────────────────────────────────────────
function _processNext() {
  if (_queue.length === 0) { _running = false; _persistQueue(); return; }
  _running = true;

  var item   = _queue.shift();
  _persistQueue();
  var leadId = item.leadId;

  db.updateEnrichmentStatus(leadId, { enrichment_status: 'in_progress' });

  var timedOut = false;
  var timer = setTimeout(function() {
    timedOut = true;
    console.error('[EnrichQ] Timeout:', leadId);
    _fail(leadId, item, new Error('Connector timeout'));
  }, LEAD_TIMEOUT);

  _runEnrichment(leadId)
    .then(function(result) {
      if (timedOut) return;
      clearTimeout(timer);
      _succeed(leadId, result);
    })
    .catch(function(err) {
      if (timedOut) return;
      clearTimeout(timer);
      _fail(leadId, item, err);
    });
}

// ── Run enrichment via connector ──────────────────────────────────────────────
async function _runEnrichment(leadId) {
  var leads  = db.getLeads();
  var lead   = leads.find(function(l){ return l.id === leadId; });
  if (!lead) throw new Error('Lead not found: ' + leadId);

  var stateKey = _resolveState(lead);
  if (!stateKey || !CONNECTORS[stateKey]) {
    // Graceful null — no connector for this location
    return {
      owner_name:  null, owner_type: null,
      source_name: 'no_connector',
      notes:       'No enrichment connector configured for state: ' + (lead.state || 'unknown')
    };
  }

  // Load connector — isolated per call, failure contained
  var connector;
  try { connector = CONNECTORS[stateKey](); }
  catch(e) { throw new Error('Connector load error (' + stateKey + '): ' + e.message); }

  return await connector.fetchOwnerData(lead);
}

// ── Finalize success ──────────────────────────────────────────────────────────
function _succeed(leadId, result) {
  var updates      = { enrichment_status: 'complete', enrichment_date: new Date().toISOString() };
  var fieldsUpdated = [];

  if (result.source_name) updates.enrichment_source = result.source_name;
  if (result.notes)       updates.enrichment_notes  = result.notes;

  if (result.owner_name) {
    updates.owner_name  = result.owner_name;
    updates.owner_type  = result.owner_type || null;
    fieldsUpdated.push('owner_name', 'owner_type');
  }
  if (result.parcel_number) { updates.parcel_number = result.parcel_number; fieldsUpdated.push('parcel_number'); }
  if (result.market_value)  { updates.market_value  = result.market_value;  fieldsUpdated.push('market_value'); }

  db.updateEnrichmentStatus(leadId, updates);
  db.addEnrichmentHistory(leadId, {
    status: 'complete', source: result.source_name || null,
    fields_updated: fieldsUpdated, notes: result.notes || null
  });
  console.log('[EnrichQ] OK:', leadId, 'fields:', fieldsUpdated.join(',') || 'none (no data)');
  setTimeout(_processNext, 150);
}

// ── Finalize failure ──────────────────────────────────────────────────────────
function _fail(leadId, item, err) {
  item.attempts++;
  if (item.attempts < RETRY_LIMIT) {
    console.warn('[EnrichQ] Retry', item.attempts, ':', leadId);
    db.updateEnrichmentStatus(leadId, { enrichment_status: 'queued' });
    _queue.unshift(item);
    _persistQueue();
  } else {
    db.updateEnrichmentStatus(leadId, {
      enrichment_status: 'failed',
      enrichment_notes:  'Failed: ' + err.message,
      enrichment_date:   new Date().toISOString()
    });
    db.addEnrichmentHistory(leadId, { status:'failed', source:null, fields_updated:[], notes:err.message });
    console.error('[EnrichQ] Failed:', leadId, err.message);
  }
  setTimeout(_processNext, 150);
}

// ── Queue status ──────────────────────────────────────────────────────────────
function getStatus() {
  return {
    queue_length: _queue.length,
    running:      _running,
    max_size:     MAX_QUEUE_SIZE,
    pending: _queue.map(function(i){ return { leadId:i.leadId, attempts:i.attempts }; })
  };
}

module.exports = { enqueue, getStatus, restoreQueue };
