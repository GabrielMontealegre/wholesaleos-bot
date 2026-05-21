'use strict';

const ADAPTER_FAMILIES = [
  'socrata_adapter',
  'arcgis_adapter',
  'csv_excel_adapter',
  'pdf_list_adapter',
  'html_table_adapter',
  'searchable_portal_adapter',
  'court_docket_adapter',
  'public_notice_adapter',
  'manual_review_adapter',
  'browser_assisted_capture_adapter'
];

const LEGACY_ADAPTER_ALIASES = {
  courthouse_portal_adapter: 'court_docket_adapter'
};

const COMMON_REPAIR_TYPES = [
  'parser_failed',
  'missing_address',
  'missing_amount',
  'missing_source_url',
  'placeholder_row',
  'malformed_pdf_extraction',
  'weak_evidence',
  'stale_source',
  'duplicate_conflict',
  'source_needs_review'
];

const ADAPTER_CONTRACTS = {
  socrata_adapter: {
    expected_interface_type: 'Socrata API',
    acquisition_method: 'API call',
    required_source_fields: ['source_url', 'resource_id', 'jurisdiction', 'state', 'county'],
    optional_source_fields: ['app_token', 'where_clause', 'updated_at_field', 'location_field'],
    evidence_preservation_rules: ['source_url', 'source_row_id', 'resource_id', 'captured_at', 'row_updated_at'],
    freshness_rule: 'Use Socrata row update timestamp or dataset metadata when available; otherwise use capture timestamp.',
    stale_after_days: 21,
    duplicate_strategy: { primary_keys: ['source_row_id', 'resource_id'], fallback_keys: ['normalized_address', 'jurisdiction', 'state'] },
    repair_classifications: ['missing_address', 'missing_amount', 'weak_evidence', 'stale_source'],
    validation_rules: ['API returns JSON array', 'required address/evidence fields map deterministically', 'dry-run preview passes before enablement'],
    safe_failure_behavior: 'Return parser_failed or weak_evidence; do not write leads when API schema drifts.'
  },
  arcgis_adapter: {
    expected_interface_type: 'ArcGIS API',
    acquisition_method: 'API call',
    required_source_fields: ['feature_server_url', 'layer_id', 'object_id_field', 'jurisdiction', 'state', 'county'],
    optional_source_fields: ['where_clause', 'geometry_field', 'status_field', 'opened_date_field'],
    evidence_preservation_rules: ['layer_url', 'object_id', 'feature_attributes', 'captured_at', 'edit_date'],
    freshness_rule: 'Use ArcGIS edit/open/inspection date fields when available; otherwise use capture timestamp.',
    stale_after_days: 30,
    duplicate_strategy: { primary_keys: ['object_id', 'layer_url'], fallback_keys: ['normalized_address', 'case_type', 'state'] },
    repair_classifications: ['missing_address', 'weak_evidence', 'stale_source'],
    validation_rules: ['FeatureServer metadata resolves', 'object id is stable', 'address or mappable location exists'],
    safe_failure_behavior: 'Return parser_failed when layer metadata is unavailable; route weak location records to repair.'
  },
  csv_excel_adapter: {
    expected_interface_type: 'static CSV / Excel file',
    acquisition_method: 'direct download',
    required_source_fields: ['download_url', 'file_name', 'jurisdiction', 'state', 'county'],
    optional_source_fields: ['sheet_name', 'header_row', 'file_hash', 'published_at'],
    evidence_preservation_rules: ['file_name', 'file_hash', 'sheet_name', 'row_number', 'source_url', 'captured_at'],
    freshness_rule: 'Use file publish date, modified date, or capture date; require manual verification when dates are missing.',
    stale_after_days: 30,
    duplicate_strategy: { primary_keys: ['parcel_id', 'file_hash', 'row_number'], fallback_keys: ['normalized_address', 'owner_name', 'county', 'state'] },
    repair_classifications: ['placeholder_row', 'missing_address', 'missing_amount', 'parser_failed'],
    validation_rules: ['header row detected', 'sample rows normalize', 'file reference preserved'],
    safe_failure_behavior: 'Route header-only and malformed rows to repair; do not infer missing owner/address fields.'
  },
  pdf_list_adapter: {
    expected_interface_type: 'downloadable PDF / document index',
    acquisition_method: 'OCR/manual review fallback',
    required_source_fields: ['source_url', 'file_name', 'jurisdiction', 'state', 'county'],
    optional_source_fields: ['page_number', 'ocr_engine', 'published_at', 'document_hash'],
    evidence_preservation_rules: ['file_name', 'file_hash', 'page_number', 'row_number', 'raw_text', 'captured_at'],
    freshness_rule: 'Use notice/file publish date and sale/event date; stale after event date or configured stale-after window.',
    stale_after_days: 14,
    duplicate_strategy: { primary_keys: ['file_hash', 'page_number', 'row_number'], fallback_keys: ['normalized_address', 'owner_name', 'sale_date'] },
    repair_classifications: ['malformed_pdf_extraction', 'missing_address', 'missing_amount', 'weak_evidence'],
    validation_rules: ['PDF reference preserved', 'row/page traceability exists', 'operator can verify source text'],
    safe_failure_behavior: 'Keep raw text and source reference; send uncertain OCR rows to repair.'
  },
  html_table_adapter: {
    expected_interface_type: 'HTML table',
    acquisition_method: 'Playwright navigation or direct HTML fetch',
    required_source_fields: ['source_url', 'table_selector_or_heading', 'jurisdiction', 'state', 'county'],
    optional_source_fields: ['pagination_rule', 'detail_link_selector', 'published_at_selector'],
    evidence_preservation_rules: ['source_url', 'row_index', 'detail_url', 'captured_at', 'raw_row_text'],
    freshness_rule: 'Use page publish/update date when present; otherwise use capture date and short stale window.',
    stale_after_days: 14,
    duplicate_strategy: { primary_keys: ['detail_url', 'row_index'], fallback_keys: ['normalized_address', 'case_number', 'sale_date'] },
    repair_classifications: ['parser_failed', 'missing_address', 'missing_source_url', 'weak_evidence'],
    validation_rules: ['table headers map deterministically', 'pagination is bounded', 'detail links are preserved'],
    safe_failure_behavior: 'Stop on layout drift; do not continue parsing ambiguous navigation/header rows.'
  },
  searchable_portal_adapter: {
    expected_interface_type: 'searchable portal',
    acquisition_method: 'browser-assisted capture',
    required_source_fields: ['source_url', 'verification_path', 'jurisdiction', 'state', 'county'],
    optional_source_fields: ['record_url', 'case_number', 'parcel_id', 'manual_export_format'],
    evidence_preservation_rules: ['source_url', 'record_url', 'source_reference', 'raw_payload', 'captured_at'],
    freshness_rule: 'Preview/dry-run first; freshness depends on operator-verified source record or sale/event date.',
    stale_after_days: 14,
    duplicate_strategy: { primary_keys: ['parcel_id', 'case_number', 'source_reference'], fallback_keys: ['normalized_address', 'sale_date', 'county', 'state'] },
    repair_classifications: ['missing_address', 'missing_amount', 'missing_source_url', 'weak_evidence', 'parser_failed'],
    validation_rules: ['manual capture can normalize', 'record/evidence link is preserved', 'dry-run preview exists before ingestion'],
    safe_failure_behavior: 'Return preview candidates only until field mapping is proven; never automate login, CAPTCHA, or bidding.'
  },
  court_docket_adapter: {
    expected_interface_type: 'court docket',
    acquisition_method: 'manual upload',
    required_source_fields: ['court_url', 'jurisdiction', 'state', 'county', 'case_number_field'],
    optional_source_fields: ['party_name_field', 'event_date_field', 'document_link_field'],
    evidence_preservation_rules: ['court_url', 'case_number', 'party_name', 'docket_date', 'captured_at'],
    freshness_rule: 'Court records are time-sensitive; verify docket status before outreach.',
    stale_after_days: 7,
    duplicate_strategy: { primary_keys: ['case_number', 'jurisdiction'], fallback_keys: ['party_name', 'county', 'state'] },
    repair_classifications: ['weak_evidence', 'missing_address', 'source_needs_review', 'stale_source'],
    validation_rules: ['case number preserved', 'party-to-property link is not inferred without evidence', 'operator verification path exists'],
    safe_failure_behavior: 'Do not infer property facts from docket text alone; route ambiguous rows to manual review.'
  },
  public_notice_adapter: {
    expected_interface_type: 'public notice site',
    acquisition_method: 'browser-assisted capture',
    required_source_fields: ['notice_url', 'jurisdiction', 'state', 'county', 'notice_category'],
    optional_source_fields: ['publisher', 'publication_date', 'notice_id', 'pdf_url'],
    evidence_preservation_rules: ['notice_url', 'publisher', 'publication_date', 'notice_id', 'raw_notice_text', 'captured_at'],
    freshness_rule: 'Use publication date and event/sale date when available; public notices stale quickly after event date.',
    stale_after_days: 14,
    duplicate_strategy: { primary_keys: ['notice_id', 'publisher'], fallback_keys: ['normalized_address', 'publication_date', 'case_number'] },
    repair_classifications: ['missing_address', 'missing_amount', 'weak_evidence', 'stale_source'],
    validation_rules: ['notice text preserved', 'publication date captured', 'legal notice type classified'],
    safe_failure_behavior: 'Do not parse unrelated notices as leads; route ambiguous legal notices to manual review.'
  },
  manual_review_adapter: {
    expected_interface_type: 'manual-only',
    acquisition_method: 'manual upload',
    required_source_fields: ['source_url', 'jurisdiction', 'state', 'county'],
    optional_source_fields: ['operator_notes', 'file_name', 'record_reference'],
    evidence_preservation_rules: ['source_url', 'operator_notes', 'raw_payload', 'captured_at'],
    freshness_rule: 'Operator must set or verify freshness before controlled ingestion.',
    stale_after_days: 7,
    duplicate_strategy: { primary_keys: ['source_reference'], fallback_keys: ['normalized_address', 'owner_name', 'county', 'state'] },
    repair_classifications: ['source_needs_review', 'weak_evidence', 'missing_address', 'missing_source_url'],
    validation_rules: ['operator source note exists', 'source URL or file reference exists', 'dry-run review completed'],
    safe_failure_behavior: 'Keep candidate in review queue; never auto-promote manual-only sources.'
  },
  browser_assisted_capture_adapter: {
    expected_interface_type: 'JavaScript app / portal',
    acquisition_method: 'browser-assisted capture',
    required_source_fields: ['source_url', 'verification_path', 'jurisdiction', 'state', 'county'],
    optional_source_fields: ['visible_dom_schema', 'export_button', 'record_detail_url'],
    evidence_preservation_rules: ['source_url', 'visible_text', 'record_url', 'captured_at', 'operator_context'],
    freshness_rule: 'Capture is fresh only at operator capture time; verify again before outreach if sale/event timing is urgent.',
    stale_after_days: 7,
    duplicate_strategy: { primary_keys: ['record_url', 'source_reference'], fallback_keys: ['normalized_address', 'case_number', 'sale_date'] },
    repair_classifications: ['parser_failed', 'weak_evidence', 'missing_source_url', 'source_needs_review'],
    validation_rules: ['no auto-navigation loop', 'operator-triggered capture only', 'visible evidence preserved'],
    safe_failure_behavior: 'Stop on CAPTCHA/login/manual verification. Return blocked/manual-review state instead of retrying.'
  }
};

const TEXAS_EXPANSION_TEMPLATE = {
  name: 'Texas statewide county expansion',
  status: 'planning',
  default_source_status: 'candidate',
  default_enabled: false,
  priority_counties: ['Dallas', 'Tarrant', 'Collin', 'Denton', 'Harris', 'Bexar', 'Travis'],
  likely_adapter_families: ['searchable_portal_adapter', 'public_notice_adapter', 'court_docket_adapter', 'socrata_adapter', 'arcgis_adapter', 'browser_assisted_capture_adapter'],
  dry_run_required: true
};

const CALIFORNIA_EXPANSION_TEMPLATE = {
  name: 'California major county expansion',
  status: 'planning',
  default_source_status: 'candidate',
  default_enabled: false,
  priority_counties: ['Los Angeles', 'Orange', 'San Diego', 'Riverside', 'San Bernardino', 'Sacramento', 'Alameda'],
  likely_adapter_families: ['public_notice_adapter', 'court_docket_adapter', 'html_table_adapter', 'searchable_portal_adapter', 'csv_excel_adapter', 'browser_assisted_capture_adapter'],
  dry_run_required: true
};

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function canonicalAdapterFamily(adapter) {
  return LEGACY_ADAPTER_ALIASES[adapter] || adapter || 'manual_review_adapter';
}

function getAdapterContract(adapter) {
  const family = canonicalAdapterFamily(adapter);
  return ADAPTER_CONTRACTS[family] || ADAPTER_CONTRACTS.manual_review_adapter;
}

function inferAdapterFamily(candidate = {}) {
  const text = [
    candidate.parser_adapter,
    candidate.adapter_family,
    candidate.interface_type,
    candidate.acquisition_method,
    candidate.source_url,
    candidate.url,
    candidate.source_name,
    candidate.source_category
  ].map(normalizeText).join(' ');
  const url = normalizeText(candidate.source_url || candidate.url);
  if (text.includes('socrata') || /\/resource\/[a-z0-9]{4}-[a-z0-9]{4}/.test(url)) return 'socrata_adapter';
  if (text.includes('arcgis') || text.includes('featureserver') || text.includes('mapserver')) return 'arcgis_adapter';
  if (url.endsWith('.csv') || url.endsWith('.xlsx') || url.endsWith('.xls') || text.includes('excel')) return 'csv_excel_adapter';
  if (url.endsWith('.pdf') || text.includes('pdf') || text.includes('document index')) return 'pdf_list_adapter';
  if (text.includes('html table') || text.includes('table')) return 'html_table_adapter';
  if (text.includes('public notice') || text.includes('notice')) return 'public_notice_adapter';
  if (text.includes('court docket') || text.includes('court') || text.includes('docket')) return 'court_docket_adapter';
  if (text.includes('searchable portal') || text.includes('portal')) return 'searchable_portal_adapter';
  if (text.includes('browser-assisted') || text.includes('javascript app')) return 'browser_assisted_capture_adapter';
  return 'manual_review_adapter';
}

function classifySourceCandidate(candidate = {}) {
  const adapterFamily = canonicalAdapterFamily(candidate.parser_adapter || inferAdapterFamily(candidate));
  const contract = getAdapterContract(adapterFamily);
  const evidenceModel = contract.evidence_preservation_rules.slice();
  const hasUrl = !!(candidate.source_url || candidate.url);
  const hasJurisdiction = !!(candidate.jurisdiction || candidate.county || candidate.state);
  const explicitAdapter = !!candidate.parser_adapter;
  const signals = [hasUrl, hasJurisdiction, explicitAdapter].filter(Boolean).length;
  const highRisk = ['manual_review_adapter', 'browser_assisted_capture_adapter', 'searchable_portal_adapter', 'public_notice_adapter', 'court_docket_adapter'].includes(adapterFamily);
  const confidence = explicitAdapter && hasUrl ? 'high' : signals >= 2 ? 'medium' : 'low';
  return {
    adapter_family: adapterFamily,
    confidence,
    required_parser_strategy: adapterFamily,
    expected_interface_type: contract.expected_interface_type,
    acquisition_method: contract.acquisition_method,
    expected_evidence_model: evidenceModel,
    repair_classifications: contract.repair_classifications.slice(),
    risk_level: highRisk ? 'manual_review_required' : confidence === 'high' ? 'standard_dry_run' : 'needs_classification',
    dry_run_required: true,
    default_source_status: 'candidate',
    default_enabled: false,
    safe_failure_behavior: contract.safe_failure_behavior
  };
}

function validateAdapterFramework() {
  const missing = ADAPTER_FAMILIES.filter((family) => !ADAPTER_CONTRACTS[family]);
  const invalid = Object.keys(ADAPTER_CONTRACTS).filter((family) => {
    const contract = ADAPTER_CONTRACTS[family];
    return !contract.expected_interface_type ||
      !contract.acquisition_method ||
      !Array.isArray(contract.required_source_fields) ||
      !Array.isArray(contract.evidence_preservation_rules) ||
      !contract.duplicate_strategy ||
      !Array.isArray(contract.repair_classifications) ||
      !Array.isArray(contract.validation_rules) ||
      !contract.safe_failure_behavior;
  });
  return {
    ok: missing.length === 0 && invalid.length === 0,
    family_count: ADAPTER_FAMILIES.length,
    missing_contracts: missing,
    invalid_contracts: invalid
  };
}

module.exports = {
  ADAPTER_FAMILIES,
  LEGACY_ADAPTER_ALIASES,
  COMMON_REPAIR_TYPES,
  ADAPTER_CONTRACTS,
  TEXAS_EXPANSION_TEMPLATE,
  CALIFORNIA_EXPANSION_TEMPLATE,
  canonicalAdapterFamily,
  getAdapterContract,
  inferAdapterFamily,
  classifySourceCandidate,
  validateAdapterFramework
};
