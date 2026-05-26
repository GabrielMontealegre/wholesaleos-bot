'use strict';

const DISTRESS_SOURCE_TYPES = [
  'public API',
  'public webpage',
  'courthouse',
  'uploaded CSV',
  'manual import',
  'browser-assisted'
];

const INGESTION_MODES = [
  'preview-only',
  'manual-review',
  'verified-only'
];

const DISTRESS_EVIDENCE_SCHEMA = {
  identity: ['source_key', 'source_category', 'county', 'state', 'captured_at'],
  property: ['address', 'city', 'state', 'zip', 'parcel_id', 'owner_name'],
  event: ['case_number', 'filing_date', 'event_date', 'sale_date', 'status'],
  amount: ['tax_due', 'lien_amount', 'judgment_amount', 'bid_amount', 'fees_due'],
  proof: ['source_url', 'source_record_url', 'document_reference', 'row_reference', 'captured_by'],
  review: ['verification_status', 'review_status', 'reviewed_by', 'reviewed_at', 'notes']
};

const SOURCE_CONFIDENCE_WEIGHTS = {
  official_source: 30,
  property_level_address: 20,
  parcel_or_case_reference: 15,
  amount_or_event_date: 15,
  fresh_record: 10,
  source_record_url: 10,
  unsupported_personal_context_penalty: -25,
  stale_or_ambiguous_penalty: -20
};

const ACQUISITION_PRIORITY_WEIGHTS = {
  pre_foreclosure: 90,
  sheriff_sale: 88,
  tax_delinquent: 82,
  probate: 64,
  code_violation: 58,
  fire_damage_indicator: 52,
  water_shutoff_indicator: 38,
  eviction: 34,
  divorce_filing_indicator: 24,
  arrest_distress_indicator: 12
};

const EVIDENCE_COMPLETENESS_FIELDS = [
  'address',
  'source_url',
  'source_record_url',
  'parcel_id',
  'case_number',
  'event_date',
  'amount',
  'status',
  'captured_at',
  'verification_status'
];

const DALLAS_DISTRESS_SOURCES = [
  {
    source_key: 'tx_dallas_pre_foreclosure_notices',
    source_name: 'Dallas foreclosure notices',
    source_category: 'pre_foreclosure',
    operator_label: 'Foreclosure notices',
    county: 'Dallas',
    state: 'TX',
    source_type: 'courthouse',
    ingestion_mode: 'manual-review',
    legality_risk_flags: ['public_record', 'time_sensitive', 'legal_notice', 'manual_verification_required'],
    reliability_score: 82,
    evidence_fields_available: ['borrower_or_grantor', 'address', 'legal_description', 'sale_date', 'document_reference', 'source_url'],
    update_cadence: 'monthly sale cycle',
    source_status: 'candidate',
    parser_readiness: 'planned',
    adapter_readiness: 'pdf_list_adapter_ready',
    ingestion_readiness: 'not_enabled',
    source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
    acquisition_weight: ACQUISITION_PRIORITY_WEIGHTS.pre_foreclosure,
    notes: 'Use as a notice source only. Verify property address, sale date, and document reference before outreach.'
  },
  {
    source_key: 'tx_dallas_tax_delinquent_accounts',
    source_name: 'Dallas tax delinquency review',
    source_category: 'tax_delinquent',
    operator_label: 'Tax delinquency',
    county: 'Dallas',
    state: 'TX',
    source_type: 'browser-assisted',
    ingestion_mode: 'manual-review',
    legality_risk_flags: ['public_record', 'amount_must_be_verified', 'no_background_search'],
    reliability_score: 76,
    evidence_fields_available: ['account_or_parcel', 'address', 'owner_name', 'tax_due', 'tax_year', 'source_record_url'],
    update_cadence: 'operator verified at capture time',
    source_status: 'research_needed',
    parser_readiness: 'not_ready',
    adapter_readiness: 'browser_assisted_ready',
    ingestion_readiness: 'not_enabled',
    source_url: '',
    acquisition_weight: ACQUISITION_PRIORITY_WEIGHTS.tax_delinquent,
    notes: 'Use only when an official tax record or uploaded county file confirms the amount and property.'
  },
  {
    source_key: 'tx_dallas_sheriff_sale',
    source_name: 'Dallas sheriff sale',
    source_category: 'sheriff_sale',
    operator_label: 'Sheriff sale',
    county: 'Dallas',
    state: 'TX',
    source_type: 'browser-assisted',
    ingestion_mode: 'preview-only',
    legality_risk_flags: ['public_record', 'portal_terms_must_be_respected', 'no_login_automation', 'no_bidding_automation', 'no_captcha_bypass'],
    reliability_score: 84,
    evidence_fields_available: ['address', 'owner_or_taxpayer', 'parcel_or_account', 'case_number', 'sale_date', 'minimum_bid', 'judgment_amount', 'source_record_url'],
    update_cadence: 'monthly sale cycle',
    source_status: 'candidate',
    parser_readiness: 'partial',
    adapter_readiness: 'searchable_portal_adapter_ready',
    ingestion_readiness: 'preview_only',
    source_url: 'https://www.dallascounty.org/departments/tax/sheriff-sales.php',
    acquisition_weight: ACQUISITION_PRIORITY_WEIGHTS.sheriff_sale,
    notes: 'Preview candidates only until the operator verifies address, case, amount, sale date, and source proof.'
  },
  {
    source_key: 'tx_dallas_probate_filings',
    source_name: 'Dallas probate review',
    source_category: 'probate',
    operator_label: 'Probate',
    county: 'Dallas',
    state: 'TX',
    source_type: 'courthouse',
    ingestion_mode: 'manual-review',
    legality_risk_flags: ['public_record', 'sensitive_life_event', 'party_to_property_link_required'],
    reliability_score: 58,
    evidence_fields_available: ['case_number', 'party_name', 'filing_date', 'court', 'document_reference', 'operator_notes'],
    update_cadence: 'court docket driven',
    source_status: 'research_needed',
    parser_readiness: 'not_ready',
    adapter_readiness: 'court_docket_adapter_ready',
    ingestion_readiness: 'not_enabled',
    source_url: 'https://www.dallascounty.org/government/courts/probate/',
    acquisition_weight: ACQUISITION_PRIORITY_WEIGHTS.probate,
    notes: 'Probate alone is not a property lead. Require a verified property connection before acquisition action.'
  },
  {
    source_key: 'tx_dallas_eviction_filings',
    source_name: 'Dallas eviction review',
    source_category: 'eviction',
    operator_label: 'Eviction pressure',
    county: 'Dallas',
    state: 'TX',
    source_type: 'courthouse',
    ingestion_mode: 'manual-review',
    legality_risk_flags: ['public_record', 'tenant_sensitivity', 'do_not_use_as_standalone_property_lead'],
    reliability_score: 42,
    evidence_fields_available: ['case_number', 'party_name', 'filing_date', 'court', 'address_if_visible', 'operator_notes'],
    update_cadence: 'court docket driven',
    source_status: 'research_needed',
    parser_readiness: 'not_ready',
    adapter_readiness: 'court_docket_adapter_ready',
    ingestion_readiness: 'blocked_for_standalone_ingestion',
    source_url: 'https://www.dallascounty.org/government/jpcourts/',
    acquisition_weight: ACQUISITION_PRIORITY_WEIGHTS.eviction,
    notes: 'Use only as support context when a verified owner/property lead already exists.'
  },
  {
    source_key: 'tx_dallas_code_violations',
    source_name: 'Dallas code violations',
    source_category: 'code_violation',
    operator_label: 'Code violations',
    county: 'Dallas',
    state: 'TX',
    source_type: 'public API',
    ingestion_mode: 'verified-only',
    legality_risk_flags: ['public_record', 'location_quality_must_be_checked', 'case_status_must_be_current'],
    reliability_score: 74,
    evidence_fields_available: ['case_number', 'address', 'violation_type', 'case_status', 'opened_date', 'source_row_id', 'source_url'],
    update_cadence: 'dataset managed',
    source_status: 'candidate',
    parser_readiness: 'partial',
    adapter_readiness: 'socrata_adapter_ready',
    ingestion_readiness: 'manual_validation_required',
    source_url: 'https://www.dallasopendata.com/resource/n7km-yvgf.json',
    acquisition_weight: ACQUISITION_PRIORITY_WEIGHTS.code_violation,
    notes: 'Good distress support when address and active/open status are verified.'
  },
  {
    source_key: 'tx_dallas_water_shutoff_indicator',
    source_name: 'Dallas water shutoff indicator',
    source_category: 'water_shutoff_indicator',
    operator_label: 'Utility shutoff signal',
    county: 'Dallas',
    state: 'TX',
    source_type: 'manual import',
    ingestion_mode: 'manual-review',
    legality_risk_flags: ['privacy_sensitive', 'source_legality_review_required', 'do_not_collect_personal_utility_data_without_authority'],
    reliability_score: 20,
    evidence_fields_available: ['address', 'service_status_if_lawfully_available', 'source_note', 'captured_at'],
    update_cadence: 'manual only',
    source_status: 'blocked_pending_legal_review',
    parser_readiness: 'not_ready',
    adapter_readiness: 'manual_review_only',
    ingestion_readiness: 'blocked',
    source_url: '',
    acquisition_weight: ACQUISITION_PRIORITY_WEIGHTS.water_shutoff_indicator,
    notes: 'Do not ingest utility shutoff data unless a lawful public or owner-provided source is confirmed.'
  },
  {
    source_key: 'tx_dallas_fire_damage_indicator',
    source_name: 'Dallas fire damage indicator',
    source_category: 'fire_damage_indicator',
    operator_label: 'Fire damage',
    county: 'Dallas',
    state: 'TX',
    source_type: 'public webpage',
    ingestion_mode: 'manual-review',
    legality_risk_flags: ['public_safety_record', 'address_quality_must_be_verified', 'do_not_infer_occupancy_or_injury'],
    reliability_score: 46,
    evidence_fields_available: ['incident_date', 'address_if_visible', 'incident_type', 'source_url', 'operator_notes'],
    update_cadence: 'as posted',
    source_status: 'research_needed',
    parser_readiness: 'not_ready',
    adapter_readiness: 'manual_review_only',
    ingestion_readiness: 'not_enabled',
    source_url: '',
    acquisition_weight: ACQUISITION_PRIORITY_WEIGHTS.fire_damage_indicator,
    notes: 'Use only when address-level public evidence exists. Fire context does not create value estimates.'
  },
  {
    source_key: 'tx_dallas_divorce_filing_indicator',
    source_name: 'Dallas divorce filing indicator',
    source_category: 'divorce_filing_indicator',
    operator_label: 'Divorce filing context',
    county: 'Dallas',
    state: 'TX',
    source_type: 'courthouse',
    ingestion_mode: 'manual-review',
    legality_risk_flags: ['sensitive_life_event', 'public_record_limits', 'party_to_property_link_required', 'do_not_use_as_standalone_property_lead'],
    reliability_score: 28,
    evidence_fields_available: ['case_number', 'party_name', 'filing_date', 'court', 'operator_notes'],
    update_cadence: 'court docket driven',
    source_status: 'blocked_for_standalone_ingestion',
    parser_readiness: 'not_ready',
    adapter_readiness: 'court_docket_adapter_ready',
    ingestion_readiness: 'blocked_for_standalone_ingestion',
    source_url: 'https://www.dallascounty.org/government/district-clerk/',
    acquisition_weight: ACQUISITION_PRIORITY_WEIGHTS.divorce_filing_indicator,
    notes: 'Sensitive context only. Require verified property connection and operator judgment before use.'
  },
  {
    source_key: 'tx_dallas_arrest_distress_indicator',
    source_name: 'Dallas arrest distress indicator',
    source_category: 'arrest_distress_indicator',
    operator_label: 'Legal distress context',
    county: 'Dallas',
    state: 'TX',
    source_type: 'courthouse',
    ingestion_mode: 'manual-review',
    legality_risk_flags: ['high_sensitivity', 'public_record_limits', 'do_not_use_as_standalone_property_lead', 'legal_review_recommended'],
    reliability_score: 18,
    evidence_fields_available: ['case_number', 'party_name', 'filing_date', 'court', 'operator_notes'],
    update_cadence: 'manual only',
    source_status: 'blocked_for_standalone_ingestion',
    parser_readiness: 'not_ready',
    adapter_readiness: 'manual_review_only',
    ingestion_readiness: 'blocked_for_standalone_ingestion',
    source_url: '',
    acquisition_weight: ACQUISITION_PRIORITY_WEIGHTS.arrest_distress_indicator,
    notes: 'High-sensitivity context. Do not target owners from this signal alone.'
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function listDallasDistressSources() {
  return clone(DALLAS_DISTRESS_SOURCES);
}

function sourceByKey(sourceKey) {
  return listDallasDistressSources().find((source) => source.source_key === sourceKey) || null;
}

function validateDallasDistressSource(source) {
  const errors = [];
  [
    'source_key',
    'source_category',
    'county',
    'state',
    'source_type',
    'ingestion_mode',
    'legality_risk_flags',
    'reliability_score',
    'evidence_fields_available',
    'update_cadence',
    'source_status',
    'parser_readiness',
    'adapter_readiness',
    'ingestion_readiness',
    'notes'
  ].forEach((field) => {
    if (source[field] === undefined || source[field] === null || source[field] === '') errors.push(`missing ${field}`);
  });
  if (source.county !== 'Dallas' || source.state !== 'TX') errors.push('source must stay Dallas County, TX');
  if (!DISTRESS_SOURCE_TYPES.includes(source.source_type)) errors.push(`invalid source_type ${source.source_type}`);
  if (!INGESTION_MODES.includes(source.ingestion_mode)) errors.push(`invalid ingestion_mode ${source.ingestion_mode}`);
  if (!Array.isArray(source.legality_risk_flags) || !source.legality_risk_flags.length) errors.push('legality_risk_flags must be non-empty');
  if (!Array.isArray(source.evidence_fields_available) || !source.evidence_fields_available.length) errors.push('evidence_fields_available must be non-empty');
  if (!Number.isFinite(source.reliability_score) || source.reliability_score < 0 || source.reliability_score > 100) errors.push('reliability_score must be 0-100');
  return errors;
}

function validateDallasDistressRegistry() {
  const sources = listDallasDistressSources();
  const seen = new Set();
  const results = sources.map((source) => {
    const errors = validateDallasDistressSource(source);
    if (seen.has(source.source_key)) errors.push(`duplicate source_key ${source.source_key}`);
    seen.add(source.source_key);
    return { source_key: source.source_key, ok: errors.length === 0, errors };
  });
  const categories = new Set(sources.map((source) => source.source_category));
  Object.keys(ACQUISITION_PRIORITY_WEIGHTS).forEach((category) => {
    if (!categories.has(category)) results.push({ source_key: category, ok: false, errors: ['missing category source'] });
  });
  return {
    ok: results.every((result) => result.ok),
    source_count: sources.length,
    categories: Array.from(categories),
    results
  };
}

function evidenceCompleteness(evidence) {
  evidence = evidence || {};
  const present = EVIDENCE_COMPLETENESS_FIELDS.filter((field) => {
    const value = evidence[field];
    return (typeof value === 'number' && Number.isFinite(value) && value > 0) || String(value || '').trim();
  });
  return {
    score: Math.round((present.length / EVIDENCE_COMPLETENESS_FIELDS.length) * 100),
    present_fields: present,
    missing_fields: EVIDENCE_COMPLETENESS_FIELDS.filter((field) => !present.includes(field)),
    ready_for_operator_review: present.includes('address') && present.includes('source_url')
  };
}

function sourceConfidenceWeight(source, evidence) {
  source = source || {};
  evidence = evidence || {};
  let score = Math.max(0, Math.min(50, Number(source.reliability_score || 0)));
  if (String(source.source_url || '').startsWith('https://')) score += SOURCE_CONFIDENCE_WEIGHTS.official_source;
  if (evidence.address) score += SOURCE_CONFIDENCE_WEIGHTS.property_level_address;
  if (evidence.parcel_id || evidence.case_number) score += SOURCE_CONFIDENCE_WEIGHTS.parcel_or_case_reference;
  if (evidence.amount || evidence.tax_due || evidence.event_date || evidence.sale_date) score += SOURCE_CONFIDENCE_WEIGHTS.amount_or_event_date;
  if (evidence.captured_at) score += SOURCE_CONFIDENCE_WEIGHTS.fresh_record;
  if (evidence.source_record_url) score += SOURCE_CONFIDENCE_WEIGHTS.source_record_url;
  if (/divorce|arrest|eviction|water_shutoff/.test(String(source.source_category || ''))) score += SOURCE_CONFIDENCE_WEIGHTS.unsupported_personal_context_penalty;
  return Math.max(0, Math.min(100, score));
}

function acquisitionPriorityWeight(source, evidence) {
  source = source || {};
  const base = ACQUISITION_PRIORITY_WEIGHTS[source.source_category] || 20;
  const confidence = sourceConfidenceWeight(source, evidence || {});
  const completeness = evidenceCompleteness(evidence || {}).score;
  const blocked = /blocked/.test(String(source.ingestion_readiness || source.source_status || ''));
  const score = Math.round((base * 0.55) + (confidence * 0.3) + (completeness * 0.15) - (blocked ? 30 : 0));
  return Math.max(0, Math.min(100, score));
}

function toDallasSourceAgentCandidate(source) {
  return {
    source_id: source.source_key,
    source_name: source.source_name,
    tier: source.acquisition_weight >= 80 ? 1 : source.acquisition_weight >= 50 ? 2 : 3,
    state: source.state,
    county: source.county,
    jurisdiction: source.county + ' County',
    source_url: source.source_url,
    official: !source.legality_risk_flags.includes('source_legality_review_required'),
    source_category: source.source_category,
    interface_type: source.source_type,
    acquisition_method: source.source_type === 'public API'
      ? 'api_call'
      : source.source_type === 'browser-assisted'
        ? 'browser_assisted_capture'
        : source.source_type === 'uploaded CSV'
          ? 'manual_upload'
          : 'manual_review',
    adapter_family: source.adapter_readiness.indexOf('socrata') > -1
      ? 'socrata_adapter'
      : source.adapter_readiness.indexOf('pdf') > -1
        ? 'pdf_list_adapter'
        : source.adapter_readiness.indexOf('court') > -1
          ? 'court_docket_adapter'
          : source.adapter_readiness.indexOf('searchable') > -1 || source.adapter_readiness.indexOf('browser') > -1
            ? 'searchable_portal_adapter'
            : 'manual_review_adapter',
    expected_fields: source.evidence_fields_available,
    evidence_fields: DISTRESS_EVIDENCE_SCHEMA.proof,
    freshness_rule: source.update_cadence,
    stale_after_days: source.source_category === 'sheriff_sale' || source.source_category === 'pre_foreclosure' ? 14 : 30,
    verification_path: source.notes,
    extraction_difficulty: source.parser_readiness,
    risk_limitations: source.legality_risk_flags.join(', '),
    implementation_priority: source.acquisition_weight,
    enabled: false,
    source_status: source.source_status,
    should_ingest: false,
    ingestion_mode: source.ingestion_mode,
    legality_risk_flags: source.legality_risk_flags,
    reliability_score: source.reliability_score,
    parser_readiness: source.parser_readiness,
    adapter_readiness: source.adapter_readiness,
    ingestion_readiness: source.ingestion_readiness,
    operator_label: source.operator_label,
    notes: source.notes
  };
}

module.exports = {
  DISTRESS_SOURCE_TYPES,
  INGESTION_MODES,
  DISTRESS_EVIDENCE_SCHEMA,
  SOURCE_CONFIDENCE_WEIGHTS,
  ACQUISITION_PRIORITY_WEIGHTS,
  EVIDENCE_COMPLETENESS_FIELDS,
  DALLAS_DISTRESS_SOURCES,
  listDallasDistressSources,
  sourceByKey,
  validateDallasDistressSource,
  validateDallasDistressRegistry,
  evidenceCompleteness,
  sourceConfidenceWeight,
  acquisitionPriorityWeight,
  toDallasSourceAgentCandidate
};
