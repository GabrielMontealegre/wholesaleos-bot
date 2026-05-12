// modules/enrichment/connectors/philly-opa.js
// Philadelphia OPA (Office of Property Assessment) — public open data, no auth
'use strict';
const axios = require('axios');
const TIMEOUT = 25000;

async function lookup(lead) {
  var addr = (lead.address || '').trim();
  if (!addr) return { owner_name: null, source_name: 'philly_opa', notes: 'No address' };
  var resp = await axios.get('https://data.phila.gov/resource/w7rb-qrn8.json', {
    params: { location: addr, $limit: 1 },
    timeout: TIMEOUT,
    headers: { Accept: 'application/json' }
  });
  var rec = (resp.data || [])[0];
  if (!rec) return { owner_name: null, source_name: 'philly_opa', notes: 'No OPA record found' };
  return {
    owner_name: rec.owner_1 || null,
    owner_2: rec.owner_2 || null,
    parcel_number: rec.parcel_number || null,
    market_value: rec.market_value || null,
    sale_date: rec.sale_date || null,
    sale_price: rec.sale_price || null,
    source_name: 'philly_opa',
    notes: 'Philadelphia OPA open data'
  };
}
module.exports = { lookup };
