'use strict';

const fs = require('fs');
const path = require('path');
const adapterFramework = require('./adapter-framework');

const REGISTRY_PATH = path.join(__dirname, 'registry.json');

const SOURCE_CATEGORIES = [
  'tax delinquent',
  'foreclosure',
  'code violation',
  'probate',
  'auction',
  'liens',
  'nuisance',
  'permits',
  'other'
];

const INTERFACE_TYPES = [
  'static CSV',
  'downloadable PDF',
  'Excel file',
  'Socrata API',
  'ArcGIS API',
  'HTML table',
  'searchable portal',
  'paginated portal',
  'document index',
  'court docket',
  'JavaScript app',
  'public notice site',
  'manual-only'
];

const ACQUISITION_METHODS = [
  'direct download',
  'API call',
  'Playwright navigation',
  'browser-assisted capture',
  'manual upload',
  'OCR/manual review fallback'
];

const ADAPTER_CATEGORIES = [
  ...adapterFramework.ADAPTER_FAMILIES,
  'courthouse_portal_adapter'
];

const REPAIR_TYPES = adapterFramework.COMMON_REPAIR_TYPES;

function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function validateSource(source) {
  const errors = [];
  const required = [
    'source_id',
    'source_name',
    'source_category',
    'state',
    'county',
    'jurisdiction',
    'source_url',
    'interface_type',
    'acquisition_method',
    'parser_adapter',
    'update_frequency',
    'freshness_rule',
    'stale_after_days',
    'duplicate_rules',
    'verification_path',
    'enabled',
    'source_status',
    'repair_strategy'
  ];
  required.forEach((field) => {
    if (source[field] === undefined || source[field] === null || source[field] === '') {
      errors.push(`missing ${field}`);
    }
  });
  if (source.source_category && !SOURCE_CATEGORIES.includes(source.source_category)) {
    errors.push(`invalid source_category ${source.source_category}`);
  }
  if (source.interface_type && !INTERFACE_TYPES.includes(source.interface_type)) {
    errors.push(`invalid interface_type ${source.interface_type}`);
  }
  if (source.acquisition_method && !ACQUISITION_METHODS.includes(source.acquisition_method)) {
    errors.push(`invalid acquisition_method ${source.acquisition_method}`);
  }
  if (source.parser_adapter && !ADAPTER_CATEGORIES.includes(source.parser_adapter)) {
    errors.push(`invalid parser_adapter ${source.parser_adapter}`);
  }
  if (!Array.isArray(source.required_fields) || source.required_fields.length === 0) {
    errors.push('required_fields must be non-empty');
  }
  if (!Array.isArray(source.evidence_fields_expected) || source.evidence_fields_expected.length === 0) {
    errors.push('evidence_fields_expected must be non-empty');
  }
  if (!source.duplicate_rules || !Array.isArray(source.duplicate_rules.primary_keys) || !Array.isArray(source.duplicate_rules.fallback_keys)) {
    errors.push('duplicate_rules primary_keys and fallback_keys are required');
  }
  return errors;
}

function validateRegistry(registry) {
  registry = registry || loadRegistry();
  const seen = new Set();
  const results = [];
  (registry.sources || []).forEach((source) => {
    const errors = validateSource(source);
    if (seen.has(source.source_id)) errors.push(`duplicate source_id ${source.source_id}`);
    seen.add(source.source_id);
    results.push({ source_id: source.source_id, ok: errors.length === 0, errors });
  });
  return {
    ok: results.every((result) => result.ok),
    source_count: (registry.sources || []).length,
    results
  };
}

function classifyAdapterFromUrl(url) {
  return adapterFramework.inferAdapterFamily({ source_url: url });
}

function sourceMatchesLead(source, lead) {
  lead = lead || {};
  const haystack = [
    lead.source_id,
    lead.registry_source_id,
    lead.source,
    lead.source_name,
    lead.source_type,
    lead.source_platform,
    lead.source_url,
    lead.source_record_url,
    lead.category,
    lead.motivation,
    lead.county,
    lead.city,
    lead.state
  ].map(normalizeText).join(' ');
  const sourceUrl = normalizeText(source.source_url);
  const sourceName = normalizeText(source.source_name);
  if (normalizeText(lead.source_id || lead.registry_source_id) === normalizeText(source.source_id)) return true;
  if (sourceName && haystack.includes(sourceName)) return true;
  if (sourceUrl && haystack.includes(sourceUrl)) return true;
  const sameState = normalizeText(source.state) && normalizeText(source.state) === normalizeText(lead.state);
  const sameCounty = normalizeText(source.county) && normalizeText(lead.county).includes(normalizeText(source.county));
  const sameJurisdiction = normalizeText(source.jurisdiction) && haystack.includes(normalizeText(source.jurisdiction));
  if (sameState && (sameCounty || sameJurisdiction)) {
    return haystack.includes(normalizeText(source.source_category).split(' ')[0]) || haystack.includes(normalizeText(source.parser_adapter).replace('_adapter', ''));
  }
  return false;
}

function classifyLeadSource(lead, registry) {
  registry = registry || loadRegistry();
  const sources = registry.sources || [];
  return sources.find((source) => sourceMatchesLead(source, lead || {})) || null;
}

module.exports = {
  REGISTRY_PATH,
  SOURCE_CATEGORIES,
  INTERFACE_TYPES,
  ACQUISITION_METHODS,
  ADAPTER_CATEGORIES,
  REPAIR_TYPES,
  loadRegistry,
  validateSource,
  validateRegistry,
  classifyAdapterFromUrl,
  classifyLeadSource,
  classifySourceCandidate: adapterFramework.classifySourceCandidate,
  getAdapterContract: adapterFramework.getAdapterContract,
  validateAdapterFramework: adapterFramework.validateAdapterFramework,
  canonicalAdapterFamily: adapterFramework.canonicalAdapterFamily
};
