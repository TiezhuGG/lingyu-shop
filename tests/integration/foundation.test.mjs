import test from 'node:test';
import assert from 'node:assert/strict';
import foundation from '../../packages/server-modules/dist/index.js';
const { parseBackendConfig } = foundation;
const valid = {
  NODE_ENV: 'development', DATABASE_URL: 'postgresql://user:secret@localhost:15432/lingyu_shop',
  AUTH_ACCESS_SIGNING_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  AUTH_REFRESH_TOKEN_PEPPER: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
};

test('backend configuration rejects absent, PoC, test leakage and malformed values without credentials', () => {
  assert.equal(parseBackendConfig(valid).poolMax, 5);
  assert(Object.isFrozen(parseBackendConfig(valid)));
  for (const env of [
    {}, { ...valid, NODE_ENV: 'staging' }, { ...valid, DATABASE_URL: undefined },
    { ...valid, DATABASE_URL: 'postgresql://user:secret@localhost/lingyu_shop_poc' },
    { ...valid, DATABASE_URL: valid.DATABASE_URL + '?schema=other' },
    { ...valid, NODE_ENV: 'test' }, { ...valid, DATABASE_URL: valid.DATABASE_URL + '_test' },
    { ...valid, DB_POOL_MAX: '0' }, { ...valid, DB_POOL_MAX: '21' },
    { ...valid, DB_TIMEOUT_MS: 'NaN' }, { ...valid, SHUTDOWN_TIMEOUT_MS: '0' },
    { ...valid, PORT: '65536' }, { ...valid, PORT: '1.5' },
    { ...valid, AUTH_ACCESS_SIGNING_KEY: 'too-short' }, { ...valid, AUTH_REFRESH_TOKEN_PEPPER: undefined },
    { ...valid, AUTH_REFRESH_TOKEN_PEPPER: valid.AUTH_ACCESS_SIGNING_KEY },
    { ...valid, AUTH_DEVELOPMENT_LOGIN_ENABLED: 'yes' }, { ...valid, NODE_ENV: 'production', AUTH_DEVELOPMENT_LOGIN_ENABLED: 'true' },
  ]) assert.throws(() => parseBackendConfig(env), error => {
    assert.match(error.message, /^Invalid configuration: [A-Z_]+$/);
    assert(!error.message.includes('secret'));
    return true;
  });
  assert.equal(parseBackendConfig({ ...valid, NODE_ENV: 'test', DATABASE_URL: valid.DATABASE_URL + '_test' }).environment, 'test');
  assert.equal(parseBackendConfig({ ...valid, AUTH_DEVELOPMENT_LOGIN_ENABLED: 'true' }).authentication.developmentLoginEnabled, true);
});
