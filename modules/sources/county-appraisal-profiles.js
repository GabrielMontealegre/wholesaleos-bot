'use strict';

const PROFILES = Object.freeze([Object.freeze({
  county: 'Ellis',
  state: 'TX',
  portal_kind: 'true_prodigy',
  portal_search_url: 'https://www.elliscad.org/property-search',
  portal_detail_url_template: 'https://www.elliscad.org/property-detail/{property_id}/{year}',
  bulk_export_page_url: 'https://www.elliscad.com/gis-data/',
  bulk_export_file_url: 'https://drive.google.com/file/d/1uE04NCTYtXZKFr1fFOh9uLFEXDLTXF3G/view',
  bulk_export_notes: 'The public ownership ZIP contains a DBF attribute table. Extract the DBF locally before ingest; the bulk table does not contain beds, baths, living area, full deed history, or value history.',
  appraisal_year_strategy: Object.freeze({ detail_year_field: 'pyear', assessed_value_year_field: 'valueyear' }),
  field_map: Object.freeze({
    parcel_id: 'pid', geo_id: 'geoid', owner_of_record: 'fileasname', owner_id: 'ownerid',
    situs_number: 'streetnum', situs_prefix: 'streetpref', situs_street: 'streetname',
    situs_suffix: 'streetsuff', situs_secondary: 'streetseco', situs_city: 'city', situs_state: 'state', situs_zip: 'zip',
    mailing_street: 'owneraddrd', mailing_unit: 'owneraddru', mailing_city: 'owneraddrc',
    mailing_state: 'owneraddrs', mailing_zip: 'owneraddrz', legal_description: 'legaldescr',
    state_code: 'statecd', acreage: 'legalacre', assessed_value: 'ownerappra',
    latest_deed_date: 'deeddt', latest_deed_instrument: 'instrument',
    improvement_actual_year: 'imprvactua'
  }),
  state_code_property_types: Object.freeze({ A1: 'Single Family Residence' }),
  verified_at: '2026-09-23',
  verified_by: 'Official Ellis CAD rendered record and public ownership DBF schema'
})]);

function profileForCounty(county, state) {
  return PROFILES.find((profile) => profile.county.toLowerCase() === String(county || '').trim().toLowerCase() &&
    profile.state === String(state || '').trim().toUpperCase()) || null;
}

module.exports = { PROFILES, profileForCounty };
