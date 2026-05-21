'use strict';

const crypto = require('crypto');
const {
  SOURCE_ID,
  SOURCE_METADATA,
  runDryRun,
  sampleDryRun
} = require('./adapters/tx-dallas-sheriff-tax-sales');

const MAX_PREVIEW_RECORDS = 10;

function previewBatchId() {
  return `preview-${SOURCE_ID}-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}

function normalizePreviewInput(payload) {
  if (!payload) return null;
  if (payload.sample === true || payload.use_sample === true || payload.fixture === 'sample') return null;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text;
  if (typeof payload.raw === 'string' && payload.raw.trim()) return payload.raw;
  return null;
}

function previewInputCount(payload) {
  if (!payload) return 0;
  if (Array.isArray(payload)) return payload.length;
  if (typeof payload === 'string') {
    return payload.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
  }
  if (Array.isArray(payload.records)) return payload.records.length;
  if (Array.isArray(payload.rows)) return payload.rows.length;
  if (typeof payload.text === 'string') return previewInputCount(payload.text);
  if (typeof payload.raw === 'string') return previewInputCount(payload.raw);
  return 0;
}

function summarizeBatch(batch) {
  const candidates = Array.isArray(batch && batch.candidates) ? batch.candidates : [];
  const summary = candidates.reduce((acc, candidate) => {
    const repairFlags = Array.isArray(candidate.repair_flags) ? candidate.repair_flags : [];
    if (candidate.should_ingest === false) acc.preview_only += 1;
    if (candidate.source_truth && candidate.source_truth.verification_status === 'not_verified') acc.unverified += 1;
    if (!repairFlags.length) acc.clean += 1;
    repairFlags.forEach((flag) => {
      acc.repair_summary[flag] = (acc.repair_summary[flag] || 0) + 1;
      acc.repair_count += 1;
    });
    return acc;
  }, {
    candidate_count: candidates.length,
    preview_only: 0,
    unverified: 0,
    clean: 0,
    repair_count: 0,
    repair_summary: {}
  });
  summary.source_id = SOURCE_ID;
  summary.source_name = SOURCE_METADATA.source_name;
  summary.max_preview_records = MAX_PREVIEW_RECORDS;
  summary.safe_for_review = true;
  summary.should_ingest = false;
  summary.review_mode = 'operator_preview_only';
  return summary;
}

function normalizePreviewBatch(batch) {
  const candidates = Array.isArray(batch && batch.candidates) ? batch.candidates : [];
  return candidates.map((candidate, index) => {
    const id = candidate.id || `${SOURCE_ID}-preview-${index + 1}`;
    return Object.assign({
      preview_batch_id: batch.preview_batch_id || previewBatchId(),
      preview_mode: 'review_queue',
      preview_status: 'pending',
      preview_decision: 'open',
      preview_index: index + 1
    }, candidate, {
      id,
      preview_id: id,
      should_ingest: false,
      dry_run: true,
      source_metadata: SOURCE_METADATA,
      source_truth: Object.assign({
        source_id: SOURCE_ID,
        source_name: SOURCE_METADATA.source_name
      }, candidate.source_truth || {}),
      lead_intelligence_brief: Object.assign({
        plain_english_summary: 'Preview-only Dallas candidate',
        operator_next_step: 'Verify the source before any ingestion.'
      }, candidate.lead_intelligence_brief || {}),
      evidence: Object.assign({}, candidate.evidence || {}, {
        preview_only: true
      })
    });
  });
}

function runPreviewBatch(payload = {}) {
  const records = normalizePreviewInput(payload);
  const isSample = payload.sample === true || payload.use_sample === true || payload.fixture === 'sample' || !records;
  const previewCount = previewInputCount(records || payload);
  if (previewCount > MAX_PREVIEW_RECORDS) {
    const error = new Error(`preview_batch_too_large: maximum ${MAX_PREVIEW_RECORDS} records`);
    error.code = 'preview_batch_too_large';
    throw error;
  }
  const batch = isSample ? sampleDryRun() : runDryRun(records, { captured_at: payload.captured_at || new Date().toISOString() });
  const previewId = previewBatchId();
  const normalized = {
    preview_batch_id: previewId,
    preview_source_id: SOURCE_ID,
    source_metadata: SOURCE_METADATA,
    dry_run: true,
    should_ingest: false,
    preview_only: true,
    review_mode: 'operator_preview_only',
    safety_note: 'Preview candidates only. No ingestion, no auto-save, no mutation of production leads.',
    batch: Object.assign({}, batch, {
      preview_batch_id: previewId,
      preview_only: true,
      should_ingest: false
    })
  };
  normalized.batch.candidates = normalizePreviewBatch(normalized.batch);
  normalized.batch.batch_summary = summarizeBatch(normalized.batch);
  normalized.batch.source_metadata = SOURCE_METADATA;
  normalized.batch.safety_note = normalized.safety_note;
  return normalized;
}

function runPreviewSample() {
  return runPreviewBatch({ sample: true });
}

module.exports = {
  MAX_PREVIEW_RECORDS,
  runPreviewBatch,
  runPreviewSample,
  summarizeBatch,
  normalizePreviewBatch,
  previewBatchId
};
