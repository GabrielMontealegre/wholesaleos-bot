'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dallasPreview = require('../../source-registry/dallas-preview-pipeline');
const sheriffAdapter = require('../../source-registry/adapters/tx-dallas-sheriff-tax-sales');
const { generateDallasPropertyIntelligence } = require('../research/dallas-property-intelligence-agent');

const MAX_CANDIDATES = 10;
const DEFAULT_SOURCE_ID = 'tx_dallas_sheriff_tax_sales';
const REGISTRY_PATH = path.join(__dirname, '..', '..', 'source-registry', 'dallas-county-source-candidates.json');
const BAD_ROW_RE = /\b(contact|phone directory|page not found|skip main navigation|privacy policy|terms of use|login|sign in|footer|header|site map)\b/i;

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeId(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function parseMoneyLike(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = cleanText(value).replace(/,/g, '');
  const match = text.match(/\$?\s*(-?\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function boundedInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(n), max));
}

function registrySourceId(id) {
  const value = cleanText(id || DEFAULT_SOURCE_ID);
  if (value === 'tx_dallas_sheriff_tax_sales_candidate') return 'tx_dallas_sheriff_tax_sales';
  return value || DEFAULT_SOURCE_ID;
}

function loadDallasSources() {
  let sources = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    sources = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  } catch (error) {
    sources = [];
  }
  const byId = new Map();
  sources.forEach((source) => {
    if (!source || !source.source_id) return;
    byId.set(registrySourceId(source.source_id), normalizeSource(source));
  });
  if (!byId.has('tx_dallas_sheriff_tax_sales')) {
    byId.set('tx_dallas_sheriff_tax_sales', normalizeSource({
      source_id: 'tx_dallas_sheriff_tax_sales',
      source_name: sheriffAdapter.SOURCE_METADATA.source_name,
      state: 'TX',
      county: 'Dallas',
      jurisdiction: sheriffAdapter.SOURCE_METADATA.jurisdiction,
      source_url: sheriffAdapter.SOURCE_METADATA.source_url,
      source_category: 'tax_sale',
      interface_type: 'searchable_portal',
      acquisition_method: 'browser_assisted_capture',
      adapter_family: 'searchable_portal_adapter',
      expected_fields: ['address', 'owner_or_taxpayer', 'parcel_or_account', 'case_number', 'sale_date', 'minimum_bid', 'judgment_amount', 'tax_due'],
      evidence_fields: ['source_url', 'source_record_url', 'row_or_card_reference', 'parcel_or_account', 'case_number', 'captured_at'],
      freshness_rule: sheriffAdapter.SOURCE_METADATA.freshness_rule,
      stale_after_days: sheriffAdapter.SOURCE_METADATA.stale_after_days,
      verification_path: sheriffAdapter.SOURCE_METADATA.verification_path,
      enabled: false,
      source_status: 'candidate',
      should_ingest: false
    }));
  }
  return Array.from(byId.values());
}

function normalizeSource(source) {
  const adapterFamily = cleanText(source.adapter_family || source.parser_adapter || source.interface_type || 'manual_review_adapter');
  return Object.assign({}, source, {
    source_id: registrySourceId(source.source_id),
    source_name: cleanText(source.source_name || source.name || 'Dallas source candidate'),
    state: cleanText(source.state || 'TX'),
    county: cleanText(source.county || 'Dallas'),
    jurisdiction: cleanText(source.jurisdiction || 'Dallas County'),
    source_url: cleanText(source.source_url || source.url || ''),
    source_category: cleanText(source.source_category || 'unknown'),
    interface_type: cleanText(source.interface_type || adapterFamily),
    acquisition_method: cleanText(source.acquisition_method || 'operator_triggered_preview'),
    adapter_family: adapterFamily,
    parser_adapter: cleanText(source.parser_adapter || adapterFamily),
    enabled: source.enabled === true,
    source_status: cleanText(source.source_status || 'candidate'),
    should_ingest: false
  });
}

function findSource(sourceId) {
  const wanted = registrySourceId(sourceId);
  return loadDallasSources().find((source) => registrySourceId(source.source_id) === wanted) || null;
}

function sourceMetadata(source) {
  return {
    source_id: source.source_id,
    source_name: source.source_name,
    source_category: source.source_category,
    state: source.state,
    county: source.county,
    jurisdiction: source.jurisdiction,
    source_url: source.source_url,
    interface_type: source.interface_type,
    acquisition_method: source.acquisition_method,
    parser_adapter: source.parser_adapter || source.adapter_family,
    adapter_family: source.adapter_family,
    source_family: source.source_family || source.source_category || source.adapter_family,
    freshness_rule: source.freshness_rule || 'Verify freshness at the official source before outreach.',
    stale_after_days: source.stale_after_days || 30,
    verification_path: source.verification_path || 'Open the official source and verify property-level evidence.',
    source_status: source.source_status || 'candidate',
    enabled: source.enabled === true,
    should_ingest: false
  };
}

function sourceFamily(source) {
  const text = [
    source.source_id,
    source.source_name,
    source.source_category,
    source.adapter_family
  ].map(cleanText).join(' ').toLowerCase();
  if (/sheriff|tax_sale|tax sale|tax foreclosure|resale|delinquent/.test(text)) return 'sheriff_tax_sale';
  if (/foreclosure|trustee|public notice|notice/.test(text)) return 'foreclosure_public_notice';
  if (/code|violation|nuisance|unsafe|vacant|311/.test(text)) return 'code_nuisance_unsafe';
  if (/arcgis|gis|parcel|dcad|appraisal|property/.test(text)) return 'property_records_support';
  if (/permit|inspection|fire/.test(text)) return 'permit_inspection_support';
  if (/probate|court|estate|docket/.test(text)) return 'probate_court_notice';
  return 'manual_review';
}

function classifyAdapter(source) {
  const text = [
    source.adapter_family,
    source.interface_type,
    source.acquisition_method,
    source.source_url,
    source.source_category
  ].map(cleanText).join(' ').toLowerCase();
  if (/socrata|opendata\.com|api_call/.test(text)) return 'socrata_adapter';
  if (/arcgis|feature server|mapserver|gis hub/.test(text)) return 'arcgis_adapter';
  if (/csv|excel|xlsx|downloadable/.test(text)) return 'csv_excel_adapter';
  if (/pdf|document_index|notice/.test(text)) return /notice/.test(text) ? 'public_notice_adapter' : 'pdf_list_adapter';
  if (/court|docket|publicsearch/.test(text)) return 'court_docket_adapter';
  if (/html|table/.test(text)) return 'html_table_adapter';
  if (/searchable|portal|browser_assisted/.test(text)) return 'searchable_portal_adapter';
  return 'manual_review_adapter';
}

function fetchWithTimeout(url, timeoutMs) {
  const fetchImpl = global.fetch || require('node-fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetchImpl(url, {
    method: 'GET',
    redirect: 'follow',
    signal: controller.signal,
    headers: {
      'Accept': 'text/html,application/json,text/plain,*/*',
      'User-Agent': 'WholesaleOS Dallas Source Agent Preview/1.0'
    }
  }).finally(() => clearTimeout(timer));
}

function textFromHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectBlocked(text) {
  const value = cleanText(text).toLowerCase();
  if (!value) return false;
  return /\b(captcha|human verification|verify you are human|access denied|forbidden|login required|sign in|register to bid)\b/.test(value);
}

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    const href = cleanText(match[1]);
    const label = cleanText(textFromHtml(match[2])).slice(0, 160);
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) continue;
    try {
      links.push({
        url: new URL(href, baseUrl).toString(),
        label
      });
    } catch (error) {
      // Ignore malformed links.
    }
  }
  return links;
}

function candidateLinks(links) {
  return links.filter((link) => /\.(pdf|csv|xlsx?)(?:$|\?)/i.test(link.url) || /\b(foreclosure|sheriff|tax|sale|notice|code|violation|property|auction|resale)\b/i.test(`${link.label} ${link.url}`)).slice(0, 10);
}

function extractAddressLines(text, maxCandidates) {
  const lines = String(text || '')
    .split(/(?:\n|\. {1,}|\|)/)
    .map(cleanText)
    .filter(Boolean);
  const seen = new Set();
  const rows = [];
  for (const line of lines) {
    if (rows.length >= maxCandidates) break;
    if (sheriffAdapter.looksLikeDallasNavigationText(line)) continue;
    const match = line.match(/\b\d{2,6}\s+[A-Za-z0-9 .'-]+(?:\s+(?:St|Street|Ave|Avenue|Dr|Drive|Rd|Road|Ln|Lane|Ct|Court|Cir|Circle|Blvd|Boulevard|Way|Trl|Trail|Pkwy|Parkway|Pl|Place|Ter|Terrace|Hwy|Highway))\b[^|;]{0,180}/i);
    if (!match) continue;
    const address = cleanText(match[0]);
    if (!sheriffAdapter.isDallasPropertyAddress(address)) continue;
    const key = safeId(address);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      address,
      raw_text: line,
      source_reference: `visible source text ${rows.length + 1}`
    });
  }
  return rows;
}

function candidateHasAddress(candidate) {
  return !!(candidate && candidate.address && sheriffAdapter.isDallasPropertyAddress(candidate.address));
}

function candidateHasTiming(candidate) {
  return !!(candidate && (candidate.sale_date || candidate.auction_date || candidate.filing_date || candidate.notice_date || candidate.case_number));
}

function candidateHasAmount(candidate) {
  if (!candidate) return false;
  return [candidate.amount_owed, candidate.tax_due, candidate.judgment_amount, candidate.minimum_bid_amount, candidate.opening_bid, candidate.dcad_value]
    .some((value) => parseMoneyLike(value) > 0);
}

function candidateHasSourceProof(candidate) {
  if (!candidate) return false;
  const evidence = candidate.evidence || {};
  return !!(candidate.source_url || candidate.source_record_url || candidate.source_reference || evidence.source_url || evidence.source_record_url || evidence.source_reference);
}

function evidenceCompletenessScore(candidate) {
  const flags = Array.isArray(candidate && candidate.repair_flags) ? candidate.repair_flags : [];
  let score = 0;
  if (candidateHasAddress(candidate)) score += 20;
  if (candidateHasTiming(candidate)) score += 15;
  if (candidateHasAmount(candidate)) score += 15;
  if (candidate && (candidate.parcel || candidate.apn)) score += 15;
  if (candidateHasSourceProof(candidate)) score += 15;
  if (candidate && (candidate.owner_name || candidate.owner)) score += 10;
  if (candidate && /^(high|medium)$/i.test(cleanText(candidate.extraction_confidence || candidate.source_confidence))) score += 10;
  if (flags.includes('parser_failed') || flags.includes('missing_address') || flags.includes('weak_address')) score = Math.min(score, 20);
  else if (flags.includes('weak_evidence') || flags.includes('missing_source_url')) score = Math.min(score, 40);
  else if (flags.includes('missing_amount') || flags.includes('missing_timing_or_amount')) score = Math.min(score, 60);
  if (BAD_ROW_RE.test(cleanText(candidate && (candidate.address || candidate.raw_text || (candidate.raw_payload && candidate.raw_payload.raw_text))))) score = Math.min(score, 20);
  return Math.max(0, Math.min(100, score));
}

function actionabilityStatus(score, candidate) {
  const flags = Array.isArray(candidate && candidate.repair_flags) ? candidate.repair_flags : [];
  if (flags.includes('parser_failed') || flags.includes('missing_address') || flags.includes('weak_address') || score <= 25) return 'Weak Lead';
  if (score < 60) return 'Needs Repair';
  if (score < 80) return 'Needs Verification';
  return 'Actionable';
}

function applyActionability(candidate, source) {
  const score = evidenceCompletenessScore(candidate);
  const status = actionabilityStatus(score, candidate);
  const queue = status === 'Actionable' ? 'actionable' : status === 'Needs Verification' ? 'verification' : status === 'Needs Repair' ? 'repair' : 'weak';
  const nextStep = status === 'Actionable'
    ? 'Verify the official source record before outreach.'
    : status === 'Needs Verification'
      ? 'Open source evidence and verify missing fields before ingestion.'
      : 'Repair source extraction before ingestion.';
  const enriched = Object.assign({}, candidate, {
    source_family: candidate.source_family || sourceFamily(source),
    actionability_score: score,
    source_agent_actionability_score: score,
    acquisition_priority_score: score,
    actionability_status: status,
    source_agent_queue: queue,
    weak_lead: status === 'Weak Lead',
    quarantined: status === 'Weak Lead' || status === 'Needs Repair',
    should_ingest: false,
    dry_run: true,
    preview_only: true
  });
  enriched.property_intelligence = generateDallasPropertyIntelligence(enriched);
  enriched.source_truth = Object.assign({}, candidate.source_truth || {}, {
    source_family: enriched.source_family,
    evidence_completeness_score: score,
    actionability_status: status,
    source_agent_queue: queue
  });
  enriched.lead_intelligence_brief = Object.assign({}, candidate.lead_intelligence_brief || {}, {
    actionability_score: score,
    actionability_status: status,
    operator_next_step: (candidate.lead_intelligence_brief && candidate.lead_intelligence_brief.operator_next_step) || nextStep
  });
  enriched.evidence = Object.assign({}, candidate.evidence || {}, {
    evidence_completeness_score: score,
    actionability_status: status,
    source_agent_queue: queue,
    preview_only: true
  });
  enriched.dallas_property_intelligence = enriched.property_intelligence;
  return enriched;
}

function socrataApiUrl(source) {
  const url = cleanText(source.source_url);
  const direct = url.match(/\/resource\/([a-z0-9-]+)\./i);
  if (direct) return url;
  const id = url.match(/\/(?:dataset|Services)\/[^/]+\/([a-z0-9-]+)(?:$|[/?#])/i);
  if (!id) return '';
  return `https://www.dallasopendata.com/resource/${id[1]}.json`;
}

function parseHumanAddress(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); }
  catch (error) { return {}; }
}

function genericAddress(row) {
  const human = row && row.location ? parseHumanAddress(row.location.human_address) : {};
  const direct = cleanText(row.address || row.property_address || row.street_address || row.situs_address || row.location_address || row.Address || human.address || '');
  if (direct) return direct;
  const streetParts = [row.str_num, row.str_nam, row.str_suffix].map(cleanText).filter(Boolean);
  return streetParts.length >= 2 ? streetParts.join(' ') : '';
}

function normalizeGenericCandidate(source, row, index, context) {
  const capturedAt = context.captured_at || nowIso();
  const humanAddress = row && row.location ? parseHumanAddress(row.location.human_address) : {};
  const address = genericAddress(row);
  const amount = row.amount_owed || row.judgment_amount || row.minimum_bid || row.minimum_bid_amount || row.value || row.Value || null;
  const saleDate = cleanText(row.sale_date || row.filing_date || row.notice_date || row.opened_date || row.issued_date || row.created || row.updated || row.date || '');
  const parcel = cleanText(row.parcel || row.apn || row.account_number || row.property_id || '');
  const caseNumber = cleanText(row.case_number || row.cause_number || row.caseid || row.case_id || row.permit_number || row.service_request || row.service_request_id || '');
  const sourceRef = cleanText(row.source_reference || row.source_row_id || row.id || row.objectid || row.RowID || row.row_id || row.service_request_id || row.service_request || `agent row ${index + 1}`);
  const repairFlags = [];
  if (!address || !sheriffAdapter.isDallasPropertyAddress(address)) repairFlags.push('missing_address');
  if (!amount && !saleDate && !caseNumber) repairFlags.push('missing_timing_or_amount');
  if (!source.source_url) repairFlags.push('missing_source_url');
  if (!sourceRef && !parcel && !caseNumber) repairFlags.push('weak_evidence');
  const confidence = repairFlags.length ? (repairFlags.includes('missing_address') ? 'Repair' : 'Low') : (parcel || caseNumber ? 'Medium' : 'Low');
  const category = source.source_category || 'unknown';
  const id = `AGENT-${source.source_id}-${safeId(sourceRef || address || index + 1)}`;
  const missing = [];
  if (!address) missing.push('property address');
  if (!amount) missing.push('amount / value');
  if (!saleDate && !caseNumber) missing.push('timing or case evidence');
  if (!parcel) missing.push('parcel/APN');
  return {
    id,
    preview_id: id,
    lead_type: 'source_agent_preview',
    status: 'source_agent_preview',
    preview_mode: 'agent_preview',
    preview_status: 'pending',
    preview_decision: 'open',
    source_id: source.source_id,
    registry_source_id: source.source_id,
    source: source.source_id,
    source_name: source.source_name,
    source_type: category,
    source_category: category,
    source_url: source.source_url,
    source_record_url: cleanText(row.source_record_url || row.url || source.source_url),
    source_reference: sourceRef,
    parser_adapter: context.adapter,
    extraction_method: context.extraction_method,
    source_family: sourceFamily(source),
    extraction_quality: confidence === 'Repair' ? 'repair' : 'property_level_candidate',
    evidence_quality: confidence === 'Medium' ? 'medium' : confidence.toLowerCase(),
    extraction_confidence: confidence,
    address,
    city: cleanText(row.city || row.City || humanAddress.city || 'Dallas'),
    state: 'TX',
    county: 'Dallas',
    owner_name: cleanText(row.owner_name || row.owner || row.Owner || ''),
    zip: cleanText(row.zip || row.zone || humanAddress.zip || ''),
    parcel: parcel || null,
    apn: parcel || null,
    case_number: caseNumber || null,
    amount_owed: amount || null,
    sale_date: saleDate || null,
    source_confidence: confidence.toLowerCase(),
    repair_flags: Array.from(new Set(repairFlags)),
    source_truth: {
      source_id: source.source_id,
      source_name: source.source_name,
      source_category: category,
      county: 'Dallas',
      state: 'TX',
      interface_type: source.interface_type,
      acquisition_method: source.acquisition_method,
      parser_adapter: context.adapter,
      source_family: sourceFamily(source),
      source_url: source.source_url,
      source_record_url: cleanText(row.source_record_url || source.source_url),
      evidence_ref: sourceRef || 'No row/file reference saved',
      amount,
      amount_kind: amount ? 'source amount/value' : 'unknown',
      distress_reason: `${source.source_name} ${category} candidate`,
      verification_status: 'not_verified',
      freshness: {
        status: 'freshness_not_verified',
        stale_after_days: source.stale_after_days || 30,
        rule: source.freshness_rule || 'Verify official source freshness before outreach.'
      },
      confidence,
      repair_flags: Array.from(new Set(repairFlags)),
      verification_path: source.verification_path || 'Open the official source and verify property-level evidence.'
    },
    lead_intelligence_brief: {
      plain_english_summary: `This preview candidate comes from ${source.source_name}. It is not a production lead yet and must be verified before outreach.`,
      motivation_explanation: category === 'unknown' ? 'Motivation not fully proven yet.' : `${category.replace(/_/g, ' ')} evidence may indicate distress, but it must be verified at the official source.`,
      amount_explanation: amount ? `${amount} is a source field from ${source.source_name}; verify what the amount means before using it.` : 'The source amount is not saved yet.',
      urgency_timing: saleDate ? `Timing field parsed as ${saleDate}; verify it in the official source.` : 'Timing is not verified.',
      missing_evidence: missing,
      operator_next_step: repairFlags.length ? 'Repair source evidence before ingestion.' : 'Open source and verify the record before ingestion.'
    },
    evidence: {
      source_id: source.source_id,
      source_url: source.source_url,
      source_record_url: cleanText(row.source_record_url || source.source_url),
      source_reference: sourceRef || null,
      captured_at: capturedAt,
      extraction_method: context.extraction_method,
      parser_adapter: context.adapter,
      preview_only: true
    },
    raw_payload: Object.assign({}, row),
    dry_run: true,
    preview_only: true,
    should_ingest: false
  };
}

function normalizeSheriffRows(source, rows, capturedAt) {
  const batch = sheriffAdapter.runDryRun(rows, { captured_at: capturedAt });
  return dallasPreview.normalizePreviewBatch({
    preview_batch_id: previewBatchId(source.source_id),
    candidates: batch.candidates.map((candidate) => Object.assign({}, candidate, {
      source_id: source.source_id,
      registry_source_id: source.source_id,
      source_name: source.source_name,
      source_url: source.source_url || candidate.source_url,
      source_family: sourceFamily(source),
      source_truth: Object.assign({}, candidate.source_truth || {}, {
        source_id: source.source_id,
        source_name: source.source_name,
        source_url: source.source_url || candidate.source_url,
        acquisition_method: source.acquisition_method,
        parser_adapter: source.parser_adapter || source.adapter_family,
        source_family: sourceFamily(source)
      }),
      preview_only: true,
      should_ingest: false,
      dry_run: true,
      evidence: Object.assign({}, candidate.evidence || {}, {
        source_id: source.source_id,
        source_url: source.source_url || candidate.source_url,
        extraction_method: 'dallas_source_agent',
        parser_adapter: source.parser_adapter || source.adapter_family,
        preview_only: true
      })
    }))
  });
}

function previewBatchId(sourceId) {
  return `preview-agent-${sourceId}-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}

function summarize(candidates, source) {
  const base = dallasPreview.summarizeBatch({ candidates });
  base.source_id = source.source_id;
  base.source_name = source.source_name;
  base.source_agent = true;
  base.max_preview_records = MAX_CANDIDATES;
  base.actionable_count = candidates.filter((candidate) => candidate.actionability_status === 'Actionable').length;
  base.verification_count = candidates.filter((candidate) => candidate.actionability_status === 'Needs Verification').length;
  base.repair_queue_count = candidates.filter((candidate) => candidate.actionability_status === 'Needs Repair').length;
  base.weak_lead_count = candidates.filter((candidate) => candidate.actionability_status === 'Weak Lead').length;
  base.average_actionability_score = candidates.length
    ? Math.round(candidates.reduce((total, candidate) => total + (candidate.actionability_score || 0), 0) / candidates.length)
    : 0;
  return base;
}

async function inspectSocrataSource(source, options) {
  const apiUrl = socrataApiUrl(source);
  if (!apiUrl) {
    return { status: 'manual_required', rows: [], reason: 'socrata_resource_id_not_found' };
  }
  const url = new URL(apiUrl);
  if (!url.searchParams.has('$limit')) url.searchParams.set('$limit', String(options.max_candidates));
  const response = await fetchWithTimeout(url.toString(), options.timeout_ms);
  const bodyText = await response.text();
  if (!response.ok) {
    return { status: 'source_error', rows: [], reason: `http_${response.status}`, source_record_url: url.toString() };
  }
  let rows = [];
  try {
    rows = JSON.parse(bodyText);
  } catch (error) {
    return { status: 'parser_failed', rows: [], reason: 'invalid_socrata_json', source_record_url: url.toString() };
  }
  if (!Array.isArray(rows)) rows = [];
  return {
    status: rows.length ? 'candidate_rows_found' : 'no_visible_candidates',
    rows: rows.slice(0, options.max_candidates).map((row, index) => Object.assign({ source_row_id: row.id || row.case_number || `socrata-${index + 1}`, source_record_url: url.toString() }, row)),
    source_record_url: url.toString()
  };
}

async function inspectPublicPage(source, options) {
  if (!source.source_url || !/^https?:\/\//i.test(source.source_url)) {
    return { status: 'manual_required', rows: [], reason: 'missing_source_url' };
  }
  const response = await fetchWithTimeout(source.source_url, options.timeout_ms);
  const html = await response.text();
  const publicText = textFromHtml(html).slice(0, 50000);
  const links = candidateLinks(extractLinks(html, source.source_url));
  if (detectBlocked(publicText)) {
    return {
      status: 'blocked_or_manual_required',
      rows: [],
      reason: 'captcha_login_or_human_verification_detected',
      evidence_links: links
    };
  }
  const rows = extractAddressLines(publicText, options.max_candidates).map((row, index) => Object.assign({}, row, {
    source_record_url: links[index] ? links[index].url : source.source_url,
    source_reference: row.source_reference || (links[index] && links[index].label) || `visible source text ${index + 1}`
  }));
  let status = rows.length ? 'candidate_rows_found' : 'manual_required';
  let reason = rows.length ? '' : 'no_property_level_rows_visible_on_source_landing_page';
  if (!rows.length && links.length) {
    status = 'manual_required';
    reason = 'source_has_evidence_links_but_requires_operator_or_file_adapter_review';
  }
  return { status, reason, rows, evidence_links: links };
}

async function inspectSource(source, options) {
  const adapter = classifyAdapter(source);
  if (adapter === 'socrata_adapter') return inspectSocrataSource(source, options);
  return inspectPublicPage(source, options);
}

async function runDallasSourceAgent(payload = {}) {
  const sourceId = registrySourceId(payload.source_id || payload.sourceId || DEFAULT_SOURCE_ID);
  const maxCandidates = boundedInt(payload.max_candidates || payload.maxCandidates, MAX_CANDIDATES, MAX_CANDIDATES);
  const timeoutMs = boundedInt(payload.timeout_ms || payload.timeout || 10000, 10000, 30000);
  const capturedAt = payload.captured_at || nowIso();
  const source = findSource(sourceId);
  if (!source) {
    return {
      ok: false,
      error: 'dallas_source_not_found',
      source_id: sourceId,
      preview_only: true,
      dry_run: true,
      should_ingest: false,
      candidates: []
    };
  }
  const adapter = classifyAdapter(source);
  const options = {
    max_candidates: maxCandidates,
    timeout_ms: timeoutMs,
    captured_at: capturedAt
  };
  let inspection;
  try {
    inspection = await inspectSource(source, options);
  } catch (error) {
    inspection = {
      status: error && error.name === 'AbortError' ? 'timeout' : 'source_error',
      rows: [],
      reason: error && error.message ? error.message : 'source inspection failed'
    };
  }

  const rows = Array.isArray(inspection.rows) ? inspection.rows.slice(0, maxCandidates) : [];
  let candidates;
  if (rows.length && /sheriff|tax_sale|tax sales/i.test(`${source.source_id} ${source.source_category} ${source.source_name}`)) {
    candidates = normalizeSheriffRows(source, rows, capturedAt);
  } else {
    candidates = rows.map((row, index) => normalizeGenericCandidate(source, row, index, {
      adapter,
      extraction_method: 'dallas_source_agent',
      captured_at: capturedAt
    }));
  }
  candidates = candidates.map((candidate) => applyActionability(candidate, source));

  const previewId = previewBatchId(source.source_id);
  candidates = candidates.map((candidate, index) => Object.assign({
    preview_batch_id: previewId,
    preview_index: index + 1,
    preview_mode: 'agent_preview',
    preview_status: 'pending',
    preview_decision: 'open'
  }, candidate, {
    preview_batch_id: previewId,
    id: candidate.id || `${previewId}-${index + 1}`,
    preview_id: candidate.preview_id || candidate.id || `${previewId}-${index + 1}`,
    preview_only: true,
    dry_run: true,
    should_ingest: false,
    source_metadata: sourceMetadata(source)
  }));

  const batch = {
    preview_batch_id: previewId,
    preview_source_id: source.source_id,
    source_metadata: sourceMetadata(source),
    dry_run: true,
    should_ingest: false,
    preview_only: true,
    review_mode: 'operator_preview_only',
    safety_note: 'Dallas Source Agent preview only. No ingestion, no auto-save, no lead mutation, no login/CAPTCHA bypass.',
    source_agent: {
      status: inspection.status || 'unknown',
      reason: inspection.reason || '',
      adapter_family: adapter,
      source_family: sourceFamily(source),
      source_url: source.source_url,
      browser_assisted_mode: adapter === 'searchable_portal_adapter' ? 'public_navigation_probe_no_login_no_captcha' : 'public_source_probe',
      playwright_strategy: 'route_ready_for_future_visible_page_capture; not used for background loops',
      evidence_links: Array.isArray(inspection.evidence_links) ? inspection.evidence_links.slice(0, 8) : [],
      operator_triggered_only: true,
      no_loop: true,
      max_candidates: maxCandidates,
      captured_at: capturedAt
    },
    candidates
  };
  batch.batch_summary = summarize(candidates, source);
  return {
    ok: true,
    source_id: source.source_id,
    source_name: source.source_name,
    status: inspection.status || 'unknown',
    reason: inspection.reason || '',
    manual_required: /manual_required|blocked|timeout|source_error|parser_failed/.test(String(inspection.status || '')),
    preview_only: true,
    dry_run: true,
    should_ingest: false,
    candidate_count: candidates.length,
    repair_count: candidates.reduce((total, candidate) => total + (Array.isArray(candidate.repair_flags) && candidate.repair_flags.length ? 1 : 0), 0),
    actionable_count: candidates.filter((candidate) => candidate.actionability_status === 'Actionable').length,
    weak_lead_count: candidates.filter((candidate) => candidate.actionability_status === 'Weak Lead').length,
    batch
  };
}

module.exports = {
  MAX_CANDIDATES,
  DEFAULT_SOURCE_ID,
  loadDallasSources,
  findSource,
  classifyAdapter,
  sourceFamily,
  evidenceCompletenessScore,
  runDallasSourceAgent
};

if (require.main === module) {
  runDallasSourceAgent({
    source_id: process.argv[2] || DEFAULT_SOURCE_ID,
    max_candidates: process.argv[3] || MAX_CANDIDATES
  }).then((result) => {
    process.stdout.write(JSON.stringify(result, null, 2));
    process.stdout.write('\n');
  }).catch((error) => {
    process.stderr.write((error && error.stack) || String(error));
    process.stderr.write('\n');
    process.exit(1);
  });
}
