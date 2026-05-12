// modules/enrichment/connectors/syracuse-arcgis.js
// Onondaga County NY (Syracuse) — SOCPA Parcels (ArcGIS FeatureServer, public)
'use strict';
const axios = require('axios');
const TIMEOUT = 25000;
const URL = 'https://services6.arcgis.com/bdPqSfflsdgFRVVM/ArcGIS/rest/services/All_Parcels_from_SOCPA_w_phase/FeatureServer/0/query';

async function lookup(lead) {
  var addr = (lead.address || '').trim().toUpperCase();
  if (!addr) return { owner_name: null, source_name: 'onondaga_arcgis', notes: 'No address' };
  var addrSearch = addr.replace(/\s+(APT|UNIT|STE|#)\s*\S+/i, '').trim();
  var resp = await axios.get(URL, {
    params: { where: "ADDRESS LIKE '" + addrSearch.replace(/'/g,"''") + "%'", outFields: 'OWNERNAME1,OWNERNAME2,ADDRESS', f: 'json', resultRecordCount: 1 },
    timeout: TIMEOUT
  });
  var features = (resp.data || {}).features || [];
  if (!features.length) return { owner_name: null, source_name: 'onondaga_arcgis', notes: 'No parcel record found' };
  var attrs = features[0].attributes || {};
  var owner = (attrs.OWNERNAME1 || '').trim();
  var owner2 = (attrs.OWNERNAME2 || '').trim();
  return {
    owner_name: owner || null,
    owner_2: owner2 || null,
    source_name: 'onondaga_arcgis',
    notes: 'Onondaga County (Syracuse) parcel data'
  };
}
module.exports = { lookup };
