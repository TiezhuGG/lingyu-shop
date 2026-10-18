import { BadRequestException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
let calculations = 0;
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (calculations >= 2) throw new HttpException('Busy', HttpStatus.TOO_MANY_REQUESTS);
  calculations += 1;
  try {
    return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, options, (error, value) => error ? reject(error) : resolve(value)));
  } finally { calculations -= 1; }
}
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function hashAdminPassword(password: string): Promise<string> {
  // Match JSON Schema minLength/maxLength (Unicode code points, not UTF-16 units).
  if (typeof password !== 'string' || [...password].length < 12 || [...password].length > 128) throw new BadRequestException();
  const salt = randomBytes(16);
  return 'scrypt-v1$' + salt.toString('hex') + '$' + (await derive(password, salt)).toString('hex');
}
export async function verifyAdminPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = stored?.split('$');
  const valid = parts?.length === 3 && parts[0] === 'scrypt-v1' && /^[a-f0-9]{32}$/.test(parts[1]!) && /^[a-f0-9]{128}$/.test(parts[2]!);
  const salt = valid ? Buffer.from(parts![1]!, 'hex') : Buffer.alloc(16);
  const result = await derive(password, salt);
  return !!valid && safeEqual(result.toString('hex'), parts![2]!);
}
export const adminDigest = (value: string): string => createHash('sha256').update(value).digest('hex');
export const adminCsrf = (cookie: string): string => createHmac('sha256', cookie).update('lingyu-admin-csrf-v1').digest('base64url');
export function adminSessionId(cookie: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/.test(cookie)) throw new UnauthorizedException();
  return cookie.slice(0, 36);
}
