'use strict';

var sourceNormalizer = require('../transforms/source-normalizer');

var DISTRESS_TYPES = [
  'foreclosure',
  'auction',
  'probate',
  'tax_delinquent',
  'lien',
  'vacant',
  'utility_delinquent',
  'bankruptcy',
  'divorce',
  'code_violation',
  'fire_damage',
  'unsafe_structure',
  'demolition',
  'failed_listing',
  'price_reduction',
  'out_of_state_owner',
  'high_equity',
  'absentee_owner'
];

var CONFIDENCE_RANK = {
  low: 1,
  medium: 2,
  high: 3
};

function firstValue() {
  for (var i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function asString(value) {
  return sourceNormalizer.asString(value);
}

function asArray(value) {
  return sourceNormalizer.asArray(value);
}

function asNumber(value) {
  return sourceNormalizer.asNumber(value);
}

function cloneRawReference(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return asString(value);
  }
}

function normalizeConfidence(value) {
  return sourceNormalizer.normalizeSourceConfidence(value) || null;
}

function strongestConfidence(a, b) {
  var left = normalizeConfidence(a);
  var right = normalizeConfidence(b);
  if (!left) return right;
  if (!right) return left;
  return CONFIDENCE_RANK[right] > CONFIDENCE_RANK[left] ? right : left;
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  var d = new Date(value);
  if (isNaN(d.getTime())) return asString(value);
  return d.toISOString().slice(0, 10);
}

function normalizeTimestamps(value) {
  value = value || {};
  return {
    observed_at: normalizeDate(firstValue(value.observed_at, value.observedAt, value.date, value.recorded_at)),
    collected_at: normalizeDate(firstValue(value.collected_at, value.collectedAt, value.fetched_at, value.created_at)),
    updated_at: normalizeDate(firstValue(value.updated_at, value.updatedAt, value.modified_at))
  };
}

function computeEvidenceConfidence(entry) {
  entry = entry || {};
  var direct = normalizeConfidence(firstValue(entry.confidence, entry.source_confidence, entry.pdf_confidence));
  if (direct) return direct;

  var urlCount = [
    entry.source_record_url,
    entry.source_pdf_url,
    entry.source_url
  ].filter(Boolean).length;

  if (entry.source_record_url || entry.case_number || entry.parcel) return 'high';
  if (urlCount > 0 || entry.evidence_label || entry.evidence_type) return 'medium';
  return 'low';
}

function normalizeEvidenceEntry(entry, options) {
  entry = entry || {};
  options = options || {};
  var sourceKind = sourceNormalizer.normalizeSourceKind(firstValue(
    entry.source_kind,
    options.source_kind,
    entry.source,
    entry.provider,
    entry.source_url
  ));
  var confidence = computeEvidenceConfidence(entry);

  return {
    source_id: asString(firstValue(entry.source_id, options.source_id)),
    source_kind: sourceKind,
    source_type: asString(firstValue(entry.source_type, entry.type, entry.motivation, options.source_type)),
    source_url: asString(firstValue(entry.source_url, entry.url, options.source_url)),
    source_record_url: asString(firstValue(entry.source_record_url, entry.record_url, entry.case_url, options.source_record_url)),
    source_pdf_url: asString(firstValue(entry.source_pdf_url, entry.pdf_source_url, entry.pdf_url, options.source_pdf_url)),
    evidence_type: asString(firstValue(entry.evidence_type, entry.signal_type, entry.motivation, entry.source_type, options.evidence_type)),
    evidence_label: asString(firstValue(entry.evidence_label, entry.label, entry.title, entry.violation_type, entry.source_type, options.evidence_label)),
    confidence: confidence,
    timestamps: normalizeTimestamps(firstValue(entry.timestamps, entry, options.timestamps)),
    raw_reference: cloneRawReference(firstValue(entry.raw_reference, entry.raw_payload, entry.raw, options.raw_reference))
  };
}

function evidenceKey(entry) {
  return [
    entry.source_id,
    entry.source_kind,
    entry.source_type,
    entry.source_record_url,
    entry.source_pdf_url,
    entry.source_url,
    entry.evidence_type,
    entry.evidence_label,
    entry.raw_reference && (entry.raw_reference.record_key || entry.raw_reference.case_number || entry.raw_reference.parcel || entry.raw_reference.id)
  ].map(function(value) {
    return asString(value) || '';
  }).join('|').toLowerCase();
}

function mergeEntry(existing, incoming) {
  existing = existing || {};
  incoming = incoming || {};
  return {
    source_id: asString(firstValue(existing.source_id, incoming.source_id)),
    source_kind: asString(firstValue(existing.source_kind, incoming.source_kind)),
    source_type: asString(firstValue(existing.source_type, incoming.source_type)),
    source_url: asString(firstValue(existing.source_url, incoming.source_url)),
    source_record_url: asString(firstValue(existing.source_record_url, incoming.source_record_url)),
    source_pdf_url: asString(firstValue(existing.source_pdf_url, incoming.source_pdf_url)),
    evidence_type: asString(firstValue(existing.evidence_type, incoming.evidence_type)),
    evidence_label: asString(firstValue(existing.evidence_label, incoming.evidence_label)),
    confidence: strongestConfidence(existing.confidence, incoming.confidence),
    timestamps: {
      observed_at: firstValue(existing.timestamps && existing.timestamps.observed_at, incoming.timestamps && incoming.timestamps.observed_at),
      collected_at: firstValue(existing.timestamps && existing.timestamps.collected_at, incoming.timestamps && incoming.timestamps.collected_at),
      updated_at: firstValue(incoming.timestamps && incoming.timestamps.updated_at, existing.timestamps && existing.timestamps.updated_at)
    },
    raw_reference: cloneRawReference(firstValue(existing.raw_reference, incoming.raw_reference))
  };
}

function dedupeEvidenceEntries(entries) {
  var output = [];
  var seen = {};

  asArray(entries).forEach(function(entry) {
    var normalized = normalizeEvidenceEntry(entry);
    var key = evidenceKey(normalized);
    if (!key.replace(/\|/g, '')) {
      key = 'entry-' + output.length;
    }
    if (seen[key] !== undefined) {
      output[seen[key]] = mergeEntry(output[seen[key]], normalized);
    } else {
      seen[key] = output.length;
      output.push(normalized);
    }
  });

  return output;
}

function mergeTimelineSignals(existingTimeline, incomingTimeline) {
  existingTimeline = existingTimeline || {};
  incomingTimeline = incomingTimeline || {};
  return {
    auction_date: normalizeDate(firstValue(existingTimeline.auction_date, incomingTimeline.auction_date)),
    years_delinquent: asNumber(firstValue(existingTimeline.years_delinquent, incomingTimeline.years_delinquent)),
    foreclosure_stage: asString(firstValue(existingTimeline.foreclosure_stage, incomingTimeline.foreclosure_stage)),
    probate_status: asString(firstValue(existingTimeline.probate_status, incomingTimeline.probate_status)),
    lien_amount: asNumber(firstValue(existingTimeline.lien_amount, incomingTimeline.lien_amount))
  };
}

function mergeDistressSignals() {
  var values = [];
  for (var i = 0; i < arguments.length; i++) {
    values = values.concat(asArray(arguments[i]));
  }

  var inferred = sourceNormalizer.normalizeDistressTypes(values);
  var output = [];

  values.concat(inferred).forEach(function(value) {
    var text = asString(value);
    if (!text) return;
    text = text.toLowerCase().replace(/[\s-]+/g, '_');
    if (DISTRESS_TYPES.indexOf(text) === -1) return;
    if (output.indexOf(text) === -1) output.push(text);
  });

  return output;
}

function extractEvidenceEntries(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.entries)) return value.entries;
  return [value];
}

function extractTimeline(value) {
  value = value || {};
  var timeline = value.timeline || value;
  return {
    auction_date: firstValue(timeline.auction_date, value.auction_date),
    years_delinquent: firstValue(timeline.years_delinquent, value.years_delinquent),
    foreclosure_stage: firstValue(timeline.foreclosure_stage, value.foreclosure_stage),
    probate_status: firstValue(timeline.probate_status, value.probate_status),
    lien_amount: firstValue(timeline.lien_amount, value.lien_amount)
  };
}

function extractDistressSignals(value) {
  value = value || {};
  return mergeDistressSignals(
    value.distress_signals,
    value.distress_types,
    value.evidence_type,
    value.source_type,
    value.evidence_label,
    value.motivation
  );
}

function aggregateConfidence(entries) {
  var confidence = null;
  asArray(entries).forEach(function(entry) {
    confidence = strongestConfidence(confidence, entry && entry.confidence);
  });
  return confidence || 'low';
}

function mergeLeadEvidence(existingEvidence, incomingEvidence) {
  var entries = dedupeEvidenceEntries(
    extractEvidenceEntries(existingEvidence).concat(extractEvidenceEntries(incomingEvidence))
  );
  var timeline = mergeTimelineSignals(
    extractTimeline(existingEvidence),
    extractTimeline(incomingEvidence)
  );
  var distressSignals = mergeDistressSignals(
    extractDistressSignals(existingEvidence),
    extractDistressSignals(incomingEvidence)
  );

  return {
    evidence_version: 'v1',
    confidence: aggregateConfidence(entries),
    entries: entries,
    timeline: timeline,
    distress_signals: distressSignals
  };
}

module.exports = {
  mergeLeadEvidence: mergeLeadEvidence,
  normalizeEvidenceEntry: normalizeEvidenceEntry,
  computeEvidenceConfidence: computeEvidenceConfidence,
  dedupeEvidenceEntries: dedupeEvidenceEntries,
  mergeTimelineSignals: mergeTimelineSignals,
  mergeDistressSignals: mergeDistressSignals
};
