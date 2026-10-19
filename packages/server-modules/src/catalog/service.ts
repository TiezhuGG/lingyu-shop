import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import type { components } from '@lingyu/contracts';
import { AdminService, type AdminPrincipal } from '../admin/service';
import type { AdminPermission } from '../admin/policy';
import { AuditService } from '../foundation/audit';
import { DatabaseService } from '../foundation/database';
import { transactionClientFor, type TransactionContext } from '../foundation/transaction';
import { StorefrontService, onlineSalesScopeId } from '../store/service';
import { PricingService } from '../pricing/service';
import { parseCatalogCategory, parseCatalogId, parseCatalogPage, parseCatalogProduct, parseCatalogPublication } from './contract';
type Schema = components['schemas'];
type Page = ReturnType<typeof parseCatalogPage>;
function pageResult<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit, items = rows.slice(0, limit);
  return { items, hasMore, nextCursor: hasMore ? items.at(-1)!.id : null };
}
@Injectable()
export class CatalogService {
  constructor(private readonly database: DatabaseService, private readonly admins: AdminService, private readonly audit: AuditService,
    private readonly storefront: StorefrontService, private readonly pricing: PricingService) {}
  private async authorized<T>(principal: AdminPrincipal, permission: AdminPermission, objectId: string, requestId: string | undefined,
    operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    try {
      return await this.database.runInTransaction(async context => {
        await this.admins.authorizeInTransaction(context, principal, permission, onlineSalesScopeId);
        return operation(context);
      });
    } catch (original) {
      const error = (original as { code?: string })?.code === 'P2002' ? new ConflictException() : original;
      if (error instanceof HttpException) await this.database.runInTransaction(context => this.audit.append(context, {
        actor: { type: 'ADMIN', id: principal.adminId }, action: 'catalog.rejected', objectType: 'catalog', objectId, requestId,
        changes: { permission, result: error.getStatus(), storeId: onlineSalesScopeId },
      }));
      throw error;
    }
  }
  private async configured(context: TransactionContext) {
    if (!(await this.storefront.readInTransaction(context)).configured) throw new ConflictException();
  }
  private async product(context: TransactionContext, id: string) {
    const row = await transactionClientFor(context).catalogProduct.findFirst({ where: { id, storeId: onlineSalesScopeId }, include: { skus: { orderBy: { id: 'asc' } } } });
    if (!row) throw new NotFoundException();
    return row;
  }
  private async draft(context: TransactionContext, id: string): Promise<Schema['CatalogProductDraft']> {
    const row = await this.product(context, id), prices = await this.pricing.drafts(context, row.skus.map(sku => sku.id));
    const published = row.publishedVersion === null ? null : await transactionClientFor(context).catalogPublication.findUnique({ where: { productId_version: { productId: id, version: row.publishedVersion } } });
    const publishedPrices = row.publishedVersion === null ? new Map<string, string>() : await this.pricing.published(context, id, row.publishedVersion);
    return { id: row.id, categoryId: row.categoryId, name: row.name, description: row.description, version: row.version, publishedVersion: row.publishedVersion,
      publishedName: published?.name ?? null, publishedPrices: [...publishedPrices].map(([id, priceMinor]) => ({ id, priceMinor })),
      skus: row.skus.map(sku => ({ id: sku.id, code: sku.code, unit: sku.unit as Schema['CatalogUnit'], options: sku.options as Schema['CatalogOptions'], active: sku.active, priceMinor: prices.get(sku.id) ?? null })) };
  }
  list(principal: AdminPrincipal, raw: unknown, requestId?: string): Promise<Schema['CatalogAdminData']> {
    const page = parseCatalogPage(raw);
    return this.authorized(principal, 'catalog.read', onlineSalesScopeId, requestId, async context => {
      const client = transactionClientFor(context);
      const categories = await client.catalogCategory.findMany({ where: { storeId: onlineSalesScopeId }, orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, sort: true, active: true, version: true } });
      const rows = await client.catalogProduct.findMany({ where: this.pageWhere(page), orderBy: { id: 'asc' }, take: page.limit + 1,
        select: { id: true, name: true, categoryId: true, version: true, publishedVersion: true } });
      return { categories, ...pageResult(rows, page.limit) };
    });
  }
  get(principal: AdminPrincipal, rawId: unknown, requestId?: string) {
    const id = parseCatalogId(rawId);
    return this.authorized(principal, 'catalog.read', id, requestId, context => this.draft(context, id));
  }
  saveCategory(principal: AdminPrincipal, rawId: unknown, raw: unknown, requestId?: string): Promise<Schema['CatalogCategorySavedData']> {
    const id = parseCatalogId(rawId), input = parseCatalogCategory(raw);
    return this.authorized(principal, 'catalog.write', id, requestId, async context => {
      await this.configured(context);
      const client = transactionClientFor(context), current = await client.catalogCategory.findUnique({ where: { id } });
      if ((current?.version ?? 0) !== input.version || (current && current.storeId !== onlineSalesScopeId)) throw new ConflictException();
      if (!current && await client.catalogCategory.count({ where: { storeId: onlineSalesScopeId } }) >= 100) throw new ConflictException();
      const data = { name: input.name, sort: input.sort, active: input.active, version: input.version + 1 };
      const row = current ? await client.catalogCategory.update({ where: { id, version: input.version }, data }) :
        await client.catalogCategory.create({ data: { ...data, id, storeId: onlineSalesScopeId } });
      const auditId = await this.audit.append(context, { actor: { type: 'ADMIN', id: principal.adminId }, action: 'catalog.category_saved', objectType: 'category', objectId: id,
        requestId, changes: { previousVersion: input.version, version: row.version, active: row.active, reason: input.reason, storeId: onlineSalesScopeId } });
      return { category: { id, ...data }, auditId };
    });
  }
  save(principal: AdminPrincipal, rawId: unknown, raw: unknown, requestId?: string): Promise<Schema['CatalogSavedData']> {
    const id = parseCatalogId(rawId), input = parseCatalogProduct(raw);
    return this.authorized(principal, 'catalog.write', id, requestId, async context => {
      await this.configured(context);
      const client = transactionClientFor(context), current = await client.catalogProduct.findUnique({ where: { id }, include: { skus: true } });
      if ((current?.version ?? 0) !== input.version || (current && current.storeId !== onlineSalesScopeId)) throw new ConflictException();
      const category = await client.catalogCategory.findFirst({ where: { id: input.categoryId, storeId: onlineSalesScopeId, active: true } });
      if (!category) throw new ConflictException();
      for (const old of current?.skus ?? []) {
        const incoming = input.skus.find(sku => sku.id === old.id);
        if (!incoming || incoming.code !== old.code || incoming.unit !== old.unit || JSON.stringify(incoming.options) !== old.optionsKey) throw new ConflictException();
      }
      const data = { categoryId: input.categoryId, name: input.name, description: input.description, version: input.version + 1 };
      if (current) await client.catalogProduct.update({ where: { id, version: input.version }, data });
      else await client.catalogProduct.create({ data: { ...data, id, storeId: onlineSalesScopeId } });
      const existing = new Set(current?.skus.map(sku => sku.id));
      for (const sku of [...input.skus].sort((a, b) => a.id.localeCompare(b.id))) {
        if (existing.has(sku.id)) await client.catalogSku.update({ where: { id: sku.id }, data: { active: sku.active } });
        else await client.catalogSku.create({ data: { id: sku.id, productId: id, code: sku.code, unit: sku.unit, options: sku.options, optionsKey: JSON.stringify(sku.options), active: sku.active } });
      }
      await this.pricing.saveDrafts(context, id, data.version, input.skus, { adminId: principal.adminId, requestId });
      const auditId = await this.audit.append(context, { actor: { type: 'ADMIN', id: principal.adminId }, action: 'catalog.draft_saved', objectType: 'product', objectId: id,
        requestId, changes: { previousVersion: input.version, version: data.version, skuCount: input.skus.length, reason: input.reason, storeId: onlineSalesScopeId } });
      return { product: await this.draft(context, id), auditId };
    });
  }
  publication(principal: AdminPrincipal, rawId: unknown, raw: unknown, publish: boolean, requestId?: string): Promise<Schema['CatalogSavedData']> {
    const id = parseCatalogId(rawId), input = parseCatalogPublication(raw);
    return this.authorized(principal, 'catalog.sku.publish', id, requestId, async context => {
      const client = transactionClientFor(context), row = await this.product(context, id);
      if (row.version !== input.version) throw new ConflictException();
      const version = row.version + 1;
      if (publish) {
        await this.configured(context);
        const category = await client.catalogCategory.findFirst({ where: { id: row.categoryId, storeId: onlineSalesScopeId, active: true } });
        const skus = row.skus.filter(sku => sku.active);
        if (!category || !skus.length) throw new ConflictException();
        await client.catalogPublication.create({ data: { productId: id, version, name: row.name, description: row.description,
          categoryId: category.id, categoryName: category.name, categorySort: category.sort, skus: { create: skus.map(sku => ({ skuId: sku.id })) } } });
        await this.pricing.publish(context, id, version, skus.map(sku => sku.id), { adminId: principal.adminId, requestId });
      } else if (row.publishedVersion === null) throw new ConflictException();
      await client.catalogProduct.update({ where: { id, version: input.version }, data: { version, publishedVersion: publish ? version : null } });
      const auditId = await this.audit.append(context, { actor: { type: 'ADMIN', id: principal.adminId }, action: publish ? 'catalog.published' : 'catalog.withdrawn', objectType: 'product', objectId: id,
        requestId, changes: { previousVersion: input.version, version, previousPublishedVersion: row.publishedVersion, reason: input.reason, storeId: onlineSalesScopeId } });
      return { product: await this.draft(context, id), auditId };
    });
  }
  private pageWhere(page: Page) { return { storeId: onlineSalesScopeId, ...(page.cursor ? { id: { gt: page.cursor } } : {}) }; }
  publicList(raw: unknown): Promise<Schema['CatalogPublicData']> {
    const page = parseCatalogPage(raw);
    return this.database.runInTransaction(async context => {
      const rows = await transactionClientFor(context).catalogProduct.findMany({ where: { ...this.pageWhere(page), publishedVersion: { not: null } },
        orderBy: { id: 'asc' }, take: page.limit + 1, include: { publications: { orderBy: { version: 'desc' }, take: 1, include: { skus: { orderBy: { skuId: 'asc' }, include: { sku: true } } } } } });
      const result = pageResult(rows, page.limit), items: Schema['CatalogPublishedProduct'][] = [];
      for (const row of result.items) {
        const snapshot = row.publications[0];
        if (!snapshot || snapshot.version !== row.publishedVersion) throw new Error('CATALOG_SNAPSHOT_UNAVAILABLE');
        const prices = await this.pricing.published(context, row.id, snapshot.version);
        items.push({ id: row.id, storeId: row.storeId, version: snapshot.version, name: snapshot.name, description: snapshot.description,
          category: { id: snapshot.categoryId, name: snapshot.categoryName, sort: snapshot.categorySort }, inventoryStatus: 'NOT_CONNECTED', purchasable: false,
          skus: snapshot.skus.map(({ sku }) => {
            const priceMinor = prices.get(sku.id);
            if (priceMinor === undefined) throw new Error('CATALOG_PRICE_UNAVAILABLE');
            return { id: sku.id, code: sku.code, unit: sku.unit as Schema['CatalogUnit'], options: sku.options as Schema['CatalogOptions'], priceMinor, priceVersion: snapshot.version };
          }) });
      }
      return { ...result, items, checkoutEnabled: false };
    });
  }
}
