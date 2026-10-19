import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const original = readFileSync('apps/miniapp/src/services/storefront.ts', 'utf8');
const data = { storeId: '00000000-0000-4000-8000-000000000001', mode: 'ONLINE', configured: false, displayName: null, version: 0, fulfillmentMethods: ['EXPRESS', 'LOCAL_DELIVERY', 'PICKUP'], enabledMethods: [], checkoutEnabled: false, physicalStoreEnabled: false };
function client({ h5 = true, base = '', production = false, response = { statusCode: 200, data: { code: 'OK', data } }, fail = false } = {}) {
  const source = (h5 ? original.replace(/\/\/ #ifndef H5[\s\S]*?\/\/ #endif/, '') : original).replaceAll('import.meta.env', 'environment');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}, calls = [];
  runInNewContext(compiled, { exports, environment: { VITE_API_BASE_URL: base, PROD: production }, uni: {
    request(options) { calls.push(options.url); if (fail) options.fail(); else options.success(response); },
  } });
  return { api: exports, calls };
}
test('miniapp adapter reads real response shape and fails safely without fabricating configured data', async () => {
  const normal = client(); assert.equal((await normal.api.getStorefront()).configured, false);
  assert.deepEqual(normal.calls, ['/api/v1/app/storefront']);
  for (const options of [{ fail: true }, { response: { statusCode: 503, data: {} } }, { response: { statusCode: 200, data: { code: 'OK', data: { mode: 'ONLINE' } } } }]) {
    await assert.rejects(client(options).api.getStorefront(), /unavailable/);
  }
});
test('native builds require explicit API origin; credentials and production HTTP never reach the network', async () => {
  for (const options of [{ h5: false }, { base: 'https://user:password@example.invalid' }, { base: 'https://api.invalid?token=secret' }, { base: 'http://api.invalid', production: true }]) {
    const fixture = client(options); await assert.rejects(fixture.api.getStorefront()); assert.equal(fixture.calls.length, 0);
  }
  const native = client({ h5: false, base: 'https://api.invalid', production: true });
  await native.api.getStorefront(); assert.deepEqual(native.calls, ['https://api.invalid/api/v1/app/storefront']);
});
