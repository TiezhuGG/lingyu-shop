import { ConflictException, HttpException, Injectable } from '@nestjs/common';
import type { components } from '@lingyu/contracts';
import type { Prisma } from '../../generated';
import { AdminService, type AdminPrincipal } from '../admin/service';
import { DatabaseService } from '../foundation/database';
import { AuditService } from '../foundation/audit';
import { transactionClientFor, type TransactionContext } from '../foundation/transaction';
import { parseStorefrontUpdate } from './contract';
type Schema = components['schemas'];
type Store = Prisma.StoreGetPayload<{ include: { fulfillmentDrafts: true } }>;
export const onlineSalesScopeId = '00000000-0000-4000-8000-000000000001';
const methods = ['EXPRESS', 'LOCAL_DELIVERY', 'PICKUP'] as const;
function publicData(row: Store | null): Schema['StorefrontData'] {
  return { storeId: onlineSalesScopeId, mode: 'ONLINE', configured: row !== null, displayName: row?.displayName ?? null, version: row?.version ?? 0,
    fulfillmentMethods: [...methods], enabledMethods: [], physicalStoreEnabled: false, checkoutEnabled: false };
}
function adminData(row: Store | null): Schema['StorefrontAdminData'] {
  return { storefront: publicData(row), fulfillmentRules: methods.map(method => {
    const rule = row?.fulfillmentDrafts.find(rule => rule.method === method);
    return { method, feeMinor: rule?.feeMinor?.toString() ?? null, freeAboveMinor: rule?.freeAboveMinor?.toString() ?? null,
      serviceDescription: rule?.serviceDescription ?? null, pickupAddress: rule?.pickupAddress ?? null };
  }) };
}
@Injectable()
export class StorefrontService {
  constructor(private readonly database: DatabaseService, private readonly admins: AdminService, private readonly audit: AuditService) {}
  private find(context: TransactionContext) {
    return transactionClientFor(context).store.findUnique({ where: { id: onlineSalesScopeId }, include: { fulfillmentDrafts: true } });
  }
  // Public boundary for future Catalog/Pricing/Cart; no exposure of ORM clients.
  readInTransaction(context: TransactionContext) { return this.find(context).then(publicData); }
  publicSettings() { return this.database.runInTransaction(context => this.readInTransaction(context)); }
  private async authorized<T>(principal: AdminPrincipal, permission: 'store.read' | 'store.configure', requestId: string | undefined,
    operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    try {
      return await this.database.runInTransaction(async context => {
        await this.admins.authorizeInTransaction(context, principal, permission, onlineSalesScopeId);
        return operation(context);
      });
    } catch (error) {
      if (error instanceof HttpException) await this.database.runInTransaction(context => this.audit.append(context, {
        actor: { type: 'ADMIN', id: principal.adminId }, action: 'store.settings_rejected', objectType: 'store', objectId: onlineSalesScopeId,
        requestId, changes: { permission, result: error.getStatus() },
      }));
      throw error;
    }
  }
  adminSettings(principal: AdminPrincipal, requestId?: string) {
    return this.authorized(principal, 'store.read', requestId, async context => adminData(await this.find(context)));
  }
  save(principal: AdminPrincipal, raw: unknown, requestId?: string): Promise<Schema['StorefrontSavedData']> {
    const input = parseStorefrontUpdate(raw);
    return this.authorized(principal, 'store.configure', requestId, async context => {
      const client = transactionClientFor(context), current = await this.find(context);
      if ((current?.version ?? 0) !== input.version) throw new ConflictException();
      const drafts = input.fulfillmentRules.map(rule => ({ ...rule, feeMinor: rule.feeMinor === null ? null : BigInt(rule.feeMinor),
        freeAboveMinor: rule.freeAboveMinor === null ? null : BigInt(rule.freeAboveMinor) }));
      if (current) {
        await client.storeFulfillmentDraft.deleteMany({ where: { storeId: onlineSalesScopeId } });
        await client.store.update({ where: { id: onlineSalesScopeId }, data: { displayName: input.displayName, version: { increment: 1 }, fulfillmentDrafts: { create: drafts } } });
      } else await client.store.create({ data: { id: onlineSalesScopeId, displayName: input.displayName, fulfillmentDrafts: { create: drafts } } });
      const auditId = await this.audit.append(context, { actor: { type: 'ADMIN', id: principal.adminId }, action: 'store.settings_saved',
        objectType: 'store', objectId: onlineSalesScopeId, requestId, changes: { reason: input.reason, previousVersion: input.version,
          version: input.version + 1, methodCount: 3, executable: false } });
      return { settings: adminData(await this.find(context)), auditId };
    });
  }
}
