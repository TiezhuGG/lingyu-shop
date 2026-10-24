import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { privateWindowsPath } from './windows-private-path';

const maxBytes = 2 * 1024 * 1024;
const keyPattern = /^[0-9a-f]{64}\.(png|jpg)$/;
export class LocalImageStoreError extends Error {
  constructor() { super('LOCAL_IMAGE_STORE_UNAVAILABLE'); }
}
/** Private development quarantine, NOT a scanner or a public asset repository. */
export class LocalImageStore {
  private readonly directory: string;
  private preparing?: Promise<string>;
  constructor(environment: string, directory: string) {
    const absolute = resolve(directory);
    if (process.env.NODE_ENV === 'production' || !['development', 'test'].includes(environment) || !isAbsolute(directory) || absolute === parse(absolute).root ||
        (process.platform === 'win32' && !/^[a-z]:[\\/]/i.test(directory))) throw new LocalImageStoreError();
    this.directory = resolve(directory);
  }
  private async rejectLinkedParents(directory: string) {
    for (let path = directory; ; path = dirname(path)) {
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new LocalImageStoreError();
      if (path === dirname(path)) break;
    }
  }
  private async prepareDirectory() {
    // Validate existing ancestors before mkdir can follow a junction into another tree.
    let ancestor = this.directory;
    while (true) {
      try { await lstat(ancestor); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || ancestor === dirname(ancestor)) throw error;
        ancestor = dirname(ancestor);
      }
    }
    await this.rejectLinkedParents(ancestor);
    const created = await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await this.rejectLinkedParents(this.directory);
    const info = await lstat(this.directory);
    const canonical = await realpath(this.directory);
    if (process.platform === 'win32') await privateWindowsPath(canonical, true, created !== undefined);
    else if (canonical !== this.directory || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()) throw new LocalImageStoreError();
    return canonical;
  }
  private async prepare() {
    // Wait for pending initialization. Later operations still recheck permissions.
    if (this.preparing) await this.preparing;
    const preparing = this.prepareDirectory();
    this.preparing = preparing;
    try { return await preparing; }
    finally { if (this.preparing === preparing) this.preparing = undefined; }
  }
  private async readFile(directory: string, key: string): Promise<Buffer> {
    const path = join(directory, key);
    const before = await lstat(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink()) throw new LocalImageStoreError();
    if (process.platform === 'win32') await privateWindowsPath(path, false);
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat({ bigint: true });
      if (!info.isFile() || info.dev !== before.dev || info.ino !== before.ino || info.size > BigInt(maxBytes) || info.size === 0n) throw new LocalImageStoreError();
      const value = await handle.readFile();
      if (value.length > maxBytes || createHash('sha256').update(value).digest('hex') !== key.slice(0, 64)) throw new LocalImageStoreError();
      return value;
    } finally { await handle.close(); }
  }
  async put(input: Uint8Array, mime: 'image/png' | 'image/jpeg') {
    try {
      if (!(input instanceof Uint8Array) || input.byteLength === 0 || input.byteLength > maxBytes) throw new LocalImageStoreError();
      const bytes = Buffer.from(input);
      const png = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR';
      const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
      if (!(mime === 'image/png' && png) && !(mime === 'image/jpeg' && jpeg)) throw new LocalImageStoreError();
      const directory = await this.prepare();
      const key = createHash('sha256').update(bytes).digest('hex') + (mime === 'image/png' ? '.png' : '.jpg');
      // Publish a fully written inode atomically without replacing an existing destination.
      const temporary = join(directory, '.upload-' + randomUUID());
      const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      try {
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        try { await link(temporary, join(directory, key)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      } finally { await unlink(temporary); }
      if (!(await this.readFile(directory, key)).equals(bytes)) throw new LocalImageStoreError();
      return { key, mime, size: bytes.length, scanStatus: 'UNVERIFIED' as const, developmentOnly: true as const };
    } catch { throw new LocalImageStoreError(); }
  }
  async read(key: string): Promise<Buffer> {
    try {
      if (!keyPattern.test(key)) throw new LocalImageStoreError();
      const directory = await this.prepare();
      return await this.readFile(directory, key);
    } catch { throw new LocalImageStoreError(); }
  }
}
