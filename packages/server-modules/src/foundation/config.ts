import { Injectable } from '@nestjs/common';

export type ServiceName = 'api' | 'worker';
export type RuntimeEnvironment = 'development' | 'test' | 'production';
export interface AuthenticationConfig {
  readonly accessSigningKey: string;
  readonly refreshTokenPepper: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;
  readonly developmentLoginEnabled: boolean;
}
export interface BackendConfig {
  readonly environment: RuntimeEnvironment;
  readonly databaseUrl: string;
  readonly poolMax: number;
  readonly databaseTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
  readonly port: number;
  readonly authentication: AuthenticationConfig;
  readonly adminOrigin: string;
}
const invalid = (field: string): never => { throw new Error('Invalid configuration: ' + field); };
function integer(env: NodeJS.ProcessEnv, field: string, fallback: number, min: number, max: number): number {
  const raw = env[field];
  if (raw !== undefined && !/^\d+$/.test(raw)) return invalid(field);
  const value = raw === undefined ? fallback : Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : invalid(field);
}
function base64urlSecret(env: NodeJS.ProcessEnv, field: string): string {
  const value = env[field];
  if (value === undefined || !/^[A-Za-z0-9_-]{43,256}$/.test(value)) return invalid(field);
  try {
    if (Buffer.from(value, 'base64url').length < 32) return invalid(field);
  } catch { return invalid(field); }
  return value;
}
function boolean(env: NodeJS.ProcessEnv, field: string, fallback: boolean): boolean {
  const value = env[field];
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return invalid(field);
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
  const developmentLoginEnabled = boolean(env, 'AUTH_DEVELOPMENT_LOGIN_ENABLED', false);
  if (environment === 'production' && developmentLoginEnabled) return invalid('AUTH_DEVELOPMENT_LOGIN_ENABLED');
  const accessSigningKey = base64urlSecret(env, 'AUTH_ACCESS_SIGNING_KEY');
  const refreshTokenPepper = base64urlSecret(env, 'AUTH_REFRESH_TOKEN_PEPPER');
  if (Buffer.from(accessSigningKey, 'base64url').equals(Buffer.from(refreshTokenPepper, 'base64url'))) return invalid('AUTH_REFRESH_TOKEN_PEPPER');
  const adminOrigin = env.ADMIN_ORIGIN ?? (environment === 'production' ? '' : 'http://127.0.0.1:5173');
  try {
    const origin = new URL(adminOrigin);
    if (origin.origin !== adminOrigin || origin.username || origin.password ||
        (environment === 'production' ? origin.protocol !== 'https:' : !['http:', 'https:'].includes(origin.protocol))) return invalid('ADMIN_ORIGIN');
  } catch { return invalid('ADMIN_ORIGIN'); }
  return Object.freeze({
    environment, databaseUrl: env.DATABASE_URL!,
    adminOrigin,
    poolMax: integer(env, 'DB_POOL_MAX', 5, 1, 20),
    databaseTimeoutMs: integer(env, 'DB_TIMEOUT_MS', 3000, 100, 30000),
    shutdownTimeoutMs: integer(env, 'SHUTDOWN_TIMEOUT_MS', 10000, 1000, 60000),
    port: integer(env, 'PORT', 3000, 1, 65535),
    authentication: Object.freeze({
      accessSigningKey,
      refreshTokenPepper,
      accessTtlSeconds: integer(env, 'AUTH_ACCESS_TTL_SECONDS', 900, 60, 3600),
      refreshTtlSeconds: integer(env, 'AUTH_REFRESH_TTL_SECONDS', 604800, 3600, 2592000),
      developmentLoginEnabled,
    }),
  });
}
@Injectable()
export class BackendConfigService {
  constructor(readonly values: BackendConfig, readonly service: ServiceName) {}
}
