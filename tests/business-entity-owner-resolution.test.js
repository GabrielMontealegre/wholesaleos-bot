'use strict';

const assert = require('assert');
const entityResolution = require('../modules/research/business-entity-owner-resolution');

(async () => {
  const row = {
    normalized_address: '123 Main St, Detroit, MI 48227',
    state: 'MI',
    owner_record: {
      owner_name: 'Example Holdings LLC',
      is_entity: true
    }
  };

  const found = await entityResolution.resolveEntityForRow(row, {
    mock_registry_text: [
      'Entity Status: Active',
      'Registered Agent: Jane Agent',
      'Registered Office: 44 Agent Way Detroit MI 48201',
      'Officer: Jim Manager',
      'Phone: (313) 555-1212'
    ].join('\n')
  });
  assert.strictEqual(found.status, 'agent_found');
  assert.strictEqual(found.registered_agent_name, 'Jane Agent');
  assert.strictEqual(found.entity_status, 'Active');
  assert.ok(found.entity_contacts.length >= 2);
  assert.ok(found.entity_contacts.every((route) => route.source_kind === 'official_public_record'));
  assert.ok(found.entity_contacts.every((route) => route.risk_flags.includes('registered_agent_not_owner')));

  const txBlocked = await entityResolution.resolveEntityForRow({
    normalized_address: '123 Main St, San Antonio, TX 78201',
    state: 'TX',
    owner_record: { owner_name: 'Texas Entity LLC', is_entity: true }
  });
  assert.strictEqual(txBlocked.status, 'blocked');
  assert.strictEqual(txBlocked.blocked_reason, 'tx_sosdirect_account_required_no_free_public_search');

  const noEntity = await entityResolution.resolveEntityForRow({
    normalized_address: '123 Main St, Detroit, MI 48227',
    state: 'MI',
    owner_record: { owner_name: 'Jane Owner', is_entity: false }
  });
  assert.strictEqual(noEntity.status, 'no_entity');

  const run = await entityResolution.runBusinessEntityOwnerResolution({
    rows: [row],
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' }
  }, {
    mock_registry_text: 'Registered Agent: Jane Agent\nRegistered Office: 44 Agent Way Detroit MI 48201'
  });
  assert.strictEqual(run.rows_hunted, 1);
  assert.strictEqual(run.attempt_records[0].lane, 'business_entity_registry');
  assert.strictEqual(run.attempt_records[0].outcome, 'FOUND');

  console.log('business entity owner resolution tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
