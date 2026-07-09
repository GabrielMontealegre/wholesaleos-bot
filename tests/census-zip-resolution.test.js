'use strict';

const assert = require('assert');

const censusZip = require('../modules/research/census-zip-resolution');

function fakeFetch(payload, status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  });
}

function censusPayload(matches) {
  return { result: { addressMatches: matches } };
}

(async () => {
  // 1) Clean match: zip + normalized address come back with provenance.
  const match = await censusZip.resolveZipFromCensus(
    { street_or_partial: '4016 Poplar Point Dr, Rockwall, TX', city: 'Rockwall', state: 'TX' },
    {
      fetchImpl: fakeFetch(censusPayload([{
        matchedAddress: '4016 POPLAR POINT DR, ROCKWALL, TX, 75032',
        addressComponents: { zip: '75032', streetName: 'POPLAR POINT', suffixType: 'DR', city: 'ROCKWALL', state: 'TX' }
      }]))
    }
  );
  assert.strictEqual(match.resolved, true);
  assert.strictEqual(match.zip, '75032');
  assert.strictEqual(match.normalized_address, '4016 Poplar Point Dr, Rockwall, TX 75032');
  assert.strictEqual(match.source, 'us_census_geocoder');

  // 2) Street number disagreement is rejected - never snap to a nearby range.
  const numberMismatch = await censusZip.resolveZipFromCensus(
    { street_or_partial: '4016 Poplar Point Dr, Rockwall, TX', city: 'Rockwall', state: 'TX' },
    {
      fetchImpl: fakeFetch(censusPayload([{
        matchedAddress: '4020 POPLAR POINT DR, ROCKWALL, TX, 75032',
        addressComponents: { zip: '75032', city: 'ROCKWALL', state: 'TX' }
      }]))
    }
  );
  assert.strictEqual(numberMismatch.resolved, false);
  assert.strictEqual(numberMismatch.reason, 'census_street_number_mismatch');

  // 3) City disagreement is rejected.
  const cityMismatch = await censusZip.resolveZipFromCensus(
    { street_or_partial: '3609 Kings Dr', city: 'Ennis', state: 'TX' },
    {
      fetchImpl: fakeFetch(censusPayload([{
        matchedAddress: '3609 KINGS DR, WAXAHACHIE, TX, 75165',
        addressComponents: { zip: '75165', city: 'WAXAHACHIE', state: 'TX' }
      }]))
    }
  );
  assert.strictEqual(cityMismatch.resolved, false);
  assert.strictEqual(cityMismatch.reason, 'census_city_mismatch');

  // 3b) Stale market-city label on the row must not block a match when the
  // document partial itself names the city the Census echoed back.
  const staleCityLabel = await censusZip.resolveZipFromCensus(
    { street_or_partial: '121 Stallion St. Waxahachie, TX', city: 'Dallas', state: 'TX' },
    {
      fetchImpl: fakeFetch(censusPayload([{
        matchedAddress: '121 STALLION ST, WAXAHACHIE, TX, 75165',
        addressComponents: { zip: '75165', streetName: 'STALLION', suffixType: 'ST', city: 'WAXAHACHIE', state: 'TX' }
      }]))
    }
  );
  assert.strictEqual(staleCityLabel.resolved, true, 'city visible in the document partial must win over a stale row label');
  assert.strictEqual(staleCityLabel.zip, '75165');

  // 4) State disagreement is rejected.
  const stateMismatch = await censusZip.resolveZipFromCensus(
    { street_or_partial: '100 Main St', city: 'Dallas', state: 'TX' },
    {
      fetchImpl: fakeFetch(censusPayload([{
        matchedAddress: '100 MAIN ST, DALLAS, GA, 30132',
        addressComponents: { zip: '30132', city: 'DALLAS', state: 'GA' }
      }]))
    }
  );
  assert.strictEqual(stateMismatch.resolved, false);
  assert.strictEqual(stateMismatch.reason, 'census_state_mismatch');

  // 5) No match / malformed zip / HTTP failure all refuse honestly.
  const noMatch = await censusZip.resolveZipFromCensus(
    { street_or_partial: '9999 Nowhere Ln, Rockwall, TX', city: 'Rockwall', state: 'TX' },
    { fetchImpl: fakeFetch(censusPayload([])) }
  );
  assert.strictEqual(noMatch.resolved, false);
  assert.strictEqual(noMatch.reason, 'no_census_match');

  const badZip = await censusZip.resolveZipFromCensus(
    { street_or_partial: '4016 Poplar Point Dr, Rockwall, TX', city: 'Rockwall', state: 'TX' },
    {
      fetchImpl: fakeFetch(censusPayload([{
        matchedAddress: '4016 POPLAR POINT DR, ROCKWALL, TX',
        addressComponents: { zip: '750', city: 'ROCKWALL', state: 'TX' }
      }]))
    }
  );
  assert.strictEqual(badZip.resolved, false);
  assert.strictEqual(badZip.reason, 'census_match_without_zip');

  const httpFail = await censusZip.resolveZipFromCensus(
    { street_or_partial: '4016 Poplar Point Dr, Rockwall, TX', city: 'Rockwall', state: 'TX' },
    { fetchImpl: fakeFetch({}, 500) }
  );
  assert.strictEqual(httpFail.resolved, false);
  assert.strictEqual(httpFail.reason, 'census_http_500');

  // 6) A partial without a leading street number is never sent out.
  let called = false;
  const noNumber = await censusZip.resolveZipFromCensus(
    { street_or_partial: 'Poplar Point Dr, Rockwall, TX', city: 'Rockwall', state: 'TX' },
    { fetchImpl: async () => { called = true; throw new Error('should not fetch'); } }
  );
  assert.strictEqual(noNumber.resolved, false);
  assert.strictEqual(noNumber.reason, 'no_street_number_in_partial');
  assert.strictEqual(called, false);

  console.log('census zip resolution tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
