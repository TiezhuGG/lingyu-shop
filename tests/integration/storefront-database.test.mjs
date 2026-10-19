import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import foundation from '../../packages/server-modules/dist/index.js';
const { parseBackendConfig, BackendConfigService, DatabaseService, AuditService, AdminService, StorefrontService, onlineSalesScopeId } = foundation;
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.pathname, '/lingyu_shop_test'); assert(['127.0.0.1', 'localhost'].includes(url.hostname));
const env = { ...process.env, NODE_ENV: 'test', PORT: '19374', ADMIN_ORIGIN: 'http://127.0.0.1:5173', AUTH_ACCESS_SIGNING_KEY: 'A'.repeat(43), AUTH_REFRESH_TOKEN_PEPPER: 'B'.repeat(43) };
const base = 'http://127.0.0.1:19374/api/v1/';
const config = new BackendConfigService(parseBackendConfig(env), 'api');
const prefix = 'storetest-' + randomUUID().slice(0, 12), trace = 'store-test-' + randomUUID();
const password = 'Disposable-store-test-2026!';
const blank = () => ['EXPRESS', 'LOCAL_DELIVERY', 'PICKUP'].map(method => ({ method, feeMinor: null, freeAboveMinor: null, serviceDescription: null, pickupAddress: null }));
test('online storefront and fulfillment drafts use real transactions and scoped permissions', { timeout: 60000 }, async t => {
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  const database = new DatabaseService(config), audit = new AuditService();
  const admins = new AdminService(config, database, audit), storefront = new StorefrontService(database, admins, audit);
  let child, output = '', ownedStore = false;
  async function call(path, { method = 'GET', cookie, csrf, body } = {}) {
    const headers = { 'content-type': 'application/json', origin: env.ADMIN_ORIGIN, 'x-request-id': trace };
    if (cookie) headers.cookie = cookie;
    if (csrf) headers['x-csrf-token'] = csrf;
    const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  async function issue(username) {
    const result = await admins.login(username, password, trace);
    return { cookie: 'lingyu_admin=' + result.cookie, csrf: result.data.csrfToken, principal: await admins.authenticate(result.cookie) };
  }
  async function start() {
    child = spawn(process.execPath, ['apps/api/dist/main.js'], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    for (let i = 0; i < 100; i++) {
      assert.equal(child.exitCode, null, output);
      try { if ((await fetch('http://127.0.0.1:19374/health/ready')).ok) return; } catch {}
      await delay(100);
    }
    throw new Error('Storefront API did not become ready');
  }
  async function stop() {
    if (child?.exitCode === null) {
      const done = once(child, 'exit');
      if (process.platform === 'win32') child.send({ type: 'shutdown' }); else child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
      try { await done; } finally { clearTimeout(timer); }
    }
  }
  try {
    assert.equal((await pool.query('SELECT count(*)::int n FROM store')).rows[0].n, 0, 'Refusing to overwrite existing storefront settings');
    assert.equal((await pool.query('SELECT count(*)::int n FROM admin_account')).rows[0].n, 0, 'Refusing bootstrap over existing administrators');
    ownedStore = true;
    await t.test('every migration applies in an empty isolated schema and all DDL is rolled back', async () => {
      const client = await pool.connect(), schema = 'store_migration_' + randomUUID().replaceAll('-', '');
      try {
        await client.query('BEGIN'); await client.query('CREATE SCHEMA "' + schema + '"');
        await client.query('SET LOCAL search_path TO "' + schema + '"');
        assert.equal((await client.query('SELECT current_schema() AS name')).rows[0].name, schema);
        const path = 'packages/server-modules/prisma/migrations';
        for (const dir of (await readdir(path, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
          await client.query(await readFile(path + '/' + dir.name + '/migration.sql', 'utf8'));
        }
        assert.equal((await client.query('SELECT count(*)::int n FROM store')).rows[0].n, 0);
        assert.equal((await client.query('SELECT count(*)::int n FROM admin_account')).rows[0].n, 0);
      } finally { await client.query('ROLLBACK'); client.release(); }
      assert.equal((await pool.query('SELECT count(*)::int n FROM pg_namespace WHERE nspname = $1', [schema])).rows[0].n, 0);
    });
    await database.onModuleInit();
    await admins.bootstrap(prefix, password); const manager = await issue(prefix);
    const operatorAccount = await admins.create(manager.principal, { username: prefix + '-ops', password, reason: 'onboarding', grants: [{ role: 'STORE_OPERATOR', scopeKey: onlineSalesScopeId }] }, trace);
    await admins.create(manager.principal, { username: prefix + '-read', password, reason: 'onboarding', grants: [{ role: 'STORE_READER', scopeKey: onlineSalesScopeId }] }, trace);
    await admins.create(manager.principal, { username: prefix + '-wrong', password, reason: 'onboarding', grants: [{ role: 'STORE_OPERATOR', scopeKey: randomUUID() }] }, trace);
    const operator = await issue(prefix + '-ops'), reader = await issue(prefix + '-read'), wrong = await issue(prefix + '-wrong');
    await start();
    const payload = { version: 0, displayName: '隔离测试商城', fulfillmentRules: blank(), reason: 'configuration_change' };
    await t.test('public unconfigured context never creates a fake store and all methods remain unavailable', async () => {
      const response = await call('app/storefront'); assert.equal(response.status, 200);
      assert.equal(response.body.data.configured, false); assert.equal(response.body.data.displayName, null);
      assert.equal(response.body.data.storeId, onlineSalesScopeId); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(response.body.data.enabledMethods, []); assert.equal(response.body.data.checkoutEnabled, false);
      assert.equal((await pool.query('SELECT count(*)::int n FROM store')).rows[0].n, 0);
    });
    await t.test('anonymous, global IAM and other scopes cannot read or write the store configuration', async () => {
      assert.equal((await call('admin/storefront')).status, 401);
      for (const session of [manager, wrong]) {
        assert.equal((await call('admin/storefront', session)).status, 403);
        assert.equal((await call('admin/storefront', { ...session, method: 'PUT', body: payload })).status, 403);
      }
      assert.equal((await call('admin/storefront', reader)).status, 200);
      assert.equal((await call('admin/storefront', { ...reader, method: 'PUT', body: payload })).status, 403);
    });
    await t.test('CSRF, unknown scope and enabling flags cannot bypass the settings schema', async () => {
      assert.equal((await call('admin/storefront', { ...operator, csrf: undefined, method: 'PUT', body: payload })).status, 403);
      for (const patch of [{ storeId: randomUUID() }, { enabledMethods: ['EXPRESS'] }, { checkoutEnabled: true }]) {
        assert.equal((await call('admin/storefront', { ...operator, method: 'PUT', body: { ...payload, ...patch } })).status, 400);
      }
    });
    await t.test('name and three drafts commit atomically, null is not free, and public data excludes drafts', async () => {
      payload.fulfillmentRules[0].feeMinor = '600'; payload.fulfillmentRules[0].freeAboveMinor = '9900';
      payload.fulfillmentRules[2].pickupAddress = '隔离测试自提点，不可实际使用';
      const firstWrites = await Promise.all(Array.from({ length: 2 }, () => call('admin/storefront', { ...operator, method: 'PUT', body: payload })));
      assert.deepEqual(firstWrites.map(result => result.status).sort(), [200, 409]);
      const saved = firstWrites.find(result => result.status === 200);
      assert.match(saved.body.data.auditId, /^[0-9a-f-]{36}$/);
      const actual = saved.body.data.settings; assert.equal(actual.storefront.version, 1);
      assert.equal(actual.fulfillmentRules[0].feeMinor, '600'); assert.equal(actual.fulfillmentRules[1].feeMinor, null);
      const visible = await call('app/storefront'); assert.equal(visible.body.data.displayName, payload.displayName);
      assert(!JSON.stringify(visible.body).includes('pickupAddress')); assert(!JSON.stringify(visible.body).includes('feeMinor'));
      assert.deepEqual(visible.body.data.enabledMethods, []);
      assert.equal((await call('admin/storefront', { ...operator, method: 'PUT', body: payload })).status, 409);
    });
    await t.test('one of two writes with the same version wins; a failed audit rolls back the entire aggregate', async () => {
      const next = { ...payload, version: 1 };
      const results = await Promise.all(['隔离甲', '隔离乙'].map(displayName => call('admin/storefront', { ...operator, method: 'PUT', body: { ...next, displayName } })));
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const previous = await storefront.adminSettings(operator.principal, trace);
      class FailingAudit extends AuditService { async append(context, input) { await super.append(context, input); throw new Error('fixture audit rollback'); } }
      await assert.rejects(new StorefrontService(database, admins, new FailingAudit()).save(operator.principal, { ...payload, version: 2, displayName: '不得提交的测试值' }, trace), /fixture audit rollback/);
      assert.deepEqual(await storefront.adminSettings(operator.principal, trace), previous);
      const records = (await pool.query('SELECT changes FROM audit_log WHERE "requestId" = $1 AND action = $2', [trace, 'store.settings_saved'])).rows;
      assert.equal(records.length, 2); assert(!JSON.stringify(records).includes(payload.displayName));
    });
    await t.test('database invariants reject additional sales scopes and negative fees', async () => {
      await assert.rejects(pool.query('INSERT INTO store (id, display_name, updated_at) VALUES ($1, $2, now())', [randomUUID(), '测试']), error => error.code === '23514');
      await assert.rejects(pool.query('UPDATE store_fulfillment_draft SET fee_minor = -1 WHERE store_id = $1', [onlineSalesScopeId]), error => error.code === '23514');
    });
    await t.test('API restart preserves the aggregate and permission revocation denies old sessions', async () => {
      await stop(); await start();
      assert.equal((await call('admin/storefront', operator)).body.data.storefront.version, 2);
      await admins.update(manager.principal, operatorAccount.id, { version: operatorAccount.version, status: 'ACTIVE', grants: [], reason: 'access_change' }, trace);
      assert.equal((await call('admin/storefront', operator)).status, 401);
      assert(!output.includes(password));
    });
  } finally {
    await stop();
    try {
      if (ownedStore) {
        await pool.query('DELETE FROM store_fulfillment_draft WHERE store_id = $1', [onlineSalesScopeId]);
        await pool.query('DELETE FROM store WHERE id = $1', [onlineSalesScopeId]);
      }
      const ids = (await pool.query('SELECT id FROM admin_account WHERE username LIKE $1', [prefix + '%'])).rows.map(row => row.id);
      await pool.query('DELETE FROM admin_session WHERE admin_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM admin_grant WHERE admin_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM admin_account WHERE id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM audit_log WHERE "requestId" = $1 OR ("objectType" = $2 AND "objectId" = ANY($3::text[]))', [trace, 'admin', ids]);
    } finally { await database.close(); await pool.end(); }
  }
});
