// enrichment-queue.js — Phase 3A
// Lightweight in-memory enrichment queue. No Redis, no BullMQ, no external deps.
// Concurrency: 1 | Retry limit: 2 | Status: queued → in_progress → complete/failed

'use strict';

const db = require('./db');

// ── Queue state ───────────────────────────────────────────────────────────────
const _queue     = [];   // [{leadId, attempts}]
let   _running   = false;
const CONCURRENCY = 1;
const RETRY_LIMIT = 2;
const MOCK_DELAY  = 1500; // ms — simulate async work

// ── Enqueue a lead for enrichment ─────────────────────────────────────────────
function enqueue(leadId) {
  // Prevent duplicate queue entries
  const already = _queue.find(function(item) { return item.leadId === leadId; });
  if (already) return { queued: false, reason: 'already_queued' };

  _queue.push({ leadId: leadId, attempts: 0 });

  // Mark lead as queued in DB immediately
  db.updateEnrichmentStatus(leadId, {
    enrichment_status:       'queued',
    last_enrichment_attempt: new Date().toISOString(),
    enrichment_attempts:     (db.getLeads().find(function(l){return l.id===leadId;})||{}).enrichment_attempts + 1 || 1
  });

  // Start processing if not already running
  if (!_running) _processNext();

  return { queued: true, leadId: leadId, position: _queue.length };
}

// ── Process next item in queue ────────────────────────────────────────────────
function _processNext() {
  if (_queue.length === 0) { _running = false; return; }
  _running = true;

  const item = _queue.shift();
  const { leadId } = item;

  // Mark in_progress
  try {
    db.updateEnrichmentStatus(leadId, { enrichment_status: 'in_progress' });
  } catch(e) {
    console.error('[EnrichQ] Failed to mark in_progress for', leadId, e.message);
    _processNext();
    return;
  }

  // Safety timeout — if mock/real process hangs, fail gracefully
  const timeout = setTimeout(function() {
    console.error('[EnrichQ] Timeout for lead', leadId);
    try {
      db.updateEnrichmentStatus(leadId, {
        enrichment_status:  'failed',
        enrichment_notes:   'Enrichment timed out',
        enrichment_source:  null,
        enrichment_date:    new Date().toISOString()
      });
    } catch(e) {}
    _processNext();
  }, 30000);

  // Run the enrichment pipeline (mock for Phase 3A)
  _runMockEnrichment(leadId)
    .then(function(result) {
      clearTimeout(timeout);
      db.updateEnrichmentStatus(leadId, {
        enrichment_status:  'complete',
        enrichment_notes:   result.notes,
        enrichment_source:  result.source,
        enrichment_date:    new Date().toISOString()
      });
      console.log('[EnrichQ] Complete:', leadId);
    })
    .catch(function(err) {
      clearTimeout(timeout);
      item.attempts++;
      if (item.attempts < RETRY_LIMIT) {
        console.warn('[EnrichQ] Retry', item.attempts, 'for', leadId);
        _queue.unshift(item); // retry at front of queue
      } else {
        console.error('[EnrichQ] Failed after retries:', leadId, err.message);
        try {
          db.updateEnrichmentStatus(leadId, {
            enrichment_status:  'failed',
            enrichment_notes:   'Failed after ' + item.attempts + ' attempts: ' + err.message,
            enrichment_source:  null,
            enrichment_date:    new Date().toISOString()
          });
        } catch(e) {}
      }
    })
    .finally(function() {
      // Process next after short delay
      setTimeout(_processNext, 200);
    });
}

// ── Mock enrichment pipeline (Phase 3A — no live scraping yet) ───────────────
function _runMockEnrichment(leadId) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      // DO NOT populate fake owner names or phone numbers
      resolve({
        notes:  'Enrichment pipeline initialized — live tracing not enabled yet.',
        source: 'mock_pipeline_v1'
      });
    }, MOCK_DELAY);
  });
}

// ── Queue status ──────────────────────────────────────────────────────────────
function getStatus() {
  return {
    queue_length: _queue.length,
    running:      _running,
    pending:      _queue.map(function(item) { return { leadId: item.leadId, attempts: item.attempts }; })
  };
}

module.exports = { enqueue: enqueue, getStatus: getStatus };
