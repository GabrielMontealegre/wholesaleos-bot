// modules/sources/arcgis-sources.js
// ArcGIS FeatureServer sources — free REST API, no Playwright needed
// 7 cities: Glendale AZ, South Bend IN, Greensboro NC, Wake County NC,
//           Syracuse NY, Nashville TN, Placer County CA
'use strict';

const axios = require('axios');
const db    = require('../../db');

const SOURCES = [
  {
    market: 'Glendale, AZ', state: 'AZ', city: 'Glendale',
    url: 'https://services1.arcgis.com/9fVTQQSiODPjLUTa/arcgis/rest/services/GlendaleOne_Code_Compliance_Cases/FeatureServer',
    layer: 0,
    addrField: 'address', statusField: 'status', typeField: 'case_type', dateField: 'opened_date',
    source: 'Glendale AZ Code Violations',
  },
  {
    market: 'South Bend, IN', state: 'IN', city: 'South Bend',
    url: 'https://services1.arcgis.com/0n2NelSAfR7gTkr1/arcgis/rest/services/Continuous_Enforcement/FeatureServer',
    layer: 4,
    buildAddr: function(a){ return [a.P__,a.P_DIR,a.P_STREET,a.P_SUF].filter(Boolean).join(' '); },
    zipField: 'P_ZIP', statusField: 'Status', dateField: 'HEARING__OR_LETTER_DATE',
    source: 'South Bend IN Code Violations',
  },
  {
    market: 'Greensboro, NC', state: 'NC', city: 'Greensboro',
    url: 'https://gis.greensboro-nc.gov/arcgis/rest/services/OpenGateCity/OpenData_CC_DS/MapServer',
    layer: 3,
    addrField: 'Address', statusField: 'Status', typeField: 'ViolationDescription', dateField: 'OpenDate',
    source: 'Greensboro NC Code Violations',
  },
  {
    market: 'Syracuse, NY', state: 'NY', city: 'Syracuse',
    url: 'https://services6.arcgis.com/bdPqSfflsdgFRVVM/arcgis/rest/services/Code_Violations_V2/FeatureServer',
    layer: 0,
    addrField: 'address', statusField: 'status', typeField: 'violation_type', dateField: 'date_opened',
    source: 'Syracuse NY Code Violations',
  },
  {
    market: 'Nashville, TN', state: 'TN', city: 'Nashville',
    url: 'https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Property_Standards_Violations_2/FeatureServer',
    layer: 0,
    addrField: 'LOCATION_ADDRESS', statusField: 'CASE_STATUS', typeField: 'VIOLATION_TYPE', dateField: 'DATE_OPENED',
    source: 'Nashville TN Code Violations',
  },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; WholesaleOS/1.0)',
  'Accept': 'application/json',
};

function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }

// Query one ArcGIS FeatureServer layer
async function queryLayer(src, offset, count) {
  // Get available layers first
  var infoRes = await axios.get(src.url + '?f=json', { headers: HEADERS, timeout: 15000 });
  var layers = infoRes.data.layers || [];
  // Use configured layer, or first available
  var layerId = src.layer !== undefined ? src.layer : (layers[0] ? layers[0].id : 0);
  var url = src.url + '/' + layerId + '/query';
  var res = await axios.get(url, {
    params: {
      where: '1=1',
      outFields: '*',
      f: 'json',
      resultRecordCount: count || 100,
      resultOffset: offset || 0,
      orderByFields: 'OBJECTID DESC',
    },
    headers: HEADERS,
    timeout: 20000,
  });
  return res.data.features || [];
}

// Convert ArcGIS feature to lead
function featureToLead(feature, src) {
  var a = feature.attributes || {};
  // Build address
  var address = '';
  if (src.buildAddr) {
    address = src.buildAddr(a);
  } else {
    // Try common address field names
    var addrFields = [src.addrField,'address','Address','ADDRESS','LOCATION_ADDRESS',
      'SITE_ADDRESS','site_address','StreetAddress','street_address'];
    for (var i=0; i<addrFields.length; i++) {
      if (a[addrFields[i]]) { address = String(a[addrFields[i]]).trim(); break; }
    }
  }
  if (!address || address.length < 5) return null;
  // Get violation type
  var violation = '';
  var typeFields = [src.typeField,'violation_type','ViolationType','VIOLATION_TYPE',
    'case_type','CaseType','ORDER_TYPE','ViolationDescription'];
  for (var j=0; j<typeFields.length; j++) {
    if (a[typeFields[j]]) { violation = String(a[typeFields[j]]).trim(); break; }
  }
  // Get date
  var rawDate = null;
  var dateFields = [src.dateField,'date_opened','DateOpened','DATE_OPENED',
    'opened_date','OpenDate','HEARING__OR_LETTER_DATE','open_date'];
  for (var k=0; k<dateFields.length; k++) {
    if (a[dateFields[k]]) { rawDate = a[dateFields[k]]; break; }
  }
  var createdAt = rawDate ? (typeof rawDate === 'number' ? rawDate : new Date(rawDate).getTime()) : Date.now();
  // Get zip
  var zip = '';
  if (src.zipField && a[src.zipField]) zip = String(a[src.zipField]).trim();
  return {
    address: address,
    city: src.city,
    state: src.state,
    zip: zip,
    source: src.source,
    source_platform: 'ArcGIS',
    lead_type: 'raw',
    violations: violation ? [violation] : ['Code Violation'],
    motivation: 'Code Violation',
    motivation_score: 65,
    score: 65,
    arv: null,
    createdAt: createdAt,
    created_at: new Date(createdAt).toISOString(),
  };
}

// Run all ArcGIS sources
async function runArcGISSources() {
  var total = 0;
  var added = 0;
  for (var i = 0; i < SOURCES.length; i++) {
    var src = SOURCES[i];
    console.log('[arcgis] Fetching', src.market);
    try {
      var features = await queryLayer(src, 0, 200);
      console.log('[arcgis]', src.market, '→', features.length, 'records');
      total += features.length;
      // Get existing lead addresses to avoid duplicates
      var existingAddrs = new Set((db.getLeads()||[]).map(function(l){ return (l.address||'').toLowerCase(); }));
      var newLeads = 0;
      for (var j = 0; j < features.length; j++) {
        var lead = featureToLead(features[j], src);
        if (!lead) continue;
        if (existingAddrs.has(lead.address.toLowerCase())) continue;
        db.addLead(lead);
        existingAddrs.add(lead.address.toLowerCase());
        newLeads++;
        added++;
      }
      console.log('[arcgis]', src.market, '→', newLeads, 'new leads added');
      await sleep(1000);
    } catch(e) {
      console.error('[arcgis] Error on', src.market, ':', e.message);
    }
  }
  console.log('[arcgis] Done. Total fetched:', total, '| New leads:', added);
  return { total, added };
}

module.exports = { runArcGISSources };