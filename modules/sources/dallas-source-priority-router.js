'use strict';

const CATEGORY_WEIGHTS = {
  preforeclosure_trustee_notice: 98,
  sheriff_sale: 96,
  tax_foreclosure: 94,
  tax_delinquent_resale: 90,
  probate: 82,
  active_code_violations: 68,
  fire_unsafe_structure: 54,
  eviction_filings: 28,
  divorce_filings: 18,
  arrest_distress: 10,
  water_shutoff: 8
};

const DALLAS_SOURCE_PLAN = [
  {
    source_id: 'tx_dallas_county_clerk_foreclosure_notices',
    source_name: 'Dallas County Clerk Foreclosure Notices',
    category: 'preforeclosure / trustee notice / foreclosure notice',
    category_key: 'preforeclosure_trustee_notice',
    source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
    source_type: 'PDF / public search portal',
    why_it_matters: 'Trustee and foreclosure notices create time-sensitive seller motivation before auction.',
    expected_lead_type: 'Preforeclosure and trustee-sale leads',
    expected_lead_value: 'Highest',
    expected_fields: ['property address', 'borrower or grantor', 'sale date', 'document reference', 'source proof URL'],
    readiness: 'Needs adapter',
    extraction_method_needed: 'Foreclosure notice PDF/public-search adapter',
    risk_legal_status: 'Public record, verify notice and property identity before outreach.',
    current_status: 'Best next source to build; current capture stack has not extracted property rows from this path yet.',
    next_build_recommendation: 'Build Dallas foreclosure document hunter v1.',
    use_policy: 'lead_source',
    legal_sensitivity: 'medium',
    likely_call_ready: true,
    document_hunter_ready: true
  },
  {
    source_id: 'tx_dallas_sheriff_tax_sales',
    source_name: 'Dallas County Tax Office Sheriff Sales',
    category: 'sheriff sale',
    category_key: 'sheriff_sale',
    source_url: 'https://www.dallascounty.org/departments/tax/sheriff-sales.php',
    source_type: 'official webpage / linked auction portal',
    why_it_matters: 'Sheriff sale rows can include auction timing, case references, amounts, and property identity.',
    expected_lead_type: 'Auction/tax-sale leads',
    expected_lead_value: 'Highest',
    expected_fields: ['property address', 'case number', 'parcel or account', 'sale date', 'minimum bid or judgment amount', 'source proof URL'],
    readiness: 'Needs adapter',
    extraction_method_needed: 'Controlled browser/file adapter focused on the linked auction detail source.',
    risk_legal_status: 'Public record, no login automation, no bidding automation, no CAPTCHA bypass.',
    current_status: 'Technically checked, but recent production runs found evidence links and 0 property candidates.',
    next_build_recommendation: 'Continue only if the selected official link exposes property rows without restricted access.',
    use_policy: 'lead_source',
    legal_sensitivity: 'medium',
    likely_call_ready: true
  },
  {
    source_id: 'tx_dallas_public_works_tax_resales',
    source_name: 'Dallas County Public Works Tax Foreclosure Resales',
    category: 'tax foreclosure / struck-off / resale property',
    category_key: 'tax_foreclosure',
    source_url: 'https://www.dallascounty.org/departments/pubworks/property-division.php',
    source_type: 'official webpage / linked files',
    why_it_matters: 'Struck-off and resale properties can identify tax-foreclosed inventory with property-level official proof.',
    expected_lead_type: 'Tax foreclosure resale leads',
    expected_lead_value: 'Highest',
    expected_fields: ['property address', 'parcel or account', 'resale status', 'bid or resale details', 'source proof URL'],
    readiness: 'Needs adapter',
    extraction_method_needed: 'Official page and linked-file parser.',
    risk_legal_status: 'Public record, verify title/sale context before treating as an acquisition lead.',
    current_status: 'Known official source, not yet built as a focused adapter.',
    next_build_recommendation: 'Build Dallas Public Works tax resale adapter after foreclosure notices.',
    use_policy: 'lead_source',
    legal_sensitivity: 'low',
    likely_call_ready: true
  },
  {
    source_id: 'tx_dallas_tax_delinquent_accounts',
    source_name: 'Dallas Tax Delinquent / Tax Lien Review',
    category: 'tax delinquent / tax lien / struck-off / resale property',
    category_key: 'tax_delinquent_resale',
    source_url: '',
    source_type: 'official tax record or file needed',
    why_it_matters: 'Tax delinquency is a strong seller-motivation signal when amount and property identity are verified.',
    expected_lead_type: 'Tax delinquency leads',
    expected_lead_value: 'High',
    expected_fields: ['property address', 'parcel or account', 'tax year', 'tax amount', 'source proof URL'],
    readiness: 'Needs source research',
    extraction_method_needed: 'Official tax-account source identification, then browser/file adapter.',
    risk_legal_status: 'Public tax record only; do not infer debt without official amount evidence.',
    current_status: 'No confirmed property-level official URL in the current adapter stack.',
    next_build_recommendation: 'Research the official Dallas tax-account path before building.',
    use_policy: 'lead_source',
    legal_sensitivity: 'medium',
    likely_call_ready: true
  },
  {
    source_id: 'tx_dallas_probate_courts',
    source_name: 'Dallas County Probate Courts',
    category: 'probate',
    category_key: 'probate',
    source_url: 'https://www.dallascounty.org/government/courts/probate/',
    source_type: 'court record search',
    why_it_matters: 'Probate can be high-value, but it usually needs a property join before becoming actionable.',
    expected_lead_type: 'Probate property leads after DCAD/OPR property match',
    expected_lead_value: 'High',
    expected_fields: ['case number', 'estate or party name', 'filing date', 'court', 'property match proof'],
    readiness: 'Needs adapter',
    extraction_method_needed: 'Court docket adapter plus DCAD/property-record join.',
    risk_legal_status: 'Sensitive life event; require careful handling and verified property connection.',
    current_status: 'Known source, not ready as standalone acquisition lead source.',
    next_build_recommendation: 'Build only after foreclosure/tax-sale paths produce enough Dallas volume.',
    use_policy: 'lead_source_after_property_join',
    legal_sensitivity: 'high',
    likely_call_ready: false
  },
  {
    source_id: 'tx_dallas_code_violations_socrata',
    source_name: 'Dallas OpenData Code Violations',
    category: 'active/open code violations',
    category_key: 'active_code_violations',
    source_url: 'https://www.dallasopendata.com/dataset/Code-Violations/x9pz-kdq9',
    source_type: 'Socrata API',
    why_it_matters: 'Active code violations can support distress, but closed/old rows are low-call-quality.',
    expected_lead_type: 'Support distress signal, not primary money source',
    expected_lead_value: 'Medium / High support',
    expected_fields: ['property address', 'case or service request id', 'violation type', 'status', 'opened date', 'source proof URL'],
    readiness: 'Ready now as support',
    extraction_method_needed: 'Existing Socrata adapter with active/open/recent filtering.',
    risk_legal_status: 'Public city dataset; verify active/open status and property identity.',
    current_status: 'Working technically; production sample returned closed/old rows and 0 ready code candidates.',
    next_build_recommendation: 'Do not keep overworking this until a better active/open dataset path is found.',
    use_policy: 'support_signal_only_until_active_open',
    legal_sensitivity: 'low',
    likely_call_ready: false
  },
  {
    source_id: 'tx_dallas_fire_unsafe_structure',
    source_name: 'Dallas Fire / Unsafe Structure Indicators',
    category: 'fire damaged / unsafe structure indicators',
    category_key: 'fire_unsafe_structure',
    source_url: '',
    source_type: 'official incident/code source needed',
    why_it_matters: 'Fire and unsafe-structure signals can support acquisition priority when tied to a verified property.',
    expected_lead_type: 'Condition/distress support signal',
    expected_lead_value: 'Medium support',
    expected_fields: ['property address', 'incident or case type', 'incident date', 'source proof URL'],
    readiness: 'Needs source research',
    extraction_method_needed: 'Official incident/code source finder, then browser/API adapter.',
    risk_legal_status: 'Support signal only; do not infer occupancy, injury, owner intent, ARV, or repair cost.',
    current_status: 'No confirmed property-level public list in the current stack.',
    next_build_recommendation: 'Research only after primary foreclosure/tax paths are handled.',
    use_policy: 'support_signal_only',
    legal_sensitivity: 'medium',
    likely_call_ready: false
  },
  {
    source_id: 'tx_dallas_eviction_filings',
    source_name: 'Dallas Eviction Filings',
    category: 'eviction filings',
    category_key: 'eviction_filings',
    source_url: 'https://www.dallascounty.org/government/jpcourts/',
    source_type: 'court record search',
    why_it_matters: 'Eviction can indicate property pressure, but it is sensitive and often tenant-facing.',
    expected_lead_type: 'Support context only',
    expected_lead_value: 'Low standalone',
    expected_fields: ['case number', 'filing date', 'court', 'address if public and property-linked'],
    readiness: 'Blocked pending legal review',
    extraction_method_needed: 'Manual/legal review before any adapter.',
    risk_legal_status: 'Sensitive; do not use as standalone acquisition source.',
    current_status: 'Protected source category.',
    next_build_recommendation: 'Do not build as lead source now.',
    use_policy: 'support_only_or_blocked',
    legal_sensitivity: 'high',
    likely_call_ready: false
  },
  {
    source_id: 'tx_dallas_divorce_filing_indicator',
    source_name: 'Dallas Divorce Filing Context',
    category: 'divorce filings',
    category_key: 'divorce_filings',
    source_url: 'https://www.dallascounty.org/government/district-clerk/',
    source_type: 'court record search',
    why_it_matters: 'Divorce can be a distress signal, but it is highly sensitive and not property evidence by itself.',
    expected_lead_type: 'Sensitive support context only',
    expected_lead_value: 'Blocked standalone',
    expected_fields: ['case number', 'filing date', 'court', 'property connection if separately verified'],
    readiness: 'Blocked pending legal review',
    extraction_method_needed: 'Legal review only; no adapter for standalone lead generation.',
    risk_legal_status: 'Sensitive life event; blocked as standalone lead source.',
    current_status: 'Protected source category.',
    next_build_recommendation: 'Do not build as lead source now.',
    use_policy: 'blocked_sensitive',
    legal_sensitivity: 'high',
    likely_call_ready: false
  },
  {
    source_id: 'tx_dallas_arrest_distress_indicator',
    source_name: 'Dallas Arrest / Legal Distress Indicators',
    category: 'arrest/distress indicators',
    category_key: 'arrest_distress',
    source_url: '',
    source_type: 'sensitive record source',
    why_it_matters: 'Legal distress is sensitive and weak as property-level acquisition evidence.',
    expected_lead_type: 'Blocked standalone',
    expected_lead_value: 'Blocked standalone',
    expected_fields: ['none for lead creation without legal review'],
    readiness: 'Blocked pending legal review',
    extraction_method_needed: 'No adapter recommended.',
    risk_legal_status: 'High sensitivity; do not target owners from this signal.',
    current_status: 'Protected source category.',
    next_build_recommendation: 'Do not build as lead source now.',
    use_policy: 'blocked_sensitive',
    legal_sensitivity: 'high',
    likely_call_ready: false
  },
  {
    source_id: 'tx_dallas_water_shutoff_indicator',
    source_name: 'Dallas Water Shutoff Indicators',
    category: 'water shutoff indicators',
    category_key: 'water_shutoff',
    source_url: '',
    source_type: 'lawful public source not confirmed',
    why_it_matters: 'Utility interruption can imply distress, but property-level public access is privacy-sensitive.',
    expected_lead_type: 'Blocked unless lawful public source is confirmed',
    expected_lead_value: 'Blocked standalone',
    expected_fields: ['none until lawful source is confirmed'],
    readiness: 'Blocked pending legal review',
    extraction_method_needed: 'Legal/source review only.',
    risk_legal_status: 'Privacy-sensitive; do not collect utility status without authority.',
    current_status: 'No lawful property-level public source confirmed.',
    next_build_recommendation: 'Do not build as lead source now.',
    use_policy: 'blocked_sensitive',
    legal_sensitivity: 'high',
    likely_call_ready: false
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function countNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currentStatusOverride(source, context) {
  const counts = context && context.counts ? context.counts : {};
  if (source.source_id !== 'tx_dallas_code_violations_socrata') return source.current_status;
  const checked = countNumber(counts.code_violation_rows_checked);
  const ready = countNumber(counts.code_violation_research_ready);
  const closedOld = countNumber(counts.code_violation_closed_old_count);
  if (!checked) return source.current_status;
  if (ready > 0) return `Working support source with ${ready} ready code candidate(s) in the latest run.`;
  if (closedOld > 0) return `Working technically, but latest run checked ${checked} code row(s) and found ${closedOld} closed/old row(s). Low call quality.`;
  return source.current_status;
}

function readinessBoost(source, context) {
  const counts = context && context.counts ? context.counts : {};
  if (source.source_id !== 'tx_dallas_code_violations_socrata') return 0;
  if (countNumber(counts.code_violation_research_ready) > 0) return 10;
  if (countNumber(counts.code_violation_closed_old_count) > 0) return -15;
  return 0;
}

function scoreSource(source, context) {
  let score = CATEGORY_WEIGHTS[source.category_key] || 20;
  if (source.readiness === 'Ready now as support') score += 8;
  if (/Needs adapter/i.test(source.readiness)) score += 4;
  if (/Blocked/i.test(source.readiness)) score -= 35;
  if (/support/i.test(source.use_policy)) score -= 18;
  if (source.use_policy === 'lead_source_after_property_join') score -= 8;
  if (source.likely_call_ready === true) score += 10;
  if (source.legal_sensitivity === 'high') score -= 15;
  score += readinessBoost(source, context);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeSource(source, context) {
  const normalized = clone(source);
  normalized.priority_score = scoreSource(normalized, context);
  normalized.current_status = currentStatusOverride(normalized, context);
  normalized.preview_only = true;
  normalized.should_ingest = false;
  return normalized;
}

function buildDallasSourcePriorityPlan(context = {}) {
  const sources = DALLAS_SOURCE_PLAN
    .map((source) => normalizeSource(source, context))
    .sort((a, b) => b.priority_score - a.priority_score || a.source_name.localeCompare(b.source_name));
  const highestPriority = sources.filter((source) => source.priority_score >= 75);
  const readyNow = sources.filter((source) => /Ready now/i.test(source.readiness));
  const needsAdapter = sources.filter((source) => /Needs adapter|Needs source research/i.test(source.readiness));
  const supportOnly = sources.filter((source) => /support/i.test(source.use_policy) && !/blocked/i.test(source.use_policy));
  const blockedSensitive = sources.filter((source) => /Blocked/i.test(source.readiness) || source.use_policy === 'blocked_sensitive');
  const recommendedNext = sources.find((source) => source.source_id === 'tx_dallas_county_clerk_foreclosure_notices') || highestPriority[0] || sources[0] || null;
  return {
    ok: true,
    preview_only: true,
    should_ingest: false,
    market: { county: 'Dallas', state: 'TX' },
    status: 'planning_only',
    summary: 'Foreclosure, trustee notice, tax sale, and tax resale sources are the next money path. Code violations remain support evidence unless active/open rows are found.',
    highest_priority_sources: highestPriority,
    ready_now_sources: readyNow,
    needs_adapter_sources: needsAdapter,
    support_only_sources: supportOnly,
    blocked_sensitive_sources: blockedSensitive,
    recommended_next_source: recommendedNext,
    sources
  };
}

module.exports = {
  CATEGORY_WEIGHTS,
  DALLAS_SOURCE_PLAN,
  buildDallasSourcePriorityPlan
};
