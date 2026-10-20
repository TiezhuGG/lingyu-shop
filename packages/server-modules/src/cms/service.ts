import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import type { components } from '@lingyu/contracts';
import type { CmsTextRevision } from '../../generated';
import { AdminService, type AdminPrincipal } from '../admin/service';
import type { AdminPermission } from '../admin/policy';
import { AuditService } from '../foundation/audit';
import { DatabaseService } from '../foundation/database';
import { transactionClientFor, type TransactionContext } from '../foundation/transaction';
import { StorefrontService, onlineSalesScopeId } from '../store/service';
import { parseCmsHistory, parseCmsPageCode, parseCmsPublication, parseCmsPublicQuery, parseCmsRollback, parseCmsSave } from './contract';
type S = components['schemas'];
type Code = S['CmsPageCode'];
const key = (pageCode: Code) => ({ storeId: onlineSalesScopeId, pageCode });
const snapshot = (row: CmsTextRevision): S['CmsTextRevision'] => ({ version: row.version, title: row.title, body: row.body, publishedAt: row.publishedAt.toISOString(), sourceVersion: row.sourceVersion });
@Injectable()
export class TextCmsService {
  constructor(private readonly database: DatabaseService, private readonly admins: AdminService, private readonly audit: AuditService, private readonly storefront: StorefrontService) {}
  private async authorized<T>(principal: AdminPrincipal, permission: AdminPermission, code: Code, requestId: string | undefined, operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    try {
      return await this.database.runInTransaction(async context => {
        await this.admins.authorizeInTransaction(context, principal, permission, onlineSalesScopeId);
        return operation(context);
      });
    } catch (original) {
      const error = (original as { code?: string })?.code === 'P2002' ? new ConflictException() : original;
      if (error instanceof HttpException) await this.database.runInTransaction(context => this.audit.append(context, {
        actor: { type: 'ADMIN', id: principal.adminId }, action: 'cms.rejected', objectType: 'cms', objectId: code, requestId,
        changes: { permission, result: error.getStatus(), storeId: onlineSalesScopeId },
      }));
      throw error;
    }
  }
  private current(context: TransactionContext, code: Code) {
    return transactionClientFor(context).cmsTextPage.findUnique({ where: { storeId_pageCode: key(code) } });
  }
  private async published(context: TransactionContext, code: Code, version: number | null) {
    if (version === null) return null;
    const row = await transactionClientFor(context).cmsTextRevision.findUnique({ where: { storeId_pageCode_version: { ...key(code), version } } });
    if (!row) throw new Error('CMS_PUBLICATION_UNAVAILABLE');
    return snapshot(row);
  }
  private async data(context: TransactionContext, code: Code, before?: number): Promise<S['CmsAdminData']> {
    const row = await this.current(context, code);
    const history = await transactionClientFor(context).cmsTextRevision.findMany({ where: { ...key(code), ...(before === undefined ? {} : { version: { lt: before } }) }, orderBy: { version: 'desc' }, take: 11 });
    const items = history.slice(0, 10), hasMore = history.length > 10;
    return { pageCode: code, version: row?.version ?? 0, title: row?.title ?? '', body: row?.body ?? '', published: await this.published(context, code, row?.publishedVersion ?? null),
      history: items.map(snapshot), hasMore, nextCursor: hasMore ? String(items.at(-1)!.version) : null };
  }
  publicPage(rawCode: unknown, query: unknown = {}): Promise<S['CmsPublicData']> {
    const code = parseCmsPageCode(rawCode); parseCmsPublicQuery(query);
    return this.database.runInTransaction(async context => ({ pageCode: code, published: await this.published(context, code, (await this.current(context, code))?.publishedVersion ?? null) }));
  }
  read(principal: AdminPrincipal, rawCode: unknown, query: unknown = {}, requestId?: string) {
    const code = parseCmsPageCode(rawCode), before = parseCmsHistory(query);
    return this.authorized(principal, 'cms.read', code, requestId, context => this.data(context, code, before));
  }
  save(principal: AdminPrincipal, rawCode: unknown, raw: unknown, requestId?: string): Promise<S['CmsSavedData']> {
    const code = parseCmsPageCode(rawCode), input = parseCmsSave(raw);
    return this.authorized(principal, 'cms.write', code, requestId, async context => {
      if (!(await this.storefront.readInTransaction(context)).configured) throw new ConflictException();
      const client = transactionClientFor(context), row = await this.current(context, code);
      if ((row?.version ?? 0) !== input.version) throw new ConflictException();
      const data = { title: input.title, body: input.body, version: input.version + 1 };
      if (row) await client.cmsTextPage.update({ where: { storeId_pageCode: key(code), version: input.version }, data });
      else await client.cmsTextPage.create({ data: { ...key(code), ...data } });
      const auditId = await this.audit.append(context, { actor: { type: 'ADMIN', id: principal.adminId }, action: 'cms.draft_saved', objectType: 'cms', objectId: code, requestId,
        changes: { storeId: onlineSalesScopeId, previousVersion: input.version, version: data.version, bodyLength: [...input.body].length, reason: input.reason } });
      return { page: await this.data(context, code), auditId };
    });
  }
  change(principal: AdminPrincipal, rawCode: unknown, raw: unknown, action: 'publish' | 'rollback' | 'withdraw', requestId?: string): Promise<S['CmsSavedData']> {
    const code = parseCmsPageCode(rawCode), rollback = action === 'rollback' ? parseCmsRollback(raw) : null;
    const input = rollback ?? parseCmsPublication(raw);
    return this.authorized(principal, 'cms.publish', code, requestId, async context => {
      const client = transactionClientFor(context), row = await this.current(context, code);
      if (!row) throw new NotFoundException();
      if (row.version !== input.version || row.version >= 2147483647) throw new ConflictException();
      const version = row.version + 1;
      if (action !== 'withdraw') {
        const content = rollback ? await client.cmsTextRevision.findUnique({ where: { storeId_pageCode_version: { ...key(code), version: rollback.targetVersion } } }) : row;
        if (!content) throw new NotFoundException();
        if (!content.title.trim() || !content.body.trim()) throw new ConflictException();
        await client.cmsTextRevision.create({ data: { ...key(code), version, title: content.title, body: content.body, sourceVersion: rollback?.targetVersion ?? null } });
      } else if (row.publishedVersion === null) throw new ConflictException();
      await client.cmsTextPage.update({ where: { storeId_pageCode: key(code), version: input.version }, data: { version, publishedVersion: action === 'withdraw' ? null : version } });
      const auditId = await this.audit.append(context, { actor: { type: 'ADMIN', id: principal.adminId }, action: 'cms.' + action, objectType: 'cms', objectId: code, requestId,
        changes: { storeId: onlineSalesScopeId, previousVersion: row.version, version, previousPublishedVersion: row.publishedVersion, sourceVersion: rollback?.targetVersion ?? null, reason: input.reason } });
      return { page: await this.data(context, code), auditId };
    });
  }
}
