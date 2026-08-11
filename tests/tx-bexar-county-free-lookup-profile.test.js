'use strict';

const assert = require('assert');
const profile = require('../modules/sources/tx-bexar-county-free-lookup-profile');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return String(body || ''); }
  };
}

(async () => {
  const found = await profile.appraisalLookup({ street_number: '15603', street_name: 'Garam Trl' }, {
    fetch_impl: async () => response('<html>15603 GARAM TRL Owner Name: TEST OWNER LLC Mailing Address: PO BOX 1 SAN ANTONIO TX 78201 Property Address</html>')
  });
  assert.strictEqual(found.status, 'owner_found');
  assert.strictEqual(found.owner_name, 'TEST OWNER LLC');
  assert.ok(/PO BOX 1/.test(found.mailing_address));

  const blocked = await profile.appraisalLookup({ street_number: '15603', street_name: 'Garam Trl' }, {
    fetch_impl: async () => response('<html>Access denied</html>', 403)
  });
  assert.strictEqual(blocked.status, 'blocked');

  const notFound = await profile.appraisalLookup({ street_number: '15603', street_name: 'Garam Trl' }, {
    fetch_impl: async () => response('<html>No matching property</html>')
  });
  assert.strictEqual(notFound.status, 'no_visible_owner');
  console.log('Bexar county free lookup profile tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
