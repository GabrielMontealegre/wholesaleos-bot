'use strict';
var fetch = require('node-fetch');
var db = require('../../db');

var ARCGIS_SOURCES = [
  {
    city: 'Glendale',
    state: 'AZ',
    county: 'Maricopa',
    hubId: '8026de93be8147d2aa2941c3e7ceed97',
    serviceUrl: 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Code_Cases/FeatureServer/0',
    addressField: 'Address',
    typeField: 'Status',
    label: 'Glendale AZ Code Violations'
  },
  {
    city: 'Placer County',
    state: 'CA',
    county: 'Placer',
    hubId: 'ef7447d4efc2439a8a96727509fa57c5_4',
    serviceUrl: 'https://services1.arcgis.com/P5Mv5GY5S66M8Z1Q/arcgis/rest/services/Code_Enforcement/FeatureServer/4',
    addressField: 'SiteAddress',
    typeField: 'ViolationType',
    label: 'Placer County CA Code Violations'
  },
  {
    city: 'South Bend',
    state: 'IN',
    county: 'St. Joseph',
    hubId: 'ff1172d09ae94928b1e3b9c47d3eec8f_50',
    serviceUrl: 'https://services.arcgis.com/bdPqSfflsdgFRkuV/arcgis/rest/services/Code_Enforcement/FeatureServer/50',
    addressField: 'Address',
    typeField: 'ViolationDesc',
    label: 'South Bend IN Code Violations'
  },
  {
    city: 'Greensboro',
    state: 'NC',
    county: 'Guilford',
    hubId: 'eb7330c8600540d6972b7e094565baff_3',
    serviceUrl: 'https://services.arcgis.com/yiEOSKvBcSaEMWBn/arcgis/rest/services/Code_Violations/FeatureServer/3',
    addressField: 'ADDRESS',
    typeField: 'VIOLATION_TYPE',
    label: 'Greensboro NC Code Violations'
  },
  {
    city: 'Wake County',
    state: 'NC',
    county: 'Wake',
    hubId: 'code-cases-past-90-days',
    serviceUrl: 'https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Code_Cases_Past_90_Days/FeatureServer/0',
    addressField: 'Address',
    typeField: 'CaseType',
    label: 'Wake County NC Code Cases'
  },
  {
    city: 'Syracuse',
    state: 'NY',
    county: 'Onondaga',
    hubId: '107745f070b049feb38273a7ab200487_0',
    serviceUrl: 'https://services6.arcgis.com/bdPqSfflsdgFRkuV/arcgis/rest/services/Code_Enforcement_Cases/FeatureServer/0',
    addressField: 'Address',
    typeField: 'CaseType',
    label: 'Syracuse NY Code Violations'
  },
  {
    city: 'Nashville',
    state: 'TN',
    county: 'Davidson',
    hubId: '038de0cf3d35435c8c563b731265c036_0',
    serviceUrl: 'https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Code_Enforcement/FeatureServer/0',
    addressField: 'StreetAddress',
    typeField: 'ViolationType',
    label: 'Nashville TN Code Violations'
  }
];

function scoreMotivation(attrs, source) {
  var score = 50;
  var reasons = [];
  var type = (attrs[source.typeField] || '').toLowerCase();
  if (type.indexOf('vacant') > -1 || type.indexOf('abandon') > -1) { score += 30; reasons.push('Vacant/Abandoned property'); }
  if (type.indexOf('hazard') > -1 || type.indexOf('unsafe') > -1) { score += 20; reasons.push('Unsafe/Hazardous condition'); }
  if (type.indexOf('fire') > -1) { score += 25; reasons.push('Fire damaged'); }
  if (type.indexOf('blight') > -1) { score += 20; reasons.push('Blighted property'); }
  if (type.indexOf('demo') > -1) { score += 15; reasons.push('Demolition order'); }
  return { score: Math.min(score, 100), reasons: reasons };
}

async function fetchArcGISSource(source, maxRecords) {
  var leads = [];
  var offset = 0;
  var pageSize = 100;
  var limit = maxRecords || 200;

  while (leads.length < limit) {
    var url = source.serviceUrl +
      '/query?where=1%3D1&outFields=*&f=json' +
      '&resultRecordCount=' + pageSize +
      '&resultOffset=' + offset;

    var res;
    try {
      res = await fetch(url, { timeout: 15000 });
    } catch(e) {
      console.error('[arcgis] fetch error ' + source.city + ': ' + e.message);
      break;
    }

    if (!res.ok) {
      try {
        var hubUrl = 'https://opendata.arcgis.com/datasets/' + source.hubId + '.geojson?outSR=4326&where=1%3D1&resultRecordCount=' + pageSize + '&resultOffset=' + offset;
        res = await fetch(hubUrl, { timeout: 15000 });
        if (!res.ok) break;
        var geojson = await res.json();
        if (!geojson.features || geojson.features.length === 0) break;
        geojson.features.forEach(function(feat) {
          var props = feat.properties || {};
          var addrRaw = props[source.addressField] || props.address || props.Address || props.ADDRESS || '';
          if (!addrRaw) return;
          var motivation = scoreMotivation(props, source);
          var lead = {
            address: addrRaw,
            city: source.city,
            state: source.state,
            county: source.county,
            zip: props.Zip || props.ZipCode || props.zip || '',
            source: 'arcgis_hub',
            source_details: source.label,
            lead_type: 'raw',
            analysisStatus: 'incomplete',
            arv: null,
            motivation: motivation.reasons.join('; ') || (props[source.typeField] || 'Code Violation'),
            violations: props[source.typeField] || 'Code Violation',
            motivation_score: motivation.score,
            good_deal_reasons: motivation.reasons,
            priority: motivation.score >= 75 ? 'HIGH' : motivation.score >= 55 ? 'MEDIUM' : 'LOW',
            phone: '',
            email: '',
            owner_name: props.OwnerName || props.owner_name || props.Owner || ''
          };
          leads.push(lead);
        });
        if (geojson.features.length < pageSize) break;
        offset += pageSize;
        continue;
      } catch(e2) {
        console.error('[arcgis] hub fallback error ' + source.city + ': ' + e2.message);
        break;
      }
    }

    var data;
    try {
      data = await res.json();
    } catch(e) {
      console.error('[arcgis] json parse error ' + source.city + ': ' + e.message);
      break;
    }

    if (!data.features || data.features.length === 0) break;

    data.features.forEach(function(feat) {
      var attrs = feat.attributes || {};
      var addrRaw = attrs[source.addressField] || attrs.address || attrs.Address || attrs.ADDRESS || '';
      if (!addrRaw) return;
      var motivation = scoreMotivation(attrs, source);
      var lead = {
        address: addrRaw,
        city: source.city,
        state: source.state,
        county: source.county,
        zip: attrs.Zip || attrs.ZipCode || attrs.zip || '',
        source: 'arcgis_hub',
        source_details: source.label,
        lead_type: 'raw',
        analysisStatus: 'incomplete',
        arv: null,
        motivation: motivation.reasons.join('; ') || (attrs[source.typeField] || 'Code Violation'),
        violations: attrs[source.typeField] || 'Code Violation',
        motivation_score: motivation.score,
        good_deal_reasons: motivation.reasons,
        priority: motivation.score >= 75 ? 'HIGH' : motivation.score >= 55 ? 'MEDIUM' : 'LOW',
        phone: '',
        email: '',
        owner_name: attrs.OwnerName || attrs.owner_name || attrs.Owner || ''
      };
      leads.push(lead);
    });

    if (data.features.length < pageSize) break;
    offset += pageSize;
    if (leads.length >= limit) break;
  }

  return leads;
}

async function runArcGISSources(maxPerSource) {
  var total = 0;
  var inserted = 0;
  console.log('[arcgis] starting run across ' + ARCGIS_SOURCES.length + ' sources');

  for (var i = 0; i < ARCGIS_SOURCES.length; i++) {
    var source = ARCGIS_SOURCES[i];
    try {
      console.log('[arcgis] fetching ' + source.label);
      var leads = await fetchArcGISSource(source, maxPerSource || 200);
      console.log('[arcgis] ' + source.city + ' raw count: ' + leads.length);
      total += leads.length;
      for (var j = 0; j < leads.length; j++) {
        try {
          var result = db.addLead(leads[j]);
          if (result && result.id) inserted++;
        } catch(e) {}
      }
    } catch(e) {
      console.error('[arcgis] error on ' + source.city + ': ' + e.message);
    }
  }

  console.log('[arcgis] done. fetched=' + total + ' inserted=' + inserted);
  return { fetched: total, inserted: inserted };
}

module.exports = { runArcGISSources: runArcGISSources };
