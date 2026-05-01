'use strict';
var fetch = require('node-fetch');
var db = require('../../db');

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
      if (!addrRaw) return;
      var motivation = scoreMotivation(row, source);
      var lead = {
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
      leads.push(lead);
    });

    if (rows.length < fetchLimit) break;
    offset += rows.length;
    if (leads.length >= limit) break;
  }

  return leads;
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

module.exports = { runExtraSocrataSources: runExtraSocrataSources };
