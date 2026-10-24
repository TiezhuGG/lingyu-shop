import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import foundation from '../../packages/server-modules/dist/index.js';
const sharp = createRequire(new URL('../../packages/server-modules/package.json', import.meta.url))('sharp');
const { parseBackendConfig, BackendConfigService, DatabaseService, AuditService, AdminService, StorefrontService, AssetService, DevelopmentImageInspection, onlineSalesScopeId, imageDigest } = foundation;
const url = new URL(process.env.DATABASE_URL ?? ''); assert.equal(url.pathname, '/lingyu_shop_test'); assert(['127.0.0.1', 'localhost'].includes(url.hostname));
test('asset real PostgreSQL/API ownership, private upload, confirmation and transaction recovery', { timeout: 240000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'lingyu-asset-api-'));
  const env = { ...process.env, NODE_ENV: 'test', PORT: '19379', ADMIN_ORIGIN: 'http://127.0.0.1:5173', AUTH_ACCESS_SIGNING_KEY: 'A'.repeat(43), AUTH_REFRESH_TOKEN_PEPPER: 'B'.repeat(43), ASSET_LOCAL_DIRECTORY: join(root, 'private') };
  const config = new BackendConfigService(parseBackendConfig(env), 'api'), pool = new Pool({ connectionString: url.toString(), max: 1 });
  const database = new DatabaseService(config), audit = new AuditService(), admins = new AdminService(config, database, audit), storefront = new StorefrontService(database, admins, audit);
  const inspection = new DevelopmentImageInspection(config), assets = new AssetService(config, database, admins, audit, storefront, inspection);
  const prefix = 'asset-' + randomUUID().slice(0, 10), trace = 'asset-' + randomUUID(), password = 'Disposable-Asset-fixture-2026!';
  let child, owned = false, output = '';
  const ids = [];
  async function call(path, { method = 'GET', cookie, csrf, body } = {}) {
    const headers = { 'content-type': 'application/json', origin: env.ADMIN_ORIGIN, 'x-request-id': trace };
    if (cookie) headers.cookie = cookie; if (csrf) headers['x-csrf-token'] = csrf;
    const response = await fetch('http://127.0.0.1:19379/api/v1/admin/' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, body: response.headers.get('content-type')?.startsWith('image/') ? bytes : JSON.parse(bytes.toString()) };
  }
  async function issueUser(username) { const login = await admins.login(username, password, trace); return { cookie: 'lingyu_admin=' + login.cookie, csrf: login.data.csrfToken, principal: await admins.authenticate(login.cookie) }; }
  async function start() {
    child = spawn(process.execPath, ['apps/api/dist/main.js'], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
    for (let i = 0; i < 100; i++) { assert.equal(child.exitCode, null, output); try { if ((await fetch('http://127.0.0.1:19379/health/ready')).ok) return; } catch {} await delay(100); }
    throw Error('Asset API unavailable');
  }
  async function stop() { if (child?.exitCode === null) { const done = once(child, 'exit'); if (process.platform === 'win32') child.send({ type: 'shutdown' }); else child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 10000); try { await done; } finally { clearTimeout(timer); } } }
  const png = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#c0ffee' } }).png().toBuffer();
  const manifest = (bytes = png, mime = 'image/png') => { const uploadId = randomUUID(); ids.push(uploadId); return { uploadId, purpose: 'CMS_IMAGE', mime, size: bytes.length, sha256: imageDigest(bytes) }; };
  try {
    for (const table of ['store', 'admin_account', 'asset_upload']) assert.equal((await pool.query('SELECT count(*)::int n FROM ' + table)).rows[0].n, 0, 'Refusing existing data: ' + table);
    owned = true; await database.onModuleInit();
    await t.test('eighth migration preserves existing storefront/admin rows when upgrading seven migrations', async () => {
      const client = await pool.connect(), schema = 'asset_upgrade_' + randomUUID().replaceAll('-', '');
      try {
        await client.query('BEGIN'); await client.query('CREATE SCHEMA "' + schema + '"'); await client.query('SET LOCAL search_path TO "' + schema + '"');
        const path = 'packages/server-modules/prisma/migrations', dirs = (await readdir(path, { withFileTypes: true })).filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
        for (const dir of dirs.slice(0, -1)) await client.query(await readFile(path + '/' + dir.name + '/migration.sql', 'utf8'));
        const adminId = randomUUID();
        await client.query('INSERT INTO store(id,display_name,updated_at) VALUES($1,$2,now())', [onlineSalesScopeId, '升级保留测试商城']);
        await client.query('INSERT INTO admin_account(id,username,password_hash) VALUES($1,$2,$3)', [adminId, 'upgrade_fixture', 'synthetic-unusable-hash']);
        await client.query(await readFile(path + '/' + dirs.at(-1).name + '/migration.sql', 'utf8'));
        assert.equal((await client.query('SELECT display_name FROM store WHERE id=$1', [onlineSalesScopeId])).rows[0].display_name, '升级保留测试商城');
        assert.equal((await client.query('SELECT username FROM admin_account WHERE id=$1', [adminId])).rows[0].username, 'upgrade_fixture');
        assert.equal((await client.query('SELECT count(*)::int n FROM asset_upload')).rows[0].n, 0);
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
    await admins.bootstrap(prefix + '-manager', password); const manager = await issueUser(prefix + '-manager');
    for (const [suffix, role, scopeKey] of [['ops', 'STORE_OPERATOR', onlineSalesScopeId], ['other', 'STORE_OPERATOR', onlineSalesScopeId], ['reader', 'STORE_READER', onlineSalesScopeId], ['wrong', 'STORE_OPERATOR', randomUUID()]])
      await admins.create(manager.principal, { username: prefix + '-' + suffix, password, reason: 'onboarding', grants: [{ role, scopeKey }] }, trace);
    const operator = await issueUser(prefix + '-ops'), other = await issueUser(prefix + '-other'), reader = await issueUser(prefix + '-reader'), wrong = await issueUser(prefix + '-wrong');
    const issue = (input, who = operator) => call('assets/upload-tickets', { ...who, method: 'POST', body: input });
    const upload = (id, bytes = png, who = operator) => call('assets/' + id + '/bytes', { ...who, method: 'POST', body: { dataBase64: bytes.toString('base64') } });
    const confirm = (id, who = operator) => call('assets/' + id + '/confirm', { ...who, method: 'POST', body: {} });
    const revoke = (id, version, who = operator) => call('assets/' + id + '/revoke', { ...who, method: 'POST', body: { version } });
    await start();
    const main = manifest();
    await t.test('empty reads do not seed; issue requires configured storefront and bounded manifests', async () => {
      assert.deepEqual((await call('assets', operator)).body.data.items, []); assert.equal((await issue(main)).status, 409);
      await storefront.save(operator.principal, { version: 0, displayName: '隔离资产测试商城', reason: 'configuration_change', fulfillmentRules: ['EXPRESS', 'LOCAL_DELIVERY', 'PICKUP'].map(method => ({ method, feeMinor: null, freeAboveMinor: null, serviceDescription: null, pickupAddress: null })) }, trace);
      assert.equal((await issue({ ...main, ownerId: other.principal.adminId })).status, 400); assert.equal((await issue({ ...main, size: 2097153 })).status, 400);
    });
    await t.test('anonymous, IAM, wrong scope and readers cannot write; CSRF cannot be omitted', async () => {
      assert.equal((await call('assets')).status, 401);
      for (const who of [manager, wrong, reader]) assert.equal((await issue(main, who)).status, 403);
      assert.equal((await issue(main, { ...operator, csrf: undefined })).status, 403);
      assert.equal((await call('assets?ownerId=' + other.principal.adminId, operator)).status, 400);
    });
    await t.test('ticket issue is idempotent across concurrency; conflicting manifests and wrong owner fail', async () => {
      const results = await Promise.all([issue(main), issue(main)]); assert.deepEqual(results.map(r => r.status), [200, 200]);
      assert.equal((await issue({ ...main, size: main.size + 1 })).status, 409); assert.equal((await issue(main, other)).status, 404);
      assert.equal((await call('assets/' + main.uploadId, other)).status, 404); assert.equal((await call('assets/' + main.uploadId + '/content', operator)).status, 404);
      assert.equal((await confirm(main.uploadId)).status, 409);
      assert.equal((await pool.query('SELECT count(*)::int n FROM audit_log WHERE action=\'asset.issued\' AND "objectId"=$1', [main.uploadId])).rows[0].n, 1);
    });
    await t.test('bytes validate actual size/hash and canonical encoding; repeat upload does not duplicate state', async () => {
      const mislabeled = manifest(png, 'image/jpeg'); await issue(mislabeled); assert.equal((await upload(mislabeled.uploadId)).status, 400);
      assert.equal((await upload(main.uploadId, Buffer.from('wrong'))).status, 409);
      assert.equal((await call('assets/' + main.uploadId + '/bytes', { ...operator, method: 'POST', body: { dataBase64: 'YR==' } })).status, 400);
      assert.equal((await upload(main.uploadId, png, other)).status, 404);
      const first = await upload(main.uploadId); assert.equal(first.status, 200); assert.equal(first.body.data.status, 'STORED');
      assert.deepEqual((await upload(main.uploadId)).body.data, first.body.data);
      assert(!JSON.stringify(first.body).includes('rawKey')); assert(!JSON.stringify(first.body).includes('sha256'));
    });
    await t.test('confirmation fully decodes privately and is idempotent; content is authenticated and sanitized', async () => {
      const first = await confirm(main.uploadId); assert.equal(first.status, 200); assert.equal(first.body.data.status, 'DEVELOPMENT_READY'); assert.equal(first.body.data.developmentOnly, true);
      assert.deepEqual((await confirm(main.uploadId)).body.data, first.body.data);
      const image = await call('assets/' + main.uploadId + '/content', operator); assert.equal(image.status, 200); assert.equal(image.headers.get('x-content-type-options'), 'nosniff'); assert.equal(image.headers.get('cache-control'), 'no-store');
      assert.equal((await sharp(image.body).metadata()).width, 3); assert.equal((await call('assets/' + main.uploadId + '/content', other)).status, 404);
      const result = await database.runInTransaction(context => assets.requireDevelopmentImageInTransaction(context, main.uploadId, onlineSalesScopeId)); assert.equal(result.developmentOnly, true);
      await assert.rejects(database.runInTransaction(context => assets.requireDevelopmentImageInTransaction(context, main.uploadId, randomUUID())), e => e.getStatus() === 409);
    });
    await t.test('corrupt signature-only data never becomes development-ready', async () => {
      const broken = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]), input = manifest(broken);
      assert.equal((await issue(input)).status, 200); assert.equal((await upload(input.uploadId, broken)).status, 200); assert.equal((await confirm(input.uploadId)).status, 400);
      assert.equal((await call('assets/' + input.uploadId, operator)).body.data.status, 'STORED'); assert.equal((await call('assets/' + input.uploadId + '/content', operator)).status, 404);
    });
    await t.test('expired tickets and revoked assets reject writes and binding; revoke replay is harmless', async () => {
      const input = manifest(); await issue(input);
      await pool.query("UPDATE asset_upload SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1", [input.uploadId]);
      assert.equal((await upload(input.uploadId)).status, 409); assert.equal((await issue(input)).status, 409);
      const version = (await call('assets/' + main.uploadId, operator)).body.data.version;
      const revoked = await revoke(main.uploadId, version); assert.equal(revoked.status, 200); assert.deepEqual((await revoke(main.uploadId, version)).body.data, revoked.body.data);
      assert.equal((await confirm(main.uploadId)).status, 409); assert.equal((await call('assets/' + main.uploadId + '/content', operator)).status, 404);
      await assert.rejects(database.runInTransaction(context => assets.requireDevelopmentImageInTransaction(context, main.uploadId, onlineSalesScopeId)), e => e.getStatus() === 409);
    });
    await t.test('audit failure rolls back tickets and post-file confirmation; no file IO is in transaction', async () => {
      class FailingAudit extends AuditService { async append(context, input) { await super.append(context, input); throw Error('fixture asset rollback'); } }
      const failing = new AssetService(config, database, admins, new FailingAudit(), storefront, inspection), input = manifest();
      await assert.rejects(failing.issue(operator.principal, input, trace), /fixture asset rollback/);
      assert.equal((await pool.query('SELECT count(*)::int n FROM asset_upload WHERE id=$1', [input.uploadId])).rows[0].n, 0);
      await issue(input); await upload(input.uploadId);
      await assert.rejects(failing.confirm(operator.principal, input.uploadId, {}, trace), /fixture asset rollback/);
      assert.equal((await call('assets/' + input.uploadId, operator)).body.data.status, 'STORED');
      assert.equal((await confirm(input.uploadId)).status, 200);
    });
    await t.test('revocation while image work is in flight wins finalization; rejected work leaves only private orphans', async () => {
      const input = manifest(); await issue(input); await upload(input.uploadId);
      let enter, release; const entered = new Promise(r => { enter = r; }), gate = new Promise(r => { release = r; });
      const delayed = { async inspect(...args) { enter(); await gate; return inspection.inspect(...args); } };
      const concurrent = new AssetService(config, database, admins, audit, storefront, delayed);
      const result = concurrent.confirm(operator.principal, input.uploadId, {}, trace);
      await entered; const row = (await call('assets/' + input.uploadId, operator)).body.data; assert.equal((await revoke(input.uploadId, row.version)).status, 200);
      release(); await assert.rejects(result, e => e.getStatus() === 409);
      assert.equal((await call('assets/' + input.uploadId, operator)).body.data.status, 'REVOKED');
    });
    await t.test('API restart restores assets, quotas use persistent facts, permission withdrawal is immediate', async () => {
      await stop(); await start(); assert.equal((await call('assets/' + main.uploadId, operator)).body.data.status, 'REVOKED');
      const count = (await pool.query('SELECT count(*)::int n FROM asset_upload')).rows[0].n;
      await pool.query(`INSERT INTO asset_upload(id,store_id,owner_id,mime,size,sha256,expires_at) SELECT gen_random_uuid(),$1,$2,'image/png',1,repeat('a',64),now()+interval '10 minutes' FROM generate_series(1,$3)`, [onlineSalesScopeId, operator.principal.adminId, 100 - count]);
      assert.equal((await issue(manifest())).status, 429);
      const account = (await admins.list(manager.principal, trace)).find(a => a.id === operator.principal.adminId);
      await admins.update(manager.principal, account.id, { version: account.version, status: 'ACTIVE', grants: [], reason: 'access_change' }, trace);
      assert.equal((await call('assets', operator)).status, 401);
      assert(!output.includes(password));
    });
    await t.test('asset SQL constraints reject fabricated READY, inconsistent fields and oversized manifests', async () => {
      for (const patch of ["status='READY'", "status='DEVELOPMENT_READY',ready_key=NULL", 'size=2097153', "sha256='unsafe'"]) {
        await assert.rejects(pool.query('UPDATE asset_upload SET ' + patch + ' WHERE id=$1', [main.uploadId]));
      }
      for (const row of (await pool.query("SELECT changes FROM audit_log WHERE action LIKE 'asset.%' AND \"requestId\"=$1", [trace])).rows) for (const field of Object.keys(row.changes ?? {})) assert(!/key|sha256|base64|path|token/i.test(field));
    });
  } finally {
    await stop(); await database.onApplicationShutdown();
    if (owned) {
      await pool.query('DELETE FROM asset_upload WHERE store_id=$1', [onlineSalesScopeId]);
      await pool.query('DELETE FROM store_fulfillment_draft WHERE store_id=$1', [onlineSalesScopeId]); await pool.query('DELETE FROM store WHERE id=$1', [onlineSalesScopeId]);
      await pool.query('DELETE FROM admin_session WHERE admin_id IN (SELECT id FROM admin_account WHERE username LIKE $1)', [prefix + '%']);
      await pool.query('DELETE FROM admin_grant WHERE admin_id IN (SELECT id FROM admin_account WHERE username LIKE $1)', [prefix + '%']);
      await pool.query('DELETE FROM audit_log WHERE "requestId"=$1 OR "actorId" IN (SELECT id::text FROM admin_account WHERE username LIKE $2) OR "objectId" IN (SELECT id::text FROM admin_account WHERE username LIKE $2)', [trace, prefix + '%']);
      await pool.query('DELETE FROM admin_account WHERE username LIKE $1', [prefix + '%']);
    }
    await pool.end(); await rm(root, { recursive: true, force: true });
  }
});
