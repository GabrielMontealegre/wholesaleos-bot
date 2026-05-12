// modules/enrichment/connectors/philadelphia.js — Phase 3C
// Philadelphia Office of Property Assessment (OPA) — public, no auth
'use strict';
const axios = require('axios');
const { classifyOwnerType } = require('../classifier');
const TIMEOUT = 8000;

async function fetchOwnerData(lead) {
  var addr = (lead.address || '').trim();
  if (!addr) return _null('No address');
  try {
    var resp = await axios.get('https://data.phila.gov/resource/w7rb-qrn8.json', {
      params: { location: addr, $limit: 1 },
      timeout: TIMEOUT,
      headers: { Accept: 'application/json' }
    });
    var rec = (resp.data || [])[0];
    if (!rec) return _null('No OPA record for: ' + addr);
    return {
      owner_name:    rec.owner_1 || null,
      owner_2:       rec.owner_2 || null,
      owner_type:    classifyOwnerType(rec.owner_1),
      parcel_number: rec.parcel_number || null,
      market_value:  rec.market_value  || null,
      sale_date:     rec.sale_date     || null,
      sale_price:    rec.sale_price    || null,
      source_name:   'philly_opa',
      notes:         'Philadelphia OPA open data'
    };
  } catch(e) { return _null('OPA fetch error: ' + e.message); }
}

function _null(notes) {
  return { owner_name:null, owner_type:null, source_name:'philly_opa', notes:notes };
}

module.exports = { fetchOwnerData };
