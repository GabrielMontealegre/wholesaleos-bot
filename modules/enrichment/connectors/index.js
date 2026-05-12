// modules/enrichment/connectors/index.js — source router (Phase 3C)
'use strict';
const phillyOPA       = require('./philly-opa');
const nashvilleArcGIS = require('./nashville-arcgis');
const syracuseArcGIS  = require('./syracuse-arcgis');

// Route by state + city
async function lookup(lead) {
  var state  = (lead.state  || '').toUpperCase().trim();
  var city   = (lead.city   || '').toLowerCase().trim();
  var source = (lead.source || '').toLowerCase();

  if (state === 'PA' || /philadelphia|l.?i violation/i.test(source)) {
    return phillyOPA.lookup(lead);
  }
  if (state === 'TN' || /nashville/i.test(source)) {
    return nashvilleArcGIS.lookup(lead);
  }
  if (state === 'NY' || /syracuse/i.test(source)) {
    return syracuseArcGIS.lookup(lead);
  }
  // Glendale AZ and South Bend IN: no public API available without CORS issues
  // Return null safely — no fake data
  var cityLabel = (lead.city || state || 'this city');
  return {
    owner_name: null,
    source_name: 'no_connector',
    notes: 'No owner lookup connector available for ' + cityLabel + ' yet'
  };
}

module.exports = { lookup };
