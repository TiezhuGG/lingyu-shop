import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import foundation from '../../packages/server-modules/dist/index.js';
const { parseBackendConfig, BackendConfigService, DatabaseService, AuditService, AdminService, CustomerSessionService } = foundation;
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.pathname, '/lingyu_shop_test');
assert(['127.0.0.1', 'localhost'].includes(url.hostname));
const env = { ...process.env, NODE_ENV: 'test', PORT: '19373', ADMIN_ORIGIN: 'http://127.0.0.1:5173', DB_TIMEOUT_MS: '3000', AUTH_DEVELOPMENT_LOGIN_ENABLED: 'true',
  AUTH_ACCESS_SIGNING_KEY: 'A'.repeat(43), AUTH_REFRESH_TOKEN_PEPPER: 'B'.repeat(43) };
const origin = env.ADMIN_ORIGIN, base = 'http://127.0.0.1:19373/api/v1/admin/';
const config = new BackendConfigService(parseBackendConfig(env), 'api');
const prefix = 'iamtest-' + randomUUID().slice(0, 12);
const password = 'Disposable-test-only-2026!';
const a = randomUUID(), b = randomUUID();

test('real admin cookies, CSRF, RBAC, revocation and audit boundaries', { timeout: 60000 }, async t => {
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  const database = new DatabaseService(config), service = new AdminService(config, database, new AuditService());
  let child, output = '';
  const trace = 'admin-test-' + randomUUID();
  async function call(path, { method = 'GET', body, cookie, csrf, suppliedOrigin = origin } = {}) {
    const headers = { 'content-type': 'application/json', 'x-request-id': trace };
    if (suppliedOrigin) headers.origin = suppliedOrigin;
    if (cookie) headers.cookie = cookie;
    if (csrf) headers['x-csrf-token'] = csrf;
    const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  async function login(username = prefix) {
    const response = await call('auth/login', { method: 'POST', body: { username, password } });
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: response.body.data.csrfToken };
  }
  async function startApi() {
    child = spawn(process.execPath, ['apps/api/dist/main.js'], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      assert.equal(child.exitCode, null, output);
      try { ready = (await fetch('http://127.0.0.1:19373/health/ready')).ok; } catch {}
      if (ready) break;
      await delay(100);
    }
    assert(ready, 'API did not become ready');
  }
  async function stopApi() {
    if (child?.exitCode === null) {
      const done = once(child, 'exit');
      if (process.platform === 'win32') child.send({ type: 'shutdown' }); else child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 10000);
      try { await done; } finally { clearTimeout(force); }
    }
  }
  try {
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM admin_account')).rows[0].n, 0, 'Refusing bootstrap in a test database that already has administrators');
    await database.onModuleInit();
    const root = await service.bootstrap(prefix, password);
    await assert.rejects(service.bootstrap(prefix + '-again', password), error => error.getStatus?.() === 409);
    await startApi();
    let rootSession;
    await t.test('exact Origin is required even for login; cookie credentials never enter JSON', async () => {
      for (const suppliedOrigin of ['', 'http://evil.invalid']) assert.equal((await call('auth/login', { method: 'POST', suppliedOrigin, body: { username: prefix, password } })).status, 403);
      const nonJson = await fetch(base + 'auth/login', { method: 'POST', headers: { origin, 'content-type': 'text/plain' }, body: '{}' });
      assert.equal(nonJson.status, 400);
      const response = await call('auth/login', { method: 'POST', body: { username: prefix, password } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const cookie = response.headers.get('set-cookie').split(';')[0];
      assert(!JSON.stringify(response.body).includes(cookie.split('=')[1]));
      rootSession = { cookie, csrf: response.body.data.csrfToken };
      assert.equal((await call('auth/me')).status, 401);
      assert.equal((await call('auth/me', rootSession)).body.data.admin.id, root.id);
    });
    const create = { username: prefix + '-store', password, reason: 'onboarding', grants: [{ role: 'STORE_OPERATOR', scopeKey: a }, { role: 'STORE_READER', scopeKey: b }] };
    let operator;
    await t.test('HTTP payload and database constraints both reject invalid grants', async () => {
      for (const body of [{ ...create, adminId: root.id }, { ...create, grants: [{ role: 'STORE_OPERATOR', scopeKey: 'GLOBAL' }] },
        { ...create, grants: [{ role: 'IAM_MANAGER', scopeKey: a }] }]) {
        assert.equal((await call('iam/admins', { ...rootSession, method: 'POST', body })).status, 400);
      }
      await assert.rejects(pool.query('INSERT INTO admin_grant (id, admin_id, role, scope_key) VALUES ($1, $2, $3, $4)',
        [randomUUID(), root.id, 'STORE_OPERATOR', 'GLOBAL']), error => error.code === '23514');
      await assert.rejects(pool.query('INSERT INTO admin_grant (id, admin_id, role, scope_key) VALUES ($1, $2, $3, $4)',
        [randomUUID(), root.id, 'IAM_MANAGER', 'GLOBAL']), error => error.code === '23505');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM admin_account')).rows[0].n, 1);
    });
    await t.test('writes reject missing or wrong CSRF and foreign origins without changing data', async () => {
      for (const options of [{ csrf: undefined }, { csrf: 'forged' }, { suppliedOrigin: 'https://evil.invalid' }]) {
        assert.equal((await call('iam/admins', { ...rootSession, ...options, method: 'POST', body: create })).status, 403);
      }
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM admin_account')).rows[0].n, 1);
      const response = await call('iam/admins', { ...rootSession, method: 'POST', body: create });
      assert.equal(response.status, 200); operator = response.body.data;
      assert(!JSON.stringify(response.body).includes('password'));
    });
    const storeSession = await login(create.username);
    const principal = await service.authenticate(storeSession.cookie.slice('lingyu_admin='.length));
    await t.test('expiry, cookie forgery, API restart and identity separation use real persisted sessions', async () => {
      const expiring = await login();
      const sessionId = expiring.cookie.slice('lingyu_admin='.length, 'lingyu_admin='.length + 36);
      await pool.query('UPDATE admin_session SET expires_at = now() - interval \'1 second\' WHERE id = $1 AND admin_id = $2', [sessionId, root.id]);
      assert.equal((await call('auth/me', expiring)).status, 401);
      assert.equal((await call('auth/me', { cookie: rootSession.cookie.slice(0, -1) + (rootSession.cookie.endsWith('A') ? 'B' : 'A') })).status, 401);
      const customers = new CustomerSessionService(config, database, new AuditService());
      const tokens = await customers.developmentLogin(prefix);
      assert.equal((await call('auth/me', { cookie: 'lingyu_admin=' + tokens.accessToken })).status, 401);
      assert.equal((await call('auth/me', { cookie: 'lingyu_admin=' + tokens.refreshToken })).status, 401);
      await assert.rejects(customers.authenticateAccess(rootSession.cookie.slice('lingyu_admin='.length)), error => error.getStatus?.() === 401);
      await stopApi(); await startApi();
      assert.equal((await call('auth/me', rootSession)).status, 200);
      assert.equal((await call('auth/me', storeSession)).status, 200);
    });
    await t.test('grant combinations do not expand write permissions across stores', async () => {
      assert.equal((await call('_access/stores/' + a, storeSession)).status, 200);
      assert.equal((await call('_access/stores/' + randomUUID(), storeSession)).status, 403);
      assert.equal((await call('iam/admins', storeSession)).status, 403);
      assert.equal((await call('iam/audit', storeSession)).status, 403);
      await service.storeAccess(principal, a, 'store.configure', trace);
      await assert.rejects(service.storeAccess(principal, b, 'store.configure', trace), error => error.getStatus?.() === 403);
      const rootPrincipal = await service.authenticate(rootSession.cookie.slice('lingyu_admin='.length));
      await assert.rejects(service.storeAccess(rootPrincipal, a, 'store.configure', trace), error => error.getStatus?.() === 403);
    });
    await t.test('stale versions conflict and self-modification cannot remove the active manager', async () => {
      const update = { version: 999, status: 'DISABLED', grants: [], reason: 'offboarding' };
      assert.equal((await call('iam/admins/' + operator.id, { ...rootSession, method: 'PATCH', body: update })).status, 409);
      assert.equal((await call('iam/admins/' + root.id, { ...rootSession, method: 'PATCH', body: { ...update, version: 1 } })).status, 403);
    });
    await t.test('scope changes revoke previous sessions and transaction-time checks reject stale authority', async () => {
      let release, entered;
      const gate = new Promise(resolve => { release = resolve; });
      const authorized = new Promise(resolve => { entered = resolve; });
      const writing = database.runInTransaction(async context => {
        await service.authorizeInTransaction(context, principal, 'store.configure', a);
        entered(); await gate;
      });
      await authorized;
      let settled = false;
      const revoking = call('iam/admins/' + operator.id, { ...rootSession, method: 'PATCH', body: { version: operator.version, status: 'ACTIVE', grants: [{ role: 'STORE_READER', scopeKey: b }], reason: 'access_change' } }).finally(() => { settled = true; });
      try { await delay(50); assert.equal(settled, false, 'Revocation must wait for an already-authorized business transaction'); }
      finally { release(); }
      const [response] = await Promise.all([revoking, writing]);
      assert.equal(response.status, 200); operator = response.body.data;
      assert.equal((await call('auth/me', storeSession)).status, 401);
      await assert.rejects(database.runInTransaction(context => service.authorizeInTransaction(context, principal, 'store.configure', a)), error => error.getStatus?.() === 401);
      const newSession = await login(create.username);
      assert.equal((await call('_access/stores/' + a, newSession)).status, 403);
      assert.equal((await call('_access/stores/' + b, newSession)).status, 200);
      const newPrincipal = await service.authenticate(newSession.cookie.slice('lingyu_admin='.length));
      const rootPrincipal = await service.authenticate(rootSession.cookie.slice('lingyu_admin='.length));
      let allowCommit, changed;
      const commitGate = new Promise(resolve => { allowCommit = resolve; });
      const hasChanged = new Promise(resolve => { changed = resolve; });
      class PausingAudit extends AuditService {
        async append(context, input) {
          const result = await super.append(context, input);
          if (input.action === 'iam.admin_update') { changed(); await commitGate; }
          return result;
        }
      }
      const disabling = new AdminService(config, database, new PausingAudit()).update(rootPrincipal, operator.id,
        { version: operator.version, status: 'DISABLED', grants: operator.grants, reason: 'offboarding' }, trace);
      await hasChanged;
      const lateWrite = assert.rejects(database.runInTransaction(context => service.authorizeInTransaction(context, newPrincipal, 'store.read', b)), error => error.getStatus?.() === 401);
      try { await delay(50); } finally { allowCommit(); }
      await Promise.all([disabling, lateWrite]);
      assert.equal((await call('auth/me', newSession)).status, 401);
      assert.equal((await call('auth/login', { method: 'POST', body: { username: create.username, password } })).status, 401);
    });
    await t.test('logout wins over queued transaction checks even if their Serializable snapshot predates revocation', async () => {
      const extraSession = await login();
      const extraPrincipal = await service.authenticate(extraSession.cookie.slice('lingyu_admin='.length));
      let release, entered;
      const gate = new Promise(resolve => { release = resolve; });
      const ready = new Promise(resolve => { entered = resolve; });
      class PausingLogoutAudit extends AuditService {
        async append(context, input) {
          const result = await super.append(context, input);
          if (input.action === 'auth.admin.logout') { entered(); await gate; }
          return result;
        }
      }
      const loggingOut = new AdminService(config, database, new PausingLogoutAudit()).logout(extraPrincipal, trace);
      await ready;
      const late = assert.rejects(database.runInTransaction(context => service.authorizeInTransaction(context, extraPrincipal, 'iam.admin.read')), error => error.getStatus?.() === 401);
      try { await delay(50); } finally { release(); }
      await Promise.all([loggingOut, late]);
    });
    await t.test('five failed logins lock the account and audit never contains credentials', async () => {
      for (let i = 0; i < 5; i++) assert.equal((await call('auth/login', { method: 'POST', body: { username: prefix, password: password + '-wrong' } })).status, 401);
      assert.equal((await call('auth/login', { method: 'POST', body: { username: prefix, password } })).status, 401);
      const records = await call('iam/audit', rootSession);
      assert.equal(records.status, 200);
      assert(records.body.data.some(row => row.action === 'auth.admin.login_failed'));
      assert(records.body.data.some(row => row.action === 'iam.grant_removed' && row.changes.scope === a));
      assert(!JSON.stringify(records.body).includes(password));
      assert(!JSON.stringify(records.body).includes(rootSession.cookie));
      assert(!output.includes(password));
      const stored = await pool.query('SELECT locked_until, failed_login_count FROM admin_account WHERE id = $1', [root.id]);
      assert(stored.rows[0].locked_until > new Date());
      assert.equal(stored.rows[0].failed_login_count, 5);
    });
    await t.test('logout revokes the cookie and client tokens do not authenticate as administrators', async () => {
      const response = await call('auth/logout', { ...rootSession, method: 'POST' });
      assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
      assert.equal((await call('auth/me', rootSession)).status, 401);
      assert.equal((await call('auth/me', { cookie: 'lingyu_admin=forged-customer-token' })).status, 401);
    });
  } finally {
    await stopApi();
    try {
      const customerIds = (await pool.query('SELECT customer_id FROM customer_identity WHERE provider_key = $1', ['development:' + prefix])).rows.map(row => row.customer_id);
      const customerSessions = (await pool.query('SELECT id FROM session WHERE subject_id = ANY($1::uuid[])', [customerIds])).rows.map(row => row.id);
      await pool.query('DELETE FROM audit_log WHERE "objectId" = ANY($1::text[])', [[...customerIds, ...customerSessions]]);
      await pool.query('DELETE FROM session WHERE subject_id = ANY($1::uuid[])', [customerIds]);
      await pool.query('DELETE FROM customer_identity WHERE customer_id = ANY($1::uuid[])', [customerIds]);
      await pool.query('DELETE FROM customer WHERE id = ANY($1::uuid[])', [customerIds]);
      const ids = (await pool.query('SELECT id FROM admin_account WHERE username LIKE $1', [prefix + '%'])).rows.map(row => row.id);
      await pool.query('DELETE FROM admin_session WHERE admin_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM admin_grant WHERE admin_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM admin_account WHERE id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM audit_log WHERE "requestId" = $1 OR ("objectType" = $2 AND "objectId" = ANY($3::text[]))', [trace, 'admin', ids]);
    } finally { await database.close(); await pool.end(); }
  }
});
