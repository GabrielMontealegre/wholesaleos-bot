// modules/enrichment/connectors/south-bend.js — Phase 3C
// St. Joseph County Indiana — public ArcGIS parcel service, no auth
'use strict';
const axios = require('axios');
const { classifyOwnerType } = require('../classifier');
const TIMEOUT = 8000;

async function fetchOwnerData(lead) {
  var addr = (lead.address || '').trim().toUpperCase().replace(/\s+/g,' ');
  if (!addr) return _null('No address');
  try {
    // St. Joseph County GIS ArcGIS REST — public parcels layer
    var resp = await axios.get(
      'https://gis.stjoeco.com/arcgis/rest/services/Parcels/MapServer/0/query', {
      params: {
        where: "UPPER(SITUS_ADDR) LIKE '%" + addr.split(' ').slice(0,4).join(' ').replace(/'/g,"''") + "%'",
        outFields: 'OWNER_NAME,OWNER_NAME2,SITUS_ADDR,PARCEL_NUM,ASSESSED_VALUE',
        returnGeometry: false, f: 'json', resultRecordCount: 1
      },
      timeout: TIMEOUT, headers: { Accept: 'application/json' }
    });
    var features = (resp.data && resp.data.features) || [];
    if (!features.length) return _null('No parcel record for: ' + addr);
    var attr = features[0].attributes || {};
    var name = attr.OWNER_NAME || null;
    return {
      owner_name:    name,
      owner_2:       attr.OWNER_NAME2 || null,
      owner_type:    classifyOwnerType(name),
      parcel_number: attr.PARCEL_NUM  || null,
      market_value:  attr.ASSESSED_VALUE || null,
      source_name:   'stj_county_gis',
      notes:         'St. Joseph County ArcGIS parcels'
    };
  } catch(e) { return _null('South Bend fetch error: ' + e.message); }
}

function _null(notes) {
  return { owner_name:null, owner_type:null, source_name:'stj_county_gis', notes:notes };
}

module.exports = { fetchOwnerData };
