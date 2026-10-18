import { ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type { components } from '@lingyu/contracts';
import type { Prisma } from '../../generated';
import { AuditService } from '../foundation/audit';
import { BackendConfigService } from '../foundation/config';
import { DatabaseService } from '../foundation/database';
import { TransactionContext, transactionClientFor } from '../foundation/transaction';
import { hasAdminPermission, validateAdminGrants, type AdminPermission } from './policy';
import { adminCsrf, adminDigest, adminSessionId, hashAdminPassword, safeEqual, verifyAdminPassword } from './security';

type Account = Prisma.AdminAccountGetPayload<{ include: { grants: true } }>;
type AccountData = components['schemas']['AdminAccountData'];
export interface AdminPrincipal { readonly adminId: string; readonly sessionId: string; readonly version: number }
const expires = (): Date => new Date(Date.now() + 8 * 60 * 60 * 1000);
function accountData(account: Account): AccountData {
  return { id: account.id, username: account.username, status: account.status, version: account.version,
    grants: account.grants.map(({ role, scopeKey }) => ({ role, scopeKey })) };
}
async function iamLock(context: TransactionContext): Promise<void> {
  // PostgreSQL returns void; cast it to a type Prisma can deserialize.
  await transactionClientFor(context).$queryRaw`SELECT pg_advisory_xact_lock(20261019)::text`;
}

@Injectable()
export class AdminService {
  constructor(private readonly config: BackendConfigService, private readonly database: DatabaseService, private readonly audit: AuditService) {}

  async bootstrap(username: string, password: string): Promise<AccountData> {
    const values = this.config.values;
    const url = new URL(values.databaseUrl);
    if (values.environment === 'production' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '15432') throw new ForbiddenException();
    if (!/^[a-z][a-z0-9_.-]{2,63}$/.test(username)) throw new ForbiddenException();
    const passwordHash = await hashAdminPassword(password);
    return this.database.runInTransaction(async context => {
      await iamLock(context);
      const client = transactionClientFor(context);
      if (await client.adminAccount.count() !== 0) throw new ConflictException();
      const admin = await client.adminAccount.create({ data: {
        id: randomUUID(), username, passwordHash, grants: { create: { id: randomUUID(), role: 'IAM_MANAGER', scopeKey: 'GLOBAL' } },
      }, include: { grants: true } });
      await this.audit.append(context, { actor: { type: 'SYSTEM', id: 'local-bootstrap' }, action: 'iam.bootstrap', objectType: 'admin', objectId: admin.id });
      return accountData(admin);
    });
  }

  async login(username: string, password: string, requestId?: string) {
    const candidate = await this.database.runInTransaction(context => transactionClientFor(context).adminAccount.findUnique({ where: { username } }));
    const valid = await verifyAdminPassword(password, candidate?.passwordHash ?? null);
    const cookie = randomUUID() + '.' + randomBytes(32).toString('base64url');
    const expiresAt = expires();
    const admin = await this.database.runInTransaction(async context => {
      await iamLock(context);
      const client = transactionClientFor(context);
      const current = await client.adminAccount.findUnique({ where: { username }, include: { grants: true } });
      const now = new Date();
      const locked = current?.lockedUntil !== null && current?.lockedUntil !== undefined && current.lockedUntil > now;
      if (!current || current.status !== 'ACTIVE' || locked || !valid || current.passwordHash !== candidate?.passwordHash) {
        if (current && !locked) {
          const failures = (current.lockedUntil && current.lockedUntil <= now ? 0 : current.failedLoginCount) + 1;
          await client.adminAccount.update({ where: { id: current.id }, data: {
            failedLoginCount: failures, lockedUntil: failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
          } });
        }
        await this.audit.append(context, { actor: { type: 'SYSTEM' }, action: 'auth.admin.login_failed', objectType: 'admin', objectId: current?.id ?? 'unknown', requestId, changes: { result: 'rejected' } });
        return null;
      }
      await client.adminAccount.update({ where: { id: current.id }, data: { failedLoginCount: 0, lockedUntil: null } });
      await client.adminSession.create({ data: { id: adminSessionId(cookie), adminId: current.id, digest: adminDigest(cookie), version: current.version, expiresAt } });
      await this.audit.append(context, { actor: { type: 'ADMIN', id: current.id }, action: 'auth.admin.login', objectType: 'admin', objectId: current.id, requestId });
      return accountData(current);
    });
    if (!admin) throw new UnauthorizedException();
    return { cookie, data: { admin, csrfToken: adminCsrf(cookie), expiresAt: expiresAt.toISOString() } };
  }

  async authenticate(cookie: string): Promise<AdminPrincipal> {
    const sessionId = adminSessionId(cookie);
    return this.database.runInTransaction(async context => {
      const session = await transactionClientFor(context).adminSession.findUnique({ where: { id: sessionId }, include: { admin: true } });
      if (!session || !safeEqual(adminDigest(cookie), session.digest) || session.revokedAt || session.expiresAt <= new Date() ||
          session.admin.status !== 'ACTIVE' || session.version !== session.admin.version) throw new UnauthorizedException();
      return { sessionId, adminId: session.adminId, version: session.version };
    });
  }

  async authorizeInTransaction(context: TransactionContext, principal: AdminPrincipal, permission: AdminPermission, scope?: string): Promise<void> {
    // Keep authorization changes serialized until the caller's transaction commits.
    await iamLock(context);
    const client = transactionClientFor(context);
    // Serializable snapshots can predate a wait on the advisory lock. A row lock
    // forces a serialization retry if revocation changed the account meanwhile.
    await client.$queryRaw`SELECT id FROM admin_account WHERE id = ${principal.adminId}::uuid FOR UPDATE`;
    await client.$queryRaw`SELECT id FROM admin_session WHERE id = ${principal.sessionId}::uuid FOR UPDATE`;
    const session = await client.adminSession.findUnique({ where: { id: principal.sessionId }, include: { admin: { include: { grants: true } } } });
    if (!session || session.adminId !== principal.adminId || session.version !== principal.version || session.version !== session.admin.version ||
        session.admin.status !== 'ACTIVE' || session.revokedAt || session.expiresAt <= new Date()) throw new UnauthorizedException();
    if (!hasAdminPermission(session.admin.grants, permission, scope)) throw new ForbiddenException();
  }

  private async perform<T>(principal: AdminPrincipal, permission: AdminPermission, scope: string | undefined, requestId: string | undefined,
    operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    try {
      return await this.database.runInTransaction(async context => {
        await this.authorizeInTransaction(context, principal, permission, scope);
        return operation(context);
      });
    } catch (error) {
      if (error instanceof HttpException) await this.database.runInTransaction(context => this.audit.append(context, {
        actor: { type: 'ADMIN', id: principal.adminId }, action: 'iam.operation_rejected', objectType: 'admin', objectId: principal.adminId,
        requestId, changes: { permission, scope: scope ?? 'GLOBAL', result: error.getStatus() },
      }));
      throw error;
    }
  }

  async me(principal: AdminPrincipal, cookie: string) {
    return this.database.runInTransaction(async context => {
      const session = await transactionClientFor(context).adminSession.findUnique({ where: { id: principal.sessionId }, include: { admin: { include: { grants: true } } } });
      if (!session || session.adminId !== principal.adminId || session.revokedAt || session.expiresAt <= new Date() || session.admin.status !== 'ACTIVE' || session.version !== session.admin.version || session.version !== principal.version) throw new UnauthorizedException();
      return { admin: accountData(session.admin), csrfToken: adminCsrf(cookie), expiresAt: session.expiresAt.toISOString() };
    });
  }

  async logout(principal: AdminPrincipal, requestId?: string): Promise<void> {
    await this.database.runInTransaction(async context => {
      const client = transactionClientFor(context);
      const changed = await client.adminSession.updateMany({ where: { id: principal.sessionId, adminId: principal.adminId, revokedAt: null }, data: { revokedAt: new Date() } });
      if (changed.count) await this.audit.append(context, { actor: { type: 'ADMIN', id: principal.adminId }, action: 'auth.admin.logout', objectType: 'admin', objectId: principal.adminId, requestId });
    });
  }

  list(principal: AdminPrincipal, requestId?: string): Promise<AccountData[]> {
    return this.perform(principal, 'iam.admin.read', undefined, requestId, async context => {
      const accounts = await transactionClientFor(context).adminAccount.findMany({ take: 100, orderBy: { username: 'asc' }, include: { grants: true } });
      return accounts.map(accountData);
    });
  }

  async create(principal: AdminPrincipal, input: components['schemas']['AdminCreateRequest'], requestId?: string): Promise<AccountData> {
    validateAdminGrants(input.grants);
    // Authorize before spending KDF resources; repeat in the transaction that writes.
    await this.perform(principal, 'iam.admin.manage', undefined, requestId, async () => undefined);
    const passwordHash = await hashAdminPassword(input.password);
    return this.perform(principal, 'iam.admin.manage', undefined, requestId, async context => {
      const client = transactionClientFor(context);
      if (await client.adminAccount.findUnique({ where: { username: input.username } })) throw new ConflictException();
      const account = await client.adminAccount.create({ data: { id: randomUUID(), username: input.username, passwordHash,
        grants: { create: input.grants.map(grant => ({ id: randomUUID(), ...grant })) } }, include: { grants: true } });
      await this.audit.append(context, { actor: { type: 'ADMIN', id: principal.adminId }, action: 'iam.admin_create', objectType: 'admin', objectId: account.id, requestId, changes: { reason: input.reason, grantCount: input.grants.length } });
      for (const grant of input.grants) await this.audit.append(context, {
        actor: { type: 'ADMIN', id: principal.adminId }, action: 'iam.grant_added', objectType: 'admin', objectId: account.id, requestId,
        changes: { role: grant.role, scope: grant.scopeKey, version: account.version, reason: input.reason },
      });
      return accountData(account);
    });
  }

  update(principal: AdminPrincipal, id: string, input: components['schemas']['AdminUpdateRequest'], requestId?: string): Promise<AccountData> {
    validateAdminGrants(input.grants);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new NotFoundException();
    return this.perform(principal, 'iam.admin.manage', undefined, requestId, async context => {
      if (id === principal.adminId) throw new ForbiddenException();
      const client = transactionClientFor(context);
      const target = await client.adminAccount.findUnique({ where: { id }, include: { grants: true } });
      if (!target) throw new NotFoundException();
      if (target.version !== input.version) throw new ConflictException();
      const removingManager = target.status === 'ACTIVE' && target.grants.some(grant => grant.role === 'IAM_MANAGER') &&
        (input.status !== 'ACTIVE' || !input.grants.some(grant => grant.role === 'IAM_MANAGER'));
      if (removingManager && await client.adminAccount.count({ where: { id: { not: id }, status: 'ACTIVE', grants: { some: { role: 'IAM_MANAGER' } } } }) === 0) throw new ConflictException();
      await client.adminGrant.deleteMany({ where: { adminId: id } });
      const account = await client.adminAccount.update({ where: { id }, data: {
        status: input.status, version: { increment: 1 }, grants: { create: input.grants.map(grant => ({ id: randomUUID(), ...grant })) },
      }, include: { grants: true } });
      await client.adminSession.updateMany({ where: { adminId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.append(context, { actor: { type: 'ADMIN', id: principal.adminId }, action: 'iam.admin_update', objectType: 'admin', objectId: id, requestId,
        changes: { reason: input.reason, previousVersion: input.version, version: account.version, status: input.status, grantCount: input.grants.length } });
      for (const [before, after, action] of [[target.grants, input.grants, 'iam.grant_removed'], [input.grants, target.grants, 'iam.grant_added']] as const) {
        for (const grant of before) if (!after.some(item => item.role === grant.role && item.scopeKey === grant.scopeKey)) await this.audit.append(context, {
          actor: { type: 'ADMIN', id: principal.adminId }, action, objectType: 'admin', objectId: id, requestId,
          changes: { role: grant.role, scope: grant.scopeKey, version: account.version, reason: input.reason },
        });
      }
      return accountData(account);
    });
  }

  storeAccess(principal: AdminPrincipal, storeId: string, permission: AdminPermission = 'store.read', requestId?: string): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(storeId)) throw new NotFoundException();
    return this.perform(principal, permission, storeId, requestId, async () => undefined);
  }

  readAudit(principal: AdminPrincipal, requestId?: string) {
    return this.perform(principal, 'audit.read', undefined, requestId, async context => {
      const records = await this.audit.recent(context);
      await this.audit.append(context, { actor: { type: 'ADMIN', id: principal.adminId }, action: 'iam.audit_read', objectType: 'admin', objectId: principal.adminId, requestId });
      return records.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
    });
  }

  recordRequestRejected(requestId: string | undefined, reason: 'origin' | 'csrf') {
    return this.database.runInTransaction(context => this.audit.append(context, {
      actor: { type: 'SYSTEM' }, action: 'auth.admin.request_rejected', objectType: 'admin-access', objectId: 'unknown', requestId, changes: { reason },
    }));
  }
}
