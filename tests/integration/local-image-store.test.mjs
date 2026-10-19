import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import foundation from '../../packages/server-modules/dist/index.js';
const { LocalImageStore } = foundation;
// Signature-only fixture, deliberately NOT evidence of decoded/scanned image safety.
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
test('private image quarantine rejects production, unsafe paths, types and oversized data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lingyu-image-'));
  try {
    for (const environment of ['production', '', 'staging']) assert.throws(() => new LocalImageStore(environment, join(root, 'images')), /LOCAL_IMAGE_STORE_UNAVAILABLE/);
    const previous = process.env.NODE_ENV;
    try { process.env.NODE_ENV = 'production'; assert.throws(() => new LocalImageStore('development',join(root,'images'))); }
    finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
    for (const path of ['/', 'relative/images']) assert.throws(() => new LocalImageStore('test', path));
    const store = new LocalImageStore('test', join(root, 'images'));
    for (const [bytes, mime] of [[Buffer.from('<svg/>'),'image/png'], [png,'image/jpeg'], [png,'image/svg+xml'], [Buffer.alloc(2097153),'image/png']]) await assert.rejects(store.put(bytes,mime), /LOCAL_IMAGE_STORE_UNAVAILABLE/);
    for (const key of ['../secret', '/etc/passwd', 'x.png']) await assert.rejects(store.read(key));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('quarantine deduplicates completed writes but never promotes them to READY or masks corruption', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lingyu-image-'));
  try {
    const directory = join(root,'images'), store = new LocalImageStore('test',directory);
    const result = await store.put(png,'image/png'); assert.equal(result.scanStatus,'UNVERIFIED'); assert.equal(result.developmentOnly,true);
    assert.deepEqual(await store.read(result.key),png); assert.deepEqual(await store.put(png,'image/png'),result);
    assert((await Promise.all(Array.from({length:8},()=>store.put(png,'image/png')))).every(item=>item.key===result.key));
    if (process.platform !== 'win32') assert.equal((await stat(join(directory,result.key))).mode & 0o077,0);
    await writeFile(join(directory,result.key),Buffer.from('corrupt'));
    await assert.rejects(store.read(result.key), /LOCAL_IMAGE_STORE_UNAVAILABLE/); await assert.rejects(store.put(png,'image/png'));
    await mkdir(join(root,'target'),{mode:0o700}); await symlink(join(root,'target'),join(root,'link'),'dir');
    await assert.rejects(new LocalImageStore('test',join(root,'link')).put(png,'image/png'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
