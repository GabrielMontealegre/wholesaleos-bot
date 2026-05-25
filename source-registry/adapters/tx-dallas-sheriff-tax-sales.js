'use strict';

const fs = require('fs');

const SOURCE_ID = 'tx_dallas_sheriff_tax_sales_candidate';
const SOURCE_URL = 'https://www.dallascounty.org/departments/tax/sheriff-sales.php';
const AUCTION_URL = 'https://dallas.texas.sheriffsaleauctions.com/';

const SOURCE_METADATA = Object.freeze({
  source_id: SOURCE_ID,
  source_name: 'Dallas County TX Sheriff Tax Sales',
  source_category: 'tax delinquent',
  state: 'TX',
  county: 'Dallas',
  jurisdiction: 'Dallas County Tax Office',
  source_url: SOURCE_URL,
  source_record_url: AUCTION_URL,
  interface_type: 'searchable portal',
  acquisition_method: 'browser-assisted capture',
  parser_adapter: 'searchable_portal_adapter',
  update_frequency: 'monthly sheriff sale cycle',
  freshness_rule: 'Verify the current Dallas County sheriff sale page and linked auction portal before outreach.',
  stale_after_days: 14,
  verification_path: 'Open Dallas County Tax Office Sheriff Sales, then verify the property in the linked Dallas sheriff sale auction portal.',
  repair_strategy: 'Route missing address, missing amount, missing source reference, or weak portal rows to Source Repair Queue.'
});

const FIELD_ALIASES = {
  address: ['address', 'property_address', 'situs_address', 'site_address', 'propertyAddress', 'Address'],
  owner_name: ['owner', 'owner_name', 'defendant', 'taxpayer', 'Owner'],
  parcel: ['parcel', 'parcel_id', 'account', 'account_number', 'tax_account', 'dcad_account', 'property_id', 'apn', 'APN'],
  amount_owed: ['amount_owed', 'tax_due', 'taxes_due', 'amount'],
  judgment_amount: ['judgment_amount', 'judgment', 'judgment balance', 'principal amount', 'judgment_total', 'judgment total', 'amount of judgment'],
  minimum_bid_amount: ['minimum_bid_amount', 'minimum bid amount', 'suggested minimum bid amount', 'minimum_bid', 'minimum bid', 'opening_bid', 'opening bid', 'bid_amount', 'bid amount'],
  strike_off_amount: ['strike_off_amount', "sheriff's deed strike off amount", 'sheriffs deed strike off amount', 'strike off amount'],
  dcad_value: ['dcad_value', 'appraised_value', 'appraised value', 'assessed_value', 'assessed value', 'property_value', 'property value'],
  case_number: ['case_number', 'cause_number', 'suit_number', 'Cause Number', 'case'],
  sale_date: ['sale_date', 'auction_date', 'sheriff_sale_date', 'Date of Sale'],
  instrument_number: ['instrument_number', 'instrument no', 'instrument no.', 'instrument #', 'file number'],
  instrument_file_date: ['instrument_file_date', 'file_date', 'file date', 'recorded_date', 'recorded date'],
  tax_years_in_judgment: ['tax_years_in_judgment', 'tax years included in judgment', 'tax years in judgment'],
  post_judgment_tax_years: ['post_judgment_tax_years', 'post judgment tax years', 'post-judgment tax years'],
  mapsco: ['mapsco', 'mapsc o', 'map sco'],
  legal_description: ['legal_description', 'legal description', 'lot_block', 'lot / block'],
  sale_status: ['sale_status', 'status', 'sale status'],
  trustee: ['trustee', 'substitute trustee', 'trustee name'],
  plaintiff: ['plaintiff', 'lender', 'mortgagee', 'beneficiary'],
  source_reference: ['source_reference', 'row_reference', 'page_reference', 'file_reference', 'pdf_reference', 'record_reference'],
  source_record_url: ['source_record_url', 'record_url', 'auction_url', 'detail_url', 'url'],
  source_file_name: ['source_file_name', 'file_name', 'pdf_name']
};

const DALLAS_BAD_ROW_RE = /\b(skip main navigation|phone directory|contact us|page not found|error 404|site map|privacy policy|terms of use|calendar|login|search dallas county)\b/i;
const DALLAS_ADDRESS_SUFFIX_RE = /\b(st|street|ave|avenue|dr|drive|rd|road|ln|lane|ct|court|cir|circle|blvd|boulevard|way|trl|trail|pkwy|parkway|pl|place|ter|terrace|loop|hwy|highway|sq|square)\b/i;

function firstPresent(record, aliases) {
  for (const key of aliases) {
    if (record && record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') return record[key];
  }
  return '';
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function looksLikeDallasNavigationText(value) {
  const text = cleanText(value);
  if (!text) return false;
  if (/^(column\s*[1-4]|unnamed)$/i.test(text)) return true;
  if (/^(contact|contacts|directory|phone directory|page not found|home|search|login)$/i.test(text)) return true;
  return DALLAS_BAD_ROW_RE.test(text);
}

function isDallasPropertyAddress(value) {
  const text = cleanText(value);
  if (!text || looksLikeDallasNavigationText(text)) return false;
  if (!/\d/.test(text)) return false;
  if (/^\d{4}\s+(contact|directory|calendar|schedule|phone)\b/i.test(text)) return false;
  return DALLAS_ADDRESS_SUFFIX_RE.test(text);
}

function parseMoney(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).replace(/,/g, '');
  const match = text.match(/\$?\s*(-?\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
}

function parseDateText(value) {
  const text = cleanText(value);
  if (!text) return '';
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  return text;
}

function parseAddressFromText(text) {
  const value = cleanText(text);
  const labeled = value.match(/(?:address|property)\s*[:#-]\s*([^|;]+)/i);
  if (labeled) return cleanText(labeled[1]);
  const street = value.match(/\b\d{2,6}\s+[A-Za-z0-9 .'-]+(?:\s+(?:St|Street|Ave|Avenue|Dr|Drive|Rd|Road|Ln|Lane|Ct|Court|Cir|Circle|Blvd|Boulevard|Way|Trl|Trail|Pkwy|Parkway|Pl|Place))\b[^|;]*/i);
  return street ? cleanText(street[0]) : '';
}

function parseRecordText(text) {
  const raw = cleanText(text);
  const judgmentAmount = parseMoney((raw.match(/(?:judgment(?: amount)?|amount of judgment)\s*[:#-]\s*(\$?[\d,]+(?:\.\d{1,2})?)/i) || [])[1]);
  const minimumBidAmount = parseMoney((raw.match(/(?:minimum bid(?: amount)?|suggested minimum bid(?: amount)?|opening bid(?: amount)?|bid amount)\s*[:#-]\s*(\$?[\d,]+(?:\.\d{1,2})?)/i) || [])[1]);
  const strikeOffAmount = parseMoney((raw.match(/(?:strike off amount|sheriff'?s deed strike off amount)\s*[:#-]\s*(\$?[\d,]+(?:\.\d{1,2})?)/i) || [])[1]);
  const dcadValue = parseMoney((raw.match(/(?:dcad value|appraised value|assessed value|property value)\s*[:#-]\s*(\$?[\d,]+(?:\.\d{1,2})?)/i) || [])[1]);
  return {
    address: parseAddressFromText(raw),
    owner_name: cleanText((raw.match(/(?:owner|taxpayer|defendant)\s*[:#-]\s*([^|;]+)/i) || [])[1]),
    parcel: cleanText((raw.match(/(?:parcel|account|apn|property id)\s*[:#-]\s*([A-Za-z0-9.-]+)/i) || [])[1]),
    amount_owed: judgmentAmount || parseMoney((raw.match(/(?:amount|tax(?:es)? due)\s*[:#-]\s*(\$?[\d,]+(?:\.\d{1,2})?)/i) || [])[1]),
    judgment_amount: judgmentAmount,
    minimum_bid_amount: minimumBidAmount,
    strike_off_amount: strikeOffAmount,
    dcad_value: dcadValue,
    case_number: cleanText((raw.match(/(?:case|cause|suit)\s*(?:number|no\.?|#)?\s*[:#-]\s*([A-Za-z0-9-]+)/i) || [])[1]),
    sale_date: parseDateText((raw.match(/(?:sale date|auction date|sheriff sale date)\s*[:#-]\s*([0-9/-]+)/i) || [])[1]),
    instrument_number: cleanText((raw.match(/(?:instrument(?: number| no\.?| #)?|file number)\s*[:#-]\s*([A-Za-z0-9-]+)/i) || [])[1]),
    instrument_file_date: parseDateText((raw.match(/(?:instrument file date|file date|recorded date)\s*[:#-]\s*([0-9/-]+)/i) || [])[1]),
    tax_years_in_judgment: cleanText((raw.match(/(?:tax years included in judgment|tax years in judgment)\s*[:#-]\s*([^|;]+)/i) || [])[1]),
    post_judgment_tax_years: cleanText((raw.match(/(?:post[- ]judgment tax years)\s*[:#-]\s*([^|;]+)/i) || [])[1]),
    mapsco: cleanText((raw.match(/(?:mapsco)\s*[:#-]\s*([^|;]+)/i) || [])[1]),
    legal_description: cleanText((raw.match(/(?:legal description)\s*[:#-]\s*([^|;]+)/i) || [])[1]),
    sale_status: cleanText((raw.match(/(?:sale status|status)\s*[:#-]\s*([^|;]+)/i) || [])[1]),
    trustee: cleanText((raw.match(/(?:trustee|substitute trustee)\s*[:#-]\s*([^|;]+)/i) || [])[1]),
    plaintiff: cleanText((raw.match(/(?:plaintiff|lender|mortgagee|beneficiary)\s*[:#-]\s*([^|;]+)/i) || [])[1]),
    source_reference: cleanText((raw.match(/(?:row|page|pdf|file|record)\s*(?:reference|ref)?\s*[:#-]\s*([^|;]+)/i) || [])[1]),
    raw_text: raw
  };
}

function parseDelimitedText(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    const parts = line.split(/\t|\s\|\s|,/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return Object.assign({ source_row_number: index + 1 }, parseRecordText(line));
    const parsed = parseRecordText(line);
    return Object.assign({}, parsed, {
      source_row_number: index + 1,
      address: parsed.address || parts[0],
      owner_name: parsed.owner_name || '',
      amount_owed: parsed.amount_owed === null ? parseMoney(parts.find((part) => /\$/.test(part))) : parsed.amount_owed,
      sale_date: parsed.sale_date || parseDateText(parts.find((part) => /\b\d{1,2}\/\d{1,2}\/20\d{2}\b/.test(part)) || ''),
      raw_text: line
    });
  });
}

function asInputRecords(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') return parseDelimitedText(input);
  if (Array.isArray(input.records)) return input.records;
  if (typeof input.text === 'string') return parseDelimitedText(input.text);
  return [input];
}

function normalizeDryRunRecord(rawRecord, options = {}) {
  const raw = typeof rawRecord === 'string' ? parseRecordText(rawRecord) : Object.assign({}, rawRecord);
  const address = cleanText(firstPresent(raw, FIELD_ALIASES.address));
  const ownerName = cleanText(firstPresent(raw, FIELD_ALIASES.owner_name));
  const parcel = cleanText(firstPresent(raw, FIELD_ALIASES.parcel));
  const judgmentAmount = parseMoney(firstPresent(raw, FIELD_ALIASES.judgment_amount));
  const minimumBidAmount = parseMoney(firstPresent(raw, FIELD_ALIASES.minimum_bid_amount));
  const strikeOffAmount = parseMoney(firstPresent(raw, FIELD_ALIASES.strike_off_amount));
  const dcadValue = parseMoney(firstPresent(raw, FIELD_ALIASES.dcad_value));
  const amount = parseMoney(firstPresent(raw, FIELD_ALIASES.amount_owed)) || judgmentAmount || null;
  const saleDate = parseDateText(firstPresent(raw, FIELD_ALIASES.sale_date));
  const caseNumber = cleanText(firstPresent(raw, FIELD_ALIASES.case_number));
  const instrumentNumber = cleanText(firstPresent(raw, FIELD_ALIASES.instrument_number));
  const instrumentFileDate = parseDateText(firstPresent(raw, FIELD_ALIASES.instrument_file_date));
  const taxYearsInJudgment = cleanText(firstPresent(raw, FIELD_ALIASES.tax_years_in_judgment));
  const postJudgmentTaxYears = cleanText(firstPresent(raw, FIELD_ALIASES.post_judgment_tax_years));
  const mapsco = cleanText(firstPresent(raw, FIELD_ALIASES.mapsco));
  const legalDescription = cleanText(firstPresent(raw, FIELD_ALIASES.legal_description));
  const saleStatus = cleanText(firstPresent(raw, FIELD_ALIASES.sale_status));
  const trustee = cleanText(firstPresent(raw, FIELD_ALIASES.trustee));
  const plaintiff = cleanText(firstPresent(raw, FIELD_ALIASES.plaintiff));
  const sourceReference = cleanText(firstPresent(raw, FIELD_ALIASES.source_reference) || raw.source_row_number || raw.row_number || '');
  const sourceRecordUrl = cleanText(firstPresent(raw, FIELD_ALIASES.source_record_url) || AUCTION_URL);
  const fileName = cleanText(firstPresent(raw, FIELD_ALIASES.source_file_name));
  const capturedAt = options.captured_at || new Date().toISOString();
  const audit = buildExtractionAudit({
    address,
    amount_owed: amount,
    judgment_amount: judgmentAmount,
    minimum_bid_amount: minimumBidAmount,
    strike_off_amount: strikeOffAmount,
    parcel,
    case_number: caseNumber,
    sale_date: saleDate,
    source_reference: sourceReference,
    source_record_url: sourceRecordUrl,
    raw_payload: raw
  });
  const repairFlags = classifyRepairIssues({
    address,
    amount_owed: amount,
    judgment_amount: judgmentAmount,
    minimum_bid_amount: minimumBidAmount,
    strike_off_amount: strikeOffAmount,
    parcel,
    case_number: caseNumber,
    sale_date: saleDate,
    source_url: SOURCE_URL,
    source_record_url: sourceRecordUrl,
    source_reference: sourceReference,
    raw_payload: raw
  });
  const confidence = audit.confidence_level.toLowerCase();
  const referencePart = sourceReference || parcel || caseNumber || address || 'preview';
  const previewId = `DRYRUN-${SOURCE_ID}-${String(referencePart).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;

  return {
    id: previewId,
    lead_type: 'dry_run_preview',
    status: 'dry_run_preview',
    source_id: SOURCE_ID,
    registry_source_id: SOURCE_ID,
    source: 'dallas_sheriff_tax_sales',
    source_name: SOURCE_METADATA.source_name,
    source_type: 'tax_sale',
    source_category: SOURCE_METADATA.source_category,
    source_url: SOURCE_URL,
    source_record_url: sourceRecordUrl,
    source_file_name: fileName,
    source_reference: sourceReference,
    source_family: 'dallas_sheriff_tax_sales',
    parser_adapter: SOURCE_METADATA.parser_adapter,
    extraction_quality: audit.extraction_quality,
    evidence_quality: audit.evidence_quality,
    extraction_confidence: audit.confidence_level,
    malformed_extraction_reason: audit.rejection_reason,
    source_details: {
      source_name: SOURCE_METADATA.source_name,
      source_type: 'tax_sale',
      county: 'Dallas',
      acquisition_method: SOURCE_METADATA.acquisition_method,
      parser_adapter: SOURCE_METADATA.parser_adapter,
      source_family: 'dallas_sheriff_tax_sales',
      extraction_quality: audit.extraction_quality,
      evidence_quality: audit.evidence_quality,
      source_reference: sourceReference,
      file_name: fileName || null
    },
    address,
    city: cleanText(raw.city || raw.City || 'Dallas'),
    state: 'TX',
    county: 'Dallas',
    zip: cleanText(raw.zip || raw.Zip || raw.postal_code || ''),
    owner_name: ownerName || null,
    parcel: parcel || null,
    apn: parcel || null,
    amount_owed: amount,
    tax_due: amount,
    judgment_amount: judgmentAmount,
    minimum_bid_amount: minimumBidAmount,
    strike_off_amount: strikeOffAmount,
    dcad_value: dcadValue,
    opening_bid: parseMoney(raw.opening_bid || raw.minimum_bid || raw.minimumBid),
    sale_date: saleDate || null,
    auction_date: saleDate || null,
    case_number: caseNumber || null,
    instrument_number: instrumentNumber || null,
    instrument_file_date: instrumentFileDate || null,
    tax_years_in_judgment: taxYearsInJudgment || null,
    post_judgment_tax_years: postJudgmentTaxYears || null,
    mapsco: mapsco || null,
    legal_description: legalDescription || null,
    sale_status: saleStatus || null,
    trustee: trustee || null,
    plaintiff: plaintiff || null,
    motivation: 'tax_delinquent',
    distress_types: ['tax_delinquent', 'auction'],
    source_confidence: confidence,
    source_confidence_reason: buildConfidenceReasons({ address, amount, judgmentAmount, minimumBidAmount, strikeOffAmount, parcel, caseNumber, sourceReference, sourceRecordUrl, saleDate }),
    repair_flags: repairFlags,
    source_truth: buildSourceTruthPreview({ address, amount, judgmentAmount, minimumBidAmount, strikeOffAmount, dcadValue, parcel, caseNumber, sourceReference, sourceRecordUrl, fileName, saleDate, confidence, repairFlags, instrumentNumber, instrumentFileDate, taxYearsInJudgment, postJudgmentTaxYears, mapsco, legalDescription, saleStatus, trustee, plaintiff, audit }),
    lead_intelligence: buildLeadIntelligencePreview({ address, amount, judgmentAmount, minimumBidAmount, strikeOffAmount, dcadValue, parcel, caseNumber, sourceReference, sourceRecordUrl, saleDate, confidence, repairFlags }),
    lead_intelligence_brief: buildLeadIntelligenceBriefPreview({ address, amount, judgmentAmount, minimumBidAmount, strikeOffAmount, dcadValue, saleDate, sourceReference, confidence, repairFlags }),
    evidence: {
      source_url: SOURCE_URL,
      source_record_url: sourceRecordUrl,
      source_file_name: fileName || null,
      source_reference: sourceReference || null,
      captured_at: capturedAt,
      raw_text: cleanText(raw.raw_text || '')
    },
    raw_payload: raw,
    dry_run: true,
    should_ingest: false
  };
}

function buildConfidenceReasons(fields) {
  const reasons = ['official_county_source'];
  if (fields.sourceRecordUrl) reasons.push('auction_or_record_url_present');
  if (fields.sourceReference) reasons.push('source_reference_present');
  if (fields.address) reasons.push('address_present');
  if (fields.amount) reasons.push('amount_owed_present');
  if (fields.judgmentAmount) reasons.push('judgment_amount_present');
  if (fields.minimumBidAmount) reasons.push('minimum_bid_present');
  if (fields.strikeOffAmount) reasons.push('strike_off_amount_present');
  if (fields.parcel) reasons.push('parcel_present');
  if (fields.caseNumber) reasons.push('case_number_present');
  if (fields.saleDate) reasons.push('sale_date_present');
  return reasons;
}

function classifyRepairIssues(candidate) {
  const flags = [];
  const rawText = cleanText(candidate.raw_payload && (candidate.raw_payload.raw_text || JSON.stringify(candidate.raw_payload))).toLowerCase();
  const amountKnown = (candidate.amount_owed > 0) || (candidate.judgment_amount > 0) || (candidate.minimum_bid_amount > 0) || (candidate.strike_off_amount > 0) || (candidate.dcad_value > 0);
  const timingKnown = !!(candidate.sale_date || candidate.case_number);
  if (!candidate.address) flags.push('missing_address');
  if (candidate.address && !isDallasPropertyAddress(candidate.address)) flags.push('weak_address');
  if (!amountKnown) flags.push('missing_amount');
  if (!candidate.source_url && !candidate.source_record_url) flags.push('missing_source_url');
  if (!candidate.source_reference && !candidate.source_record_url && !candidate.case_number && !candidate.parcel) flags.push('weak_evidence');
  if (!amountKnown && !timingKnown) flags.push('missing_timing_or_amount');
  if (looksLikeDallasNavigationText(candidate.address) || /column\s*[1-4]|unnamed|header only|navigation|footer|page not found|phone directory|contact us/.test(rawText)) flags.push('parser_failed');
  if (/pdf/.test(rawText) && !candidate.source_reference) flags.push('malformed_pdf_extraction');
  if (!flags.length && (!candidate.source_reference || !amountKnown)) flags.push('weak_evidence');
  return Array.from(new Set(flags));
}

function buildExtractionAudit(fields) {
  const rawText = cleanText(fields.raw_payload && (fields.raw_payload.raw_text || JSON.stringify(fields.raw_payload))).toLowerCase();
  const amountKnown = (fields.amount_owed > 0) || (fields.judgment_amount > 0) || (fields.minimum_bid_amount > 0) || (fields.strike_off_amount > 0);
  const sourceProof = !!(fields.source_record_url || fields.source_reference);
  const propertyEvidence = !!(fields.parcel || fields.case_number || fields.source_reference);
  const timingKnown = !!fields.sale_date;
  const realAddress = isDallasPropertyAddress(fields.address);
  const navText = looksLikeDallasNavigationText(fields.address) || /page not found|phone directory|skip main navigation|contact us/.test(rawText);
  const missing = [];
  if (!realAddress) missing.push('valid_dallas_property_address');
  if (!sourceProof) missing.push('source_url_or_evidence_reference');
  if (!amountKnown && !timingKnown) missing.push('timing_or_amount');
  if (navText) missing.push('navigation_or_directory_text');

  if (navText || !realAddress) {
    return {
      confidence_level: 'Repair',
      extraction_quality: 'repair',
      evidence_quality: 'bad_row',
      rejection_reason: missing.join(', ')
    };
  }
  if (sourceProof && propertyEvidence && (amountKnown || timingKnown)) {
    return {
      confidence_level: (fields.parcel || fields.case_number) && amountKnown ? 'High' : 'Medium',
      extraction_quality: 'property_level',
      evidence_quality: (fields.parcel || fields.case_number) ? 'strong' : 'medium',
      rejection_reason: ''
    };
  }
  return {
    confidence_level: sourceProof ? 'Low' : 'Repair',
    extraction_quality: 'partial',
    evidence_quality: sourceProof ? 'weak' : 'missing_source_proof',
    rejection_reason: missing.join(', ') || 'incomplete_property_evidence'
  };
}

function buildSourceTruthPreview(fields) {
  const amountValue = fields.amount > 0 ? fields.amount : (fields.judgmentAmount > 0 ? fields.judgmentAmount : (fields.minimumBidAmount > 0 ? fields.minimumBidAmount : (fields.strikeOffAmount > 0 ? fields.strikeOffAmount : null)));
  const amountKind = fields.amount > 0 ? 'amount_owed' : (fields.judgmentAmount > 0 ? 'judgment_amount' : (fields.minimumBidAmount > 0 ? 'minimum_bid_amount' : (fields.strikeOffAmount > 0 ? 'strike_off_amount' : 'unknown')));
  return {
    source_id: SOURCE_ID,
    source_name: SOURCE_METADATA.source_name,
    source_category: SOURCE_METADATA.source_category,
    county: 'Dallas',
    state: 'TX',
    interface_type: SOURCE_METADATA.interface_type,
    acquisition_method: SOURCE_METADATA.acquisition_method,
    parser_adapter: SOURCE_METADATA.parser_adapter,
    source_family: 'dallas_sheriff_tax_sales',
    extraction_quality: fields.audit ? fields.audit.extraction_quality : null,
    evidence_quality: fields.audit ? fields.audit.evidence_quality : null,
    extraction_confidence: fields.audit ? fields.audit.confidence_level : fields.confidence,
    malformed_extraction_reason: fields.audit ? fields.audit.rejection_reason : '',
    source_url: SOURCE_URL,
    source_record_url: fields.sourceRecordUrl || AUCTION_URL,
    evidence_ref: fields.sourceReference || fields.fileName || 'No row/file reference saved',
    amount: amountValue,
    amount_kind: amountKind,
    judgment_amount: fields.judgmentAmount || null,
    minimum_bid_amount: fields.minimumBidAmount || null,
    strike_off_amount: fields.strikeOffAmount || null,
    dcad_value: fields.dcadValue || null,
    instrument_number: fields.instrumentNumber || null,
    instrument_file_date: fields.instrumentFileDate || null,
    tax_years_in_judgment: fields.taxYearsInJudgment || null,
    post_judgment_tax_years: fields.postJudgmentTaxYears || null,
    mapsco: fields.mapsco || null,
    legal_description: fields.legalDescription || null,
    sale_status: fields.saleStatus || null,
    trustee: fields.trustee || null,
    plaintiff: fields.plaintiff || null,
    distress_reason: 'Dallas County sheriff/tax sale candidate',
    verification_status: 'not_verified',
    source_confidence_text: fields.confidence,
    freshness: {
      status: 'fresh_until_verified',
      stale_after_days: SOURCE_METADATA.stale_after_days,
      rule: SOURCE_METADATA.freshness_rule
    },
    confidence: fields.confidence,
    repair_flags: fields.repairFlags,
    verification_path: SOURCE_METADATA.verification_path,
    repair_strategy: SOURCE_METADATA.repair_strategy
  };
}

function buildLeadIntelligencePreview(fields) {
  const amountValue = fields.amount > 0 ? fields.amount : (fields.judgmentAmount > 0 ? fields.judgmentAmount : (fields.minimumBidAmount > 0 ? fields.minimumBidAmount : (fields.strikeOffAmount > 0 ? fields.strikeOffAmount : null)));
  const amountKind = fields.amount > 0 ? 'amount owed' : (fields.judgmentAmount > 0 ? 'judgment amount' : (fields.minimumBidAmount > 0 ? 'minimum bid' : (fields.strikeOffAmount > 0 ? 'strike off amount' : 'unknown amount')));
  return {
    intelligence_version: 'dry_run_v1',
    summary: 'Dallas County sheriff/tax sale dry-run candidate',
    distress_cause: 'tax delinquent / sheriff sale',
    urgency_level: fields.saleDate ? 'needs_date_verification' : 'timing_not_verified',
    urgency_reason: fields.saleDate ? `Sale date parsed as ${fields.saleDate}; verify before outreach.` : 'Sale date missing or not verified.',
    amount_kind: amountKind,
    amount_value: amountValue,
    evidence: {
      source: SOURCE_ID,
      source_confidence_reason: buildConfidenceReasons(fields),
      repair_flags: fields.repairFlags
    },
    recommended_next_action: fields.repairFlags.length ? 'repair_source' : 'verify_source'
  };
}

function buildLeadIntelligenceBriefPreview(fields) {
  const amountValue = fields.amount > 0 ? fields.amount : (fields.judgmentAmount > 0 ? fields.judgmentAmount : (fields.minimumBidAmount > 0 ? fields.minimumBidAmount : (fields.strikeOffAmount > 0 ? fields.strikeOffAmount : null)));
  const amountKind = fields.amount > 0 ? 'amount owed' : (fields.judgmentAmount > 0 ? 'judgment amount' : (fields.minimumBidAmount > 0 ? 'minimum bid' : (fields.strikeOffAmount > 0 ? 'strike off amount' : 'unknown amount')));
  const amountText = amountValue > 0
    ? `$${Math.round(amountValue).toLocaleString()} is the Dallas source ${amountKind}; it is not a mortgage balance.`
    : 'The source amount is not saved yet.';
  const timing = fields.saleDate ? `Sale timing is parsed as ${fields.saleDate}, but must be verified in the official source before outreach.` : 'Timing is not verified.';
  const missing = [];
  if (!fields.address) missing.push('address');
  if (!(amountValue > 0)) missing.push('amount / bid amount');
  if (!fields.sourceReference) missing.push('row/file/PDF reference');
  return {
    plain_english_summary: `This dry-run lead comes from the Dallas County sheriff/tax sale source. ${amountText} Source verification is required before outreach.`,
    motivation_explanation: 'Tax delinquency or sheriff sale evidence may indicate motivation, but motivation is not fully proven until the official sale record is verified.',
    amount_explanation: amountText,
    urgency_timing: timing,
    missing_evidence: missing,
    operator_next_step: missing.length ? 'Repair source evidence before outreach.' : 'Open source and verify the sale record.'
  };
}

function runDryRun(input, options = {}) {
  const records = asInputRecords(input);
  const candidates = records.map((record) => normalizeDryRunRecord(record, options));
  return {
    source_id: SOURCE_ID,
    dry_run: true,
    should_ingest: false,
    candidate_count: candidates.length,
    candidates,
    repair_summary: candidates.reduce((acc, candidate) => {
      candidate.repair_flags.forEach((flag) => {
        acc[flag] = (acc[flag] || 0) + 1;
      });
      return acc;
    }, {})
  };
}

function sampleDryRun() {
  return runDryRun([
    {
      address: '1000 SAMPLE ONLY ST',
      city: 'Dallas',
      parcel: '00000123456700000',
      owner_name: 'SAMPLE TAXPAYER',
      amount_owed: '$18,750.42',
      judgment_amount: '$18,750.42',
      minimum_bid_amount: '$175,000.00',
      strike_off_amount: '$301,418.88',
      dcad_value: '$249,380.00',
      case_number: 'TX-24-00001',
      sale_date: '06/02/2026',
      instrument_number: '2026-00012345',
      instrument_file_date: '03/03/2026',
      tax_years_in_judgment: '2021, 2022, 2023, 2024',
      post_judgment_tax_years: '2025',
      mapsco: '80H-B',
      legal_description: 'LOT 8 BLK 3 SAMPLE ADDN',
      sale_status: 'Accepting Bids',
      trustee: 'Dallas County Sheriff',
      plaintiff: 'Dallas County Tax Office',
      source_reference: 'dry-run fixture row 1',
      source_record_url: AUCTION_URL,
      raw_text: 'DRY RUN FIXTURE ONLY - not a production lead'
    },
    {
      owner_name: 'MISSING ADDRESS SAMPLE',
      amount_owed: '',
      judgment_amount: '',
      minimum_bid_amount: '',
      source_reference: '',
      raw_text: 'DRY RUN WEAK ROW - missing address and amount'
    }
  ], { captured_at: '2026-05-21T00:00:00.000Z' });
}

if (require.main === module) {
  const arg = process.argv[2];
  const input = arg && arg !== '--sample' ? JSON.parse(fs.readFileSync(arg, 'utf8')) : null;
  const result = input ? runDryRun(input) : sampleDryRun();
  process.stdout.write(JSON.stringify(result, null, 2));
  process.stdout.write('\n');
}

module.exports = {
  SOURCE_ID,
  SOURCE_METADATA,
  normalizeDryRunRecord,
  runDryRun,
  sampleDryRun,
  classifyRepairIssues,
  isDallasPropertyAddress,
  looksLikeDallasNavigationText,
  buildSourceTruthPreview,
  buildLeadIntelligenceBriefPreview
};
