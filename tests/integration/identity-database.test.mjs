import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import foundation from '../../packages/server-modules/dist/index.js';

const { parseBackendConfig, BackendConfigService, DatabaseService, AuditService, CustomerSessionService } = foundation;
const source = new URL(process.env.DATABASE_URL ?? '');
assert.equal(source.pathname, '/lingyu_shop_test');
assert(['localhost', '127.0.0.1'].includes(source.hostname));
const keys = { AUTH_ACCESS_SIGNING_KEY: randomBytes(32).toString('base64url'), AUTH_REFRESH_TOKEN_PEPPER: randomBytes(32).toString('base64url') };
const config = parseBackendConfig({ ...process.env, ...keys, NODE_ENV: 'test', AUTH_DEVELOPMENT_LOGIN_ENABLED: 'true', DB_TIMEOUT_MS: '3000' });

async function fixture(run) {
  const database = new DatabaseService(new BackendConfigService(config, 'api'));
  const sessions = new CustomerSessionService(new BackendConfigService(config, 'api'), database, new AuditService());
  const verify = new Pool({ connectionString: source.toString(), max: 1 });
  const developmentId = 'identity-test-' + randomUUID();
  try {
    await database.onModuleInit();
    await run({ sessions, database, verify, developmentId });
  } finally {
    // Resolve only this fixture's unique identity, including when an assertion fails.
    try {
      const customers = await verify.query('SELECT customer_id FROM customer_identity WHERE provider_key = $1', ['development:' + developmentId]);
      const ids = customers.rows.map(row => row.customer_id);
      const owned = await verify.query('SELECT id FROM session WHERE subject_id = ANY($1::uuid[])', [ids]);
      await verify.query('DELETE FROM audit_log WHERE "objectId" = ANY($1::text[])', [[...ids, ...owned.rows.map(row => row.id)]]);
      await verify.query('DELETE FROM session WHERE subject_id = ANY($1::uuid[])', [ids]);
      await verify.query('DELETE FROM customer_identity WHERE customer_id = ANY($1::uuid[])', [ids]);
      await verify.query('DELETE FROM customer WHERE id = ANY($1::uuid[])', [ids]);
    } finally { await verify.end(); await database.close(); }
  }
}

test('a guessed refresh secret cannot revoke an otherwise valid session', async () => fixture(async ({ sessions, developmentId }) => {
  const issued = await sessions.developmentLogin(developmentId);
  const principal = await sessions.authenticateAccess(issued.accessToken);
  const forged = principal.sessionId + '.' + randomBytes(32).toString('base64url');
  await assert.rejects(sessions.refresh(forged), error => error.getStatus?.() === 401);
  assert.deepEqual(await sessions.authenticateAccess(issued.accessToken), principal);
  const rotated = await sessions.refresh(issued.refreshToken);
  await assert.rejects(sessions.refresh(issued.refreshToken), error => error.getStatus?.() === 401);
  await assert.rejects(sessions.authenticateAccess(rotated.accessToken), error => error.getStatus?.() === 401);
}));

test('simultaneous first login resolves one customer and independent sessions', async () => fixture(async ({ sessions, verify, developmentId }) => {
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => sessions.developmentLogin(developmentId)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 4, 'Concurrent first logins must not expose unique-constraint errors');
  const principals = await Promise.all(results.map(result => sessions.authenticateAccess(result.value.accessToken)));
  assert.equal(new Set(principals.map(principal => principal.customerId)).size, 1);
  assert.equal(new Set(principals.map(principal => principal.sessionId)).size, 4);
  assert.equal((await verify.query('SELECT count(*)::int AS n FROM customer_identity WHERE provider_key = $1', ['development:' + developmentId])).rows[0].n, 1);
}));

test('duplicate concurrent refresh never leaves a usable replayed session', async () => fixture(async ({ sessions, developmentId }) => {
  const issued = await sessions.developmentLogin(developmentId);
  const results = await Promise.allSettled([sessions.refresh(issued.refreshToken), sessions.refresh(issued.refreshToken)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.getStatus?.() === 401).length, 1);
  const winner = results.find(result => result.status === 'fulfilled').value;
  await assert.rejects(sessions.authenticateAccess(winner.accessToken), error => error.getStatus?.() === 401);
}));

test('expiry, audience, actor type, signature, customer status and logout are enforced', async () => fixture(async ({ sessions, verify, developmentId }) => {
  const issued = await sessions.developmentLogin(developmentId);
  const principal = await sessions.authenticateAccess(issued.accessToken);
  const [header, payload] = issued.accessToken.split('.');
  const originalClaims = JSON.parse(Buffer.from(payload, 'base64url'));
  for (const patch of [{ exp: 1 }, { aud: 'admin' }, { subject_type: 'ADMIN' }, { iat: originalClaims.iat + 10000 }]) {
    const modified = header + '.' + Buffer.from(JSON.stringify({ ...originalClaims, ...patch })).toString('base64url');
    const signed = modified + '.' + createHmac('sha256', Buffer.from(keys.AUTH_ACCESS_SIGNING_KEY, 'base64url')).update(modified).digest('base64url');
    await assert.rejects(sessions.authenticateAccess(signed), error => error.getStatus?.() === 401);
  }
  await assert.rejects(sessions.authenticateAccess(issued.accessToken + 'x'), error => error.getStatus?.() === 401);
  await verify.query('UPDATE customer SET status = $1 WHERE id = $2', ['DISABLED', principal.customerId]);
  await assert.rejects(sessions.authenticateAccess(issued.accessToken), error => error.getStatus?.() === 401);
  await verify.query('UPDATE customer SET status = $1 WHERE id = $2', ['ACTIVE', principal.customerId]);
  await sessions.logout(principal);
  await assert.rejects(sessions.refresh(issued.refreshToken), error => error.getStatus?.() === 401);
  await assert.rejects(sessions.authenticateAccess(issued.accessToken), error => error.getStatus?.() === 401);
  const audits = await verify.query('SELECT * FROM audit_log WHERE "objectId" = $1', [principal.sessionId]);
  assert(!JSON.stringify(audits.rows).includes(issued.refreshToken));
  assert(!JSON.stringify(audits.rows).includes(issued.accessToken));
}));

test('existing development credentials are rejected when development identity is disabled', async () => fixture(async ({ sessions, database, developmentId }) => {
  const issued = await sessions.developmentLogin(developmentId);
  const disabledConfig = { ...config, authentication: { ...config.authentication, developmentLoginEnabled: false } };
  const disabled = new CustomerSessionService(new BackendConfigService(disabledConfig, 'api'), database, new AuditService());
  await assert.rejects(disabled.developmentLogin(developmentId), error => error.getStatus?.() === 404);
  await assert.rejects(disabled.authenticateAccess(issued.accessToken), error => error.getStatus?.() === 401);
  await assert.rejects(disabled.refresh(issued.refreshToken), error => error.getStatus?.() === 401);
}));

test('sessions survive backend reconnection and refresh expiry is enforced', async () => fixture(async ({ sessions, verify, developmentId }) => {
  const issued = await sessions.developmentLogin(developmentId);
  const principal = await sessions.authenticateAccess(issued.accessToken);
  const reconnected = new DatabaseService(new BackendConfigService(config, 'api'));
  try {
    await reconnected.onModuleInit();
    const restored = new CustomerSessionService(new BackendConfigService(config, 'api'), reconnected, new AuditService());
    assert.deepEqual(await restored.authenticateAccess(issued.accessToken), principal);
    const rotated = await restored.refresh(issued.refreshToken);
    const row = await verify.query('SELECT refresh_hash FROM session WHERE id = $1', [principal.sessionId]);
    assert.equal(row.rows[0].refresh_hash.length, 64);
    assert.notEqual(row.rows[0].refresh_hash, rotated.refreshToken);
    await verify.query("UPDATE session SET refresh_expires_at = now() - interval '1 second' WHERE id = $1", [principal.sessionId]);
    await assert.rejects(restored.refresh(rotated.refreshToken), error => error.getStatus?.() === 401);
    await assert.rejects(restored.authenticateAccess(rotated.accessToken), error => error.getStatus?.() === 401);
  } finally { await reconnected.close(); }
}));
