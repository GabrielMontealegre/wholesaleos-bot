// modules/enrichment/connectors/syracuse.js — Phase 3C
// Onondaga County NY — NYS ORPTS parcel data via data.ny.gov, no auth
'use strict';
const axios = require('axios');
const { classifyOwnerType } = require('../classifier');
const TIMEOUT = 8000;

async function fetchOwnerData(lead) {
  var addr = (lead.address || '').trim().toUpperCase().replace(/\s+/g,' ');
  if (!addr) return _null('No address');
  try {
    // NYS ORPTS Real Property parcel data — Onondaga County (FIPS 36067)
    var resp = await axios.get('https://data.ny.gov/resource/bim3-2pxi.json', {
      params: {
        county_name: 'Onondaga',
        $where: "upper(property_address) like '%" + addr.split(' ').slice(0,3).join(' ').replace(/'/g,"''") + "%'",
        $limit: 1
      },
      timeout: TIMEOUT,
      headers: { Accept: 'application/json' }
    });
    var rec = (resp.data || [])[0];
    if (!rec) return _null('No parcel record for: ' + addr);
    var name = rec.owner || rec.owner_name || null;
    return {
      owner_name:    name,
      owner_type:    classifyOwnerType(name),
      parcel_number: rec.swis_code || rec.print_key || null,
      market_value:  rec.full_market_value || null,
      source_name:   'nys_orpts',
      notes:         'NYS ORPTS Onondaga County parcel data'
    };
  } catch(e) { return _null('Syracuse/NYS fetch error: ' + e.message); }
}

function _null(notes) {
  return { owner_name:null, owner_type:null, source_name:'nys_orpts', notes:notes };
}

module.exports = { fetchOwnerData };
