import { Injectable } from '@nestjs/common';

export type ServiceName = 'api' | 'worker';
export type RuntimeEnvironment = 'development' | 'test' | 'production';
export interface BackendConfig {
  readonly environment: RuntimeEnvironment;
  readonly databaseUrl: string;
  readonly poolMax: number;
  readonly databaseTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
  readonly port: number;
}
const invalid = (field: string): never => { throw new Error('Invalid configuration: ' + field); };
function integer(env: NodeJS.ProcessEnv, field: string, fallback: number, min: number, max: number): number {
  const raw = env[field];
  if (raw !== undefined && !/^\d+$/.test(raw)) return invalid(field);
  const value = raw === undefined ? fallback : Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : invalid(field);
}
export function parseBackendConfig(env: NodeJS.ProcessEnv): BackendConfig {
  const environment = env.NODE_ENV;
  if (environment !== 'development' && environment !== 'test' && environment !== 'production') return invalid('NODE_ENV');
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ''); } catch { return invalid('DATABASE_URL'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || !url.username || !url.password ||
      !/^\/[a-zA-Z][a-zA-Z0-9_]*$/.test(url.pathname) || url.search || url.hash ||
      url.pathname === '/lingyu_shop_poc' ||
      (environment === 'test' ? url.pathname !== '/lingyu_shop_test' : url.pathname === '/lingyu_shop_test')) return invalid('DATABASE_URL');
  return Object.freeze({
    environment, databaseUrl: env.DATABASE_URL!,
    poolMax: integer(env, 'DB_POOL_MAX', 5, 1, 20),
    databaseTimeoutMs: integer(env, 'DB_TIMEOUT_MS', 3000, 100, 30000),
    shutdownTimeoutMs: integer(env, 'SHUTDOWN_TIMEOUT_MS', 10000, 1000, 60000),
    port: integer(env, 'PORT', 3000, 1, 65535),
  });
}
@Injectable()
export class BackendConfigService {
  constructor(readonly values: BackendConfig, readonly service: ServiceName) {}
}
