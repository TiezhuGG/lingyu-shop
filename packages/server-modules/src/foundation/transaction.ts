import { Prisma } from '../../generated';
import type { AuditAppendInput, AuditAppender, AuditSource } from './audit';

export class TransactionUnavailableError extends Error {
  constructor() { super('Transaction unavailable'); }
}

/** A single callback attempt; it becomes invalid as soon as the callback settles. */
export class TransactionContext {
  #active = true;

  constructor(
    readonly attempt: number,
    readonly source: AuditSource,
    private readonly appendAuditRecord: AuditAppender,
  ) {}

  async appendAudit(input: AuditAppendInput): Promise<string> {
    if (!this.#active) throw new TransactionUnavailableError();
    return this.appendAuditRecord(input);
  }

  invalidate(): void { this.#active = false; }
}

export function isRetryableTransactionError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; meta?: { code?: unknown; driverAdapterError?: { cause?: { kind?: unknown; originalCode?: unknown } } } };
  if (candidate.code === 'P2034') return true;
  if (candidate.code !== 'P2010') return false;
  if (candidate.meta?.code === '40001' || candidate.meta?.code === '40P01') return true;
  const cause = candidate.meta?.driverAdapterError?.cause;
  return cause?.kind === 'TransactionWriteConflict' && (cause.originalCode === '40001' || cause.originalCode === '40P01');
}

export async function retryTransaction<T>(
  run: (attempt: number) => Promise<T>,
  options: { attempts?: number; backoffMs?: number; onRetry?: (attempt: number) => void } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const backoffMs = options.backoffMs ?? 25;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 3) throw new RangeError('Transaction attempts must be between 1 and 3');
  if (!Number.isSafeInteger(backoffMs) || backoffMs < 0 || backoffMs > 1000) throw new RangeError('Invalid transaction backoff');
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await run(attempt); }
    catch (error) {
      if (!isRetryableTransactionError(error) || attempt === attempts) throw error;
      options.onRetry?.(attempt);
      await new Promise<void>(resolve => setTimeout(resolve, backoffMs * attempt));
    }
  }
  throw new Error('Transaction retry exhausted');
}

export const serializableTransactionOptions = Object.freeze({
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
});
