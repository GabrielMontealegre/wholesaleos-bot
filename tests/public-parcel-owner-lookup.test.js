'use strict';

const assert = require('assert');
const ownerLookup = require('../modules/research/public-parcel-owner-lookup');
const parcelProfiles = require('../modules/sources/public-parcel-api-profiles');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); }
  };
}

(async () => {
  const profile = {
    api_kind: 'arcgis',
    service_url: 'https://public.example.gov/arcgis/rest/services/Parcels/MapServer',
    layer: 0,
    field_map: {
      owner_name: 'OWNER',
      mailing_address: ['MAIL1', 'MAIL_CITY', 'MAIL_STATE', 'MAIL_ZIP'],
      situs_address: 'SITUS',
      parcel_id: 'APN',
      land_use: 'LAND_USE',
      assessed_value: 'TOTAL_VALUE',
      year_built: 'YEAR_BUILT',
      living_area: 'LIVING_AREA',
      prior_document_date: 'DOCDATE'
    }
  };
  const row = {
    normalized_address: '123 Main St, San Antonio, TX 78201',
    city: 'San Antonio',
    county: 'Bexar',
    state: 'TX'
  };

  const found = await ownerLookup.lookupOwnerForRow(row, {
    profiles: [profile],
    fetch_impl: async (url) => {
      assert.ok(/SITUS/.test(decodeURIComponent(String(url))));
      return response({ features: [{ attributes: {
        OWNER: 'KILLER CAPITAL CONSULTANTS LLC',
        MAIL1: 'PO BOX 100',
        MAIL_CITY: 'SAN ANTONIO',
        MAIL_STATE: 'TX',
        MAIL_ZIP: '78201',
        SITUS: '123 Main St',
        APN: '12345',
        LAND_USE: 'Single Family Residential',
        TOTAL_VALUE: 155000,
        YEAR_BUILT: 1984,
        LIVING_AREA: 1422,
        DOCDATE: '2025-05-01'
      } }] });
    }
  });
  assert.strictEqual(found.status, 'owner_found');
  assert.strictEqual(found.owner_record.owner_name, 'KILLER CAPITAL CONSULTANTS LLC');
  assert.strictEqual(found.owner_record.is_entity, true);
  assert.strictEqual(found.owner_record.owner_role, 'owner_of_record');
  assert.strictEqual(found.owner_record.source_kind, 'official_public_record');
  assert.strictEqual(found.owner_record.land_use, 'Single Family Residential');
  assert.strictEqual(found.land_use, 'Single Family Residential');
  assert.strictEqual(found.property_story.source_kind, 'official_public_record');
  assert.strictEqual(found.property_story.assessed_value, '155000');
  assert.strictEqual(found.property_story.year_built, '1984');
  assert.strictEqual(found.property_story.living_area, '1422');
  assert.strictEqual(found.property_story.prior_document_date, '2025-05-01');
  assert.match(found.property_story.evidence_text, /Assessed value clue, not ARV: 155000/);
  assert.match(found.evidence_text, /Land use: Single Family Residential/);
  assert.strictEqual(found.mailing_route.route_kind, 'mailing_address');
  assert.strictEqual(found.mailing_route.source_kind, 'official_public_record');

  let detroitQueryUrl = '';
  const suffixTolerant = await ownerLookup.lookupOwnerForRow({
    normalized_address: '13905 Robson St, Detroit, MI 48227',
    city: 'Detroit', county: 'Wayne', state: 'MI'
  }, {
    profiles: [{
      api_kind: 'arcgis',
      service_url: 'https://services.example.gov/arcgis/rest/services/DetroitParcels/FeatureServer',
      layer: 0,
      verification_status: 'verified_public_schema_2026_08_11',
      field_map: { taxpayer_name: 'taxpayer_1', taxpayer_name_secondary: 'taxpayer_2', taxpayer_mailing_address: ['taxpayer_street', 'taxpayer_city', 'taxpayer_state', 'taxpayer_zip'], situs_address: 'address', parcel_id: 'parcel_number', land_use: 'property_class_desc' }
    }],
    fetch_impl: async (url) => {
      detroitQueryUrl = decodeURIComponent(String(url));
      return response({ features: [{ attributes: {
        taxpayer_1: 'PUBLIC OWNER', taxpayer_2: 'CO-OWNER', taxpayer_street: 'PO BOX 100', taxpayer_city: 'DETROIT', taxpayer_state: 'MI', taxpayer_zip: '48227', address: '13905 ROBSON', parcel_number: '22044339', property_class_desc: 'RESIDENTIAL-IMPROVED'
      } }] });
    }
  });
  assert.strictEqual(suffixTolerant.status, 'owner_found');
  assert.strictEqual(suffixTolerant.owner_record.owner_name, '');
  assert.strictEqual(suffixTolerant.owner_record.taxpayer_name, 'PUBLIC OWNER');
  assert.strictEqual(suffixTolerant.owner_record.taxpayer_name_secondary, 'CO-OWNER');
  assert.deepStrictEqual(suffixTolerant.owner_record.taxpayer_names, ['PUBLIC OWNER', 'CO-OWNER']);
  assert.strictEqual(suffixTolerant.owner_record.owner_role, 'taxpayer_of_record');
  assert.strictEqual(suffixTolerant.owner_record.record_label, 'Taxpayer of record');
  assert.match(detroitQueryUrl, /UPPER\(address\) LIKE '%ROBSON%'/);
  assert.ok(!/ROBSON ST%/.test(detroitQueryUrl), 'street suffix must not make Detroit suffix-free records unmatchable');
  assert.strictEqual(suffixTolerant.land_use, 'RESIDENTIAL-IMPROVED');
  assert.match(suffixTolerant.owner_record.evidence_text, /Taxpayer of record: PUBLIC OWNER/);
  assert.match(suffixTolerant.owner_record.evidence_text, /Secondary taxpayer: CO-OWNER/);

  const taxpayerRun = await ownerLookup.runPublicParcelOwnerLookup({
    rows: [{
      normalized_address: '13905 Robson St, Detroit, MI 48227',
      city: 'Detroit', county: 'Wayne', state: 'MI'
    }],
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' }
  }, {
    profiles: [{
      api_kind: 'arcgis',
      service_url: 'https://services.example.gov/arcgis/rest/services/DetroitParcels/FeatureServer',
      layer: 0,
      verification_status: 'verified_public_schema_taxpayer_only_no_owner_field',
      field_map: { taxpayer_name: 'taxpayer_1', taxpayer_name_secondary: 'taxpayer_2', taxpayer_mailing_address: ['taxpayer_street', 'taxpayer_city', 'taxpayer_state', 'taxpayer_zip'], situs_address: 'address', parcel_id: 'parcel_number', land_use: 'property_class_desc' }
    }],
    fetch_impl: async () => response({ features: [{ attributes: {
      taxpayer_1: 'WELLS FARGO BANK NA TAX SERVICE ESCROW DEPT',
      taxpayer_2: 'TAX SERVICE ESCROW DEPT',
      taxpayer_street: 'PO BOX 1629',
      taxpayer_city: 'MINNEAPOLIS',
      taxpayer_state: 'MN',
      taxpayer_zip: '55440',
      address: '13905 ROBSON',
      parcel_number: '22044339',
      property_class_desc: 'RESIDENTIAL-IMPROVED'
    } }] })
  });
  assert.strictEqual(taxpayerRun.attempt_records[0].outcome, 'FOUND');
  assert.match(taxpayerRun.attempt_records[0].reason_text, /Taxpayer of record and\/or mailing route found/);
  assert.strictEqual(taxpayerRun.results.get('13905 robson st, detroit, mi 48227').owner_record.owner_name, '');
  assert.strictEqual(taxpayerRun.results.get('13905 robson st, detroit, mi 48227').owner_record.taxpayer_name, 'WELLS FARGO BANK NA TAX SERVICE ESCROW DEPT');
  assert.deepStrictEqual(taxpayerRun.results.get('13905 robson st, detroit, mi 48227').owner_record.taxpayer_names, ['WELLS FARGO BANK NA TAX SERVICE ESCROW DEPT', 'TAX SERVICE ESCROW DEPT']);
  assert.strictEqual(taxpayerRun.results.get('13905 robson st, detroit, mi 48227').owner_record.is_entity, true);
  assert.ok(taxpayerRun.results.get('13905 robson st, detroit, mi 48227').mailing_route.risk_flags.includes('taxpayer_may_not_be_owner_may_be_servicer_or_escrow'));

  const ambiguous = await ownerLookup.lookupOwnerForRow(row, {
    profiles: [profile],
    fetch_impl: async () => response({ features: [
      { attributes: { OWNER: 'A', APN: '1' } },
      { attributes: { OWNER: 'B', APN: '2' } }
    ] })
  });
  assert.strictEqual(ambiguous.status, 'ambiguous');

  const noMatch = await ownerLookup.lookupOwnerForRow(row, {
    profiles: [profile],
    fetch_impl: async () => response({ features: [] })
  });
  assert.strictEqual(noMatch.status, 'no_match');

  const blocked = await ownerLookup.lookupOwnerForRow(row, {
    profiles: [profile],
    fetch_impl: async () => response({ error: 'forbidden' }, 403)
  });
  assert.strictEqual(blocked.status, 'blocked');

  const arcgisError = await ownerLookup.lookupOwnerForRow(row, {
    profiles: [profile],
    fetch_impl: async () => response({ error: { code: 400, message: 'Invalid field' } })
  });
  assert.strictEqual(arcgisError.status, 'failed');
  assert.match(arcgisError.blocked_reason, /^arcgis_error_400: Invalid field/);
  const arcgisErrorRun = await ownerLookup.runPublicParcelOwnerLookup({
    rows: [row],
    market: { city: 'San Antonio', county: 'Bexar', state: 'TX' }
  }, {
    profiles: [profile],
    fetch_impl: async () => response({ error: { code: 400, message: 'Invalid field' } })
  });
  assert.strictEqual(arcgisErrorRun.attempt_records[0].outcome, 'FAILED');
  assert.match(arcgisErrorRun.attempt_records[0].reason_code, /^ARCGIS_ERROR_400/);

  const unverifiedFound = await ownerLookup.lookupOwnerForRow(row, {
    profiles: [Object.assign({}, profile, { verification_status: 'unverified_field_map_guess_discovery_timed_out' })],
    fetch_impl: async () => response({ features: [{ attributes: {
      OWNER: 'KILLER CAPITAL CONSULTANTS LLC',
      MAIL1: 'PO BOX 100',
      APN: '12345'
    } }] })
  });
  assert.strictEqual(unverifiedFound.status, 'owner_found');
  assert.strictEqual(unverifiedFound.owner_record.verification_status, 'unverified_field_map_guess_discovery_timed_out');
  assert.match(unverifiedFound.evidence_text, /Profile caveat: unverified_field_map_guess_discovery_timed_out/);

  const run = await ownerLookup.runPublicParcelOwnerLookup({
    rows: [row],
    market: { city: 'San Antonio', county: 'Bexar', state: 'TX' }
  }, {
    profiles: [profile],
    fetch_impl: async () => response({ features: [{ attributes: { OWNER: 'Jane Owner', MAIL1: '100 Mail St', APN: 'ABC' } }] })
  });
  assert.strictEqual(run.rows_hunted, 1);
  assert.strictEqual(run.attempt_records[0].lane, 'county_appraisal');
  assert.strictEqual(run.attempt_records[0].outcome, 'FOUND');
  assert.strictEqual(run.preview_only, true);

  const unverifiedRun = await ownerLookup.runPublicParcelOwnerLookup({
    rows: [row],
    market: { city: 'San Antonio', county: 'Bexar', state: 'TX' }
  }, {
    profiles: [Object.assign({}, profile, { verification_status: 'unverified_field_map_guess_discovery_timed_out' })],
    fetch_impl: async () => response({ features: [{ attributes: { OWNER: 'Jane Owner', MAIL1: '100 Mail St', APN: 'ABC' } }] })
  });
  assert.match(unverifiedRun.attempt_records[0].reason_text, /Profile caveat: unverified_field_map_guess_discovery_timed_out/);
  const bexarProfile = parcelProfiles.PROFILES.find((item) => item.profile_id === 'tx_bexar_arcgis_parcels');
  assert.strictEqual(bexarProfile.verified_at, null, 'Bexar cannot be marked verified after an unreachable discovery retry');
  assert.strictEqual(bexarProfile.verification_status, 'unverified_field_map_guess_discovery_timed_out');
  assert.match(bexarProfile.verification_evidence, /22-57-27-738Z\.json$/);
  const detroitProfile = parcelProfiles.PROFILES.find((item) => item.profile_id === 'mi_detroit_arcgis_parcels_current');
  assert.strictEqual(detroitProfile.verified_at, '2026-08-11');
  assert.strictEqual(detroitProfile.field_map.land_use, 'property_class_desc');
  assert.strictEqual(detroitProfile.record_count, 380445);

  console.log('public parcel owner lookup tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
