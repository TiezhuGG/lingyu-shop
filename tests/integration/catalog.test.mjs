import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import foundation from '../../packages/server-modules/dist/index.js';
const { parseCatalogProduct, parseCatalogCategory, parseCatalogPage, parseCatalogPublication } = foundation;
const sku = (value = '小包') => ({ id: randomUUID(), code: 'TEST_' + randomUUID().slice(0, 8).toUpperCase(), unit: 'PACK', options: [{ name: ' 包装 ', value }], active: true, priceMinor: null });
const input = () => ({ version: 0, categoryId: randomUUID(), name: '  测试商品  ', description: '', skus: [sku()], reason: 'catalog_change' });
test('fixed SKU normalization preserves undecided prices and canonicalizes specification axes', () => {
  const value = input(); value.skus[0].options = [{ name: '口味', value: '原味' }, { name: ' 包装 ', value: 'Ａ' }];
  const parsed = parseCatalogProduct(value);
  assert.equal(parsed.name, '测试商品'); assert.equal(parsed.skus[0].priceMinor, null);
  assert.deepEqual(parsed.skus[0].options, [{ name: '包装', value: 'A' }, { name: '口味', value: '原味' }]);
  value.skus[0].priceMinor = '0'; assert.equal(parseCatalogProduct(value).skus[0].priceMinor, '0');
  value.skus[0].priceMinor = '999999999999'; assert.equal(parseCatalogProduct(value).skus[0].priceMinor, '999999999999');
});
test('catalog rejects floating/negative/leading-zero money, unsupported units and forged ownership', () => {
  for (const price of [0, '-1', '1.5', '01', '1000000000000', '']) { const value = input(); value.skus[0].priceMinor = price; assert.throws(() => parseCatalogProduct(value)); }
  for (const patch of [{ storeId: randomUUID() }, { adminId: randomUUID() }, { publishedVersion: 1 }, { name: '  ' }, { skus: [] }]) assert.throws(() => parseCatalogProduct({ ...input(), ...patch }));
  for (const patch of [{ unit: 'GRAM' }, { code: 'lowercase' }, { options: [{ name: '', value: 'a' }] }, { options: [{ name: '包装', value: '\u0000' }] }]) {
    const value = input(); Object.assign(value.skus[0], patch); assert.throws(() => parseCatalogProduct(value));
  }
});
test('catalog rejects duplicate IDs/codes/canonical combinations, mixed or duplicate axes, normalized length overflow', () => {
  const cases = [
    [sku('Ａ'), sku('A')], [sku('a'), { ...sku('b'), options: [] }],
    [{ ...sku(), options: [{ name: '包装', value: 'a' }, { name: ' 包装 ', value: 'b' }] }],
    [{ ...sku(), options: [{ name: '包装', value: '㍿'.repeat(20) }] }],
  ];
  const a = sku('a'), b = sku('b'); cases.push([a, { ...b, id: a.id }], [a, { ...b, code: a.code }]);
  for (const skus of cases) assert.throws(() => parseCatalogProduct({ ...input(), skus }));
});
test('classification/publication inputs and bounded keyset pagination reject unknown and malformed fields', () => {
  assert.equal(parseCatalogCategory({ version: 0, name: ' 分类 ', sort: 0, active: true, reason: 'catalog_change' }).name, '分类');
  assert.deepEqual(parseCatalogPage({}), { cursor: undefined, limit: 20 }); assert.equal(parseCatalogPage({ limit: '100' }).limit, 100);
  for (const value of [{ limit: '101' }, { limit: 20 }, { limit: '01' }, { cursor: 'invalid' }, { storeId: randomUUID() }, { limit: ['1', '2'] }]) assert.throws(() => parseCatalogPage(value));
  assert.throws(() => parseCatalogPublication({ version: 1, reason: 'publication_change', actor: 'forged' }));
});
