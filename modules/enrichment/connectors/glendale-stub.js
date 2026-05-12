// modules/enrichment/connectors/glendale-stub.js
// Glendale AZ — Maricopa County assessor CORS-restricted from server-side public access.
// Returns null safely. No fake data.
'use strict';
async function lookup(lead) {
  return {
    owner_name: null,
    source_name: 'glendale_stub',
    notes: 'Maricopa County owner lookup not yet available — API access pending'
  };
}
module.exports = { lookup };
