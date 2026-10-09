import assert from 'node:assert/strict';
import test from 'node:test';
import { isRetryableTransactionError, retryTransaction } from '../../scripts/lib/prisma-transaction-retry.mjs';
import { assertPocDatabaseUrl } from '../../scripts/lib/poc-database-url.mjs';

test('PoC accepts only a dedicated loopback PostgreSQL target and never leaks malformed credentials', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const value = `postgresql://test:secret@${host}:15432/lingyu_shop_poc`;
    assert.equal(assertPocDatabaseUrl(value), value);
  }
  for (const value of [undefined, '', 'secret invalid url', 'postgresql://test:secret@remote.invalid/lingyu_shop_poc', 'postgresql://test:secret@localhost/business', 'postgresql://test:secret@localhost/lingyu_shop_poc?host=remote.invalid', 'postgresql://test:secret@localhost/lingyu_shop_poc?schema=business', 'postgresql://test:secret@localhost/lingyu_shop_poc#override', 'https://test:secret@localhost/lingyu_shop_poc']) {
    assert.throws(() => assertPocDatabaseUrl(value), error => !error.message.includes('secret'));
  }
});

test('transaction retries only structured conflict codes, never message text or constraint errors', () => {
  for (const error of [{ code: 'P2034' }, { code: 'P2010', meta: { code: '40P01' } }, { code: 'P2010', meta: { code: '40001' } }, { code: 'P2010', meta: { driverAdapterError: { cause: { kind: 'TransactionWriteConflict', originalCode: '40P01' } } } }, { code: 'P2010', meta: { driverAdapterError: { cause: { kind: 'TransactionWriteConflict', originalCode: '40001' } } } }]) {
    assert.equal(isRetryableTransactionError(error), true);
  }
  for (const error of [null, 'P2034', Error('40P01 deadlock'), { code: 'P2002' }, { code: 'P2010', meta: { code: '23514' } }, { code: 'P2010' }, { code: 'P1001' }, { code: 'P2010', meta: { driverAdapterError: { cause: { kind: 'CheckConstraintViolation', originalCode: '40P01' } } } }]) {
    assert.equal(isRetryableTransactionError(error), false);
  }
});

test('retry reruns the complete callback and returns only the successful result', async () => {
  const calls = [];
  const retries = [];
  const result = await retryTransaction(async attempt => {
    calls.push(attempt);
    if (attempt === 1) throw { code: 'P2034' };
    return 'committed';
  }, { backoffMs: 0, onRetry: value => retries.push(value) });
  assert.equal(result, 'committed');
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(retries, [{ attempt: 1, code: 'P2034' }]);
});

test('retry is bounded and preserves the final error', async () => {
  const conflict = { code: 'P2034' };
  let calls = 0;
  await assert.rejects(retryTransaction(async () => { calls++; throw conflict; }, { backoffMs: 0 }), error => error === conflict);
  assert.equal(calls, 3);
  const constraint = { code: 'P2002' };
  calls = 0;
  await assert.rejects(retryTransaction(async () => { calls++; throw constraint; }), error => error === constraint);
  assert.equal(calls, 1);
});

test('invalid retry limits fail before any transaction begins', async () => {
  let called = false;
  const run = () => { called = true; };
  await assert.rejects(retryTransaction(run, { attempts: 0 }), RangeError);
  await assert.rejects(retryTransaction(run, { attempts: 6 }), RangeError);
  await assert.rejects(retryTransaction(run, { backoffMs: -1 }), RangeError);
  assert.equal(called, false);
});
