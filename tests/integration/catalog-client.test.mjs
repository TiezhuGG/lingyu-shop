import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const original = readFileSync('apps/miniapp/src/services/catalog.ts', 'utf8');
const id = '00000000-0000-4000-8000-000000000001';
const data = () => ({ items: [{ id, storeId: id, version: 2, name: '隔离测试', description: '', category: { id, name: '分类', sort: 0 },
  inventoryStatus: 'NOT_CONNECTED', purchasable: false, skus: [{ id, code: 'TEST', unit: 'PACK', options: [], priceMinor: '1299', priceVersion: 2 }] }], nextCursor: null, hasMore: false, checkoutEnabled: false });
function client({ h5 = true, base = '', production = false, result = data(), status = 200, fail = false } = {}) {
  const source = (h5 ? original.replace(/\/\/ #ifndef H5[\s\S]*?\/\/ #endif/, '') : original).replaceAll('import.meta.env', 'environment');
  const exports = {}, calls = [];
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, environment: { VITE_API_BASE_URL: base, PROD: production }, uni: { request(options) { calls.push(options.url); if (fail) options.fail(); else options.success({ statusCode: status, data: { code: 'OK', data: result } }); } } });
  return { api: exports, calls };
}
test('catalog client preserves versioned integer-minor facts and formats prices without floating point', async () => {
  const fixture = client(); assert.equal((await fixture.api.getPublishedProducts()).items[0].skus[0].priceMinor, '1299');
  assert.equal(fixture.api.formatCatalogMinor('0'), '0.00'); assert.equal(fixture.api.formatCatalogMinor('1'), '0.01');
  assert.equal(fixture.api.formatCatalogMinor('999999999999'), '9999999999.99'); assert.equal(fixture.api.formatCatalogMinor('1.5'), '—');
  assert.deepEqual(fixture.calls, ['/api/v1/app/products']);
});
test('catalog client rejects malformed/unsafe responses, stale price versions and fabricated availability', async () => {
  const invalid = [null, {}, { ...data(), checkoutEnabled: true }, { ...data(), hasMore: true }];
  for (const patch of [{ priceMinor: 1299 }, { priceMinor: '-1' }, { priceVersion: 1 }, { unit: 'GRAM' }, { options: null }]) {
    const value = data(); Object.assign(value.items[0].skus[0], patch); invalid.push(value);
  }
  const purchasable = data(); purchasable.items[0].purchasable = true; invalid.push(purchasable);
  for (const result of invalid) await assert.rejects(client({ result }).api.getPublishedProducts(), /unavailable/);
  await assert.rejects(client({ fail: true }).api.getPublishedProducts()); await assert.rejects(client({ status: 503 }).api.getPublishedProducts());
  for (const options of [{ h5: false }, { base: 'https://user:secret@api.invalid' }, { base: 'http://api.invalid', production: true }]) {
    const fixture = client(options); await assert.rejects(fixture.api.getPublishedProducts()); assert.equal(fixture.calls.length, 0);
  }
  const fixture = client({ h5: false, base: 'https://api.invalid', production: true });
  await fixture.api.getPublishedProducts(id); assert.equal(fixture.calls[0], 'https://api.invalid/api/v1/app/products?cursor=' + id);
});
