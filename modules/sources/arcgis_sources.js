// modules/sources/arcgis_sources.js
// ArcGIS FeatureServer sources: Glendale AZ, Placer County CA, South Bend IN, Greensboro NC, Wake County NC, Syracuse NY, Nashville TN
'use strict';
const axios = require('axios');
const db = require('../../db');

const SOURCES = [
  {
    market: 'Glendale, AZ', state: 'AZ', city: 'Glendale',
    url: 'https://services1.arcgis.com/9fVTQQSiODPjLUTa/arcgis/rest/services/GlendaleOne_Code_Compliance_Cases/FeatureServer/0/query',
    addrField: 'Address', dateField: 'RequestDate', typeField: 'CaseType', caseField: 'CodeCaseNumber',
    source: 'Glendale AZ Code Violations', sourceUrl: 'https://hub.arcgis.com/maps/8026de93be8147d2aa2941c3e7ceed97'
  },
  {
    market: 'Greensboro, NC', state: 'NC', city: 'Greensboro',
    url: 'https://gis.greensboro-nc.gov/arcgis/rest/services/OpenGateCity/OpenData_CC_DS/MapServer/3/query',
    addrField: 'ResponsibleParty', dateField: 'DateOpened', typeField: 'CaseType', caseField: 'CaseNumber',
    source: 'Greensboro NC Code Violations', sourceUrl: 'https://hub.arcgis.com/datasets/eb7330c8600540d6972b7e094565baff_3'
  },
  {
    market: 'Wake County, NC', state: 'NC', city: 'Raleigh',
    url: 'https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Code_Cases_Past_90_Days/FeatureServer/0/query',
    addrField: 'Address', dateField: 'DateOpened', typeField: 'ViolationType', caseField: 'CaseNumber',
    source: 'Wake County NC Code Cases', sourceUrl: 'https://data-wake.opendata.arcgis.com/datasets/code-cases-past-90-days'
  },
  {
    market: 'Syracuse, NY', state: 'NY', city: 'Syracuse',
    url: 'https://services6.arcgis.com/bdPqSfflsdgFRVVM/arcgis/rest/services/Code_Violations_V2/FeatureServer/0/query',
    addrField: 'complaint_address', dateField: 'open_date', typeField: 'complaint_type_name', caseField: 'complaint_number',
    source: 'Syracuse NY Code Violations', sourceUrl: 'https://hub.arcgis.com/datasets/107745f070b049feb38273a7ab200487_0'
  },
  {
    market: 'Nashville, TN', state: 'TN', city: 'Nashville',
    url: 'https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Property_Standards_Violations_2/FeatureServer/0/query',
    addrField: 'Property_Address', dateField: 'Date_Received', typeField: 'Violation_Type', caseField: 'Request_Nbr',
    source: 'Nashville TN Property Violations', sourceUrl: 'https://datanashvillegov-nashville.hub.arcgis.com/datasets/038de0cf3d35435c8c563b731265c036_0'
  },
  {
    market: "Placer County, CA", state: "CA", city: "Auburn",
    url: "https://services1.arcgis.com/L5bq1UhFYKOc0bKR/arcgis/rest/services/Code_Enforcement_Cases/FeatureServer/0/query",
    addrField: "SiteAddress", dateField: "OpenDate", typeField: "ViolationType", caseField: "CaseNumber",
    source: "Placer County CA Code Enforcement", sourceUrl: "https://hub.arcgis.com/datasets/ef7447d4efc2439a8a96727509fa57c5_4"
  },
  {
    market: "South Bend, IN", state: "IN", city: "South Bend",
    url: "https://services.arcgis.com/AF20J31nGaez0LkQ/arcgis/rest/services/code_enforcement/FeatureServer/0/query",
    addrField: "address", dateField: "open_date", typeField: "case_type", caseField: "case_number",
    source: "South Bend IN Code Enforcement", sourceUrl: "https://hub.arcgis.com/datasets/ff1172d09ae94928b1e3b9c47d3eec8f_50"
  },
];

async function fetchFromArcGIS(src, count) {
  count = count || 100;
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    f: 'json',
    resultRecordCount: String(count),
    orderByFields: src.dateField + ' DESC',
  });
  const res = await axios.get(src.url + '?' + params.toString(), { timeout: 20000 });
  const features = (res.data && res.data.features) || [];
  const leads = [];
  features.forEach(function(feat) {
    const a = feat.attributes || {};
    const address = a[src.addrField] || a.Address || a.address || a.Property_Address || a.complaint_address || '';
    if (!address || address.length < 5) return;
    // Build lead object
    const lead = {
      address: address.trim().toUpperCase(),
      city: a.City || a.city || src.city,
      state: a.State || a.state || src.state,
      zip: String(a.ZIP || a.zip || a.Zip || a.complaint_zip || ''),
      county: src.market,
      source: src.source,
      source_url: src.sourceUrl,
      source_details: String(a[src.typeField] || a[src.caseField] || ''),
      violations: [String(a[src.typeField] || 'Code Violation')],
      motivation: 'code_violation',
      motivation_score: 65,
      lead_type: 'raw',
      arv: null,
      repairs: null,
    };
    leads.push(lead);
  });
  return leads;
}

async function fetchAllArcGIS(count) {
  count = count || 50;
  let total = 0;
  for (const src of SOURCES) {
    try {
      const leads = await fetchFromArcGIS(src, count);
      let added = 0;
      leads.forEach(function(lead) {
        try { db.addLead(lead); added++; } catch(e) {}
      });
      total += added;
      console.log('[arcgis] ' + src.market + ': ' + added + ' leads added');
    } catch(e) {
      console.error('[arcgis] ' + src.market + ' error:', e.message);
    }
  }
  return total;
}

module.exports = { fetchAllArcGIS, SOURCES };