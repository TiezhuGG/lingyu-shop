import test from 'node:test';
import assert from 'node:assert/strict';
import foundation from '../../packages/server-modules/dist/index.js';
import security from '../../packages/server-modules/dist/admin/security.js';
const { hasAdminPermission, validateAdminGrants, parseAdminInput, readAdminCookie, serializeAdminCookie } = foundation;
test('production requires an exact HTTPS admin origin and forbids local bootstrap', async () => {
  const env = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://unit:unit@127.0.0.1:15432/lingyu_shop', AUTH_ACCESS_SIGNING_KEY: 'A'.repeat(43), AUTH_REFRESH_TOKEN_PEPPER: 'B'.repeat(43) };
  for (const ADMIN_ORIGIN of [undefined, 'http://admin.invalid', 'https://admin.invalid/', 'https://admin.invalid/path', 'https://user:pass@admin.invalid']) {
    assert.throws(() => foundation.parseBackendConfig({ ...env, ADMIN_ORIGIN }), /ADMIN_ORIGIN/);
  }
  const config = new foundation.BackendConfigService(foundation.parseBackendConfig({ ...env, ADMIN_ORIGIN: 'https://admin.invalid' }), 'api');
  const admins = new foundation.AdminService(config, null, null);
  await assert.rejects(admins.bootstrap('administrator', 'unit-test-password'), error => error.getStatus?.() === 403);
});
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
test('RBAC binds permission to its own store grant and rejects invalid scope combinations', () => {
  const grants = [{ role: 'STORE_OPERATOR', scopeKey: a }, { role: 'STORE_READER', scopeKey: b }];
  validateAdminGrants(grants);
  assert.equal(hasAdminPermission(grants, 'store.configure', a), true);
  assert.equal(hasAdminPermission(grants, 'store.configure', b), false);
  assert.equal(hasAdminPermission(grants, 'store.read', b), true);
  assert.equal(hasAdminPermission(grants, 'iam.admin.manage'), false);
  assert.equal(hasAdminPermission([{ role: 'IAM_MANAGER', scopeKey: 'GLOBAL' }], 'store.configure', a), false);
  for (const invalid of [[...grants, grants[0]], [{ role: 'IAM_MANAGER', scopeKey: a }], [{ role: 'STORE_OPERATOR', scopeKey: 'GLOBAL' }]]) assert.throws(() => validateAdminGrants(invalid));
});
test('admin DTO cannot accept ownership, permissions or unknown fields', () => {
  assert.throws(() => parseAdminInput('AdminLoginRequest', { username: 'user', password: 'a-long-test-password', adminId: a }));
  assert.throws(() => parseAdminInput('AdminUpdateRequest', { version: 1, status: 'ACTIVE', grants: [], reason: 'access_change', permissions: ['everything'] }));
  assert.equal(parseAdminInput('AdminLoginRequest', { username: 'user', password: 'a-long-test-password' }).username, 'user');
});
test('production cookie flags and duplicate-cookie rejection are explicit', () => {
  assert.match(serializeAdminCookie('cookie', true), /^__Host-lingyu-admin=cookie; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/);
  assert.match(serializeAdminCookie('', true, true), /Max-Age=0; Secure$/);
  assert.throws(() => readAdminCookie('lingyu_admin=one; lingyu_admin=two', false));
  assert.throws(() => readAdminCookie('lingyu_admin=one', true));
  assert.equal(readAdminCookie('unrelated=a; lingyu_admin=one', false), 'one');
});
test('scrypt uses random salts and verifies without exposing password data', async () => {
  const value = 'disposable-test-password';
  const first = await security.hashAdminPassword(value);
  const second = await security.hashAdminPassword(value);
  assert.notEqual(first, second);
  assert(!first.includes(value));
  assert.equal(await security.verifyAdminPassword(value, first), true);
  assert.equal(await security.verifyAdminPassword('wrong-long-password', first), false);
  assert.equal(await security.verifyAdminPassword(value, null), false);
  const unicode = '😀'.repeat(65);
  assert.equal(parseAdminInput('AdminLoginRequest', { username: 'user', password: unicode }).password, unicode);
  assert.equal(await security.verifyAdminPassword(unicode, await security.hashAdminPassword(unicode)), true);
});
test('password work is bounded to two concurrent calculations per process', async () => {
  const results = await Promise.allSettled(Array.from({ length: 3 }, () => security.hashAdminPassword('disposable-test-password')));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.getStatus?.() === 429).length, 1);
});
