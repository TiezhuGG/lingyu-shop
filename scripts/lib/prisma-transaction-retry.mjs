import { setTimeout as delay } from 'node:timers/promises';

// PoC only. Production transaction ownership is implemented in T01-D.
export function isRetryableTransactionError(error) {
  if (error === null || typeof error !== 'object') return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010') return false;
  if (['40001', '40P01'].includes(error.meta?.code)) return true;
  // Prisma 7.10 adapter-pg wraps raw-query SQLSTATE here (verified with real deadlock).
  const cause = error.meta?.driverAdapterError?.cause;
  return cause?.kind === 'TransactionWriteConflict' && ['40001', '40P01'].includes(cause.originalCode);
}

export async function retryTransaction(run, { attempts = 3, backoffMs = 25, onRetry = () => {} } = {}) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new RangeError('Transaction attempts must be between 1 and 5');
  }
  if (!Number.isSafeInteger(backoffMs) || backoffMs < 0 || backoffMs > 1000) {
    throw new RangeError('Invalid transaction backoff');
  }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run(attempt);
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === attempts) throw error;
      onRetry({ attempt, code: error.code });
      await delay(backoffMs * attempt);
    }
  }
}
