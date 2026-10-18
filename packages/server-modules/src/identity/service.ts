import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { CustomerIdentityProvider, CustomerStatus, Prisma, SessionSubjectType } from '../../generated';
import { AuditService } from '../foundation/audit';
import { BackendConfigService } from '../foundation/config';
import { DatabaseService } from '../foundation/database';
import { transactionClientFor } from '../foundation/transaction';

export interface AppPrincipal {
  readonly customerId: string;
  readonly sessionId: string;
}

export interface AppSessionTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: string;
  readonly refreshExpiresAt: string;
}

type IdentityStore = {
  findCustomerByDevelopmentId(developmentId: string): Promise<{ id: string; status: CustomerStatus } | null>;
  createCustomerWithDevelopmentIdentity(developmentId: string): Promise<{ id: string; status: CustomerStatus }>;
  createSession(input: { id: string; customerId: string; refreshHash: string; refreshExpiresAt: Date }): Promise<void>;
  findSession(id: string): Promise<{ id: string; subjectId: string; subjectType: SessionSubjectType; developmentOnly: boolean; refreshExpiresAt: Date; revokedAt: Date | null } | null>;
  lockSession(id: string): Promise<{ id: string; subjectId: string; subjectType: SessionSubjectType; developmentOnly: boolean; refreshHash: string; refreshExpiresAt: Date; revokedAt: Date | null } | null>;
  wasRefreshUsed(sessionId: string, digest: string): Promise<boolean>;
  rememberRefresh(sessionId: string, digest: string): Promise<void>;
  rotateSession(input: { id: string; refreshHash: string; refreshExpiresAt: Date; usedAt: Date }): Promise<void>;
  revokeSession(input: { id: string; reason: string; revokedAt: Date }): Promise<boolean>;
  findActiveCustomer(id: string): Promise<{ id: string } | null>;
};

const identityRepository = {
  forTransaction(client: Prisma.TransactionClient): IdentityStore {
    return {
      async findCustomerByDevelopmentId(developmentId) {
        const identity = await client.customerIdentity.findUnique({
          where: { providerKey: developmentProviderKey(developmentId) },
          include: { customer: true },
        });
        return identity === null ? null : { id: identity.customer.id, status: identity.customer.status };
      },
      async createCustomerWithDevelopmentIdentity(developmentId) {
        const customer = await client.customer.create({ data: { id: randomUUID() } });
        await client.customerIdentity.create({ data: {
          id: randomUUID(), customerId: customer.id, provider: CustomerIdentityProvider.DEVELOPMENT,
          providerKey: developmentProviderKey(developmentId),
        } });
        return { id: customer.id, status: customer.status };
      },
      async createSession(input) {
        await client.session.create({ data: {
          id: input.id, subjectId: input.customerId, subjectType: SessionSubjectType.CUSTOMER,
          refreshHash: input.refreshHash, refreshExpiresAt: input.refreshExpiresAt,
        } });
      },
      async findSession(id) {
        return client.session.findUnique({ where: { id }, select: {
          id: true, subjectId: true, subjectType: true, developmentOnly: true, refreshExpiresAt: true, revokedAt: true,
        } });
      },
      async lockSession(id) {
        const rows = await client.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "session" WHERE "id" = ${id}::uuid FOR UPDATE`;
        if (rows.length === 0) return null;
        return client.session.findUnique({ where: { id } });
      },
      async rotateSession(input) {
        await client.session.update({ where: { id: input.id }, data: {
          refreshHash: input.refreshHash, refreshExpiresAt: input.refreshExpiresAt, lastUsedAt: input.usedAt,
        } });
      },
      async wasRefreshUsed(sessionId, digest) {
        return await client.usedRefreshToken.findUnique({ where: { sessionId_digest: { sessionId, digest } } }) !== null;
      },
      async rememberRefresh(sessionId, digest) {
        await client.usedRefreshToken.create({ data: { sessionId, digest } });
      },
      async revokeSession(input) {
        const result = await client.session.updateMany({ where: { id: input.id, revokedAt: null }, data: {
          revokedAt: input.revokedAt, revokeReason: input.reason, lastUsedAt: input.revokedAt,
        } });
        return result.count === 1;
      },
      async findActiveCustomer(id) {
        return client.customer.findFirst({ where: { id, status: CustomerStatus.ACTIVE }, select: { id: true } });
      },
    };
  },
};

const developmentIdPattern = /^[A-Za-z0-9_-]{3,64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const refreshSecretPattern = /^[A-Za-z0-9_-]{43}$/;
const base64url = (value: string | Buffer): string => Buffer.from(value).toString('base64url');
const nowSeconds = (): number => Math.floor(Date.now() / 1000);

function developmentProviderKey(developmentId: string): string { return 'development:' + developmentId; }
function same(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}
function parseJson(value: string): unknown {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { return null; }
}

@Injectable()
export class CustomerSessionService {
  constructor(
    private readonly config: BackendConfigService,
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async developmentLogin(developmentId: string, requestId?: string): Promise<AppSessionTokens> {
    if (!this.config.values.authentication.developmentLoginEnabled || this.config.values.environment === 'production') throw new NotFoundException();
    if (!developmentIdPattern.test(developmentId)) throw new UnauthorizedException();
    const issued = this.newRefreshToken();
    const result = await this.database.runInTransaction(async context => {
      const store = identityRepository.forTransaction(transactionClientFor(context));
      let customer = await store.findCustomerByDevelopmentId(developmentId);
      if (customer === null) {
        customer = await store.createCustomerWithDevelopmentIdentity(developmentId);
        await this.audit.append(context, { actor: { type: 'CUSTOMER', id: customer.id }, action: 'auth.customer_create', objectType: 'customer', objectId: customer.id, requestId, changes: { provider: 'development' } });
      }
      if (customer.status !== CustomerStatus.ACTIVE) throw new UnauthorizedException();
      await store.createSession({ id: issued.sessionId, customerId: customer.id, refreshHash: issued.hash, refreshExpiresAt: issued.expiresAt });
      await this.audit.append(context, { actor: { type: 'CUSTOMER', id: customer.id }, action: 'auth.session_create', objectType: 'session', objectId: issued.sessionId, requestId, changes: { provider: 'development' } });
      return customer.id;
    });
    return this.tokens(result, issued.sessionId, issued.raw, issued.expiresAt);
  }

  async refresh(refreshToken: string, requestId?: string): Promise<AppSessionTokens> {
    const parsed = this.parseRefreshToken(refreshToken);
    if (parsed === null) throw new UnauthorizedException();
    const issued = this.newRefreshToken(parsed.sessionId);
    const result = await this.database.runInTransaction(async context => {
      const store = identityRepository.forTransaction(transactionClientFor(context));
      const session = await store.lockSession(parsed.sessionId);
      const now = new Date();
      if (session === null || session.subjectType !== SessionSubjectType.CUSTOMER || session.revokedAt !== null || session.refreshExpiresAt <= now || !this.acceptsSession(session)) return { kind: 'invalid' as const };
      if (!same(Buffer.from(session.refreshHash, 'hex'), Buffer.from(parsed.hash, 'hex'))) {
        // Only an actually used credential proves replay. A guessed secret must not revoke another session.
        if (!await store.wasRefreshUsed(session.id, parsed.hash)) return { kind: 'invalid' as const };
        await store.revokeSession({ id: session.id, reason: 'refresh_replay', revokedAt: now });
        await this.audit.append(context, { actor: { type: 'CUSTOMER', id: session.subjectId }, action: 'auth.refresh_replay_blocked', objectType: 'session', objectId: session.id, requestId, changes: { reason: 'refresh_replay' } });
        return { kind: 'replayed' as const };
      }
      const customer = await store.findActiveCustomer(session.subjectId);
      if (customer === null) {
        await store.revokeSession({ id: session.id, reason: 'customer_inactive', revokedAt: now });
        await this.audit.append(context, { actor: { type: 'CUSTOMER', id: session.subjectId }, action: 'auth.session_revoke', objectType: 'session', objectId: session.id, requestId, changes: { reason: 'customer_inactive' } });
        return { kind: 'invalid' as const };
      }
      await store.rememberRefresh(session.id, parsed.hash);
      await store.rotateSession({ id: session.id, refreshHash: issued.hash, refreshExpiresAt: issued.expiresAt, usedAt: now });
      await this.audit.append(context, { actor: { type: 'CUSTOMER', id: session.subjectId }, action: 'auth.session_refresh', objectType: 'session', objectId: session.id, requestId });
      return { kind: 'ok' as const, customerId: session.subjectId };
    });
    if (result.kind !== 'ok') throw new UnauthorizedException();
    return this.tokens(result.customerId, parsed.sessionId, issued.raw, issued.expiresAt);
  }

  async logout(principal: AppPrincipal, requestId?: string): Promise<void> {
    await this.database.runInTransaction(async context => {
      const store = identityRepository.forTransaction(transactionClientFor(context));
      const session = await store.lockSession(principal.sessionId);
      if (session === null || session.subjectType !== SessionSubjectType.CUSTOMER || session.subjectId !== principal.customerId) throw new UnauthorizedException();
      if (await store.revokeSession({ id: session.id, reason: 'logout', revokedAt: new Date() })) {
        await this.audit.append(context, { actor: { type: 'CUSTOMER', id: principal.customerId }, action: 'auth.session_revoke', objectType: 'session', objectId: session.id, requestId, changes: { reason: 'logout' } });
      }
    });
  }

  async authenticateAccess(token: string): Promise<AppPrincipal> {
    const claims = this.verifyAccessToken(token);
    if (claims === null) throw new UnauthorizedException();
    return this.database.runInTransaction(async context => {
      const store = identityRepository.forTransaction(transactionClientFor(context));
      const session = await store.findSession(claims.sid);
      if (session === null || session.subjectType !== SessionSubjectType.CUSTOMER || session.subjectId !== claims.sub || session.revokedAt !== null || session.refreshExpiresAt <= new Date() || !this.acceptsSession(session)) throw new UnauthorizedException();
      const customer = await store.findActiveCustomer(claims.sub);
      if (customer === null) throw new UnauthorizedException();
      return { customerId: claims.sub, sessionId: claims.sid };
    });
  }

  private acceptsSession(session: { developmentOnly: boolean }): boolean {
    return !session.developmentOnly || (this.config.values.environment !== 'production' && this.config.values.authentication.developmentLoginEnabled);
  }

  private tokens(customerId: string, sessionId: string, refreshToken: string, refreshExpiresAt: Date): AppSessionTokens {
    const expiresAt = new Date((nowSeconds() + this.config.values.authentication.accessTtlSeconds) * 1000);
    return Object.freeze({
      accessToken: this.signAccessToken(customerId, sessionId, Math.floor(expiresAt.getTime() / 1000)),
      refreshToken, accessExpiresAt: expiresAt.toISOString(), refreshExpiresAt: refreshExpiresAt.toISOString(),
    });
  }
  private newRefreshToken(sessionId: string = randomUUID()): { sessionId: string; raw: string; hash: string; expiresAt: Date } {
    const secret = randomBytes(32).toString('base64url');
    const raw = sessionId + '.' + secret;
    return { sessionId, raw, hash: this.refreshHash(secret), expiresAt: new Date(Date.now() + this.config.values.authentication.refreshTtlSeconds * 1000) };
  }
  private refreshHash(secret: string): string {
    return createHmac('sha256', Buffer.from(this.config.values.authentication.refreshTokenPepper, 'base64url')).update(secret).digest('hex');
  }
  private parseRefreshToken(value: string): { sessionId: string; hash: string } | null {
    const [sessionId, secret, extra] = value.split('.');
    if (extra !== undefined || !uuidPattern.test(sessionId ?? '') || !refreshSecretPattern.test(secret ?? '')) return null;
    return { sessionId: sessionId!, hash: this.refreshHash(secret!) };
  }
  private signAccessToken(customerId: string, sessionId: string, exp: number): string {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({ sub: customerId, subject_type: 'CUSTOMER', aud: 'app', sid: sessionId, permission_version: 0, iat: nowSeconds(), exp }));
    const input = header + '.' + payload;
    const signature = createHmac('sha256', Buffer.from(this.config.values.authentication.accessSigningKey, 'base64url')).update(input).digest('base64url');
    return input + '.' + signature;
  }
  private verifyAccessToken(token: string): { sub: string; sid: string } | null {
    const [headerPart, payloadPart, signaturePart, extra] = token.split('.');
    if (extra !== undefined || !headerPart || !payloadPart || !signaturePart) return null;
    const expected = createHmac('sha256', Buffer.from(this.config.values.authentication.accessSigningKey, 'base64url')).update(headerPart + '.' + payloadPart).digest('base64url');
    if (!same(Buffer.from(signaturePart), Buffer.from(expected))) return null;
    const header = parseJson(headerPart);
    const payload = parseJson(payloadPart);
    if (!isRecord(header) || header.alg !== 'HS256' || header.typ !== 'JWT' || !isRecord(payload)) return null;
    const now = nowSeconds();
    if (payload.aud !== 'app' || payload.subject_type !== 'CUSTOMER' || !uuidPattern.test(string(payload.sub)) || !uuidPattern.test(string(payload.sid)) || !integer(payload.permission_version) || payload.permission_version < 0 || !integer(payload.iat) || !integer(payload.exp) || payload.iat > now + 60 || payload.exp <= now) return null;
    return { sub: string(payload.sub), sid: string(payload.sid) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function string(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value); }
