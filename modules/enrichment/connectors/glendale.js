// modules/enrichment/connectors/glendale.js — Phase 3C
// Maricopa County Assessor — public API, no auth required
'use strict';
const axios = require('axios');
const { classifyOwnerType } = require('../classifier');
const TIMEOUT = 8000;

async function fetchOwnerData(lead) {
  var addr = (lead.address || '').trim().toUpperCase().replace(/\s+/g,' ');
  if (!addr) return _null('No address');
  try {
    // Maricopa County Assessor search API
    var resp = await axios.get('https://mcassessor.maricopa.gov/mcs.php', {
      params: { q: addr },
      timeout: TIMEOUT,
      headers: { Accept: 'text/html,application/json', 'User-Agent': 'WholesaleOS/1.0 PropertyResearch' }
    });
    // Response is HTML — parse owner from text
    var html = resp.data || '';
    // Extract owner name from assessor HTML response
    var ownerMatch = html.match(/Owner[:\s]+([A-Z][A-Z\s,\.&]+?)(?:<|\n|\r)/i);
    var name = ownerMatch ? ownerMatch[1].trim() : null;
    // Try JSON endpoint if available
    if (!name) {
      var resp2 = await axios.get('https://mcassessor.maricopa.gov/mcs.php', {
        params: { q: addr, output: 'json' }, timeout: TIMEOUT,
        headers: { Accept: 'application/json' }
      });
      if (resp2.data && resp2.data.owner) name = resp2.data.owner;
    }
    return {
      owner_name:  name,
      owner_type:  classifyOwnerType(name),
      source_name: 'maricopa_assessor',
      notes:       name ? 'Maricopa County Assessor' : 'No record found: ' + addr
    };
  } catch(e) { return _null('Glendale/Maricopa fetch error: ' + e.message); }
}

function _null(notes) {
  return { owner_name:null, owner_type:null, source_name:'maricopa_assessor', notes:notes };
}

module.exports = { fetchOwnerData };
