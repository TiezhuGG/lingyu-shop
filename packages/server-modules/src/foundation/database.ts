import { Injectable, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../generated';
import { BackendConfigService } from './config';
import { createAuditAppender } from './audit';
import { retryTransaction, serializableTransactionOptions, TransactionContext, TransactionUnavailableError } from './transaction';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly pool: Pool;
  private readonly client: PrismaClient;
  private draining = false;
  private closed?: Promise<void>;
  private readonly transactions = new Set<Promise<unknown>>();

  constructor(private readonly config: BackendConfigService) {
    const values = config.values;
    this.pool = new Pool({
      connectionString: values.databaseUrl, max: values.poolMax,
      connectionTimeoutMillis: values.databaseTimeoutMs,
      statement_timeout: values.databaseTimeoutMs,
      idleTimeoutMillis: 10000,
      application_name: 'lingyu-' + config.service + '-' + process.pid,
    });
    this.pool.on('error', () => console.error('DATABASE_POOL_ERROR'));
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });
  }
  async onModuleInit(): Promise<void> {
    try {
      await this.client.$connect();
      if (!await this.isReady()) throw new Error('unavailable');
    } catch {
      await this.close();
      throw new Error('DATABASE_STARTUP_FAILED');
    }
  }
  beginDrain(): void { this.draining = true; }
  async runInTransaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    if (this.draining) throw new TransactionUnavailableError();
    const transaction = retryTransaction(async attempt => this.client.$transaction(async client => {
      if (this.draining) throw new TransactionUnavailableError();
      const source = this.serviceSource();
      const context = new TransactionContext(attempt, source, createAuditAppender(client, source));
      try { return await operation(context); }
      finally { context.invalidate(); }
    }, { ...serializableTransactionOptions, maxWait: this.timeout(), timeout: this.timeout() }));
    this.transactions.add(transaction);
    try { return await transaction; }
    finally { this.transactions.delete(transaction); }
  }
  async isReady(): Promise<boolean> {
    if (this.draining) return false;
    try {
      await this.client.$queryRaw`SELECT 1`;
      return !this.draining;
    } catch { return false; }
  }
  close(): Promise<void> {
    this.beginDrain();
    return this.closed ??= (async () => {
      try { await Promise.allSettled(this.transactions); await this.client.$disconnect(); }
      finally { await this.pool.end(); }
      console.log('DATABASE_CLOSED');
    })();
  }
  onApplicationShutdown(): Promise<void> { return this.close(); }
  private timeout(): number { return this.config.values.databaseTimeoutMs; }
  private serviceSource(): 'API' | 'WORKER' { return this.config.service === 'api' ? 'API' : 'WORKER'; }
}
