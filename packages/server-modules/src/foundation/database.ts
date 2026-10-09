import { Injectable, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../generated';
import { BackendConfigService } from './config';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly pool: Pool;
  private readonly client: PrismaClient;
  private draining = false;
  private closed?: Promise<void>;

  constructor(config: BackendConfigService) {
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
      try { await this.client.$disconnect(); }
      finally { await this.pool.end(); }
      console.log('DATABASE_CLOSED');
    })();
  }
  onApplicationShutdown(): Promise<void> { return this.close(); }
}
