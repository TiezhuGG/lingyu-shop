import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const source = new URL(process.env.POC_DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(source.hostname) || source.port !== '15432' || source.pathname !== '/lingyu_shop_poc') {
  throw new Error('Only dedicated local Compose tests are allowed');
}
const testUrl = new URL(source);
testUrl.pathname = '/lingyu_shop_test';
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: testUrl.toString() };
const prisma = resolve('node_modules/prisma/build/index.js');
const config = resolve('packages/server-modules/prisma.config.ts');

execFileSync(process.execPath, [prisma, 'migrate', 'deploy', '--config', config], { env, stdio: 'inherit' });
execFileSync(process.execPath, ['--test', '--test-concurrency=1', 'tests/integration/foundation-database.test.mjs', 'tests/integration/identity-database.test.mjs', 'tests/integration/admin-database.test.mjs', 'tests/integration/storefront-database.test.mjs', 'tests/integration/catalog-database.test.mjs'], { env, stdio: 'inherit' });
