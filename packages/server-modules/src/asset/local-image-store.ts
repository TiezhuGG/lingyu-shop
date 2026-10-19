import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, join, parse, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const maxBytes = 2 * 1024 * 1024;
const keyPattern = /^[0-9a-f]{64}\.(png|jpg)$/;
export class LocalImageStoreError extends Error {
  constructor() { super('LOCAL_IMAGE_STORE_UNAVAILABLE'); }
}
/** Private development quarantine, NOT a scanner or a public asset repository. */
export class LocalImageStore {
  private readonly directory: string;
  constructor(environment: string, directory: string) {
    if (process.env.NODE_ENV === 'production' || !['development', 'test'].includes(environment) || !isAbsolute(directory) || resolve(directory) === parse(directory).root) throw new LocalImageStoreError();
    this.directory = resolve(directory);
  }
  private async prepare() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(this.directory) !== this.directory ||
        (process.platform !== 'win32' && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()))) throw new LocalImageStoreError();
  }
  private async readFile(key: string): Promise<Buffer> {
    const handle = await open(join(this.directory, key), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > maxBytes || info.size === 0) throw new LocalImageStoreError();
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
      await this.prepare();
      const key = createHash('sha256').update(bytes).digest('hex') + (mime === 'image/png' ? '.png' : '.jpg');
      // Publish a fully written inode atomically without replacing an existing destination.
      const temporary = join(this.directory, '.upload-' + randomUUID());
      const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try {
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        try { await link(temporary, join(this.directory, key)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      } finally { await unlink(temporary); }
      if (!(await this.readFile(key)).equals(bytes)) throw new LocalImageStoreError();
      return { key, mime, size: bytes.length, scanStatus: 'UNVERIFIED' as const, developmentOnly: true as const };
    } catch { throw new LocalImageStoreError(); }
  }
  async read(key: string): Promise<Buffer> {
    try {
      if (!keyPattern.test(key)) throw new LocalImageStoreError();
      await this.prepare();
      return await this.readFile(key);
    } catch { throw new LocalImageStoreError(); }
  }
}
