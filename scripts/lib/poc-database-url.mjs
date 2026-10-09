import assert from 'node:assert/strict';

export function assertPocDatabaseUrl(input) {
  assert(typeof input === 'string' && input.length > 0, 'Set POC_DATABASE_URL for the dedicated loopback database');
  let url;
  try { url = new URL(input); } catch { throw Error('Invalid POC_DATABASE_URL format'); }
  assert(['postgresql:', 'postgres:'].includes(url.protocol), 'PoC requires the PostgreSQL protocol');
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'PoC refuses non-loopback servers');
  assert(url.pathname === '/lingyu_shop_poc', 'PoC refuses any database except lingyu_shop_poc');
  assert(!url.search && !url.hash, 'PoC refuses connection options, schema overrides or fragments');
  return input;
}
