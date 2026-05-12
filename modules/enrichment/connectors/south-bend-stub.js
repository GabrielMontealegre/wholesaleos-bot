// modules/enrichment/connectors/south-bend-stub.js
// South Bend IN — St Joseph County GIS not publicly accessible without credentials.
// Returns null safely. No fake data.
'use strict';
async function lookup(lead) {
  return {
    owner_name: null,
    source_name: 'southbend_stub',
    notes: 'St Joseph County owner lookup not yet available — API access pending'
  };
}
module.exports = { lookup };
