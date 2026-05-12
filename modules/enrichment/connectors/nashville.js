// modules/enrichment/connectors/nashville.js — Phase 3C
// Nashville Metro Property Assessor — Socrata public API, no auth
'use strict';
const axios = require('axios');
const { classifyOwnerType } = require('../classifier');
const TIMEOUT = 8000;

async function fetchOwnerData(lead) {
  var addr = (lead.address || '').trim().toUpperCase();
  if (!addr) return _null('No address');
  try {
    // Davidson County Assessments dataset
    var resp = await axios.get('https://data.nashville.gov/resource/4gys-v75z.json', {
      params: { $where: "situs_address='" + addr.replace(/'/g,"''") + "'", $limit: 1 },
      timeout: TIMEOUT,
      headers: { Accept: 'application/json' }
    });
    var rec = (resp.data || [])[0];
    if (!rec) {
      // Try partial match
      var resp2 = await axios.get('https://data.nashville.gov/resource/4gys-v75z.json', {
        params: { $where: "situs_address like '%" + addr.split(' ').slice(0,3).join(' ').replace(/'/g,"''") + "%'", $limit: 1 },
        timeout: TIMEOUT, headers: { Accept: 'application/json' }
      });
      rec = (resp2.data || [])[0];
    }
    if (!rec) return _null('No assessor record for: ' + addr);
    var name = rec.mailing_name1 || rec.owner_name || null;
    return {
      owner_name:    name,
      owner_2:       rec.mailing_name2 || null,
      owner_type:    classifyOwnerType(name),
      parcel_number: rec.parcel_id || rec.account_number || null,
      market_value:  rec.total_appraised_value || rec.assessment_value || null,
      source_name:   'nashville_assessor',
      notes:         'Nashville Metro Property Assessor open data'
    };
  } catch(e) { return _null('Nashville fetch error: ' + e.message); }
}

function _null(notes) {
  return { owner_name:null, owner_type:null, source_name:'nashville_assessor', notes:notes };
}

module.exports = { fetchOwnerData };
