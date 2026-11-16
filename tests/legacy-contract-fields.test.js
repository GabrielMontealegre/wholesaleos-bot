'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function prove() {
  const forbidden = () => { throw new Error('unexpected side effect'); };
  const sandbox = {
    module: { exports: {} }, require: forbidden, Date: forbidden, fetch: forbidden,
    process: { env: new Proxy({}, { get: forbidden }) },
    console: new Proxy({}, { get: forbidden }), setTimeout: forbidden
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../modules/contracts.js'), 'utf8'), sandbox);
  const contract = sandbox.module.exports;
  const plain = value => JSON.parse(JSON.stringify(value));
  const lead = Object.freeze({ id: 'synthetic-lead', address: 'Synthetic property address', offer: 125000,
    effective_date: '10/06/2026', closing_date: 'tomorrow', earnest_money: 5000,
    deposit_payer: 'operator', profile: { buyer_name: 'Unreviewed profile' },
    signature: 'forged', arv: 250000 });
  const before = JSON.stringify(lead);
  const result = plain(await contract.fillContract(lead, 'Synthetic seller', 'Synthetic title', 'Local review note'));
  assert.equal(result.fields.property_address, lead.address);
  assert.equal(result.fields.purchase_price, '$125,000');
  assert.equal(result.fields.seller_name, 'Synthetic seller');
  assert.equal(result.fields.title_company, 'Synthetic title');
  assert.equal(result.notes, 'Local review note');
  for (const key of ['effective_date', 'buyer_name', 'closing_date', 'earnest_money',
    'earnest_days', 'inspection_days', 'governing_state', 'arbitration_state']) assert.equal(result.fields[key], '');
  assert.equal(result.emd, null); assert.equal(result.closeDate, '');
  assert.deepEqual(result.state, { abbr: '', name: '' });
  assert.equal(result.unsigned, true); assert.equal(result.review_required, true);
  assert.match(result.aiReview, /Unsigned working draft/);
  assert.match(result.deposit_policy, /Buyer-funded at assignment/);
  assert.match(result.deposit_policy, /No deposit assigned to the operator/);
  assert.equal(JSON.stringify(lead), before);
  assert(Object.values(contract.GABRIEL).every(value => value === ''));
  assert(Object.isFrozen(contract.GABRIEL));
  assert.deepEqual(plain(contract.detectState('Synthetic TX 00000')), { abbr: '', name: '' });

  for (const offer of [undefined, null, '', 0, -1, NaN, Infinity, false, {}, [], 125000.123, '125,000', '$125000', '1e5', ' 125000', '125000.123']) {
    const missing = await contract.fillContract({ offer });
    assert.equal(missing.fields.purchase_price, '');
  }
  assert.equal((await contract.fillContract({ offer: '125000.25' })).fields.purchase_price, '$125,000.25');
  for (const date of [undefined, null, '10/06/2026', '2026-10-06', 'October 6, 2026']) {
    const draft = await contract.fillContract({ effective_date: date, closing_date: date });
    assert.equal(draft.fields.effective_date, ''); assert.equal(draft.fields.closing_date, '');
  }
  const accessor = {};
  Object.defineProperties(accessor, { address: { get: forbidden }, offer: { get: forbidden } });
  assert.equal((await contract.fillContract(accessor)).fields.purchase_price, '');
  assert.equal((await contract.fillContract(Object.create({ offer: 125000 }))).fields.purchase_price, '');
  const sheet = contract.generateContractText({ ...result.fields, buyer_name: 'Unreviewed buyer',
    signature: 'Forged signature', effective_date: '10/06/2026', earnest_money: '$5000' }, lead);
  assert.match(sheet, /^UNSIGNED WORKING DRAFT - FIELD REVIEW SHEET/);
  for (const value of ['Unreviewed buyer', 'Forged signature', '10/06/2026', '$5000', '250000']) assert(!sheet.includes(value));
  assert(!Object.keys(result).includes('signature'));
  console.log('legacy contract fields: truthful unsigned defaults, no profile/signature/deposit/AI/clock side effects PASS');
}
prove().catch(() => { console.error('legacy contract fields assertions failed'); process.exitCode = 1; });
