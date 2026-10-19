import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import foundation from '../../packages/server-modules/dist/index.js';
const { parseBackendConfig, BackendConfigService, DatabaseService, AuditService, AdminService, StorefrontService, CatalogService, PricingService, onlineSalesScopeId } = foundation;
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.pathname, '/lingyu_shop_test'); assert(['127.0.0.1', 'localhost'].includes(url.hostname));
const env = { ...process.env, NODE_ENV: 'test', PORT: '19375', ADMIN_ORIGIN: 'http://127.0.0.1:5173', AUTH_ACCESS_SIGNING_KEY: 'A'.repeat(43), AUTH_REFRESH_TOKEN_PEPPER: 'B'.repeat(43) };
const config = new BackendConfigService(parseBackendConfig(env), 'api');
const prefix = 'catalog-' + randomUUID().slice(0, 12), trace = 'catalog-test-' + randomUUID(), password = 'Disposable-catalog-test-2026!';
const productId = randomUUID(), categoryId = randomUUID(), secondId = randomUUID(), missingId = randomUUID();
const productIds = [productId, secondId, missingId], skuIds = [];
const makeSku = (label, priceMinor = null) => { const id = randomUUID(); skuIds.push(id); return { id, code: 'TEST_' + id.replaceAll('-', '').toUpperCase(), unit: 'PACK', options: [{ name: '包装', value: label }], active: true, priceMinor }; };
const body = { version: 0, categoryId, name: '隔离测试商品', description: '仅用于自动验收', skus: [makeSku('小包'), makeSku('大包')], reason: 'catalog_change' };
test('catalog publication uses scoped real PostgreSQL transactions, immutable snapshots and Pricing versions', { timeout: 90000 }, async t => {
  const pool = new Pool({ connectionString: url.toString(), max: 1 }), database = new DatabaseService(config), audit = new AuditService();
  const admins = new AdminService(config, database, audit), storefront = new StorefrontService(database, admins, audit), pricing = new PricingService(audit);
  const catalog = new CatalogService(database, admins, audit, storefront, pricing);
  let child, output = '', ownedStore = false, product;
  async function call(path, { method = 'GET', cookie, csrf, body } = {}) {
    const headers = { 'content-type': 'application/json', origin: env.ADMIN_ORIGIN, 'x-request-id': trace };
    if (cookie) headers.cookie = cookie; if (csrf) headers['x-csrf-token'] = csrf;
    const response = await fetch('http://127.0.0.1:19375/api/v1/' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  async function issue(username) { const result = await admins.login(username, password, trace); return { cookie: 'lingyu_admin=' + result.cookie, csrf: result.data.csrfToken, principal: await admins.authenticate(result.cookie) }; }
  async function start() {
    child = spawn(process.execPath, ['apps/api/dist/main.js'], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    for (let i = 0; i < 100; i++) { assert.equal(child.exitCode, null, output); try { if ((await fetch('http://127.0.0.1:19375/health/ready')).ok) return; } catch {} await delay(100); }
    throw new Error('Catalog API did not become ready');
  }
  async function stop() {
    if (child?.exitCode === null) { const done = once(child, 'exit'); if (process.platform === 'win32') child.send({ type: 'shutdown' }); else child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000); try { await done; } finally { clearTimeout(timer); } }
  }
  const productPath = 'admin/catalog/products/' + productId;
  try {
    for (const table of ['store', 'admin_account', 'catalog_product', 'catalog_category']) assert.equal((await pool.query('SELECT count(*)::int n FROM ' + table)).rows[0].n, 0, 'Refusing to overwrite existing test data: ' + table);
    ownedStore = true; await database.onModuleInit(); await admins.bootstrap(prefix, password); const manager = await issue(prefix);
    const account = await admins.create(manager.principal, { username: prefix + '-ops', password, reason: 'onboarding', grants: [{ role: 'STORE_OPERATOR', scopeKey: onlineSalesScopeId }] }, trace);
    await admins.create(manager.principal, { username: prefix + '-read', password, reason: 'onboarding', grants: [{ role: 'STORE_READER', scopeKey: onlineSalesScopeId }] }, trace);
    await admins.create(manager.principal, { username: prefix + '-wrong', password, reason: 'onboarding', grants: [{ role: 'STORE_OPERATOR', scopeKey: randomUUID() }] }, trace);
    const operator = await issue(prefix + '-ops'), reader = await issue(prefix + '-read'), wrong = await issue(prefix + '-wrong');
    const write = (path, payload, session = operator, method = 'PUT') => call(path, { ...session, method, body: payload });
    const action = (version, publish = true, session = operator) => write(productPath + (publish ? '/publish' : '/withdraw'), { version, reason: 'publication_change' }, session, 'POST');
    const visible = async () => { const result = await call('app/products'); assert.equal(result.status, 200); return result.body.data; };
    await start();
    await t.test('empty public catalog does not seed business data; categories require configured sales scope', async () => {
      const result = await call('app/products'); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.deepEqual(result.body.data.items, []);
      assert.equal((await write('admin/catalog/categories/' + categoryId, { version: 0, name: '隔离分类', sort: 0, active: true, reason: 'catalog_change' })).status, 409);
      assert.equal((await pool.query('SELECT count(*)::int n FROM store')).rows[0].n, 0);
      await storefront.save(operator.principal, { version: 0, displayName: '隔离商品商城', reason: 'configuration_change', fulfillmentRules: ['EXPRESS', 'LOCAL_DELIVERY', 'PICKUP'].map(method => ({ method, feeMinor: null, freeAboveMinor: null, serviceDescription: null, pickupAddress: null })) }, trace);
    });
    await t.test('anonymous/GLOBAL/other scope/reader cannot mutate drafts or publish, CSRF and query/body fields are enforced', async () => {
      assert.equal((await call('admin/catalog')).status, 401);
      for (const session of [manager, wrong]) { assert.equal((await call('admin/catalog', session)).status, 403); assert.equal((await write(productPath, body, session)).status, 403); assert.equal((await action(0, true, session)).status, 403); }
      assert.equal((await call('admin/catalog', reader)).status, 200);
      assert.equal((await write(productPath, body, reader)).status, 403); assert.equal((await action(0, true, reader)).status, 403);
      assert.equal((await write(productPath, body, { ...operator, csrf: undefined })).status, 403);
      assert.equal((await write(productPath, { ...body, storeId: randomUUID() })).status, 400);
      assert.equal((await call('app/products?storeId=' + onlineSalesScopeId)).status, 400);
      assert.equal((await call('app/products?limit=101')).status, 400);
      assert.equal((await call('admin/catalog?cursor=invalid', operator)).status, 400);
    });
    await t.test('category create is versioned; normalized duplicate names and stale writes conflict', async () => {
      const payload = { version: 0, name: '隔离分类', sort: 1, active: true, reason: 'catalog_change' };
      const results = await Promise.all([write('admin/catalog/categories/' + categoryId, payload), write('admin/catalog/categories/' + categoryId, payload)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.equal((await write('admin/catalog/categories/' + randomUUID(), { ...payload, name: ' 隔离分类 ' })).status, 409);
    });
    await t.test('draft and nullable prices persist, remain private and fixed SKU identities cannot be repurposed', async () => {
      const results = await Promise.all([write(productPath, body), write(productPath, body)]); assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      product = results.find(r => r.status === 200).body.data.product; assert.equal(product.version, 1); assert.equal(product.skus.length, 2);
      assert(product.skus.every(sku => sku.priceMinor === null)); assert.equal((await visible()).items.length, 0);
      assert.equal((await action(1)).status, 409, 'undecided prices are not free');
      for (const change of [{ unit: 'BOX' }, { code: 'NEW_CODE' }, { options: [{ name: '包装', value: '其他包装' }] }]) {
        const value = structuredClone(body); value.version = 1; Object.assign(value.skus[0], change); assert.equal((await write(productPath, value)).status, 409);
      }
      assert.equal((await write(productPath, { ...body, version: 1, skus: [body.skus[0]] })).status, 409, 'existing SKU cannot be deleted');
      const forged = { ...body, skus: body.skus.map(sku => ({ ...sku, id: randomUUID() })) };
      assert.equal((await write('admin/catalog/products/' + missingId, forged)).status, 409, 'SKU codes are unique globally');
      assert.equal((await call('admin/catalog/products/' + missingId, operator)).status, 404);
    });
    await t.test('prices and publication commit atomically, zero is explicit and public facts have matching versions', async () => {
      body.version = 1; body.skus[0].priceMinor = '1299'; body.skus[1].priceMinor = '0';
      const saved = await write(productPath, body); assert.equal(saved.status, 200); assert.equal(saved.body.data.product.version, 2);
      const results = await Promise.all([action(2), action(2)]); assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      product = results.find(r => r.status === 200).body.data.product; assert.equal(product.publishedVersion, 3); assert.match(results.find(r => r.status === 200).body.data.auditId, /^[0-9a-f-]{36}$/);
      const snapshot = (await visible()).items[0]; assert.equal(snapshot.name, body.name); assert.equal(snapshot.version, 3);
      assert.equal(snapshot.purchasable, false); assert.equal(snapshot.inventoryStatus, 'NOT_CONNECTED');
      assert.deepEqual(snapshot.skus.map(sku => sku.priceMinor).sort(), ['0', '1299']); assert(snapshot.skus.every(sku => sku.priceVersion === 3 && sku.unit === 'PACK'));
      assert(!('active' in snapshot.skus[0])); assert(!('publishedPrices' in snapshot));
    });
    await t.test('later draft/name/category/price edits and SKU deactivation do not alter the published snapshot', async () => {
      const before = (await visible()).items;
      body.version = 3; body.name = '仅草稿新名称'; body.skus[0].priceMinor = '2599'; body.skus[1].active = false;
      assert.equal((await write(productPath, body)).status, 200);
      assert.equal((await write('admin/catalog/categories/' + categoryId, { version: 1, name: '新分类草稿配置', sort: 2, active: true, reason: 'catalog_change' })).status, 200);
      assert.deepEqual((await visible()).items, before);
      const draft = (await call(productPath, reader)).body.data; assert.equal(draft.version, 4); assert.equal(draft.publishedName, '隔离测试商品');
      assert.equal(draft.publishedPrices.find(sku => sku.id === body.skus[0].id).priceMinor, '1299');
      assert.equal((await action(3)).status, 409);
    });
    await t.test('audit failure rolls back draft prices, new publication prices/pointer and every successful audit', async () => {
      class FailingAudit extends AuditService { async append(context, input) { const id = await super.append(context, input); if (input.action === 'catalog.draft_saved' || input.action === 'catalog.published') throw new Error('fixture catalog audit rollback'); return id; } }
      const failing = new CatalogService(database, admins, new FailingAudit(), storefront, pricing);
      const before = await catalog.get(operator.principal, productId), oldPublic = await visible();
      const count = async () => (await pool.query('SELECT count(*)::int n FROM audit_log WHERE "requestId"=$1', [trace])).rows[0].n;
      const audits = await count();
      await assert.rejects(failing.save(operator.principal, productId, { ...body, version: 4, skus: body.skus.map(sku => ({ ...sku, priceMinor: '99' })) }, trace), /fixture catalog audit rollback/);
      await assert.rejects(failing.publication(operator.principal, productId, { version: 4, reason: 'publication_change' }, true, trace), /fixture catalog audit rollback/);
      assert.deepEqual(await catalog.get(operator.principal, productId), before); assert.deepEqual(await visible(), oldPublic); assert.equal(await count(), audits);
      assert.equal((await pool.query('SELECT count(*)::int n FROM catalog_publication WHERE product_id=$1', [productId])).rows[0].n, 1);
      assert.equal((await pool.query('SELECT count(*)::int n FROM sku_price_version WHERE product_id=$1', [productId])).rows[0].n, 2);
    });
    await t.test('republishing switches the whole snapshot, leaving immutable history and audit amount facts', async () => {
      const saved = await action(4); assert.equal(saved.status, 200); product = saved.body.data.product;
      const snapshot = (await visible()).items[0]; assert.equal(snapshot.version, 5); assert.equal(snapshot.name, '仅草稿新名称');
      assert.equal(snapshot.category.name, '新分类草稿配置'); assert.equal(snapshot.skus.length, 1); assert.equal(snapshot.skus[0].priceMinor, '2599');
      const old = (await pool.query('SELECT price_minor::text FROM sku_price_version WHERE product_id=$1 AND version=3 ORDER BY price_minor', [productId])).rows;
      assert.deepEqual(old.map(row => row.price_minor), ['0', '1299']);
      const records = (await pool.query('SELECT changes FROM audit_log WHERE "requestId"=$1 AND action=$2', [trace, 'pricing.published'])).rows;
      assert(records.some(row => row.changes.priceMinor === '2599')); assert(!JSON.stringify(records).includes(body.name));
    });
    await t.test('classification archival blocks future publication but does not silently change old snapshots', async () => {
      assert.equal((await write('admin/catalog/categories/' + categoryId, { version: 2, name: '归档分类', sort: 2, active: false, reason: 'catalog_change' })).status, 200);
      assert.equal((await action(5)).status, 409); assert.equal((await visible()).items.length, 1);
      assert.equal((await write('admin/catalog/categories/' + categoryId, { version: 3, name: '恢复分类', sort: 2, active: true, reason: 'catalog_change' })).status, 200);
    });
    await t.test('an all-disabled draft cannot publish an empty product or expose prices', async () => {
      const value = { ...body, version: 0, name: '停用规格隔离商品', skus: [{ ...makeSku('停用包装', '1'), active: false }] };
      assert.equal((await write('admin/catalog/products/' + missingId, value)).status, 200);
      const result = await write('admin/catalog/products/' + missingId + '/publish', { version: 1, reason: 'publication_change' }, operator, 'POST');
      assert.equal(result.status, 409); assert(!(await visible()).items.some(item => item.id === missingId));
      assert.equal((await pool.query('SELECT count(*)::int n FROM catalog_publication WHERE product_id=$1', [missingId])).rows[0].n, 0);
      value.version = 1; value.skus.push(makeSku('新增固定包装', '399'));
      assert.equal((await write('admin/catalog/products/' + missingId, value)).status, 200);
      assert.equal((await write('admin/catalog/products/' + missingId + '/publish', { version: 2, reason: 'publication_change' }, operator, 'POST')).status, 200);
      const added = (await visible()).items.find(item => item.id === missingId); assert.equal(added.skus.length, 1); assert.equal(added.skus[0].id, value.skus[1].id);
      assert.equal((await write('admin/catalog/products/' + missingId + '/withdraw', { version: 3, reason: 'publication_change' }, operator, 'POST')).status, 200);
    });
    await t.test('public keyset pages are stable and never include unpublished products', async () => {
      const second = { ...body, version: 0, name: '另一个隔离商品', skus: [makeSku('默认包装', '999999999999')] };
      assert.equal((await write('admin/catalog/products/' + secondId, second)).status, 200);
      assert.equal((await call('app/products?limit=1')).body.data.hasMore, false, 'draft excluded');
      assert.equal((await write('admin/catalog/products/' + secondId + '/publish', { version: 1, reason: 'publication_change' }, operator, 'POST')).status, 200);
      const first = (await call('app/products?limit=1')).body.data; assert.equal(first.items.length, 1); assert.equal(first.hasMore, true);
      const secondPage = (await call('app/products?limit=1&cursor=' + first.nextCursor)).body.data;
      assert.equal(secondPage.items.length, 1); assert.equal(secondPage.hasMore, false); assert.notEqual(first.items[0].id, secondPage.items[0].id);
      const listed = (await call('admin/catalog?limit=1', operator)).body.data; assert.equal(listed.hasMore, true); assert.equal(listed.items.length, 1);
    });
    await t.test('database enforces fixed units, nonnegative amounts and publication/SKU ownership', async () => {
      await assert.rejects(pool.query('UPDATE catalog_sku SET unit=$1 WHERE id=$2', ['GRAM', body.skus[0].id]), error => error.code === '23514');
      await assert.rejects(pool.query('UPDATE sku_price_draft SET price_minor=-1 WHERE sku_id=$1', [body.skus[0].id]), error => error.code === '23514');
      await assert.rejects(pool.query('UPDATE sku_price_version SET price_minor=1000000000000 WHERE product_id=$1', [productId]), error => error.code === '23514');
      await assert.rejects(pool.query('INSERT INTO catalog_published_sku(product_id,version,sku_id) VALUES($1,5,$2)', [productId, skuIds.at(-1)]), error => error.code === '23503');
    });
    await t.test('restart preserves live snapshots, withdrawal removes immediately and revoked sessions cannot edit', async () => {
      await stop(); await start(); assert.equal((await visible()).items.length, 2);
      const results = await Promise.all([action(5, false), action(5, false)]); assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert(!(await visible()).items.some(item => item.id === productId)); assert.equal((await call(productPath, operator)).body.data.version, 6);
      await admins.update(manager.principal, account.id, { version: account.version, status: 'ACTIVE', grants: [], reason: 'access_change' }, trace);
      assert.equal((await action(6)).status, 401); assert.equal((await call(productPath, operator)).status, 401); assert(!output.includes(password));
    });
  } finally {
    await stop();
    try {
      // Only random IDs owned by this test are removed; no clearing tables or preexisting data.
      await pool.query('UPDATE catalog_product SET published_version=NULL WHERE id=ANY($1::uuid[])', [productIds]);
      await pool.query('DELETE FROM sku_price_version WHERE product_id=ANY($1::uuid[])', [productIds]);
      await pool.query('DELETE FROM catalog_published_sku WHERE product_id=ANY($1::uuid[])', [productIds]);
      await pool.query('DELETE FROM catalog_publication WHERE product_id=ANY($1::uuid[])', [productIds]);
      await pool.query('DELETE FROM sku_price_draft WHERE sku_id=ANY($1::uuid[])', [skuIds]);
      await pool.query('DELETE FROM catalog_sku WHERE product_id=ANY($1::uuid[])', [productIds]);
      await pool.query('DELETE FROM catalog_product WHERE id=ANY($1::uuid[])', [productIds]);
      await pool.query('DELETE FROM catalog_category WHERE id=$1', [categoryId]);
      if (ownedStore) { await pool.query('DELETE FROM store_fulfillment_draft WHERE store_id=$1', [onlineSalesScopeId]); await pool.query('DELETE FROM store WHERE id=$1', [onlineSalesScopeId]); }
      const ids = (await pool.query('SELECT id FROM admin_account WHERE username LIKE $1', [prefix + '%'])).rows.map(row => row.id);
      await pool.query('DELETE FROM admin_session WHERE admin_id=ANY($1::uuid[])', [ids]); await pool.query('DELETE FROM admin_grant WHERE admin_id=ANY($1::uuid[])', [ids]); await pool.query('DELETE FROM admin_account WHERE id=ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM audit_log WHERE "requestId"=$1 OR ("objectType"=$2 AND "objectId"=ANY($3::text[]))', [trace, 'admin', ids]);
    } finally { await database.close(); await pool.end(); }
  }
});
