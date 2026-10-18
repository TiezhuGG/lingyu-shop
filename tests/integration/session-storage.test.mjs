import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the actual miniapp storage adapter against platform storage, without a browser mock server.
const source = readFileSync('apps/miniapp/src/services/session-storage.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function platform(storage = new Map()) {
  const exports = {};
  runInNewContext(compiled, { exports, uni: {
    getStorageSync: key => structuredClone(storage.get(key)),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: key => storage.delete(key),
  } });
  return { api: exports, storage };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('guest intentions survive app reload, session failure cleanup and logout', () => {
  const { api, storage } = platform();
  assert.equal(api.readGuestCartDraft(), null);
  const draft = { storeId: 'test-store', items: [{ skuId: 'test-sku', quantity: 2 }] };
  api.saveGuestCartDraft(draft);
  api.saveStoredAppSession({ accessToken: 'test-access', refreshToken: 'test-refresh', accessExpiresAt: '2030-01-01', refreshExpiresAt: '2030-01-02' });
  const reloaded = platform(storage).api;
  assert.deepEqual(plain(reloaded.readGuestCartDraft()), draft);
  reloaded.clearStoredAppSession();
  assert.equal(reloaded.readStoredAppSession(), null);
  assert.deepEqual(plain(reloaded.readGuestCartDraft()), draft);
  storage.set('lingyu.app-session.v1', { invalid: true });
  assert.equal(reloaded.readStoredAppSession(), null);
  assert.deepEqual(plain(reloaded.readGuestCartDraft()), draft);
});

test('malformed quantities, duplicate SKUs and corrupted storage cannot become guest intentions', () => {
  const { api, storage } = platform();
  for (const items of [
    [{ skuId: 'test-sku', quantity: -1 }], [{ skuId: 'test-sku', quantity: 1.5 }],
    [{ skuId: 'test-sku', quantity: 1000 }], [{ skuId: 'test-sku', quantity: 1 }, { skuId: 'test-sku', quantity: 1 }],
  ]) assert.throws(() => api.saveGuestCartDraft({ storeId: 'test-store', items }));
  storage.set(api.guestCartStorageKey, 'corrupted');
  assert.equal(api.readGuestCartDraft(), null);
});
