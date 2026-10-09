import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import foundation from '../../packages/server-modules/dist/index.js';
const { parseBackendConfig, BackendConfigService, DatabaseService } = foundation;
const source = new URL(process.env.POC_DATABASE_URL ?? '');
assert(['127.0.0.1', 'localhost'].includes(source.hostname) && source.port === '15432' && source.pathname === '/lingyu_shop_poc', 'Only dedicated local Compose tests are allowed');
// Explicit isolated Compose runner; keep the supplied URL's local guard above.
if (process.env.LINGYU_TEST_COMPOSE === '1') { source.hostname = 'postgres'; source.port = '5432'; }
const testUrl = new URL(source); testUrl.pathname = '/lingyu_shop_test';
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: testUrl.toString(), DB_TIMEOUT_MS: '500', PORT: '19371' };
const admin = new Pool({ connectionString: source.toString(), max: 1, connectionTimeoutMillis: 3000 });
function launch(service, extra = {}) {
  const child = spawn(process.execPath, ['apps/' + service + '/dist/main.js'], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  return { child, output: () => output };
}
async function eventually(check, message) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await delay(100); }
  assert.fail(message);
}
async function connections(pid) {
  const { rows } = await admin.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name IN ($1,$2)', ['lingyu-api-' + pid, 'lingyu-worker-' + pid]);
  return rows[0].count;
}
async function closeProcess(run) {
  if (run.child.exitCode !== null) return;
  const done = once(run.child, 'exit');
  if (process.platform === 'win32') run.child.send({ type: 'shutdown' });
  else run.child.kill('SIGTERM');
  const timeout = setTimeout(() => run.child.kill(), 15000);
  try { const [code] = await done; assert.equal(code, 0, run.output()); assert.match(run.output(), /SHUTDOWN_COMPLETE/); }
  finally { clearTimeout(timeout); }
}

test('real shared lifecycle, readiness failure/recovery and API/Worker connection release', { timeout: 45000 }, async () => {
  let api, worker;
  try {
    const initial = await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = 'lingyu_shop_test'");
    assert.equal(initial.rows[0].count, 0, 'Test database is already in use; refusing fault injection');
    api = launch('api'); worker = launch('worker');
    await eventually(async () => {
      assert.equal(api.child.exitCode, null, api.output());
      try { return (await fetch('http://127.0.0.1:19371/health/ready')).status === 200; } catch { return false; }
    }, 'API readiness did not succeed');
    await eventually(async () => worker.output().includes('no jobs registered.'), 'Worker startup failed');
    assert.equal((await fetch('http://127.0.0.1:19371/missing')).status, 404);
    assert.deepEqual(await (await fetch('http://127.0.0.1:19371/health')).json(), { status: 'ok', service: 'api', scope: 'engineering' });
    assert(await connections(api.child.pid) > 0);
    assert(await connections(worker.child.pid) > 0);
    const tables = await admin.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    assert(tables.rows.some(row => row.tablename === 'engineering_probe'), 'PoC remains in its own database');
    await admin.query('ALTER DATABASE lingyu_shop_test ALLOW_CONNECTIONS false');
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', ['lingyu_shop_test']);
    const started = Date.now();
    const failed = await fetch('http://127.0.0.1:19371/health/ready');
    assert.equal(failed.status, 503);
    assert(Date.now() - started < 3000, 'Readiness must be bounded');
    const failure = await failed.text();
    assert(!/postgres|SQL|secret|password|stack/i.test(failure));
    assert.equal((await fetch('http://127.0.0.1:19371/health/live')).status, 200);
    await admin.query('ALTER DATABASE lingyu_shop_test ALLOW_CONNECTIONS true');
    await eventually(async () => (await fetch('http://127.0.0.1:19371/health/ready')).status === 200, 'Readiness did not recover');
    await closeProcess(api); await closeProcess(worker);
    await eventually(async () => await connections(api.child.pid) === 0 && await connections(worker.child.pid) === 0, 'Database connections leaked');
  } finally {
    await admin.query('ALTER DATABASE lingyu_shop_test ALLOW_CONNECTIONS true');
    try {
      if (api) await closeProcess(api);
      if (worker) await closeProcess(worker);
    } finally { await admin.end(); }
  }
});

test('database service drains active work and rejects readiness after close', { timeout: 10000 }, async () => {
  const service = new DatabaseService(new BackendConfigService(parseBackendConfig(env), 'worker'));
  try {
    await service.onModuleInit();
    // Exercise the owned real pool while closing; this does not expose a public SQL API.
    const connection = await service.pool.connect();
    const pending = connection.query('SELECT pg_sleep(0.2)').finally(() => connection.release());
    const closing = service.close();
    assert.equal(await service.isReady(), false);
    await pending; await closing;
    assert.equal(await service.isReady(), false);
    await service.close();
  } finally { await service.close(); }
});

test('unreachable database startup exits promptly without leaking URL', { timeout: 10000 }, async () => {
  const url = new URL(testUrl); url.port = '1';
  const run = launch('worker', { DATABASE_URL: url.toString() });
  const timeout = setTimeout(() => run.child.kill(), 7000);
  try {
    const [code] = await once(run.child, 'exit');
    assert.equal(code, 1, run.output());
    assert.match(run.output(), /WORKER_STARTUP_FAILED/);
    assert(!run.output().includes(source.password));
  } finally { clearTimeout(timeout); }
});
