import test from 'node:test';
import assert from 'node:assert/strict';
import foundation from '../../packages/server-modules/dist/index.js';

const { TransactionContext, TransactionUnavailableError, isRetryableTransactionError, retryTransaction } = foundation;

test('transaction retry only accepts verified conflict shapes and is bounded', async () => {
  for (const error of [
    { code: 'P2034' },
    { code: 'P2010', meta: { code: '40P01' } },
    { code: 'P2010', meta: { driverAdapterError: { cause: { kind: 'TransactionWriteConflict', originalCode: '40001' } } } },
  ]) assert.equal(isRetryableTransactionError(error), true);
  for (const error of [null, { code: 'P1001' }, { code: 'P2002' }, { code: 'P2010', meta: { code: '23514' } }, { code: 'P2010', meta: { driverAdapterError: { cause: { kind: 'CheckConstraintViolation', originalCode: '40P01' } } } }]) {
    assert.equal(isRetryableTransactionError(error), false);
  }
  let calls = 0;
  const result = await retryTransaction(async attempt => {
    calls += 1;
    if (attempt < 3) throw { code: 'P2034' };
    return 'committed';
  }, { backoffMs: 0 });
  assert.equal(result, 'committed');
  assert.equal(calls, 3);
  await assert.rejects(retryTransaction(async () => { throw { code: 'P2034' }; }, { backoffMs: 0 }), error => error?.code === 'P2034');
});

test('transaction context cannot append after its callback lifetime', async () => {
  const context = new TransactionContext(1, 'API', async () => 'audit-id');
  assert.equal(await context.appendAudit({ action: 'test.create', objectType: 'test', objectId: '1' }), 'audit-id');
  context.invalidate();
  await assert.rejects(context.appendAudit({ action: 'test.create', objectType: 'test', objectId: '1' }), TransactionUnavailableError);
});
