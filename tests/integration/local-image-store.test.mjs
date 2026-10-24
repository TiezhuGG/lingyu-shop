import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
    const invalid = ['/', 'relative/images', parse(root).root];
    if (process.platform === 'win32') invalid.push('C:images', '\\images', '\\\\localhost\\share\\images', '\\\\?\\C:\\images');
    for (const path of invalid) assert.throws(() => new LocalImageStore('test', path));
    const store = new LocalImageStore('test', join(root, 'images'));
    for (const [bytes, mime] of [[Buffer.from('<svg/>'),'image/png'], [png,'image/jpeg'], [png,'image/svg+xml'], [Buffer.alloc(2097153),'image/png']]) await assert.rejects(store.put(bytes,mime), /LOCAL_IMAGE_STORE_UNAVAILABLE/);
    for (const key of ['../secret', '/etc/passwd', 'x.png']) await assert.rejects(store.read(key));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('quarantine rejects linked ancestors and linked files even with matching content hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lingyu-image-links-'));
  try {
    const target = join(root, 'target');
    await mkdir(target, { mode: 0o700 });
    const alias = join(root, 'alias');
    await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(new LocalImageStore('test', join(alias, 'nested')).put(png, 'image/png'), /LOCAL_IMAGE_STORE_UNAVAILABLE/);
    await assert.rejects(stat(join(target, 'nested')), { code: 'ENOENT' });
    const directory = join(root, 'images'), store = new LocalImageStore('test', directory);
    const result = await store.put(png, 'image/png');
    const external = join(root, 'outside.png');
    await writeFile(external, png);
    await rm(join(directory, result.key));
    await symlink(external, join(directory, result.key), 'file');
    await assert.rejects(store.read(result.key), /LOCAL_IMAGE_STORE_UNAVAILABLE/);
    await assert.rejects(store.put(png, 'image/png'), /LOCAL_IMAGE_STORE_UNAVAILABLE/);
    assert.deepEqual(await (await import('node:fs/promises')).readFile(external), png);
  } finally { await rm(root, { recursive: true, force: true }); }
});

if (process.platform === 'win32') {
  const run = promisify(execFile);
  const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  async function acl(path, script) {
    const result = await run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ErrorActionPreference='Stop'; " + script, 'utf16le').toString('base64')], {
      env: { ...process.env, LINGYU_ACL_TEST_PATH: path }, windowsHide: true, timeout: 10000,
    });
    return result.stdout.trim();
  }
  test('Windows quarantine accepts short/case aliases, protects new directories and refuses broad existing ACLs without rewriting them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lingyu-image-acl-'));
    try {
      const directory = join(root, 'images');
      const store = new LocalImageStore('test', directory.toUpperCase());
      const result = await store.put(png, 'image/png');
      assert.deepEqual(await new LocalImageStore('test', directory).read(result.key), png);
      const broad = join(root, 'broad');
      await mkdir(broad);
      // Default inherited ACL is deliberately not accepted as a private quarantine.
      const sddl = '[System.IO.Directory]::GetAccessControl($env:LINGYU_ACL_TEST_PATH).Sddl';
      const before = await acl(broad, sddl);
      await assert.rejects(new LocalImageStore('test', broad).put(png, 'image/png'), /LOCAL_IMAGE_STORE_UNAVAILABLE/);
      assert.equal(await acl(broad, sddl), before);
      const file = join(directory, result.key);
      await acl(file, `
        $acl = [System.IO.File]::GetAccessControl($env:LINGYU_ACL_TEST_PATH)
        $world = [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0')
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($world, 'Read', 'Allow'))
        [System.IO.File]::SetAccessControl($env:LINGYU_ACL_TEST_PATH, $acl)
      `);
      await assert.rejects(store.read(result.key), /LOCAL_IMAGE_STORE_UNAVAILABLE/);
      await assert.rejects(store.put(png, 'image/png'), /LOCAL_IMAGE_STORE_UNAVAILABLE/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
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
