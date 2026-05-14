'use strict';
var fetch = require('node-fetch');
var db = require('../../db');
var sourceNormalizer = require('./transforms/source-normalizer');

// 20 additional Socrata open data cities
var SOCRATA_SOURCES = [
  {
    city: 'Miami',
    state: 'FL',
    county: 'Miami-Dade',
    domain: 'opendata.miamidade.gov',
    dataset: 'b6h5-isam',
    addressField: 'address',
    typeField: 'violation_type',
    label: 'Miami FL Code Violations'
  },
  {
    city: 'Tampa',
    state: 'FL',
    county: 'Hillsborough',
    domain: 'data.tampagov.net',
    dataset: 'pjrz-fvza',
    addressField: 'site_address',
    typeField: 'case_type',
    label: 'Tampa FL Code Cases'
  },
  {
    city: 'Orlando',
    state: 'FL',
    county: 'Orange',
    domain: 'data.cityoforlando.net',
    dataset: 'h243-2jzg',
    addressField: 'address',
    typeField: 'violation_description',
    label: 'Orlando FL Code Violations'
  },
  {
    city: 'Atlanta',
    state: 'GA',
    county: 'Fulton',
    domain: 'opendata.atlantaga.gov',
    dataset: 'g7yk-f8rq',
    addressField: 'address',
    typeField: 'violation_type',
    label: 'Atlanta GA Code Enforcement'
  },
  {
    city: 'Dallas',
    state: 'TX',
    county: 'Dallas',
    domain: 'www.dallasopendata.com',
    dataset: 'n7km-yvgf',
    addressField: 'location',
    typeField: 'status_of_case',
    label: 'Dallas TX Code Cases'
  },
  {
    city: 'San Antonio',
    state: 'TX',
    county: 'Bexar',
    domain: 'data.sanantonio.gov',
    dataset: 'ssud-gf3e',
    addressField: 'address',
    typeField: 'case_type',
    label: 'San Antonio TX Code Cases'
  },
  {
    city: 'Columbus',
    state: 'OH',
    county: 'Franklin',
    domain: 'opendata.columbus.gov',
    dataset: 'ry76-gybg',
    addressField: 'address',
    typeField: 'case_type',
    label: 'Columbus OH Code Violations'
  },
  {
    city: 'Cincinnati',
    state: 'OH',
    county: 'Hamilton',
    domain: 'data.cincinnati-oh.gov',
    dataset: '4cjh-bm8t',
    addressField: 'address',
    typeField: 'code_section',
    label: 'Cincinnati OH Code Violations'
  },
  {
    city: 'Grand Rapids',
    state: 'MI',
    county: 'Kent',
    domain: 'data.michigan.gov',
    dataset: 'n8t6-phef',
    addressField: 'address',
    typeField: 'violation',
    label: 'Grand Rapids MI Code Violations'
  },
  {
    city: 'Richmond',
    state: 'VA',
    county: 'Richmond City',
    domain: 'data.richmondgov.com',
    dataset: 'jnmd-89qs',
    addressField: 'property_address',
    typeField: 'violation_type',
    label: 'Richmond VA Code Violations'
  },
  {
    city: 'Indianapolis',
    state: 'IN',
    county: 'Marion',
    domain: 'data.indy.gov',
    dataset: 'rb5m-35vx',
    addressField: 'location',
    typeField: 'status',
    label: 'Indianapolis IN Code Violations'
  },
  {
    city: 'St. Louis',
    state: 'MO',
    county: 'St. Louis City',
    domain: 'data.stlouis-mo.gov',
    dataset: 'nx5j-3dby',
    addressField: 'address',
    typeField: 'violation',
    label: 'St. Louis MO Code Violations'
  },
  {
    city: 'Minneapolis',
    state: 'MN',
    county: 'Hennepin',
    domain: 'opendata.minneapolismn.gov',
    dataset: 'xbek-mf3d',
    addressField: 'address',
    typeField: 'code_violation_type',
    label: 'Minneapolis MN Code Violations'
  },
  {
    city: 'Denver',
    state: 'CO',
    county: 'Denver',
    domain: 'data.denvergov.org',
    dataset: 'asc1-a3me',
    addressField: 'address',
    typeField: 'complaint_type',
    label: 'Denver CO Code Cases'
  },
  {
    city: 'Phoenix',
    state: 'AZ',
    county: 'Maricopa',
    domain: 'phoenixopendata.com',
    dataset: 'v2nr-hx9r',
    addressField: 'address',
    typeField: 'case_type',
    label: 'Phoenix AZ Code Violations'
  },
  {
    city: 'Las Vegas',
    state: 'NV',
    county: 'Clark',
    domain: 'opendata.lasvegasnevada.gov',
    dataset: 'sfbp-nkbs',
    addressField: 'address',
    typeField: 'violation_type',
    label: 'Las Vegas NV Code Violations'
  },
  {
    city: 'Charlotte',
    state: 'NC',
    county: 'Mecklenburg',
    domain: 'data.charlottenc.gov',
    dataset: 'psa3-nhzj',
    addressField: 'address',
    typeField: 'violation_type',
    label: 'Charlotte NC Code Violations'
  },
  {
    city: 'Memphis',
    state: 'TN',
    county: 'Shelby',
    domain: 'data.memphistn.gov',
    dataset: 'cz3v-f87n',
    addressField: 'violation_address',
    typeField: 'code_violation',
    label: 'Memphis TN Code Violations'
  },
  {
    city: 'Chicago',
    state: 'IL',
    county: 'Cook',
    domain: 'datacatalog.cookcountyil.gov',
    dataset: 'tx2p-k2g9',
    addressField: 'address',
    typeField: 'class',
    label: 'Cook County IL Tax Liens'
  },
  {
    city: 'San Antonio',
    state: 'TX',
    county: 'Bexar',
    domain: 'data.bexar.org',
    dataset: 'bexar-tax-delinquent',
    addressField: 'situs_address',
    typeField: 'tax_year',
    label: 'Bexar County TX Tax Liens'
  }
];

function scoreMotivation(row, source) {
  var score = 50;
  var reasons = [];
  var type = (row[source.typeField] || '').toLowerCase();
  if (type.indexOf('vacant') > -1 || type.indexOf('abandon') > -1) { score += 30; reasons.push('Vacant/Abandoned'); }
  if (type.indexOf('hazard') > -1 || type.indexOf('unsafe') > -1) { score += 20; reasons.push('Unsafe condition'); }
  if (type.indexOf('fire') > -1) { score += 25; reasons.push('Fire damaged'); }
  if (type.indexOf('blight') > -1) { score += 20; reasons.push('Blighted'); }
  if (type.indexOf('tax') > -1 || type.indexOf('lien') > -1) { score += 25; reasons.push('Tax delinquent'); }
  if (type.indexOf('demo') > -1) { score += 15; reasons.push('Demolition order'); }
  return { score: Math.min(score, 100), reasons: reasons };
}

function firstField(row, fields) {
  row = row || {};
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    if (row[field] !== undefined && row[field] !== null && row[field] !== '') return row[field];
  }
  var keys = Object.keys(row);
  for (var j = 0; j < fields.length; j++) {
    var wanted = String(fields[j]).toLowerCase();
    for (var k = 0; k < keys.length; k++) {
      if (keys[k].toLowerCase() === wanted && row[keys[k]] !== undefined && row[keys[k]] !== null && row[keys[k]] !== '') {
        return row[keys[k]];
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

function parseYearsDelinquent(row) {
  var explicit = parseMoney(firstField(row, ['years_delinquent', 'years_delinq', 'delinquent_years']));
  if (explicit !== null) return explicit;

  var yearValue = firstField(row, ['delinquent_year', 'delinquency_year', 'tax_sale_year']);
  var year = parseInt(yearValue, 10);
  var currentYear = new Date().getFullYear();
  if (year && year > 1900 && year <= currentYear) return Math.max(0, currentYear - year);
  return null;
}

function sourceApiUrl(source) {
  return 'https://' + source.domain + '/resource/' + source.dataset + '.json';
}

function sourceDatasetUrl(source) {
  return 'https://' + source.domain + '/resource/' + source.dataset;
}

function isCookCountyTaxSource(source) {
  return source && source.domain === 'datacatalog.cookcountyil.gov' && source.dataset === 'tx2p-k2g9';
}

function buildCookCountyTaxLead(row, source) {
  var parcel = firstField(row, ['pin', 'apn', 'parcel', 'parcel_number', 'pin10']);
  var taxYear = firstField(row, ['tax_year', 'year', 'delinquent_year', 'tax_sale_year']);
  var sourceStatus = firstField(row, ['status', 'tax_status', 'payment_status', 'sale_status']);
  var taxDue = parseMoney(firstField(row, ['tax_due', 'tax_amount', 'amount_due', 'balance_due', 'total_due', 'delinquent_amount']));
  var lienAmount = parseMoney(firstField(row, ['lien_amount', 'lien', 'tax_lien_amount']));
  var yearsDelinquent = parseYearsDelinquent(row);
  var hasRichTaxEvidence = taxDue !== null ||
    lienAmount !== null ||
    yearsDelinquent !== null ||
    /delinq|lien|sale|auction|due/i.test(String(sourceStatus || ''));
  var queryUrl = sourceApiUrl(source) + (parcel ? '?pin=' + encodeURIComponent(parcel) : '?$limit=1');

  var lead = {
    address: firstField(row, ['prop_address_full', source.addressField, 'address', 'Address']) || '',
    city: firstField(row, ['prop_address_city_name', 'city', 'City']) || source.city,
    state: firstField(row, ['prop_address_state', 'state', 'State']) || source.state,
    county: source.county,
    zip: firstField(row, ['prop_address_zipcode_1', 'zip', 'zip_code', 'zipcode']) || '',
    source: 'socrata_extra',
    source_url: sourceDatasetUrl(source),
    source_query_url: queryUrl,
    source_record_url: parcel ? queryUrl : null,
    source_details: {
      source_name: source.label,
      source_type: 'tax_delinquency',
      county: source.county,
      dataset_id: source.dataset,
      tax_year: taxYear || null,
      status: sourceStatus || null
    },
    lead_type: 'raw',
    analysisStatus: 'incomplete',
    arv: null,
    motivation: 'tax_delinquent',
    violations: 'Tax Delinquent',
    motivation_score: hasRichTaxEvidence ? 80 : 65,
    good_deal_reasons: ['Tax delinquent'],
    priority: hasRichTaxEvidence ? 'HIGH' : 'MEDIUM',
    phone: '',
    email: '',
    owner_name: firstField(row, ['mail_address_name', 'owner_name', 'owner', 'Owner']) || '',
    parcel: parcel || '',
    apn: parcel || '',
    tax_year: taxYear || null,
    source_status: sourceStatus || null,
    tax_due: taxDue,
    lien_amount: lienAmount,
    years_delinquent: yearsDelinquent,
    distress_types: ['tax_delinquent'],
    distress_score: hasRichTaxEvidence
      ? (yearsDelinquent ? Math.min(100, 80 + Math.min(yearsDelinquent * 5, 20)) : 80)
      : 65,
    source_confidence: hasRichTaxEvidence ? 'high' : 'medium'
  };

  lead.source_normalized = sourceNormalizer.normalizeSourcePayload({
    address: lead.address,
    city: lead.city,
    state: lead.state,
    county: lead.county,
    owner_name: lead.owner_name,
    parcel: lead.parcel,
    apn: lead.apn,
    tax_due: lead.tax_due,
    lien_amount: lead.lien_amount,
    years_delinquent: lead.years_delinquent,
    distress_types: lead.distress_types,
    distress_score: lead.distress_score,
    source_type: 'tax_delinquency',
    source_url: lead.source_url,
    source_query_url: lead.source_query_url,
    source_record_url: lead.source_record_url,
    source_details: lead.source_details,
    source_confidence: lead.source_confidence
  }, {
    source_id: 'cook-county-tax-delinquency',
    source_kind: 'socrata',
    provider: 'Cook County IL',
    source_confidence: 'high'
  });

  return lead;
}

function buildGenericSocrataLead(row, source) {
  var addrRaw = row[source.addressField] || row.address || row.Address || '';
  if (!addrRaw || typeof addrRaw !== 'string') {
    // try nested location object
    if (row.location && row.location.human_address) {
      try {
        var loc = JSON.parse(row.location.human_address);
        addrRaw = loc.address || '';
      } catch(e) {}
    }
  }
  if (!addrRaw) return null;
  var motivation = scoreMotivation(row, source);
  return {
    address: addrRaw,
    city: source.city,
    state: source.state,
    county: source.county,
    zip: row.zip || row.zip_code || row.zipcode || '',
    source: 'socrata_extra',
    source_details: source.label,
    lead_type: 'raw',
    analysisStatus: 'incomplete',
    arv: null,
    motivation: motivation.reasons.join('; ') || (row[source.typeField] || 'Code Violation'),
    violations: row[source.typeField] || 'Code Violation',
    motivation_score: motivation.score,
    good_deal_reasons: motivation.reasons,
    priority: motivation.score >= 75 ? 'HIGH' : motivation.score >= 55 ? 'MEDIUM' : 'LOW',
    phone: '',
    email: '',
    owner_name: row.owner_name || row.owner || ''
  };
}

async function fetchSocrataSource(source, maxRecords) {
  var leads = [];
  var offset = 0;
  var pageSize = 1000;
  var limit = maxRecords || 200;

  while (leads.length < limit) {
    var fetchLimit = Math.min(pageSize, limit - leads.length);
    var url = 'https://' + source.domain + '/resource/' + source.dataset + '.json' +
      '?$limit=' + fetchLimit + '&$offset=' + offset;

    var res;
    try {
      res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        timeout: 15000
      });
    } catch(e) {
      console.error('[socrata-extra] fetch error ' + source.city + ': ' + e.message);
      break;
    }

    if (!res.ok) {
      console.error('[socrata-extra] ' + source.city + ' HTTP ' + res.status);
      break;
    }

    var rows;
    try {
      rows = await res.json();
    } catch(e) {
      console.error('[socrata-extra] json error ' + source.city + ': ' + e.message);
      break;
    }

    if (!rows || rows.length === 0) break;

    rows.forEach(function(row) {
      var lead = isCookCountyTaxSource(source)
        ? buildCookCountyTaxLead(row, source)
        : buildGenericSocrataLead(row, source);
      if (lead && lead.address) leads.push(lead);
    });

    if (rows.length < fetchLimit) break;
    offset += rows.length;
    if (leads.length >= limit) break;
  }

  return leads;
}

function clampCookCountyTaxLimit(limit) {
  var parsed = parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 3);
}

function getCookCountyTaxSource() {
  return SOCRATA_SOURCES.find(function(source) {
    return isCookCountyTaxSource(source);
  }) || null;
}

function getSavedLeadById(id) {
  if (!id || !db.getLeads) return null;
  return db.getLeads().find(function(lead) {
    return lead && lead.id === id;
  }) || null;
}

async function fetchCookCountyTaxRows(limit) {
  var requested = clampCookCountyTaxLimit(limit);
  var source = getCookCountyTaxSource();
  if (!source) throw new Error('Cook County tax delinquency source is not configured');

  var url = sourceApiUrl(source) + '?$limit=' + requested;
  var res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    timeout: 15000
  });

  if (!res.ok) {
    throw new Error('Cook County tax fetch failed: HTTP ' + res.status);
  }

  var rows = await res.json();
  if (!Array.isArray(rows)) {
    throw new Error('Cook County tax fetch returned an unexpected response');
  }

  return {
    source: source,
    rows: rows.slice(0, requested)
  };
}

function compactCookCountyTaxSample(savedLead, mappedLead) {
  var lead = savedLead || mappedLead || {};

  return {
    address: lead.address || null,
    parcel: lead.parcel || lead.apn || null,
    tax_due: lead.tax_due != null ? lead.tax_due : null,
    years_delinquent: lead.years_delinquent != null ? lead.years_delinquent : null,
    distress_types: Array.isArray(lead.distress_types) ? lead.distress_types : [],
    distress_score: lead.distress_score != null ? lead.distress_score : null,
    source_query_url: lead.source_query_url || null,
    source_record_url: lead.source_record_url || null,
    lead_intelligence: db.computeLeadIntelligence
      ? db.computeLeadIntelligence(lead)
      : (lead.lead_intelligence || null)
  };
}

function compactCookCountyTaxError(rowIndex, error, mappedLead, rawRow) {
  var source = mappedLead || rawRow || {};
  return {
    row_index: rowIndex,
    message: error && error.message ? error.message : 'Unknown Cook row processing error',
    parcel: source.parcel || source.apn || source.pin || source.parcel_number || null,
    address: source.address || source.prop_address_full || source.Address || null
  };
}

async function runCookCountyTaxTest(limit) {
  var requested = clampCookCountyTaxLimit(limit);
  var fetched = await fetchCookCountyTaxRows(requested);
  var rows = fetched.rows || [];
  var source = fetched.source;
  var samples = [];
  var errors = [];
  var insertedOrMerged = 0;

  for (var i = 0; i < rows.length && i < requested; i++) {
    var rawRow = rows[i];
    var mappedLead = null;
    try {
      mappedLead = buildCookCountyTaxLead(rawRow, source);
      if (!mappedLead || !mappedLead.address) {
        throw new Error('Cook row missing address after mapping');
      }

      var result = db.addLead(mappedLead);
      var savedLead = result && result.id ? getSavedLeadById(result.id) : null;
      if (result && result.id) insertedOrMerged++;
      samples.push(compactCookCountyTaxSample(savedLead || (result && result.address ? result : mappedLead), mappedLead));
    } catch(e) {
      errors.push(compactCookCountyTaxError(i, e, mappedLead, rawRow));
    }
  }

  return {
    ok: samples.length > 0 || errors.length === 0,
    requested: requested,
    partial: errors.length > 0 && samples.length > 0,
    errors: errors,
    inserted_or_merged: insertedOrMerged,
    samples: samples
  };
}

async function runExtraSocrataSources(maxPerSource) {
  var total = 0;
  var inserted = 0;
  console.log('[socrata-extra] starting run across ' + SOCRATA_SOURCES.length + ' sources');

  for (var i = 0; i < SOCRATA_SOURCES.length; i++) {
    var source = SOCRATA_SOURCES[i];
    try {
      console.log('[socrata-extra] fetching ' + source.label);
      var leads = await fetchSocrataSource(source, maxPerSource || 200);
      console.log('[socrata-extra] ' + source.city + ' raw count: ' + leads.length);
      total += leads.length;
      for (var j = 0; j < leads.length; j++) {
        try {
          var result = db.addLead(leads[j]);
          if (result && result.id) inserted++;
        } catch(e) {}
      }
    } catch(e) {
      console.error('[socrata-extra] error on ' + source.city + ': ' + e.message);
    }
  }

  console.log('[socrata-extra] done. fetched=' + total + ' inserted=' + inserted);
  return { fetched: total, inserted: inserted };
}

module.exports = {
  runExtraSocrataSources: runExtraSocrataSources,
  runCookCountyTaxTest: runCookCountyTaxTest,
  _buildCookCountyTaxLead: buildCookCountyTaxLead,
  _buildGenericSocrataLead: buildGenericSocrataLead
};
