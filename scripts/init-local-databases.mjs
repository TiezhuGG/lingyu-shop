import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { Pool } from 'pg';
import { assertPocDatabaseUrl } from './lib/poc-database-url.mjs';
if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') throw new Error('Local initialization requires development environment');
const url = new URL(assertPocDatabaseUrl(process.env.POC_DATABASE_URL));
if (url.port !== '15432' || url.username !== 'lingyu_dev') throw new Error('Local Compose administrator URL required');
const pool = new Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 3000 });
try {
  for (const name of ['lingyu_shop', 'lingyu_shop_test']) {
    const exists = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    // Names come exclusively from the fixed allowlist above, never from user input.
    if (!exists.rowCount) await pool.query('CREATE DATABASE "' + name + '"');
    console.log('Database available: ' + name);
  }
  const content = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
  if (existsSync('.env') && !/^DATABASE_URL=/m.test(content)) {
    url.pathname = '/lingyu_shop';
    appendFileSync('.env', '\n' + (/^NODE_ENV=/m.test(content) ? '' : 'NODE_ENV=development\n') + 'DATABASE_URL=' + url.toString() + '\n');
    console.log('Added local business configuration to ignored .env; credentials withheld.');
  }
} finally { await pool.end(); }
