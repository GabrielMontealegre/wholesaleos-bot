'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse } = require('csv-parse');
const cheerio = require('cheerio');
const { canonicalizeAddress, addressesMatchExactly } = require('../../scripts/lib/address-canonical');
const leadOperationsState = require('../research/lead-operations-state');
const { isEntityName } = require('../research/public-parcel-owner-lookup');

const BLOCKED_TEXT_RE = /\b(captcha|verify you are human|access denied|login required|sign in|subscription required|paywall)\b/i;
const WORD_NUMBERS = Object.freeze({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10 });
const CP1252_SPECIAL = Object.freeze([
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178
]);
const portalCalls = new Map();
const portalBlocks = new Map();

function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
function numberOrNull(value) {
  const text = clean(value).replace(/,/g, '');
  return text && /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
}
function isoDate(value) {
  const text = clean(value);
  const match = text.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!match) return '';
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}
function yearCount(date, nowIso) {
  const start = isoDate(date);
  const end = isoDate(clean(nowIso).slice(0, 10));
  if (!start || !end || end < start) return null;
  let years = Number(end.slice(0, 4)) - Number(start.slice(0, 4));
  if (end.slice(5) < start.slice(5)) years -= 1;
  return years;
}
function profileField(record, profile, field) {
  return clean(record && record[profile && profile.field_map && profile.field_map[field]]);
}
function completeAddress(address) {
  const parts = canonicalizeAddress(address);
  return ['number', 'street', 'suffix', 'city', 'state', 'zip'].every((field) => parts[field]) ? parts : null;
}
function addressFromBulk(record, profile, mailing = false) {
  const field = (name) => profileField(record, profile, name);
  if (mailing) {
    const street = [field('mailing_street'), field('mailing_unit')].filter(Boolean).join(' ');
    return street && field('mailing_city') && field('mailing_state') && field('mailing_zip')
      ? `${street}, ${field('mailing_city')}, ${field('mailing_state')} ${field('mailing_zip')}` : '';
  }
  const street = [field('situs_number'), field('situs_prefix'), field('situs_street'), field('situs_suffix'), field('situs_secondary')].filter(Boolean).join(' ');
  return street && field('situs_city') && field('situs_state') && field('situs_zip')
    ? `${street}, ${field('situs_city')}, ${field('situs_state')} ${field('situs_zip')}` : '';
}
function detailUrl(profile, parcelId, year) {
  if (!clean(parcelId) || !clean(year) || !profile.portal_detail_url_template) return '';
  return profile.portal_detail_url_template.replace('{property_id}', encodeURIComponent(parcelId))
    .replace('{year}', encodeURIComponent(year));
}
function bulkRecord(record, profile, provenance) {
  const field = (name) => profileField(record, profile, name);
  const address = addressFromBulk(record, profile);
  const mailing = addressFromBulk(record, profile, true);
  const acres = numberOrNull(field('acreage'));
  const stateCode = field('state_code');
  const year = field('improvement_actual_year');
  const parcelId = field('parcel_id');
  const detailYear = clean(record[profile.appraisal_year_strategy.detail_year_field]);
  const valueYear = clean(record[profile.appraisal_year_strategy.assessed_value_year_field]);
  const situs = completeAddress(address);
  const mail = completeAddress(mailing);
  return {
    county: profile.county, state: profile.state, parcel_id: parcelId, geo_id: field('geo_id'),
    normalized_address: address, address_key: situs && situs.canonical_string,
    owner_of_record: field('owner_of_record'), owner_id: field('owner_id'), mailing_address: mailing,
    owner_occupied: situs && mail ? addressesMatchExactly(situs, mail) : null,
    legal_description: field('legal_description'), state_code: stateCode,
    property_type: clean(profile.state_code_property_types && profile.state_code_property_types[stateCode]),
    lot_size_acres: acres, lot_size_sqft_approx: acres == null ? null : Math.round(acres * 43560),
    assessed_value: numberOrNull(field('assessed_value')), assessed_value_year: valueYear,
    improvement_actual_year: /^\d{4}$/.test(year) ? year : '',
    latest_deed_date: isoDate(field('latest_deed_date')),
    latest_deed_instrument: field('latest_deed_instrument'),
    source_kind: 'official_public_record', source_url: detailUrl(profile, parcelId, detailYear),
    bulk_source_url: profile.bulk_export_file_url || profile.bulk_export_page_url,
    ingested_at: provenance.ingested_at, file_hash: provenance.file_hash,
    evidence_text: `Official county ownership export; parcel ${parcelId}; file SHA-256 ${provenance.file_hash}.`
  };
}

function parseDbfHeader(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33) throw new Error('dbf_header_short');
  const recordCount = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  if (headerLength < 33 || recordLength < 2 || buffer.length < headerLength || buffer[headerLength - 1] !== 0x0d) {
    throw new Error('dbf_header_invalid');
  }
  const fields = [];
  let offset = 1;
  for (let cursor = 32; cursor < headerLength - 1; cursor += 32) {
    const name = buffer.subarray(cursor, cursor + 11).toString('latin1').split('\0')[0].trim();
    const length = buffer[cursor + 16];
    if (!name || !length) throw new Error('dbf_field_invalid');
    fields.push({ name, type: String.fromCharCode(buffer[cursor + 11]), length, offset });
    offset += length;
  }
  if (offset !== recordLength) throw new Error('dbf_record_length_mismatch');
  const codePage = buffer[29];
  if (codePage !== 0x00 && codePage !== 0x03 && codePage !== 0x57) throw new Error(`dbf_code_page_unsupported_${codePage}`);
  return { record_count: recordCount, header_length: headerLength, record_length: recordLength, code_page: codePage, fields };
}
function parseDbfRow(buffer, header) {
  if (buffer[0] === 0x2a) return null;
  const row = {};
  for (const field of header.fields) {
    const bytes = buffer.subarray(field.offset, field.offset + field.length);
    const latin1 = bytes.toString('latin1');
    row[field.name] = (header.code_page === 0x57
      ? latin1.replace(/[\u0080-\u009f]/g, (character) => String.fromCodePoint(CP1252_SPECIAL[character.charCodeAt(0) - 0x80]))
      : latin1).trim();
  }
  return row;
}
async function* dbfRows(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  let header;
  try {
    const prefix = Buffer.alloc(32);
    await handle.read(prefix, 0, 32, 0);
    const headerBytes = Buffer.alloc(prefix.readUInt16LE(8));
    await handle.read(headerBytes, 0, headerBytes.length, 0);
    header = parseDbfHeader(headerBytes);
  } finally { await handle.close(); }
  let pending = Buffer.alloc(0);
  let yielded = 0;
  for await (const chunk of fs.createReadStream(filePath, { start: header.header_length, highWaterMark: 1024 * 1024 })) {
    pending = Buffer.concat([pending, chunk]);
    let cursor = 0;
    while (cursor + header.record_length <= pending.length && yielded < header.record_count) {
      const row = parseDbfRow(pending.subarray(cursor, cursor + header.record_length), header);
      if (row) yield row;
      yielded += 1;
      cursor += header.record_length;
    }
    pending = pending.subarray(cursor);
    if (yielded >= header.record_count) break;
  }
  if (yielded !== header.record_count) throw new Error('dbf_truncated_records');
}
async function* csvRows(filePath) {
  const parser = fs.createReadStream(filePath).pipe(parse({ columns: true, bom: true, skip_empty_lines: true }));
  for await (const row of parser) yield row;
}
async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}
function addToIndex(map, key, record) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(record);
}
async function ingestBulkFile(input) {
  const profile = input && input.profile;
  const filePath = input && input.file_path;
  if (!profile || !filePath) throw new Error('profile_and_file_required');
  if (!clean(input.operator_id)) throw new Error('bulk_operator_id_required');
  const extension = path.extname(filePath).toLowerCase();
  if (extension !== '.dbf' && extension !== '.csv') throw new Error('bulk_file_must_be_extracted_dbf_or_csv');
  const provenance = {
    county: profile.county, state: profile.state, file_name: path.basename(filePath),
    file_hash: await hashFile(filePath), record_count: 0,
    ingested_at: input.now_iso || new Date().toISOString(),
    source_page_url: profile.bulk_export_page_url,
    source_file_url: profile.bulk_export_file_url || '',
    operator_id: clean(input.operator_id)
  };
  const byAddress = new Map();
  const byParcel = new Map();
  const byGeo = new Map();
  const iterator = extension === '.dbf' ? dbfRows(filePath) : csvRows(filePath);
  const requiredFields = ['parcel_id', 'owner_of_record', 'situs_number', 'situs_street', 'situs_city',
    'situs_state', 'situs_zip', 'mailing_street', 'mailing_city', 'mailing_state', 'mailing_zip'];
  for await (const sourceRow of iterator) {
    if (provenance.record_count === 0) {
      for (const field of requiredFields) {
        if (!Object.hasOwn(sourceRow, profile.field_map[field])) throw new Error(`bulk_required_field_missing_${field}`);
      }
    }
    provenance.record_count += 1;
    const record = bulkRecord(sourceRow, profile, provenance);
    addToIndex(byAddress, record.address_key, record);
    addToIndex(byParcel, record.parcel_id, record);
    addToIndex(byGeo, record.geo_id, record);
  }
  return { profile, provenance, by_address: byAddress, by_parcel: byParcel, by_geo: byGeo };
}
function matchRow(row, index) {
  if (clean(row && row.state).toUpperCase() !== clean(index.profile.state).toUpperCase() ||
      clean(row && row.county).toUpperCase() !== clean(index.profile.county).toUpperCase()) {
    return { status: 'no_match', reason: 'county_or_state_mismatch' };
  }
  const address = completeAddress(row && row.normalized_address);
  const byAddress = address ? index.by_address.get(address.canonical_string) || [] : [];
  const parcel = clean(row && (row.parcel_id || row.apn || row.owner_record && row.owner_record.parcel_id));
  const geo = clean(row && row.geo_id);
  const byParcel = parcel ? index.by_parcel.get(parcel) || [] : [];
  const byGeo = geo ? index.by_geo.get(geo) || [] : [];
  const candidates = address ? byAddress : parcel ? byParcel : byGeo;
  if (candidates.length > 1) return { status: 'ambiguous', reason: 'multiple_exact_county_records' };
  if (!candidates.length) return { status: 'no_match', reason: 'no_exact_county_record' };
  const record = candidates[0];
  if (address && !addressesMatchExactly(address, record.normalized_address)) return { status: 'no_match', reason: 'address_not_exact' };
  if ((parcel && parcel !== record.parcel_id && parcel !== record.geo_id) || (geo && geo !== record.geo_id)) {
    return { status: 'no_match', reason: 'parcel_or_geo_conflicts_with_address' };
  }
  return { status: 'matched', match_basis: address ? 'exact_address' : parcel ? 'parcel_id' : 'geo_id', record };
}
function conflict(row, field, officialValue, sourceUrl) {
  const previous = row[field];
  if (previous == null || clean(previous) === '' || clean(previous) === clean(officialValue)) return;
  if (!Array.isArray(row.appraisal_conflicts)) row.appraisal_conflicts = [];
  if (!row.appraisal_conflicts.some((item) => item.field === field && clean(item.prior_value) === clean(previous))) {
    row.appraisal_conflicts.push({ field, prior_value: previous, official_value: officialValue,
      prior_source_url: clean(row.public_estimate_source_url || row.source_url), official_source_url: sourceUrl });
  }
}
function nestedConflict(row, field, previous, officialValue, sourceUrl) {
  if (!clean(previous) || !clean(officialValue) || clean(previous) === clean(officialValue)) return;
  if (!Array.isArray(row.appraisal_conflicts)) row.appraisal_conflicts = [];
  if (!row.appraisal_conflicts.some((item) => item.field === field && clean(item.prior_value) === clean(previous))) {
    row.appraisal_conflicts.push({ field, prior_value: previous, official_value: officialValue,
      prior_source_url: clean(row.owner_record && row.owner_record.source_url), official_source_url: sourceUrl });
  }
}
function setOfficial(row, field, value, sourceUrl) {
  if (value == null || clean(value) === '') return;
  conflict(row, field, value, sourceUrl);
  row[field] = value;
}
function equityClue(record, nowIso) {
  const deeds = Array.isArray(record.deed_history) ? record.deed_history : [];
  const latest = deeds[0];
  if (!latest || !isoDate(latest.date) || clean(latest.grantee).toUpperCase() !== clean(record.owner_of_record).toUpperCase()) {
    return { years_held: null, equity_signal: 'UNKNOWN', reason: 'Current-owner deed history not established.' };
  }
  const years = yearCount(latest.date, nowIso);
  if (years == null) return { years_held: null, equity_signal: 'UNKNOWN', reason: 'Ownership period is unknown.' };
  if (years >= 8) return { years_held: years, equity_signal: 'LIKELY_EQUITY', reason: 'Long tenure clue only; debt and actual equity are unknown.' };
  if (years <= 3 && /\b(builder|development|homes|construction)\b/i.test(clean(latest.grantor))) {
    return { years_held: years, equity_signal: 'LIKELY_NONE', reason: 'Recent builder deed clue only; debt and actual equity are unknown.' };
  }
  return { years_held: years, equity_signal: 'LIKELY_THIN', reason: 'Tenure clue only; debt and actual equity are unknown.' };
}
function applyMatchedRecord(inputRow, record, nowIso = new Date().toISOString()) {
  const row = JSON.parse(JSON.stringify(inputRow));
  const url = record.source_url || record.bulk_source_url;
  const clue = equityClue(record, nowIso);
  const evidence = `County appraisal record ${record.county} ${record.parcel_id}; official owner and mailing address. County appraised value is not a sold comp or ARV.`;
  nestedConflict(row, 'owner_record.owner_name', row.owner_record && row.owner_record.owner_name, record.owner_of_record, url);
  nestedConflict(row, 'owner_record.mailing_address', row.owner_record && row.owner_record.mailing_address, record.mailing_address, url);
  row.county_appraisal_record = Object.assign({}, record, { equity_signal: clue.equity_signal, years_held: clue.years_held, equity_reason: clue.reason });
  if (clean(record.owner_of_record)) {
    row.owner_record = Object.assign({}, row.owner_record || {}, {
      owner_name: record.owner_of_record,
      mailing_address: clean(record.mailing_address) || clean(row.owner_record && row.owner_record.mailing_address),
      parcel_id: record.parcel_id, situs_address: record.normalized_address,
      is_entity: isEntityName(record.owner_of_record),
      owner_role: 'owner_of_record', record_label: 'Owner of record',
      source_kind: 'official_public_record', source_url: url, evidence_text: evidence
    });
  }
  row.mailing_route = record.mailing_address ? {
    route_kind: 'mailing_address', value: record.mailing_address,
    source_kind: 'official_public_record', source_url: url, evidence_text: evidence,
    confidence: 'High', risk_flags: ['mail_only_route', 'owner_of_record_may_differ_from_occupant']
  } : row.mailing_route;
  setOfficial(row, 'parcel_id', record.parcel_id, url);
  setOfficial(row, 'geo_id', record.geo_id, url);
  setOfficial(row, 'legal_description', record.legal_description, url);
  setOfficial(row, 'property_kind', record.property_type, url);
  setOfficial(row, 'lot_size', record.lot_size_sqft == null ? record.lot_size_sqft_approx : record.lot_size_sqft, url);
  setOfficial(row, 'living_area', record.living_area, url);
  setOfficial(row, 'year_built', record.year_built, url);
  setOfficial(row, 'bedrooms', record.beds, url);
  setOfficial(row, 'bathrooms', record.baths, url);
  setOfficial(row, 'assessed_value', record.assessed_value, url);
  row.assessed_value_evidence_text = record.assessed_value == null ? row.assessed_value_evidence_text :
    `County appraised value (not a sold comp), value year ${record.assessed_value_year || 'not shown'}; ${url}`;
  if (record.assessed_value != null) {
    row.property_story = Object.assign({}, row.property_story || {}, {
      assessed_value: String(record.assessed_value), source_kind: 'official_public_record', source_url: url,
      evidence_text: `County appraised value is a clue, not ARV or a sold comp. ${url}`
    });
  }
  if (clean(record.owner_of_record)) row.official_lookup_status = 'owner_found';
  row.preview_only = true;
  row.not_a_saved_lead = true;
  const contact = leadOperationsState.contactStateForDeal(row);
  const property = leadOperationsState.propertyStateForDeal(row);
  const overall = leadOperationsState.rowStateForDeal(row);
  Object.assign(row, contact, property, overall);
  row.row_state_next_action = overall.next_action;
  return row;
}

function textOf($, element) { return clean($(element).text()); }
function tableRows($, table) {
  const headers = $(table).find('thead th').map((_, cell) => textOf($, cell)).get();
  if (!headers.length) return [];
  return $(table).find('tbody tr').map((_, tr) => {
    const cells = $(tr).find('td').map((__, cell) => textOf($, cell)).get();
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
  }).get();
}
function portalLabel($, label) {
  let value = '';
  $('main p').each((_, item) => {
    if (textOf($, item).toLowerCase() !== `${label.toLowerCase()}:`) return;
    const sibling = $(item).next();
    if (sibling.length) value = textOf($, sibling);
  });
  return value;
}
function parsePortalHtml(html, profile, sourceUrl) {
  const $ = cheerio.load(html);
  const heading = $('main h2').map((_, el) => textOf($, el)).get().find((text) => /^Property\s*\|/i.test(text)) || '';
  const parcelId = (heading.match(/Property\s*\|\s*(\d+)/i) || [])[1] || portalLabel($, 'Property ID');
  if (!parcelId) return null;
  const tables = $('main table').toArray().map((table) => tableRows($, table));
  const values = tables.find((rows) => rows.some((row) => Object.hasOwn(row, 'Appraised') && Object.hasOwn(row, 'Year'))) || [];
  const deeds = tables.find((rows) => rows.some((row) => Object.hasOwn(row, 'Deed Date') && Object.hasOwn(row, 'Grantor/Seller'))) || [];
  const improvements = tables.find((rows) => rows.some((row) => Object.hasOwn(row, 'Description') && Object.hasOwn(row, 'Year Built') && Object.hasOwn(row, 'SQFT'))) || [];
  const land = tables.find((rows) => rows.some((row) => Object.hasOwn(row, 'Acres') && Object.hasOwn(row, 'SQFT'))) || [];
  const valueHistory = values.map((row) => ({ year: clean(row.Year), appraised_value: numberOrNull(row.Appraised) }))
    .filter((item) => item.year && item.appraised_value != null)
    .sort((a, b) => b.year.localeCompare(a.year));
  const deedHistory = deeds.map((row) => ({ date: isoDate(row['Deed Date']), type: clean(row.Description),
    grantor: clean(row['Grantor/Seller']), grantee: clean(row['Grantee/Buyer']), instrument: clean(row.Instrument) }))
    .filter((item) => item.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  const mainArea = improvements.find((row) => /MAIN AREA/i.test(row.Description));
  const garage = improvements.find((row) => /GARAGE/i.test(row.Description));
  const featureText = $('main table').map((_, table) => textOf($, table)).get().find((text) => /Number of Bedrooms\s*:/i.test(text)) || '';
  const wordNumber = (pattern) => { const match = featureText.match(pattern); return match ? WORD_NUMBERS[match[1].toUpperCase()] || numberOrNull(match[1]) : null; };
  const stateCode = portalLabel($, 'State Code');
  const exemptions = portalLabel($, 'Exemptions');
  const acreage = numberOrNull(land[0] && land[0].Acres);
  const lotSqft = numberOrNull(land[0] && land[0].SQFT);
  const situsText = $('main').text().match(/\bAddress:\s*(\d{1,7}\s+[A-Z0-9 .#-]{3,80}),\s*([A-Za-z ]+)\s+([A-Z]{2})\s+(\d{5})/i);
  const situs = situsText ? `${clean(situsText[1])}, ${clean(situsText[2])}, ${situsText[3]} ${situsText[4]}` : '';
  const currentValue = valueHistory[0] || {};
  return {
    county: profile.county, state: profile.state, parcel_id: parcelId,
    geo_id: portalLabel($, 'Geographic ID'), owner_of_record: portalLabel($, 'Name'),
    owner_id: portalLabel($, 'Owner ID'), mailing_address: portalLabel($, 'Mailing Address'),
    percent_ownership: numberOrNull(portalLabel($, '% Ownership').replace(/\s*%$/, '')),
    homestead_exemption: exemptions ? /\bHS\s*-\s*Homestead\b/i.test(exemptions) : null,
    legal_description: portalLabel($, 'Legal Description'), normalized_address: situs,
    state_code: stateCode, property_type: clean(profile.state_code_property_types && profile.state_code_property_types[stateCode]),
    lot_size_acres: acreage, lot_size_sqft: lotSqft,
    living_area: numberOrNull(mainArea && mainArea.SQFT), gross_building_area: numberOrNull(portalLabel($, 'Gross Building Area').replace(/\s*sqft$/i, '')),
    year_built: numberOrNull(mainArea && mainArea['Year Built']), garage: clean(garage && garage.Description),
    beds: wordNumber(/Number of Bedrooms\s*:\s*(\w+)\s+BEDROOM/i),
    baths: wordNumber(/Plumbing\s*:\s*(\w+)\s+BATH/i),
    construction: clean((featureText.match(/Exterior Wall\s*:\s*(.*?)(?=Flooring\s*:|Foundation\s*:|$)/i) || [])[1]),
    foundation: clean((featureText.match(/Foundation\s*:\s*([^:]+?)(?=Heating\/Cooling\s*:|$)/i) || [])[1]),
    roof: clean((featureText.match(/Roof Covering\s*:\s*([^:]+?)(?=Roof Style\s*:|$)/i) || [])[1]),
    value_history: valueHistory, deed_history: deedHistory,
    assessed_value: currentValue.appraised_value == null ? null : currentValue.appraised_value,
    assessed_value_year: currentValue.year || '',
    source_kind: 'official_public_record', source_url: sourceUrl
  };
}

async function readPortalRecord(input, options = {}) {
  const profile = input.profile;
  const url = detailUrl(profile, input.parcel_id, input.year);
  if (!url) return { status: 'failed', reason: 'portal_property_id_and_year_required' };
  const nowMs = options.now_ms == null ? Date.now() : options.now_ms;
  const key = `${profile.state}|${profile.county}`;
  const blockedState = options.blocked_state || portalBlocks;
  if (blockedState.has(key)) return { status: 'blocked', reason: blockedState.get(key), source_url: url };
  const recent = (options.rate_state || portalCalls).get(key) || [];
  const withinHour = recent.filter((at) => nowMs - at < 3600000);
  if (withinHour.length >= 60 || (withinHour.length && nowMs - withinHour[withinHour.length - 1] < 3000)) {
    return { status: 'rate_limited', reason: 'portal_limit_1_per_3_seconds_60_per_hour', source_url: url };
  }
  const fetchImpl = options.fetch_impl || globalThis.fetch;
  if (!fetchImpl) return { status: 'requires_local_browser', reason: 'no_http_fetch_implementation', source_url: url };
  withinHour.push(nowMs);
  (options.rate_state || portalCalls).set(key, withinHour);
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', redirect: 'manual',
      headers: { Accept: 'text/html', 'User-Agent': 'WholesaleOS County Appraisal Read/1.0' } });
  } catch (error) {
    return { status: 'failed', reason: clean(error && error.message) || 'portal_fetch_failed', source_url: url };
  }
  if (response.status === 403 || response.status === 429) {
    blockedState.set(key, `http_${response.status}`);
    return { status: 'blocked', reason: `http_${response.status}`, source_url: url };
  }
  if (!response.ok || response.status >= 300) return { status: 'failed', reason: `http_${response.status}`, source_url: url };
  let html = await response.text();
  if (BLOCKED_TEXT_RE.test(html)) {
    blockedState.set(key, 'portal_access_wall');
    return { status: 'blocked', reason: 'portal_access_wall', source_url: url };
  }
  let record = parsePortalHtml(html, profile, url);
  if (!record && options.render_impl) {
    html = await options.render_impl(url);
    if (BLOCKED_TEXT_RE.test(html)) {
      blockedState.set(key, 'portal_access_wall');
      return { status: 'blocked', reason: 'portal_access_wall', source_url: url };
    }
    record = parsePortalHtml(html, profile, url);
  }
  if (!record) return { status: 'requires_local_browser', reason: 'portal_requires_rendered_detail', source_url: url };
  if (record.parcel_id !== clean(input.parcel_id)) return { status: 'failed', reason: 'portal_parcel_mismatch', source_url: url };
  return { status: 'found', record: Object.assign(record, { fetched_at: new Date(nowMs).toISOString() }), source_url: url };
}

module.exports = {
  addressFromBulk, applyMatchedRecord, bulkRecord, detailUrl, equityClue, ingestBulkFile,
  matchRow, parseDbfHeader, parseDbfRow, parsePortalHtml, readPortalRecord
};
