import test from 'node:test';
import assert from 'node:assert/strict';
import foundation from '../../packages/server-modules/dist/index.js';
const blank = () => ['EXPRESS', 'LOCAL_DELIVERY', 'PICKUP'].map(method => ({ method, feeMinor: null, freeAboveMinor: null, serviceDescription: null, pickupAddress: null }));
const input = () => ({ version: 0, displayName: '  测试商城  ', fulfillmentRules: blank(), reason: 'configuration_change' });
test('storefront schema preserves undecided fees, all three methods and normalized names', () => {
  const parsed = foundation.parseStorefrontUpdate(input());
  assert.equal(parsed.displayName, '测试商城');
  assert.equal(parsed.fulfillmentRules.length, 3);
  assert(parsed.fulfillmentRules.every(rule => rule.feeMinor === null));
  const zero = input(); zero.fulfillmentRules[0].feeMinor = '0';
  assert.equal(foundation.parseStorefrontUpdate(zero).fulfillmentRules[0].feeMinor, '0');
});
test('storefront cannot override scope, enable fulfillment or omit/duplicate methods', () => {
  for (const patch of [{ storeId: 'forged' }, { enabledMethods: ['EXPRESS'] }, { checkoutEnabled: true }, { displayName: '   ' },
    { fulfillmentRules: [] }, { fulfillmentRules: [blank()[0], blank()[0], blank()[1]] }]) assert.throws(() => foundation.parseStorefrontUpdate({ ...input(), ...patch }));
});
test('draft fees are bounded integer minor strings and pickup address is method-specific', () => {
  for (const feeMinor of [0, '-1', '1.5', '01', '1000000000000']) {
    const value = input(); value.fulfillmentRules[0].feeMinor = feeMinor;
    assert.throws(() => foundation.parseStorefrontUpdate(value));
  }
  const wrong = input(); wrong.fulfillmentRules[0].pickupAddress = 'not a pickup method';
  assert.throws(() => foundation.parseStorefrontUpdate(wrong));
  for (const field of ['serviceDescription', 'pickupAddress']) {
    const invalid = input(); invalid.fulfillmentRules[2][field] = 'invalid\u0000text';
    assert.throws(() => foundation.parseStorefrontUpdate(invalid));
  }
});
