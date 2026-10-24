import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import foundation from '../../packages/server-modules/dist/index.js';
const sharp = createRequire(new URL('../../packages/server-modules/package.json', import.meta.url))('sharp');
const { parseAssetIssue, parseAssetBytes, parseAssetEmpty, parseAssetId, parseAssetRevoke, parseAssetList, imageDigest, DevelopmentImageInspection, AssetService, hasAdminPermission, parseBackendConfig } = foundation;
const directory = resolve('.local-tools/asset-unit-not-created');
const config = { values: { environment: 'test', assetDirectory: directory } };
const input = { uploadId: randomUUID(), purpose: 'CMS_IMAGE', mime: 'image/png', size: 10, sha256: 'a'.repeat(64) };
test('asset contracts reject forged ownership, state, file keys and unsupported upload manifests', () => {
  assert.deepEqual(parseAssetIssue(input), input);
  for (const patch of [{ ownerId: randomUUID() }, { storeId: randomUUID() }, { status: 'READY' }, { key: '../other.png' }, { size: 0 }, { size: 2097153 }, { size: 1.5 }, { mime: 'image/svg+xml' }, { purpose: 'CUSTOMER_EVIDENCE' }, { sha256: 'A'.repeat(64) }]) assert.throws(() => parseAssetIssue({ ...input, ...patch }));
  for (const id of ['../x', '', null, undefined]) assert.throws(() => parseAssetId(id));
  assert.equal(parseAssetId(input.uploadId), input.uploadId);
  assert.throws(() => parseAssetRevoke({ version: 0 })); assert.throws(() => parseAssetEmpty({ status: 'READY' })); assert.throws(() => parseAssetList({ ownerId: 'other' }));
});
test('asset base64 is canonical, bounded, and cannot disguise trailing or oversized bytes', () => {
  assert.deepEqual(parseAssetBytes({ dataBase64: 'YQ==' }), Buffer.from('a'));
  for (const dataBase64 of ['', 'YQ', 'YR==', 'YQ===', 'Y Q==', 'data:image/png;base64,YQ==', Buffer.alloc(2097153).toString('base64')]) assert.throws(() => parseAssetBytes({ dataBase64 }));
  assert.equal(imageDigest(Buffer.from('a')), 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
});
test('development inspection fully decodes, strips metadata/trailing payload and never claims production clearance', async () => {
  const inspector = new DevelopmentImageInspection(config);
  const jpeg = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#c0ffee' } }).withMetadata({ exif: { IFD0: { Copyright: 'isolated fixture metadata' } } }).jpeg().toBuffer();
  assert((await sharp(jpeg).metadata()).exif);
  const result = await inspector.inspect(jpeg, 'image/jpeg'), metadata = await sharp(result.bytes).metadata();
  assert.equal(result.developmentOnly, true); assert.equal(result.width, 3); assert.equal(result.height, 2); assert.equal(metadata.format, 'png'); assert.equal(metadata.exif, undefined);
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
  const cleaned = await inspector.inspect(Buffer.concat([png, Buffer.from('<script>fixture</script>')]), 'image/png');
  assert(!cleaned.bytes.includes(Buffer.from('<script>fixture</script>')));
});
test('development inspection refuses corrupt, wrong format, excessive dimensions and production/missing configuration', async () => {
  const inspector = new DevelopmentImageInspection(config);
  const oversized = await sharp({ create: { width: 4097, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
  for (const bytes of [Buffer.from('not an image'), oversized, Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')]) await assert.rejects(inspector.inspect(bytes, 'image/png'), e => e.getStatus() === 400);
  const jpeg = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } }).jpeg().toBuffer();
  await assert.rejects(inspector.inspect(jpeg, 'image/png'), e => e.getStatus() === 400);
  for (const values of [{ environment: 'production', assetDirectory: directory }, { environment: 'test' }]) {
    await assert.rejects(new DevelopmentImageInspection({ values }).inspect(jpeg, 'image/jpeg'), e => e.getStatus() === 503);
    await assert.rejects(new AssetService({ values }).issue({}, input), e => e.getStatus() === 503);
  }
});
test('asset permissions remain scoped and production configuration cannot enable local storage', () => {
  const scope = randomUUID();
  assert(hasAdminPermission([{ role: 'STORE_OPERATOR', scopeKey: scope }], 'asset.upload', scope));
  assert(!hasAdminPermission([{ role: 'STORE_READER', scopeKey: scope }], 'asset.upload', scope));
  assert(!hasAdminPermission([{ role: 'IAM_MANAGER', scopeKey: 'GLOBAL' }], 'asset.read', scope));
  const env = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:example@127.0.0.1:15432/lingyu_shop', AUTH_ACCESS_SIGNING_KEY: 'A'.repeat(43), AUTH_REFRESH_TOKEN_PEPPER: 'B'.repeat(43), ADMIN_ORIGIN: 'https://example.test' };
  assert.throws(() => parseBackendConfig({ ...env, ASSET_LOCAL_DIRECTORY: directory }), /ASSET_LOCAL_DIRECTORY/);
  assert.throws(() => parseBackendConfig({ ...env, NODE_ENV: 'test', DATABASE_URL: env.DATABASE_URL + '_test', ASSET_LOCAL_DIRECTORY: '/' }), /ASSET_LOCAL_DIRECTORY/);
});
