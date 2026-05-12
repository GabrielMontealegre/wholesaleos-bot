// modules/enrichment/connectors/nashville-arcgis.js
// Nashville Davidson County — Parcels Mailing List (ArcGIS FeatureServer, public)
'use strict';
const axios = require('axios');
const TIMEOUT = 25000;
const URL = 'https://services2.arcgis.com/HdTo6HJqh92wn4D8/ArcGIS/rest/services/Parcels_Mailing_List/FeatureServer/0/query';

async function lookup(lead) {
  var addr = (lead.address || '').trim().toUpperCase();
  if (!addr) return { owner_name: null, source_name: 'nashville_arcgis', notes: 'No address' };
  // Normalize address: remove unit markers for matching
  var addrSearch = addr.replace(/\s+(APT|UNIT|STE|#)\s*\S+/i, '').trim();
  var resp = await axios.get(URL, {
    params: { where: "PropAddr LIKE '" + addrSearch.replace(/'/g,"''") + "%'", outFields: 'Owner,PropAddr,OwnAddr1', f: 'json', resultRecordCount: 1 },
    timeout: TIMEOUT
  });
  var features = (resp.data || {}).features || [];
  if (!features.length) return { owner_name: null, source_name: 'nashville_arcgis', notes: 'No parcel record found' };
  var attrs = features[0].attributes || {};
  return {
    owner_name: attrs.Owner || null,
    parcel_number: null,
    source_name: 'nashville_arcgis',
    notes: 'Nashville Davidson County parcel data'
  };
}
module.exports = { lookup };
