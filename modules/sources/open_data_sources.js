// modules/sources/open_data_sources.js
// Socrata open data: Mesa AZ, LA CA, Hartford CT, Louisville KY, NOLA LA, Boston MA, Kansas City MO, Fayetteville NC, Buffalo NY, Philadelphia PA, Pittsburgh PA, Fort Worth TX, Norfolk VA, Austin TX, Seattle WA
'use strict';
const axios = require('axios');
const db = require('../../db');

const SOURCES = [
  {
    market: 'Mesa, AZ', state: 'AZ', city: 'Mesa',
    url: 'https://data.mesaaz.gov/resource/39rt-2rfj.json',
    addrField: 'address', typeField: 'case_type', dateField: 'open_date',
    source: 'Mesa AZ Code Violations', sourceUrl: 'https://data.mesaaz.gov/'
  },
  {
    market: 'Los Angeles, CA', state: 'CA', city: 'Los Angeles',
    url: 'https://data.lacity.org/resource/9jfy-rxed.json',
    addrField: 'address_house_number_direction_street_name', typeField: 'case_type', dateField: 'date_case_generated',
    source: 'Los Angeles CA Building Code', sourceUrl: 'https://data.lacity.org'
  },
  {
    market: 'Boston, MA', state: 'MA', city: 'Boston',
    url: 'https://data.boston.gov/api/3/action/datastore_search.json?resource_id=90ed3816-5e70-44b8-ab9a-c41e93b7c75f&limit=100',
    addrField: 'Address', typeField: 'Description', dateField: 'Status_Date', isCKAN: true,
    source: 'Boston MA Code Violations', sourceUrl: 'https://data.boston.gov'
  },
  {
    market: 'Kansas City, MO', state: 'MO', city: 'Kansas City',
    url: 'https://data.kcmo.org/resource/vq3e-m9ge.json',
    addrField: 'address', typeField: 'violation_description', dateField: 'date_opn',
    source: 'Kansas City MO Property Violations', sourceUrl: 'https://data.kcmo.org'
  },
  {
    market: 'Philadelphia, PA', state: 'PA', city: 'Philadelphia',
    url: 'https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+li_violations+ORDER+BY+violationdate+DESC+LIMIT+100&format=json',
    addrField: 'address', typeField: 'violationcodetitle', dateField: 'violationdate', isCarto: true,
    source: 'Philadelphia PA L&I Violations', sourceUrl: 'https://opendataphilly.org'
  },
  {
    market: 'Austin, TX', state: 'TX', city: 'Austin',
    url: 'https://data.austintexas.gov/resource/6wtj-zbtb.json',
    addrField: 'address', typeField: 'case_type', dateField: 'applied_date',
    source: 'Austin TX Code Complaints', sourceUrl: 'https://data.austintexas.gov'
  },
  {
    market: 'Seattle, WA', state: 'WA', city: 'Seattle',
    url: 'https://data.seattle.gov/resource/ez4a-iuw9.json',
    addrField: 'address', typeField: 'complaint_type', dateField: 'originalcompliancedate',
    source: 'Seattle WA Code Complaints', sourceUrl: 'https://data.seattle.gov'
  },
  {
    market: "Hartford, CT", state: "CT", city: "Hartford",
    url: "https://data.hartford.gov/resource/pers-xhpw.json",
    addrField: "location_1_address", typeField: "description", dateField: "date_of_violation",
    source: "Hartford CT Code Violations", sourceUrl: "https://data.hartford.gov"
  },
  {
    market: "Louisville, KY", state: "KY", city: "Louisville",
    url: "https://data.louisvilleky.gov/resource/5g9f-e75h.json",
    addrField: "address", typeField: "violation_code_description", dateField: "case_date",
    source: "Louisville KY Code Violations", sourceUrl: "https://data.louisvilleky.gov"
  },
  {
    market: "New Orleans, LA", state: "LA", city: "New Orleans",
    url: "https://data.nola.gov/resource/gcku-jbr4.json",
    addrField: "address", typeField: "casesubtype", dateField: "caseopendate",
    source: "New Orleans LA Code Enforcement", sourceUrl: "https://data.nola.gov"
  },
  {
    market: "Fayetteville, NC", state: "NC", city: "Fayetteville",
    url: "https://services.arcgis.com/ijFJ1wfcEDLCXdDc/arcgis/rest/services/CodeEnforcement/FeatureServer/0/query?where=1%3D1&outFields=*&f=json&resultRecordCount=100",
    addrField: "Address", typeField: "ViolationType", dateField: "DateOpened", isArcGISRaw: true,
    source: "Fayetteville NC Code Violations", sourceUrl: "https://data.fayettevillenc.gov"
  },
  {
    market: "Buffalo, NY", state: "NY", city: "Buffalo",
    url: "https://data.buffalony.gov/resource/6c2n-d9h7.json",
    addrField: "parcel_address", typeField: "violation_type", dateField: "inspection_date",
    source: "Buffalo NY Housing Violations", sourceUrl: "https://data.buffalony.gov"
  },
  {
    market: "Pittsburgh, PA", state: "PA", city: "Pittsburgh",
    url: "https://data.wprdc.org/resource/pzpb-38hp.json",
    addrField: "street_num_name", typeField: "viol_desc", dateField: "compl_date",
    source: "Pittsburgh PA PLI Violations", sourceUrl: "https://data.wprdc.org"
  },
  {
    market: "Fort Worth, TX", state: "TX", city: "Fort Worth",
    url: "https://data.fortworthtexas.gov/resource/spnu-bq4u.json",
    addrField: "address_location", typeField: "description", dateField: "date_filed",
    source: "Fort Worth TX Code Violations", sourceUrl: "https://data.fortworthtexas.gov"
  },
  {
    market: "Norfolk, VA", state: "VA", city: "Norfolk",
    url: "https://data.norfolk.gov/resource/tfj5-edcq.json",
    addrField: "siteaddress", typeField: "casesubtype", dateField: "opendate",
    source: "Norfolk VA Code Violations", sourceUrl: "https://data.norfolk.gov"
  },
];

async function fetchFromSocrata(src, count) {
  count = count || 100;
  let rows = [];
  if (src.isCKAN) {
    const res = await axios.get(src.url, { timeout: 20000 });
    rows = (res.data && res.data.result && res.data.result.records) || [];
  } else if (src.isCarto) {
    const res = await axios.get(src.url, { timeout: 20000 });
    rows = (res.data && res.data.rows) || [];
  } else if (src.isArcGISRaw) {
    const res = await axios.get(src.url, { timeout: 20000 });
    rows = ((res.data && res.data.features) || []).map(function(f){ return f.attributes || {}; });
  } else {
    const url = src.url + (src.url.indexOf('?') > -1 ? '&' : '?') + '$limit=' + count + '&$order=' + src.dateField + '+DESC';
    const res = await axios.get(url, { timeout: 20000 });
    rows = res.data || [];
  }
  const leads = [];
  rows.forEach(function(row) {
    const address = String(row[src.addrField] || '').trim().toUpperCase();
    if (!address || address.length < 5) return;
    leads.push({
      address: address,
      city: src.city,
      state: src.state,
      zip: String(row.zip || row.zipcode || row.postal_code || ''),
      county: src.market,
      source: src.source,
      source_url: src.sourceUrl,
      source_details: String(row[src.typeField] || ''),
      violations: [String(row[src.typeField] || 'Code Violation')],
      motivation: 'code_violation',
      motivation_score: 65,
      lead_type: 'raw',
      arv: null,
      repairs: null,
    });
  });
  return leads;
}

async function fetchAllOpenData(count) {
  count = count || 50;
  let total = 0;
  for (const src of SOURCES) {
    try {
      const leads = await fetchFromSocrata(src, count);
      let added = 0;
      leads.forEach(function(lead) {
        try { db.addLead(lead); added++; } catch(e) {}
      });
      total += added;
      console.log('[open-data] ' + src.market + ': ' + added + ' leads');
    } catch(e) {
      console.error('[open-data] ' + src.market + ' error:', e.message);
    }
  }
  return total;
}

module.exports = { fetchAllOpenData, SOURCES };