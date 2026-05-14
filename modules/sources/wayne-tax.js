'use strict';

var fetch = require('node-fetch');
var XLSX = require('xlsx');
var db = require('../../db');
var sourceNormalizer = require('./transforms/source-normalizer');

var WAYNE_SOURCE_PAGE_URL = 'https://www.waynecountymi.gov/Government/Elected-Officials/Treasurer';
var WAYNE_LEGACY_MASTERSHEET_URL = 'https://www.waynecounty.com/elected/treasurer/foreclosure.aspx';
var WAYNE_SOURCE_NAME = 'Wayne County MI Tax Foreclosure XLSX';

function clampWayneTaxLimit(limit) {
  var parsed = parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 3);
}

function firstField(row, fields) {
  row = row || {};
  for (var i = 0; i < fields.length; i++) {
    var key = fields[i];
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    var rowKeys = Object.keys(row);
    for (var j = 0; j < rowKeys.length; j++) {
      if (String(rowKeys[j]).toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, '')) {
        var value = row[rowKeys[j]];
        if (value !== undefined && value !== null && value !== '') return value;
      }
    }
  }
  return null;
}

function parseMoney(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  var cleaned = String(value).replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  var parsed = Number(cleaned);
  return isFinite(parsed) ? parsed : null;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    var parsed = XLSX.SSF && XLSX.SSF.parse_date_code ? XLSX.SSF.parse_date_code(value) : null;
    if (parsed) {
      var mm = String(parsed.m).padStart(2, '0');
      var dd = String(parsed.d).padStart(2, '0');
      return parsed.y + '-' + mm + '-' + dd;
    }
  }
  var date = new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function resolveUrl(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch(e) {
    return href || null;
  }
}

async function fetchText(url) {
  var res = await fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'User-Agent': 'WholesaleOS/1.0'
    },
    timeout: 15000
  });
  if (!res.ok) throw new Error('Wayne source page fetch failed: HTTP ' + res.status);
  return res.text();
}

async function fetchBuffer(url) {
  var res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream',
      'User-Agent': 'WholesaleOS/1.0'
    },
    timeout: 20000
  });
  if (!res.ok) throw new Error('Wayne XLSX fetch failed: HTTP ' + res.status);
  if (res.buffer) return res.buffer();
  var arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function discoverWayneTaxXlsxUrl() {
  var html = await fetchText(WAYNE_SOURCE_PAGE_URL);
  var linkRe = /<a\b[^>]*href=["']([^"']+\.xlsx(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/ig;
  var match;
  var fallback = null;
  while ((match = linkRe.exec(html)) !== null) {
    var href = match[1];
    var label = String(match[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    var resolved = resolveUrl(WAYNE_SOURCE_PAGE_URL, href);
    if (!fallback) fallback = resolved;
    if (/properties\s+facing\s+foreclosure|foreclos/i.test(label + ' ' + href)) return resolved;
  }
  if (fallback) return fallback;
  throw new Error('Wayne Treasurer XLSX link not found');
}

function xlsxRowsFromBuffer(buffer, limit) {
  var requested = clampWayneTaxLimit(limit);
  var workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  var sheetName = workbook.SheetNames && workbook.SheetNames[0];
  if (!sheetName) return [];
  var sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet['!ref']) return [];
  var range = XLSX.utils.decode_range(sheet['!ref']);
  range.e.r = Math.min(range.e.r, range.s.r + requested);
  return XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    range: XLSX.utils.encode_range(range)
  }).slice(0, requested);
}

async function fetchWayneTaxRows(limit) {
  var requested = clampWayneTaxLimit(limit);
  var xlsxUrl = await discoverWayneTaxXlsxUrl();
  var buffer = await fetchBuffer(xlsxUrl);
  return {
    rows: xlsxRowsFromBuffer(buffer, requested),
    source_page_url: WAYNE_SOURCE_PAGE_URL,
    source_xlsx_url: xlsxUrl
  };
}

function buildWayneTaxLead(row, sourceInfo) {
  row = row || {};
  sourceInfo = sourceInfo || {};
  var parcel = firstField(row, ['parcel_id', 'parcel', 'parcel_number', 'apn', 'property_id', 'parcelid']);
  var address = firstField(row, ['property_address', 'address', 'site_address', 'situs', 'propertyaddress']);
  var city = firstField(row, ['city_name', 'city', 'municipality', 'community']);
  var ownerName = firstField(row, ['owner_name', 'owner', 'taxpayer_name', 'name']);
  var taxDue = parseMoney(firstField(row, ['tax_due', 'taxes_due', 'amount_due', 'balance_due', 'total_due', 'delinquent_amount']));
  var openingBid = parseMoney(firstField(row, ['opening_bid', 'minimum_bid', 'min_bid', 'starting_bid', 'bid']));
  var auctionDate = parseDate(firstField(row, ['auction_date', 'sale_date', 'date']));
  var taxYear = firstField(row, ['tax_year', 'year', 'delinquent_year', 'forfeiture_year', 'foreclosure_year']);
  var status = firstField(row, ['status', 'foreclosure_stage', 'stage']);

  var distressTypes = ['tax_delinquent'];
  if (auctionDate || openingBid !== null || /auction|foreclos/i.test(String(status || ''))) {
    distressTypes.push('auction');
  }

  var sourceUrl = sourceInfo.source_xlsx_url || WAYNE_SOURCE_PAGE_URL;
  var score = distressTypes.indexOf('auction') > -1 ? 85 : 75;
  var lead = {
    address: address || '',
    city: city || 'Wayne County',
    state: 'MI',
    county: 'Wayne',
    zip: firstField(row, ['zip', 'zip_code', 'zipcode']) || '',
    source: 'wayne_tax',
    source_url: sourceUrl,
    source_query_url: sourceInfo.source_page_url || WAYNE_SOURCE_PAGE_URL,
    source_record_url: parcel ? sourceUrl + '#parcel=' + encodeURIComponent(parcel) : sourceUrl,
    source_details: {
      source_name: WAYNE_SOURCE_NAME,
      source_type: 'tax_foreclosure',
      county: 'Wayne',
      legacy_mastersheet_url: WAYNE_LEGACY_MASTERSHEET_URL,
      tax_year: taxYear || null,
      status: status || null
    },
    lead_type: 'raw',
    analysisStatus: 'incomplete',
    arv: null,
    motivation: 'tax_delinquent',
    violations: ['Tax Foreclosure'],
    motivation_score: score,
    good_deal_reasons: ['Wayne County tax foreclosure signal'],
    priority: score >= 80 ? 'HIGH' : 'MEDIUM',
    phone: '',
    email: '',
    owner_name: ownerName || '',
    parcel: parcel || '',
    apn: parcel || '',
    auction_date: auctionDate,
    opening_bid: openingBid,
    tax_due: taxDue,
    foreclosure_stage: status || (auctionDate ? 'auction_scheduled' : 'tax_foreclosure'),
    distress_types: distressTypes,
    distress_score: score,
    source_confidence: 'high'
  };

  lead.source_normalized = sourceNormalizer.normalizeSourcePayload({
    address: lead.address,
    city: lead.city,
    state: lead.state,
    county: lead.county,
    owner_name: lead.owner_name,
    parcel: lead.parcel,
    apn: lead.apn,
    auction_date: lead.auction_date,
    opening_bid: lead.opening_bid,
    tax_due: lead.tax_due,
    foreclosure_stage: lead.foreclosure_stage,
    distress_types: lead.distress_types,
    distress_score: lead.distress_score,
    source_type: 'tax_foreclosure',
    source_url: lead.source_url,
    source_query_url: lead.source_query_url,
    source_record_url: lead.source_record_url,
    source_details: lead.source_details,
    source_confidence: lead.source_confidence
  }, {
    source_id: 'wayne-county-tax-foreclosure-xlsx',
    source_kind: 'csv',
    provider: 'Wayne County MI Treasurer',
    source_confidence: 'high'
  });

  return lead;
}

function getSavedLeadById(id) {
  if (!id || !db.getLeads) return null;
  return db.getLeads().find(function(lead) {
    return lead && lead.id === id;
  }) || null;
}

function compactWayneTaxSample(savedLead, mappedLead) {
  var lead = savedLead || mappedLead || {};
  return {
    address: lead.address || null,
    parcel: lead.parcel || lead.apn || null,
    owner_name: lead.owner_name || null,
    auction_date: lead.auction_date || null,
    opening_bid: lead.opening_bid != null ? lead.opening_bid : null,
    tax_due: lead.tax_due != null ? lead.tax_due : null,
    foreclosure_stage: lead.foreclosure_stage || null,
    distress_types: Array.isArray(lead.distress_types) ? lead.distress_types : [],
    distress_score: lead.distress_score != null ? lead.distress_score : null,
    source_query_url: lead.source_query_url || null,
    source_record_url: lead.source_record_url || null,
    lead_intelligence: db.computeLeadIntelligence
      ? db.computeLeadIntelligence(lead)
      : (lead.lead_intelligence || null)
  };
}

function compactWayneTaxError(rowIndex, error, mappedLead, rawRow) {
  var source = mappedLead || rawRow || {};
  return {
    row_index: rowIndex,
    message: error && error.message ? error.message : 'Unknown Wayne row processing error',
    parcel: source.parcel || source.apn || source.parcel_id || source.PARCEL_ID || null,
    address: source.address || source.property_address || source.PROPERTY_ADDRESS || null
  };
}

async function runWayneTaxTest(limit) {
  var requested = clampWayneTaxLimit(limit);
  var fetched = await fetchWayneTaxRows(requested);
  var rows = fetched.rows || [];
  var samples = [];
  var errors = [];
  var insertedOrMerged = 0;

  for (var i = 0; i < rows.length && i < requested; i++) {
    var rawRow = rows[i];
    var mappedLead = null;
    try {
      mappedLead = buildWayneTaxLead(rawRow, fetched);
      if (!mappedLead || !mappedLead.address) {
        throw new Error('Wayne row missing address after mapping');
      }

      var result = db.addLead(mappedLead);
      var savedLead = result && result.id ? getSavedLeadById(result.id) : null;
      if (result && result.id) insertedOrMerged++;
      samples.push(compactWayneTaxSample(savedLead || (result && result.address ? result : mappedLead), mappedLead));
    } catch(e) {
      errors.push(compactWayneTaxError(i, e, mappedLead, rawRow));
    }
  }

  return {
    ok: samples.length > 0 || errors.length === 0,
    partial: errors.length > 0 && samples.length > 0,
    requested: requested,
    inserted_or_merged: insertedOrMerged,
    errors: errors,
    samples: samples
  };
}

module.exports = {
  runWayneTaxTest: runWayneTaxTest,
  _buildWayneTaxLead: buildWayneTaxLead,
  _xlsxRowsFromBuffer: xlsxRowsFromBuffer
};
